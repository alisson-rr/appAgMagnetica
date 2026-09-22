import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Send, MessageSquare, Bot, User, RotateCcw } from 'lucide-react';
import api from '../services/api';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { EmptyState, Loading, PageHeader } from '../components/PageChrome';

// Sem Realtime: o painel usa JWT próprio contra a API, não sessão do Supabase.
// Uma volta a cada 8 s é barata e suficiente para uma caixa de entrada que uma
// pessoa está olhando — e não exige infraestrutura nova.
const INTERVALO_MS = 8000;

function horaCurta(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function apelido(conversa) {
  if (conversa.contato_nome) return conversa.contato_nome;
  // Sem nome, o número já é mais útil que o jid inteiro.
  const digitos = String(conversa.remote_jid || '').split('@')[0];
  return digitos || 'Contato';
}

function comHumano(c) {
  return Math.max(Date.parse(c.humano_solicitado_em) || 0, Date.parse(c.humano_assumido_em) || 0)
    > (Date.parse(c.ia_liberada_em) || 0);
}

const AVISOS = {
  aceito: 'Aviso aceito pelo WhatsApp do responsável.',
  sem_destinatario: 'Configure o WhatsApp do responsável em Configurações → Automação.',
  destinatario_e_cliente: 'O número do responsável é o mesmo do cliente. Revise a configuração.',
  incerto: 'Não foi possível confirmar o envio do aviso. Confira o WhatsApp.',
  processando: 'O envio do aviso foi iniciado; o resultado ainda não foi registrado.',
};

const AUTORES = {
  ia: { rotulo: 'Recepção', Icone: Bot },
  painel: { rotulo: 'Você', Icone: User },
};

export default function Conversas() {
  const [conversas, setConversas] = useState([]);
  const [aberta, setAberta] = useState(null);
  const [mensagens, setMensagens] = useState([]);
  const [texto, setTexto] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [devolvendo, setDevolvendo] = useState(false);
  const [erro, setErro] = useState('');
  const fimDaLista = useRef(null);

  const carregarConversas = useCallback(async () => {
    try {
      const { data } = await api.get('/conversas');
      const lista = Array.isArray(data) ? data : [];
      lista.sort((a, b) => Number(comHumano(b)) - Number(comHumano(a)));
      setConversas(lista);
      setAberta((atual) => atual ? lista.find((c) => c.id === atual.id) || atual : null);
      setErro('');
    } catch {
      setErro('Não consegui atualizar as conversas. Vou tentar novamente.');
    } finally {
      setCarregando(false);
    }
  }, []);

  const carregarMensagens = useCallback(async (conversaId) => {
    if (!conversaId) return;
    try {
      const { data } = await api.get(`/conversas/${conversaId}/mensagens`);
      setMensagens(Array.isArray(data) ? data : []);
    } catch {
      /* idem */
    }
  }, []);

  useEffect(() => {
    carregarConversas();
  }, [carregarConversas]);

  useEffect(() => {
    const id = setInterval(() => {
      carregarConversas();
      if (aberta) carregarMensagens(aberta.id);
    }, INTERVALO_MS);
    return () => clearInterval(id);
  }, [carregarConversas, carregarMensagens, aberta]);

  useEffect(() => {
    if (fimDaLista.current) fimDaLista.current.scrollIntoView({ block: 'end' });
  }, [mensagens]);

  const abrir = async (conversa) => {
    setAberta(conversa);
    setMensagens([]);
    await carregarMensagens(conversa.id);
    if (conversa.nao_lidas > 0) {
      try {
        await api.post(`/conversas/${conversa.id}/lida`);
        setConversas((atuais) => atuais.map((c) => (
          c.id === conversa.id ? { ...c, nao_lidas: 0 } : c
        )));
      } catch {
        /* o contador volta na próxima volta */
      }
    }
  };

  const enviar = async () => {
    const corpo = texto.trim();
    if (!corpo || !aberta || enviando) return;
    setEnviando(true);
    try {
      await api.post(`/conversas/${aberta.id}/enviar`, { texto: corpo });
      setTexto('');
      await carregarMensagens(aberta.id);
      await carregarConversas();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Não consegui enviar a mensagem.');
    } finally {
      setEnviando(false);
    }
  };

  const devolverParaIA = async () => {
    if (!aberta || devolvendo) return;
    setDevolvendo(true);
    try {
      await api.post(`/conversas/${aberta.id}/devolver-ia`);
      await carregarConversas();
      toast.success('A recepção volta a responder esta conversa.');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Não consegui devolver agora.');
    } finally {
      setDevolvendo(false);
    }
  };

  const assumir = async () => {
    if (!aberta || devolvendo) return;
    setDevolvendo(true);
    try {
      await api.post(`/conversas/${aberta.id}/assumir`);
      await carregarConversas();
      toast.success('Conversa assumida. A recepção fica pausada até você devolver.');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Não consegui assumir agora.');
    } finally { setDevolvendo(false); }
  };

  if (carregando) return <Loading label="Carregando as conversas" />;

  return (
    <div>
      <PageHeader
        title="Conversas"
        subtitle="Assuma uma conversa para atender. A recepção fica pausada até você devolver."
      />
      {erro && <p role="status" className="mb-3 text-sm text-destructive">{erro}</p>}

      {conversas.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="Nenhuma conversa ainda"
          description="As conversas aparecem aqui assim que o WhatsApp receber a primeira mensagem. O histórico anterior à ativação não é recuperável."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <Card className="max-h-[70vh] overflow-y-auto p-2">
            <ul className="flex flex-col gap-1">
              {conversas.map((conversa) => (
                <li key={conversa.id}>
                  <button
                    type="button"
                    onClick={() => abrir(conversa)}
                    aria-current={aberta?.id === conversa.id ? 'true' : undefined}
                    className={`w-full rounded-md p-3 text-left transition-colors ${
                      aberta?.id === conversa.id ? 'bg-muted' : 'hover:bg-muted/60'
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-medium">{apelido(conversa)}</span>
                      {conversa.nao_lidas > 0 && (
                        <span
                          className="shrink-0 rounded-full bg-primary px-2 text-xs font-semibold text-primary-foreground"
                          aria-label={`${conversa.nao_lidas} não lidas`}
                        >
                          {conversa.nao_lidas}
                        </span>
                      )}
                    </div>
                    {comHumano(conversa) && <p className="text-sm font-semibold text-primary">{conversa.humano_assumido_em && Date.parse(conversa.humano_assumido_em) > (Date.parse(conversa.ia_liberada_em) || 0) ? 'Em atendimento humano' : 'Precisa de você'}</p>}
                    <p className="truncate text-sm text-muted-foreground">
                      {conversa.ultima_mensagem || 'sem mensagens'}
                    </p>
                    <p className="text-xs text-muted-foreground">{horaCurta(conversa.ultima_em)}</p>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="flex max-h-[70vh] flex-col p-0">
            {!aberta ? (
              <div className="flex flex-1 items-center justify-center p-8 text-muted-foreground">
                Escolha uma conversa à esquerda.
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
                  <h2 className="font-display text-lg font-bold">{apelido(aberta)}</h2>
                  <Button variant="outline" size="sm" onClick={assumir} disabled={devolvendo}>Assumir conversa</Button>
                  {/*
                    Responder aqui cala a recepção por 30 minutos. Este botão é a
                    saída para quem respondeu uma coisa rápida e quer a IA de
                    volta agora, em vez de esperar o tempo passar.
                  */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={devolverParaIA}
                    disabled={devolvendo}
                    className="flex items-center gap-2"
                  >
                    <RotateCcw size={16} aria-hidden="true" />
                    {devolvendo ? 'Devolvendo...' : 'Devolver para a recepção'}
                  </Button>
                </div>

                {comHumano(aberta) && <p role="status" className="border-b px-4 py-2 text-sm">Recepção pausada. {AVISOS[aberta.aviso_resultado] || 'Você pode responder por aqui.'}</p>}

                <div className="flex-1 overflow-y-auto p-4">
                  <ul className="flex flex-col gap-3">
                    {mensagens.map((m) => {
                      const meta = AUTORES[m.autor];
                      return (
                        <li
                          key={m.id}
                          className={`flex ${m.do_negocio ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[80%] rounded-lg px-3 py-2 ${
                              m.do_negocio ? 'bg-primary/10' : 'bg-muted'
                            }`}
                          >
                            {meta && (
                              <span className="mb-1 flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                                <meta.Icone size={12} aria-hidden="true" />
                                {meta.rotulo}
                              </span>
                            )}
                            <p className="whitespace-pre-wrap break-words text-sm">
                              {m.conteudo || <em>({m.tipo})</em>}
                            </p>
                            <span className="mt-1 block text-right text-[11px] text-muted-foreground">
                              {horaCurta(m.created_at)}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  <div ref={fimDaLista} />
                </div>

                <div className="border-t p-3">
                  <label htmlFor="chat-texto" className="sr-only">Mensagem</label>
                  <div className="flex items-end gap-2">
                    <Textarea
                      id="chat-texto"
                      rows={2}
                      value={texto}
                      onChange={(evento) => setTexto(evento.target.value)}
                      onKeyDown={(evento) => {
                        if (evento.key === 'Enter' && !evento.shiftKey) {
                          evento.preventDefault();
                          enviar();
                        }
                      }}
                      placeholder="Escreva e pressione Enter"
                    />
                    <Button onClick={enviar} disabled={enviando || !texto.trim()}>
                      <Send size={18} aria-hidden="true" />
                      <span className="sr-only">Enviar</span>
                    </Button>
                  </div>
                </div>
              </>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
