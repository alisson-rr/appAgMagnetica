import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Clock3, LogOut, Star } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { toast } from 'sonner';
import { PLANOS } from '../data/planos';
import { useAuth } from '../context/AuthContext';

const dataDoTrial = (valor) => {
  if (!valor) return null;
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data.toLocaleDateString('pt-BR');
};

const EscolherPlano = () => {
  const [planoSelecionado, setPlanoSelecionado] = useState(null);
  const [tipoCobranca, setTipoCobranca] = useState('anual');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const fimDoTrial = dataDoTrial(user?.trial_fim);
  const podeVoltarAoPainel = Boolean(user && !user.trial_expirado);

  // PONTO DE INTEGRAÇÃO DE COBRANÇA
  // Hoje este handler só anota a escolha e devolve o usuário ao painel.
  // O agente de billing substitui o corpo por: criar a sessão de checkout no
  // backend (com o preço do plano e o período em `tipoCobranca`) e redirecionar.
  // Nenhuma chave, SDK ou chamada de pagamento existe neste arquivo.
  const handleEscolherPlano = async (plano) => {
    setPlanoSelecionado(plano.id);
    setLoading(true);

    try {
      localStorage.setItem('plano_escolhido', plano.id);

      if (plano.id === 'personalizado') {
        toast.success('Entraremos em contato para personalizar seu plano!');
      } else {
        toast.success(
          fimDoTrial
            ? `Assinatura disponível em breve; seu teste segue até ${fimDoTrial}.`
            : `Plano ${plano.nome} anotado. A assinatura fica disponível em breve.`,
        );
      }

      // Quem já está logado nunca é mandado para o login: isso derrubava a
      // sessão no meio do trial e parecia erro do sistema (contrato §4.2).
      setTimeout(() => {
        navigate(user ? '/dashboard' : '/login');
      }, 1500);
    } catch (error) {
      toast.error('Erro ao selecionar plano');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <img src="/assets/logo.png" alt="Agenda Magnética" className="h-16" />
          {user && (
            <div className="flex flex-wrap items-center gap-2">
              {podeVoltarAoPainel && (
                <Button variant="outline" onClick={() => navigate('/dashboard')}>
                  <ArrowLeft size={16} /> Voltar ao painel
                </Button>
              )}
              <Button variant="outline" onClick={logout}>
                <LogOut size={16} /> Sair da conta
              </Button>
            </div>
          )}
        </div>

        {user?.trial_expirado && (
          <p className="mt-6 rounded-2xl bg-coral-soft px-4 py-3 text-center text-sm font-semibold text-coral-deep">
            Seu período de teste terminou. Escolha um plano para continuar usando o painel.
          </p>
        )}

        <div className="mt-8 text-center">
          <h1 className="font-display text-3xl font-bold text-ink md:text-4xl">
            Escolha o plano <span className="gradient-text">ideal</span> para o seu negócio
          </h1>
          <p className="mt-3 text-muted-foreground">
            Todos os planos incluem configuração acompanhada e suporte.
          </p>
        </div>

        <div className="mt-8 flex justify-center">
          <div
            className="inline-flex rounded-full border border-border/70 bg-card p-1 shadow-soft"
            role="group"
            aria-label="Periodicidade da cobrança"
          >
            {['mensal', 'anual'].map((opcao) => (
              <button
                key={opcao}
                type="button"
                onClick={() => setTipoCobranca(opcao)}
                aria-pressed={tipoCobranca === opcao}
                className={`rounded-full px-6 py-2.5 text-sm font-semibold transition ${
                  tipoCobranca === opcao ? 'bg-primary text-white' : 'text-muted-foreground hover:text-primary'
                }`}
              >
                {opcao === 'mensal' ? 'Mensal' : 'Anual'}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-10 grid items-start gap-6 md:grid-cols-3">
          {PLANOS.map((plano) => {
            const preco = plano.precoMinimo ?? (tipoCobranca === 'anual' ? plano.precoAnual : plano.precoMensal);
            const processando = loading && planoSelecionado === plano.id;

            return (
              <Card
                key={plano.id}
                className={`relative flex h-full flex-col p-8 ${
                  plano.popular ? 'border-primary/30 shadow-card md:-mt-3 md:pt-10' : ''
                }`}
              >
                {plano.popular && (
                  <span
                    className="absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-ink"
                    style={{ background: 'var(--gradient-warm)' }}
                  >
                    <Star className="h-3 w-3" /> Mais escolhido
                  </span>
                )}

                <h2 className="font-display text-xl font-bold text-primary">{plano.nome}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{plano.descricao}</p>

                <p className="mt-6 flex items-end gap-1.5">
                  {plano.precoMinimo && (
                    <span className="pb-2 text-sm text-muted-foreground">a partir de</span>
                  )}
                  <span className="pb-1.5 text-base font-bold text-foreground/70">R$</span>
                  <strong className="font-display text-4xl font-bold leading-none text-ink">{preco}</strong>
                  <span className="pb-1.5 text-sm text-muted-foreground">/mês</span>
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {plano.precoMinimo
                    ? 'valor final definido junto com o time'
                    : tipoCobranca === 'anual'
                      ? `no plano anual · R$ ${plano.precoMensal} no mensal`
                      : 'no plano mensal'}
                </p>

                <ul className="mt-6 flex-1 space-y-3">
                  {plano.recursos.map((recurso) => (
                    <li key={recurso} className="flex items-start gap-3 text-sm text-foreground/80">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>{recurso}</span>
                    </li>
                  ))}
                </ul>

                {plano.roadmap.length > 0 && (
                  <div className="surface-muted mt-5 p-4">
                    <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.1em] text-coral-deep">
                      <Clock3 className="h-3.5 w-3.5" /> Ainda não disponível
                    </p>
                    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {plano.roadmap.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <Button
                  onClick={() => handleEscolherPlano(plano)}
                  disabled={processando}
                  size="lg"
                  variant={plano.popular ? 'default' : 'outline'}
                  className={`mt-7 w-full ${plano.popular ? '' : 'border-primary/40 text-primary'}`}
                >
                  {processando
                    ? 'Processando...'
                    : plano.id === 'personalizado'
                      ? 'Quero um plano personalizado'
                      : 'Escolher este plano'}
                </Button>
              </Card>
            );
          })}
        </div>

        <p className="mt-10 text-center text-sm text-muted-foreground">
          Os itens marcados como “ainda não disponível” fazem parte do plano de evolução do produto.
        </p>
      </div>
    </div>
  );
};

export default EscolherPlano;
