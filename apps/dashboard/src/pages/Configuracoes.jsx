import React, { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import api from '../services/api';
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
import { agruparHorarios, idsRemovidos, negocioSchema, turnosPreenchidos, validarHorarios } from '../lib/onboarding';
import { formatPhone, unformatPhone } from '../utils/formatters';

const MENSAGEM_LEMBRETE_PADRAO =
  'Olá {nome}! Lembramos que você tem uma consulta agendada para {data} às {horario}. Confirme sua presença respondendo esta mensagem.';

const ABAS = [
  { id: 'dados', label: 'Dados do negócio', icon: Building2 },
  { id: 'automacao', label: 'Automação', icon: MessageSquare },
  { id: 'horarios', label: 'Horário de atendimento', icon: Clock },
  { id: 'historico', label: 'Minha assinatura', icon: History },
];

const Configuracoes = () => {
  const [abaAtiva, setAbaAtiva] = useState('dados');
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [clinica, setClinica] = useState(null);
  const [mensagemLembrete, setMensagemLembrete] = useState(MENSAGEM_LEMBRETE_PADRAO);
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
        setMensagemLembrete(dados.mensagem_lembrete || MENSAGEM_LEMBRETE_PADRAO);
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
  }, [carregarHorarios, carregarImplantacao, reset]);

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

  const salvarMensagem = async () => {
    if (!clinica?.id) return;
    setSalvando(true);
    try {
      const { data } = await api.put(`/config/info-clinica/${clinica.id}`, {
        mensagem_lembrete: mensagemLembrete,
      });
      setClinica(data);
      toast.success('Mensagem salva.');
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
                  {salvando ? 'Salvando...' : 'Salvar mensagem'}
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
