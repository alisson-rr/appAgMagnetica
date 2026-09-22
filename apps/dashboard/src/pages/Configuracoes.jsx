import React, { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { Building2, MessageSquare, Clock, History, Save } from 'lucide-react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { EmptyState, Loading, PageHeader } from '../components/PageChrome';
import { CampoErro, descricaoDoCampo } from '../components/CampoErro';
import HorariosEditor from '../components/HorariosEditor';
import ConexaoWhatsApp from '../components/ConexaoWhatsApp';
import { agruparHorarios, atendenteSchema, idsRemovidos, negocioSchema, TONS, turnosPreenchidos, validarHorarios } from '../lib/onboarding';
import { formatPhone, unformatPhone } from '../utils/formatters';

// Desligado e o padrao: um lembrete que o dono nao pediu chega como mensagem
// nao solicitada para o cliente dele.
const ANTECEDENCIAS = [
  { valor: '', rotulo: 'Nao enviar lembrete' },
  { valor: '12', rotulo: '12 horas antes' },
  { valor: '24', rotulo: '1 dia antes' },
  { valor: '48', rotulo: '2 dias antes' },
  { valor: '72', rotulo: '3 dias antes' },
];

const MENSAGEM_LEMBRETE_PADRAO =
  'Olá {nome}! Passando para lembrar do seu horário em {data} às {horario}.';

const ABAS = [
  { id: 'dados', label: 'Dados do negócio', icon: Building2 },
  { id: 'automacao', label: 'Automação', icon: MessageSquare },
  { id: 'horarios', label: 'Horário de atendimento', icon: Clock },
  { id: 'historico', label: 'Minha assinatura', icon: History },
];

const identidadeSchema = atendenteSchema.pick({ assistente_nome: true, assistente_tom: true });

const Configuracoes = () => {
  const { user, refreshUser } = useAuth();
  const [responsavel, setResponsavel] = useState('');
  const [pilotoEmpresa, setPilotoEmpresa] = useState('');
  const [pilotoAte, setPilotoAte] = useState('');
  const [abaAtiva, setAbaAtiva] = useState('dados');
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [clinica, setClinica] = useState(null);
  const [mensagemLembrete, setMensagemLembrete] = useState(MENSAGEM_LEMBRETE_PADRAO);
  const [lembreteHoras, setLembreteHoras] = useState('');
  const [dias, setDias] = useState(() => agruparHorarios([]));
  const [horariosOriginais, setHorariosOriginais] = useState([]);
  const [errosHorarios, setErrosHorarios] = useState({});
  const [implantacao, setImplantacao] = useState(null);
  const [assinaturas] = useState([]);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm({ resolver: zodResolver(negocioSchema) });

  const {
    register: registerAtendente,
    handleSubmit: submitAtendente,
    reset: resetAtendente,
    formState: { errors: errosAtendente },
  } = useForm({
    resolver: zodResolver(identidadeSchema),
    defaultValues: { assistente_nome: '', assistente_tom: 'acolhedor' },
  });

  const telefone = watch('telefone');

  const carregarHorarios = useCallback(async () => {
    const { data } = await api.get('/config/horarios-clinica');
    setHorariosOriginais(data || []);
    setDias(agruparHorarios(data || []));
  }, []);

  const carregarImplantacao = useCallback(async () => {
    try {
      const { data } = await api.get('/config/implantacao');
      setImplantacao(data);
    } catch {
      setImplantacao(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [clinicaRes] = await Promise.all([api.get('/config/info-clinica'), carregarHorarios()]);
        const dados = clinicaRes.data || {};
        setClinica(dados);
        setResponsavel(dados.whatsapp_responsavel || '');
        setMensagemLembrete(dados.mensagem_lembrete || MENSAGEM_LEMBRETE_PADRAO);
        setLembreteHoras(dados.lembrete_horas ? String(dados.lembrete_horas) : '');
        resetAtendente({
          assistente_nome: dados.assistente_nome || '',
          assistente_tom: dados.assistente_tom || 'acolhedor',
        });
        reset({
          nome: dados.nome || '',
          telefone: formatPhone(dados.telefone || ''),
          email: dados.email || '',
          endereco: dados.endereco || '',
          descricao: dados.descricao || '',
        });
      } catch (error) {
        toast.error('Erro ao carregar configurações');
      } finally {
        setLoading(false);
      }
      carregarImplantacao();
    })();
  }, [carregarHorarios, carregarImplantacao, reset, resetAtendente]);

  /**
   * Só campos editáveis vão no `PUT`. Antes o objeto inteiro do `GET` voltava
   * ao servidor, `id`, `created_at` e `automacao_ativa` inclusive — devolver o
   * que se leu é como uma tela apaga o que outra acabou de mudar.
   */
  const salvarDados = handleSubmit(async (valores) => {
    if (!clinica?.id) return;
    setSalvando(true);
    try {
      const { data } = await api.put(`/config/info-clinica/${clinica.id}`, {
        nome: valores.nome.trim(),
        telefone: unformatPhone(valores.telefone || '') || null,
        email: (valores.email || '').trim() || null,
        endereco: (valores.endereco || '').trim() || null,
        descricao: (valores.descricao || '').trim() || null,
      });
      setClinica(data);
      toast.success('Dados do negócio salvos.');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao salvar dados do negócio');
    } finally {
      setSalvando(false);
    }
  });

  const salvarAtendente = submitAtendente(async (valores) => {
    if (!clinica?.id) return;
    setSalvando(true);
    try {
      const { data } = await api.put(`/config/info-clinica/${clinica.id}`, valores);
      setClinica(data);
      resetAtendente({ assistente_nome: data.assistente_nome, assistente_tom: data.assistente_tom });
      carregarImplantacao();
      toast.success('Identidade da assistente salva.');
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string'
        ? error.response.data.detail : 'Não foi possível salvar a assistente.');
    } finally {
      setSalvando(false);
    }
  });

  const salvarMensagem = async () => {
    if (!clinica?.id) return;
    setSalvando(true);
    try {
      const { data } = await api.put(`/config/info-clinica/${clinica.id}`, {
        mensagem_lembrete: mensagemLembrete,
        whatsapp_responsavel: responsavel.trim() || null,
        // Vazio vira `null`, que e o valor que desliga o lembrete no banco.
        lembrete_horas: lembreteHoras ? Number(lembreteHoras) : null,
      });
      setClinica(data);
      toast.success(lembreteHoras ? 'Lembrete salvo.' : 'Lembrete desligado.');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao salvar a mensagem');
    } finally {
      setSalvando(false);
    }
  };

  const salvarHorarios = async () => {
    const resultado = validarHorarios(dias);
    setErrosHorarios(resultado.erros);
    if (!resultado.valido) return;

    setSalvando(true);
    try {
      for (const id of idsRemovidos(horariosOriginais, dias)) {
        await api.delete(`/config/horarios-clinica/${id}`);
      }
      for (const turno of turnosPreenchidos(dias)) {
        const corpo = {
          dia_semana: turno.dia_semana,
          hora_inicio: turno.hora_inicio,
          hora_fim: turno.hora_fim,
        };
        if (turno.id) await api.put(`/config/horarios-clinica/${turno.id}`, corpo);
        else await api.post('/config/horarios-clinica', corpo);
      }
      await carregarHorarios();
      carregarImplantacao();
      toast.success('Horários salvos.');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao salvar horários');
    } finally {
      setSalvando(false);
    }
  };

  const liberarPiloto = async (evento) => {
    evento.preventDefault();
    setSalvando(true);
    try {
      const { data } = await api.put(`/admin/empresas/${Number(pilotoEmpresa)}/piloto`, {
        piloto_ate: pilotoAte ? new Date(pilotoAte).toISOString() : null,
      });
      await refreshUser();
      toast.success(data.piloto_ate ? `Piloto liberado até ${new Date(data.piloto_ate).toLocaleString('pt-BR')}` : 'Liberação de piloto revogada.');
    } catch (error) {
      toast.error(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Confira a empresa e o prazo futuro.');
    } finally { setSalvando(false); }
  };

  if (loading) {
    return <Loading label="Carregando configurações" className="h-64" />;
  }

  const idAba = (id) => `aba-${id}`;
  const idPainel = (id) => `painel-${id}`;

  return (
    <div className="page-shell">
      <PageHeader
        title="Configurações"
        description="Dados do negócio, horários, conexão do WhatsApp e histórico da conta."
      />

      <div className="flex gap-1 overflow-x-auto border-b border-border/70" role="tablist" aria-label="Seções das configurações">
        {ABAS.map((aba) => {
          const Icon = aba.icon;
          const ativa = abaAtiva === aba.id;
          return (
            <button
              key={aba.id}
              id={idAba(aba.id)}
              type="button"
              role="tab"
              aria-selected={ativa}
              aria-controls={idPainel(aba.id)}
              tabIndex={ativa ? 0 : -1}
              onClick={() => setAbaAtiva(aba.id)}
              className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition ${
                ativa
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
              }`}
            >
              <Icon size={18} />
              {aba.label}
            </button>
          );
        })}
      </div>

      <div className="mt-6">
        {abaAtiva === 'dados' && (
          <div role="tabpanel" id={idPainel('dados')} aria-labelledby={idAba('dados')}>
            <Card className="p-6 sm:p-8">
              <h2 className="mb-6 font-display text-lg font-bold text-ink">Dados cadastrais</h2>

              <form onSubmit={salvarDados} noValidate>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div>
                    <Label htmlFor="config-nome">Nome do negócio *</Label>
                    <Input
                      id="config-nome"
                      className="mt-1"
                      {...descricaoDoCampo('config-nome', errors.nome?.message)}
                      {...register('nome')}
                    />
                    <CampoErro id="config-nome-erro" mensagem={errors.nome?.message} />
                  </div>

                  <div>
                    <Label htmlFor="config-email">E-mail</Label>
                    <Input
                      id="config-email"
                      type="email"
                      className="mt-1"
                      {...descricaoDoCampo('config-email', errors.email?.message)}
                      {...register('email')}
                    />
                    <CampoErro id="config-email-erro" mensagem={errors.email?.message} />
                  </div>

                  <div>
                    <Label htmlFor="config-telefone">Telefone principal</Label>
                    <Input
                      id="config-telefone"
                      type="tel"
                      inputMode="tel"
                      maxLength={15}
                      placeholder="(00) 00000-0000"
                      className="mt-1"
                      {...descricaoDoCampo('config-telefone', errors.telefone?.message)}
                      {...register('telefone')}
                      value={telefone || ''}
                      onChange={(evento) =>
                        setValue('telefone', formatPhone(evento.target.value), {
                          shouldDirty: true,
                          shouldValidate: true,
                        })
                      }
                    />
                    <CampoErro id="config-telefone-erro" mensagem={errors.telefone?.message} />
                  </div>

                  <div>
                    <Label htmlFor="config-endereco">Endereço</Label>
                    <Input
                      id="config-endereco"
                      className="mt-1"
                      {...descricaoDoCampo('config-endereco', errors.endereco?.message)}
                      {...register('endereco')}
                    />
                    <CampoErro id="config-endereco-erro" mensagem={errors.endereco?.message} />
                  </div>
                </div>

                <div className="mt-6">
                  <Label htmlFor="config-descricao">Sobre o negócio</Label>
                  <Textarea
                    id="config-descricao"
                    rows={6}
                    className="mt-1"
                    placeholder="Formas de pagamento, convênios, estacionamento, o que levar na primeira sessão, política de cancelamento."
                    {...descricaoDoCampo('config-descricao', errors.descricao?.message)}
                    {...register('descricao')}
                  />
                  <CampoErro id="config-descricao-erro" mensagem={errors.descricao?.message} />
                  <p className="field-hint">A sua recepção usa este texto para responder o que não está no catálogo. Qualquer pessoa que escrever no WhatsApp pode receber este texto de volta. Uma informação por linha, e nada de nome, telefone ou dado de cliente.</p>
                </div>

                <div className="mt-8 flex justify-end">
                  <Button type="submit" disabled={salvando} className="flex items-center gap-2">
                    <Save size={18} />
                    {salvando ? 'Salvando...' : 'Salvar alterações'}
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        )}

        {abaAtiva === 'automacao' && (
          <div role="tabpanel" id={idPainel('automacao')} aria-labelledby={idAba('automacao')} className="space-y-6">
            <Card className="p-6 sm:p-8">
              <h2 className="font-display text-lg font-bold text-ink">Sua assistente virtual</h2>
              <p className="mb-6 mt-1 text-sm text-muted-foreground">
                Escolha como ela se apresenta e o jeito de conversar no WhatsApp.
              </p>
              <form onSubmit={salvarAtendente} noValidate className="space-y-5">
                <div className="grid gap-6 md:grid-cols-2">
                  <div>
                    <Label htmlFor="config-assistente-nome">Nome da assistente *</Label>
                    <Input id="config-assistente-nome" maxLength={40} placeholder="Ex.: Clara" className="mt-1"
                      {...descricaoDoCampo('config-assistente-nome', errosAtendente.assistente_nome?.message)}
                      {...registerAtendente('assistente_nome')} />
                    <CampoErro id="config-assistente-nome-erro" mensagem={errosAtendente.assistente_nome?.message} />
                    <p className="field-hint">Use apenas o nome, com 2 a 40 letras e espaços. Ela se identifica como assistente virtual.</p>
                  </div>
                  <div>
                    <Label htmlFor="config-assistente-tom">Jeito de conversar *</Label>
                    <select id="config-assistente-tom" className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      {...descricaoDoCampo('config-assistente-tom', errosAtendente.assistente_tom?.message)}
                      {...registerAtendente('assistente_tom')}>
                      {TONS.map((tom) => <option key={tom.valor} value={tom.valor}>{tom.rotulo}</option>)}
                    </select>
                    <CampoErro id="config-assistente-tom-erro" mensagem={errosAtendente.assistente_tom?.message} />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button type="submit" disabled={salvando} className="flex items-center gap-2">
                    <Save size={18} />{salvando ? 'Salvando...' : 'Salvar assistente'}
                  </Button>
                </div>
              </form>
            </Card>
            <Card className="p-6 sm:p-8">
              {/* Mesmo componente do passo 6 do onboarding (contrato §4.3). */}
              <ConexaoWhatsApp
                automacaoAtiva={Boolean(implantacao?.automacao_ativa)}
                aoMudarAutomacao={(ativa) =>
                  setImplantacao((atual) => ({ ...(atual || {}), automacao_ativa: ativa }))
                }
                aoMudarConexao={carregarImplantacao}
              />
            </Card>

            <Card className="p-6 sm:p-8">
              <h2 className="mb-6 font-display text-lg font-bold text-ink">Mensagens modelo</h2>

              <div className="mb-6">
                <Label htmlFor="config-responsavel">WhatsApp do responsável</Label>
                <Input id="config-responsavel" type="tel" value={responsavel} onChange={(e) => setResponsavel(e.target.value)} placeholder="DDD + número" />
                <p className="field-hint">Recebe um aviso quando alguém pede atendimento humano. Use um número diferente do WhatsApp conectado.</p>
                <Label htmlFor="config-antecedencia">Quando enviar o lembrete</Label>
                <select
                  id="config-antecedencia"
                  className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={lembreteHoras}
                  onChange={(evento) => setLembreteHoras(evento.target.value)}
                  aria-describedby="config-antecedencia-ajuda"
                >
                  {ANTECEDENCIAS.map((opcao) => (
                    <option key={opcao.valor} value={opcao.valor}>{opcao.rotulo}</option>
                  ))}
                </select>
                <p id="config-antecedencia-ajuda" className="field-hint">
                  A recepcao manda a mensagem e entende a resposta: quem responde
                  &quot;sim&quot; tem a presenca confirmada na agenda.
                </p>
              </div>

              <div>
                <Label htmlFor="config-lembrete">Lembrete de consulta</Label>
                <Textarea
                  id="config-lembrete"
                  rows={4}
                  className="mt-2"
                  value={mensagemLembrete}
                  onChange={(evento) => setMensagemLembrete(evento.target.value)}
                  aria-describedby="config-lembrete-ajuda"
                  placeholder="Use {nome}, {data} e {horario} como variáveis"
                />
                <p id="config-lembrete-ajuda" className="field-hint">
                  Variáveis disponíveis: {'{nome}'}, {'{data}'}, {'{horario}'}, {'{profissional}'}, {'{procedimento}'}
                </p>
              </div>

              <div className="mt-6 flex justify-end">
                <Button onClick={salvarMensagem} disabled={salvando} className="flex items-center gap-2">
                  <Save size={18} />
                  {salvando ? 'Salvando...' : 'Salvar lembrete'}
                </Button>
              </div>
            </Card>
          </div>
        )}

        {abaAtiva === 'horarios' && (
          <div role="tabpanel" id={idPainel('horarios')} aria-labelledby={idAba('horarios')}>
            <Card className="p-6 sm:p-8">
              <h2 className="mb-2 font-display text-lg font-bold text-ink">Horário de funcionamento</h2>
              <p className="mb-6 text-sm text-muted-foreground">
                A agenda respeita esses limites. Você pode ter mais de um turno por dia (manhã e tarde,
                por exemplo). Dia em branco é dia fechado.
              </p>

              <HorariosEditor dias={dias} aoMudar={setDias} erros={errosHorarios} idPrefixo="config-horario" />

              <div className="mt-8 flex justify-end">
                <Button onClick={salvarHorarios} disabled={salvando} className="flex items-center gap-2">
                  <Save size={18} />
                  {salvando ? 'Salvando...' : 'Salvar horários'}
                </Button>
              </div>
            </Card>
          </div>
        )}

        {abaAtiva === 'historico' && (
          <div role="tabpanel" id={idPainel('historico')} aria-labelledby={idAba('historico')}>
            <Card className="p-6 sm:p-8">
              <h2 className="font-display text-lg font-bold text-ink">Minha assinatura</h2>
              {user?.piloto_ate && <p className="my-3 text-sm">Piloto {user.piloto_ativo ? 'válido' : 'encerrado'} até {new Date(user.piloto_ate).toLocaleString('pt-BR')}.</p>}
              {user?.role === 'admin' && (
                <form onSubmit={liberarPiloto} className="my-5 grid gap-3 rounded border p-4">
                  <h3 className="font-semibold">Liberação administrativa de piloto</h3>
                  <Label htmlFor="piloto-empresa">ID da empresa</Label>
                  <Input id="piloto-empresa" type="number" min="1" required value={pilotoEmpresa} onChange={(e) => setPilotoEmpresa(e.target.value)} />
                  <Label htmlFor="piloto-prazo">Prazo no seu fuso horário</Label>
                  <Input id="piloto-prazo" type="datetime-local" value={pilotoAte} onChange={(e) => setPilotoAte(e.target.value)} />
                  <p className="field-hint">Deixe o prazo vazio para revogar a liberação. Não altera pagamentos ou planos.</p>
                  <Button type="submit" disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar liberação'}</Button>
                </form>
              )}
              <p className="mb-6 mt-1 text-sm text-muted-foreground">
                Cobranças da Agenda Magnética. Os pagamentos dos seus atendimentos ficam em Financeiro.
              </p>

              {assinaturas.length === 0 ? (
                <EmptyState
                  icon={History}
                  title="Nenhum pagamento registrado"
                  description="O histórico da sua assinatura aparecerá aqui quando houver cobrança."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="table-soft">
                    <thead>
                      <tr>
                        <th scope="col">Data</th>
                        <th scope="col">Plano</th>
                        <th scope="col">Valor</th>
                        <th scope="col">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assinaturas.map((assinatura, index) => (
                        <tr key={index}>
                          <td>{new Date(assinatura.started_at).toLocaleDateString('pt-BR')}</td>
                          <td>{assinatura.plano?.nome}</td>
                          <td>R$ {assinatura.plano?.preco?.toFixed(2)}</td>
                          <td>
                            <span
                              className={`badge ${
                                assinatura.status === 'active'
                                  ? 'badge-success'
                                  : assinatura.status === 'past_due'
                                    ? 'badge-attention'
                                    : 'badge-danger'
                              }`}
                            >
                              {assinatura.status === 'active'
                                ? 'Ativo'
                                : assinatura.status === 'past_due'
                                  ? 'Pendente'
                                  : 'Cancelado'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default Configuracoes;
