import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  MessageSquare,
  Scissors,
  Sparkles,
  UserCog,
  UserPlus,
} from 'lucide-react';

import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Switch } from '../components/ui/switch';
import { Loading } from '../components/PageChrome';
import { CampoErro, descricaoDoCampo } from '../components/CampoErro';
import HorariosEditor from '../components/HorariosEditor';
import ServicoForm from '../components/ServicoForm';
import ProfissionalForm from '../components/ProfissionalForm';
import ConexaoWhatsApp from '../components/ConexaoWhatsApp';
import { formatPhone, unformatPhone } from '../utils/formatters';
import {
  PASSOS,
  TONS,
  TOTAL_PASSOS,
  agruparHorarios,
  atendenteSchema,
  disponibilidadeDosHorarios,
  fraseDeExemplo,
  idsRemovidos,
  negocioSchema,
  passoDaQuery,
  primeiroPassoPendente,
  turnosPreenchidos,
  validarHorarios,
} from '../lib/onboarding';

const ICONES = {
  negocio: Building2,
  horarios: Clock,
  servicos: Scissors,
  equipe: UserCog,
  atendente: MessageSquare,
  whatsapp: Sparkles,
};

const dadosOuVazio = (resultado, padrao) =>
  resultado.status === 'fulfilled' ? (resultado.value?.data ?? padrao) : padrao;

const Onboarding = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, updateUser, refreshUser } = useAuth();

  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [passo, setPasso] = useState(passoDaQuery(searchParams.get('passo')) || 1);

  const [implantacao, setImplantacao] = useState(null);
  const [clinica, setClinica] = useState(null);
  const [dias, setDias] = useState(() => agruparHorarios([]));
  const [horariosOriginais, setHorariosOriginais] = useState([]);
  const [errosHorarios, setErrosHorarios] = useState({});
  const [procedimentos, setProcedimentos] = useState([]);
  const [profissionais, setProfissionais] = useState([]);
  const [areas, setAreas] = useState([]);

  const painel = useRef(null);
  const decidiuPasso = useRef(false);

  const irParaPasso = useCallback(
    (numero) => {
      const alvo = Math.min(Math.max(numero, 1), TOTAL_PASSOS);
      setPasso(alvo);
      setSearchParams({ passo: String(alvo) }, { replace: true });
    },
    [setSearchParams],
  );

  /** Lê de novo tudo que o servidor decide. Nunca derruba a tela por uma falha. */
  const recarregar = useCallback(async (comEmpresa) => {
    const [checklist, info, horarios, servicos, equipe, areasAtuacao] = await Promise.allSettled([
      comEmpresa ? api.get('/config/implantacao') : Promise.reject(new Error('sem empresa')),
      api.get('/config/info-clinica'),
      comEmpresa ? api.get('/config/horarios-clinica') : Promise.reject(new Error('sem empresa')),
      comEmpresa ? api.get('/procedimentos') : Promise.reject(new Error('sem empresa')),
      comEmpresa ? api.get('/profissionais') : Promise.reject(new Error('sem empresa')),
      comEmpresa ? api.get('/areas-atuacao') : Promise.reject(new Error('sem empresa')),
    ]);

    const linhas = dadosOuVazio(horarios, []);
    setImplantacao(dadosOuVazio(checklist, null));
    setClinica(dadosOuVazio(info, null));
    setHorariosOriginais(linhas);
    setDias(agruparHorarios(linhas));
    setProcedimentos(dadosOuVazio(servicos, []));
    setProfissionais(dadosOuVazio(equipe, []));
    setAreas(dadosOuVazio(areasAtuacao, []));

    return dadosOuVazio(checklist, null);
  }, []);

  // Ao montar: sessão do servidor + checklist, e abre no primeiro passo pendente.
  useEffect(() => {
    let cancelado = false;
    (async () => {
      const sessao = await refreshUser();
      const checklist = await recarregar(Boolean(sessao?.id_info_clinica));
      if (cancelado) return;

      if (!decidiuPasso.current) {
        decidiuPasso.current = true;
        const daUrl = passoDaQuery(searchParams.get('passo'));
        // Sem empresa, o passo 1 é obrigatório: nada mais existe para salvar.
        const alvo = !sessao?.id_info_clinica ? 1 : daUrl || primeiroPassoPendente(checklist);
        irParaPasso(alvo);
      }
      setCarregando(false);
    })();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Foco no painel a cada troca de passo, para quem navega por teclado.
  useEffect(() => {
    if (!carregando) painel.current?.focus();
  }, [passo, carregando]);

  const atualizarChecklist = useCallback(async () => {
    try {
      const { data } = await api.get('/config/implantacao');
      setImplantacao(data);
      return data;
    } catch {
      return null;
    }
  }, []);

  // ===== Passo 1: negócio =====
  const salvarNegocio = async (valores) => {
    setSalvando(true);
    try {
      const payload = {
        nome: valores.nome.trim(),
        telefone: unformatPhone(valores.telefone || '') || null,
        email: (valores.email || '').trim() || null,
        endereco: (valores.endereco || '').trim() || null,
        descricao: (valores.descricao || '').trim() || null,
      };

      if (user?.id_info_clinica) {
        const { data } = await api.put(`/config/info-clinica/${user.id_info_clinica}`, payload);
        setClinica(data);
      } else {
        const { data } = await api.post('/config/info-clinica', payload);
        // O novo token já carrega o `id_info_clinica`; sem ele, toda chamada
        // seguinte responderia "empresa não encontrada".
        updateUser({ id_info_clinica: data.id }, data.access_token);
        setClinica(data);
        await recarregar(true);
      }
      await atualizarChecklist();
      toast.success('Dados do negócio salvos.');
      irParaPasso(2);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Não foi possível salvar os dados agora.');
    } finally {
      setSalvando(false);
    }
  };

  // ===== Passo 2: horários =====
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
      const { data } = await api.get('/config/horarios-clinica');
      setHorariosOriginais(data || []);
      setDias(agruparHorarios(data || []));
      await atualizarChecklist();
      toast.success('Horários salvos.');
      irParaPasso(3);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Não foi possível salvar os horários agora.');
    } finally {
      setSalvando(false);
    }
  };

  // ===== Passo 3: serviços =====
  const criarServico = async (payload) => {
    setSalvando(true);
    try {
      await api.post('/procedimentos', payload);
      const { data } = await api.get('/procedimentos');
      setProcedimentos(data || []);
      await atualizarChecklist();
      toast.success('Serviço cadastrado.');
      return true;
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Não foi possível salvar o serviço agora.');
      return false;
    } finally {
      setSalvando(false);
    }
  };

  // ===== Passo 4: equipe =====
  const criarProfissional = async ({ procedimentos: escolhidos, disponibilidades, ...dadosPessoa }) => {
    setSalvando(true);
    try {
      const { data } = await api.post('/profissionais', dadosPessoa);
      if (escolhidos?.length) {
        await api.post(`/profissionais/${data.id}/procedimentos`, escolhidos);
      }
      await api.post(`/profissionais/${data.id}/disponibilidade`, disponibilidades || []);
      const lista = await api.get('/profissionais');
      setProfissionais(lista.data || []);
      await atualizarChecklist();
      toast.success('Profissional cadastrado.');
      return true;
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Não foi possível salvar o profissional agora.');
      return false;
    } finally {
      setSalvando(false);
    }
  };

  /**
   * Atalho "Sou eu mesmo" (contrato P3). Autônomo é o cliente inicial: ele é o
   * profissional, atende tudo que cadastrou e trabalha no horário do negócio.
   */
  const souEuMesmo = async () => {
    const disponibilidades = disponibilidadeDosHorarios(dias);
    if (!disponibilidades.length) {
      toast.error('Defina os horários do negócio antes — são eles que viram a sua disponibilidade.');
      irParaPasso(2);
      return;
    }
    if (!procedimentos.length) {
      toast.error('Cadastre pelo menos um serviço antes.');
      irParaPasso(3);
      return;
    }
    await criarProfissional({
      nome: (user?.nome || '').trim() || 'Responsável',
      email: user?.email || null,
      whats: null,
      id_area_atuacao: null,
      ativo: true,
      observacoes: null,
      procedimentos: procedimentos.map((proc) => proc.id),
      disponibilidades,
    });
  };

  // ===== Passo 5: atendente =====
  const salvarAtendente = async (valores) => {
    setSalvando(true);
    try {
      const { data } = await api.put(`/config/info-clinica/${user.id_info_clinica}`, valores);
      setClinica(data);
      await atualizarChecklist();
      toast.success('Sua atendente está pronta.');
      irParaPasso(6);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Não foi possível salvar a atendente agora.');
    } finally {
      setSalvando(false);
    }
  };

  // ===== Concluir =====
  const concluir = async () => {
    setSalvando(true);
    try {
      await api.put(`/config/info-clinica/${user.id_info_clinica}`, { onboarding_completo: true });
      await refreshUser();
      toast.success('Implantação concluída.');
      navigate('/dashboard');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Não foi possível concluir agora.');
    } finally {
      setSalvando(false);
    }
  };

  if (carregando) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loading label="Carregando sua implantação" className="" />
      </div>
    );
  }

  const passoAtual = PASSOS.find((item) => item.numero === passo) || PASSOS[0];
  const Icone = ICONES[passoAtual.chave];
  const feito = (chave) => Boolean(implantacao?.[chave]);
  const podeContinuarDepois = passo >= 2 && Boolean(user?.id_info_clinica);

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="mx-auto w-full max-w-3xl py-8">
        <div className="text-center">
          <img src="/assets/logo.png" alt="Agenda Magnética" className="mx-auto h-14" />
          <h1 className="mt-6 font-display text-3xl font-bold text-ink">
            Vamos deixar sua recepção pronta
          </h1>
          <p className="mt-2 text-muted-foreground">
            São 6 passos. Você pode parar e voltar quando quiser — nada se perde.
          </p>
        </div>

        {/* Progresso */}
        <nav aria-label="Passos da implantação" className="mt-8">
          <p className="text-center text-sm font-semibold text-primary" aria-live="polite">
            Passo {passo} de {TOTAL_PASSOS} · {passoAtual.titulo}
          </p>
          <ol className="mt-3 flex items-center justify-center gap-1.5 sm:gap-2">
            {PASSOS.map((item) => {
              const concluido = feito(item.chave);
              const atual = item.numero === passo;
              const podeIr = Boolean(user?.id_info_clinica) || item.numero === 1;
              return (
                <li key={item.numero}>
                  <button
                    type="button"
                    onClick={() => podeIr && irParaPasso(item.numero)}
                    disabled={!podeIr}
                    aria-current={atual ? 'step' : undefined}
                    aria-label={`Passo ${item.numero}: ${item.titulo}${concluido ? ' (concluído)' : ''}`}
                    className={`flex h-10 w-10 items-center justify-center rounded-full font-display text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                      atual
                        ? 'bg-primary text-white ring-2 ring-primary/30 ring-offset-2'
                        : concluido
                          ? 'bg-primary/15 text-primary'
                          : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {concluido && !atual ? <Check size={18} /> : item.numero}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <Card
          className="animate-enter mt-8 p-6 sm:p-8"
          ref={painel}
          tabIndex={-1}
          role="region"
          aria-label={`Passo ${passo}: ${passoAtual.titulo}`}
        >
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-primary">
              <Icone size={22} />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-lg font-bold text-ink">{passoAtual.titulo}</h2>
              <p className="text-sm text-muted-foreground">{SUBTITULOS[passoAtual.chave]}</p>
            </div>
          </div>

          <div className="mt-6">
            {passo === 1 && (
              <PassoNegocio clinica={clinica} salvando={salvando} aoSalvar={salvarNegocio} />
            )}

            {passo === 2 && (
              <>
                <HorariosEditor dias={dias} aoMudar={setDias} erros={errosHorarios} />
                <Navegacao
                  aoVoltar={() => irParaPasso(1)}
                  aoAvancar={salvarHorarios}
                  salvando={salvando}
                  rotuloAvancar="Salvar e continuar"
                />
              </>
            )}

            {passo === 3 && (
              <>
                <ListaSimples
                  itens={procedimentos.map((proc) => `${proc.nome} · ${proc.duracao_minutos} min`)}
                  vazio="Nenhum serviço cadastrado ainda."
                />
                <div className="mt-5 rounded-2xl border border-border/70 p-5">
                  <h3 className="mb-4 font-display text-base font-bold text-ink">Novo serviço</h3>
                  <ServicoForm
                    enxuto
                    enviando={salvando}
                    aoSalvar={criarServico}
                    textoBotao="Adicionar serviço"
                    idPrefixo="onb-servico"
                  />
                </div>
                <Navegacao
                  aoVoltar={() => irParaPasso(2)}
                  aoAvancar={() => irParaPasso(4)}
                  bloqueado={procedimentos.length === 0}
                  aviso="Cadastre pelo menos um serviço para continuar."
                />
              </>
            )}

            {passo === 4 && (
              <>
                <div className="surface-muted flex flex-wrap items-center justify-between gap-4 p-5">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">Atende sozinho?</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      Criamos você como profissional, com todos os serviços e os horários do negócio.
                    </p>
                  </div>
                  <Button type="button" onClick={souEuMesmo} disabled={salvando}>
                    <UserPlus size={18} />
                    Sou eu mesmo
                  </Button>
                </div>

                <div className="mt-5">
                  <ListaSimples
                    itens={profissionais.map((prof) => prof.nome)}
                    vazio="Ninguém cadastrado ainda."
                  />
                </div>

                <div className="mt-5 rounded-2xl border border-border/70 p-5">
                  <h3 className="mb-4 font-display text-base font-bold text-ink">Novo profissional</h3>
                  <ProfissionalForm
                    areas={areas}
                    procedimentos={procedimentos}
                    enviando={salvando}
                    aoSalvar={criarProfissional}
                    textoBotao="Adicionar profissional"
                    idPrefixo="onb-profissional"
                  />
                </div>

                <Navegacao
                  aoVoltar={() => irParaPasso(3)}
                  aoAvancar={() => irParaPasso(5)}
                  bloqueado={!feito('equipe')}
                  aviso="Cadastre alguém com pelo menos um serviço e um horário de trabalho."
                />
              </>
            )}

            {passo === 5 && (
              <PassoAtendente clinica={clinica} salvando={salvando} aoSalvar={salvarAtendente} />
            )}

            {passo === 6 && (
              <>
                <ConexaoWhatsApp
                  automacaoAtiva={Boolean(implantacao?.automacao_ativa)}
                  aoMudarAutomacao={(ativa) =>
                    setImplantacao((atual) => ({ ...(atual || {}), automacao_ativa: ativa }))
                  }
                  aoMudarConexao={atualizarChecklist}
                />
                <div className="mt-8 flex flex-wrap justify-between gap-3">
                  <Button variant="outline" size="lg" onClick={() => irParaPasso(5)}>
                    <ChevronLeft size={18} />
                    Voltar
                  </Button>
                  <Button size="lg" onClick={concluir} disabled={salvando}>
                    {salvando ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                    {implantacao?.automacao_ativa ? 'Concluir' : 'Concluir sem ativar'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </Card>

        {podeContinuarDepois && (
          <p className="mt-6 text-center">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="text-sm font-semibold text-muted-foreground underline underline-offset-4 hover:text-primary"
            >
              Continuar depois
            </button>
          </p>
        )}
      </div>
    </div>
  );
};

const SUBTITULOS = {
  negocio: 'O nome e o contato que a sua recepção usa para se apresentar.',
  horarios: 'Quando o negócio atende. Deixe em branco os dias fechados.',
  servicos: 'Duração e valor definem os horários que a recepção oferece.',
  equipe: 'Quem atende, o que faz e em que horários.',
  atendente: 'O nome e o jeito de falar de quem recebe seus clientes.',
  whatsapp: 'Conecte o número, teste de outro telefone e ative o atendimento.',
};

const Navegacao = ({ aoVoltar, aoAvancar, salvando, bloqueado, aviso, rotuloAvancar = 'Continuar' }) => (
  <div className="mt-8">
    {bloqueado && aviso && <p className="mb-3 text-sm text-muted-foreground">{aviso}</p>}
    <div className="flex flex-wrap justify-between gap-3">
      <Button variant="outline" size="lg" onClick={aoVoltar} type="button">
        <ChevronLeft size={18} />
        Voltar
      </Button>
      <Button size="lg" onClick={aoAvancar} disabled={salvando || bloqueado} type="button">
        {salvando ? <Loader2 size={18} className="animate-spin" /> : null}
        {salvando ? 'Salvando...' : rotuloAvancar}
        {!salvando && <ChevronRight size={18} />}
      </Button>
    </div>
  </div>
);

const ListaSimples = ({ itens, vazio }) =>
  itens.length === 0 ? (
    <p className="surface-muted px-4 py-3 text-sm text-muted-foreground">{vazio}</p>
  ) : (
    <ul className="space-y-2">
      {itens.map((texto, indice) => (
        <li
          key={`${texto}-${indice}`}
          className="surface-muted flex items-center gap-2 px-4 py-3 text-sm font-medium text-ink"
        >
          <Check size={16} className="shrink-0 text-primary" />
          {texto}
        </li>
      ))}
    </ul>
  );

const PassoNegocio = ({ clinica, salvando, aoSalvar }) => {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(negocioSchema),
    defaultValues: {
      nome: clinica?.nome || '',
      telefone: formatPhone(clinica?.telefone || ''),
      email: clinica?.email || '',
      endereco: clinica?.endereco || '',
      descricao: clinica?.descricao || '',
    },
  });
  const telefone = watch('telefone');

  return (
    <form onSubmit={handleSubmit(aoSalvar)} className="space-y-4" noValidate>
      <div>
        <Label htmlFor="negocio-nome">Nome do negócio *</Label>
        <Input
          id="negocio-nome"
          placeholder="Ex.: Studio Bem Estar"
          {...descricaoDoCampo('negocio-nome', errors.nome?.message)}
          {...register('nome')}
        />
        <CampoErro id="negocio-nome-erro" mensagem={errors.nome?.message} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="negocio-telefone">Telefone</Label>
          <Input
            id="negocio-telefone"
            type="tel"
            inputMode="tel"
            maxLength={15}
            placeholder="(00) 00000-0000"
            {...descricaoDoCampo('negocio-telefone', errors.telefone?.message)}
            {...register('telefone')}
            value={telefone || ''}
            onChange={(evento) =>
              setValue('telefone', formatPhone(evento.target.value), {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
          />
          <CampoErro id="negocio-telefone-erro" mensagem={errors.telefone?.message} />
        </div>
        <div>
          <Label htmlFor="negocio-email">E-mail</Label>
          <Input
            id="negocio-email"
            type="email"
            {...descricaoDoCampo('negocio-email', errors.email?.message)}
            {...register('email')}
          />
          <CampoErro id="negocio-email-erro" mensagem={errors.email?.message} />
        </div>
      </div>

      <div>
        <Label htmlFor="negocio-endereco">Endereço</Label>
        <Input
          id="negocio-endereco"
          placeholder="Rua, número, bairro, cidade"
          {...descricaoDoCampo('negocio-endereco', errors.endereco?.message)}
          {...register('endereco')}
        />
        <CampoErro id="negocio-endereco-erro" mensagem={errors.endereco?.message} />
      </div>

      <div>
        <Label htmlFor="negocio-descricao">Sobre o negócio</Label>
        <Textarea
          id="negocio-descricao"
          rows={6}
          placeholder="Formas de pagamento, convênios, estacionamento, o que levar na primeira sessão, política de cancelamento."
          {...descricaoDoCampo('negocio-descricao', errors.descricao?.message)}
          {...register('descricao')}
        />
        <CampoErro id="negocio-descricao-erro" mensagem={errors.descricao?.message} />
        <p className="field-hint">A sua recepção usa este texto para responder o que não está no catálogo. Qualquer pessoa que escrever no WhatsApp pode receber este texto de volta. Uma informação por linha, e nada de nome, telefone ou dado de cliente.</p>
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" size="lg" disabled={salvando}>
          {salvando ? <Loader2 size={18} className="animate-spin" /> : null}
          {salvando ? 'Salvando...' : 'Salvar e continuar'}
          {!salvando && <ChevronRight size={18} />}
        </Button>
      </div>
    </form>
  );
};

const PassoAtendente = ({ clinica, salvando, aoSalvar }) => {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(atendenteSchema),
    defaultValues: {
      assistente_nome: clinica?.assistente_nome || '',
      assistente_tom: clinica?.assistente_tom || 'acolhedor',
      exige_profissional: Boolean(clinica?.exige_profissional),
    },
  });

  const nome = watch('assistente_nome');
  const tom = watch('assistente_tom');
  const exige = watch('exige_profissional');

  return (
    <form onSubmit={handleSubmit(aoSalvar)} className="space-y-5" noValidate>
      <div>
        <Label htmlFor="atendente-nome">Como ela se chama? *</Label>
        <Input
          id="atendente-nome"
          maxLength={40}
          placeholder="Ex.: Marina"
          {...descricaoDoCampo('atendente-nome', errors.assistente_nome?.message)}
          {...register('assistente_nome')}
        />
        <CampoErro id="atendente-nome-erro" mensagem={errors.assistente_nome?.message} />
        <p className="field-hint">Só letras e espaços, até 40 caracteres.</p>
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-foreground">Jeito de conversar *</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {TONS.map((opcao) => (
            <label
              key={opcao.valor}
              className={`cursor-pointer rounded-2xl border p-4 transition ${
                tom === opcao.valor ? 'border-primary bg-accent' : 'border-border/70 hover:border-primary/40'
              }`}
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  value={opcao.valor}
                  className="h-4 w-4 accent-primary"
                  {...register('assistente_tom')}
                />
                <span className="font-semibold text-ink">{opcao.rotulo}</span>
              </span>
              <span className="mt-1.5 block text-xs text-muted-foreground">{opcao.descricao}</span>
            </label>
          ))}
        </div>
        <CampoErro id="atendente-tom-erro" mensagem={errors.assistente_tom?.message} />
      </fieldset>

      <div className="surface-muted p-5">
        <p className="text-xs font-bold uppercase tracking-[.12em] text-muted-foreground">
          Prévia da primeira mensagem
        </p>
        <p className="mt-2 text-sm leading-6 text-ink" aria-live="polite">
          {fraseDeExemplo(nome, tom)}
        </p>
      </div>

      <div className="flex items-start gap-3">
        <Switch
          id="atendente-exige-profissional"
          checked={exige}
          onCheckedChange={(marcado) => setValue('exige_profissional', marcado, { shouldDirty: true })}
        />
        <Label htmlFor="atendente-exige-profissional" className="leading-6">
          Perguntar com quem a pessoa quer ser atendida
          <span className="block text-xs font-normal text-muted-foreground">
            Deixe desligado se tanto faz quem atende — a conversa fica mais curta.
          </span>
        </Label>
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" size="lg" disabled={salvando}>
          {salvando ? <Loader2 size={18} className="animate-spin" /> : null}
          {salvando ? 'Salvando...' : 'Salvar e continuar'}
          {!salvando && <ChevronRight size={18} />}
        </Button>
      </div>
    </form>
  );
};

export default Onboarding;
