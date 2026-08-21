import { useState } from "react";
import { ArrowRight, Check, Clock3, Sparkles, Star } from "lucide-react";
import { appLinks } from "@/lib/appUrl";

/**
 * Códigos e preços vêm de apps/dashboard/src/pages/EscolherPlano.jsx e são
 * provisórios. Só entram em `recursos` itens que existem hoje no produto;
 * o restante fica em `roadmap`, marcado como ainda não disponível.
 */
const planos = [
  {
    id: "essencial",
    nome: "Essencial",
    descricao: "Ideal para começar",
    precoMensal: 399,
    precoAnual: 297,
    popular: false,
    recursos: [
      "Atendimento no WhatsApp com as regras que você define",
      "Agendamento a partir dos horários reais da sua agenda",
      "Central do dia com o que precisa da sua atenção",
      "Cadastro de clientes, serviços e horários de funcionamento",
      "Suporte e manutenção contínuos",
    ],
    roadmap: [],
  },
  {
    id: "premium",
    nome: "Premium",
    descricao: "O mais escolhido",
    precoMensal: 599,
    precoAnual: 467,
    popular: true,
    recursos: [
      "Tudo do plano Essencial",
      "Vários profissionais na mesma agenda",
      "Disponibilidade e serviços por profissional",
      "Acompanhamento de implantação por 90 dias",
    ],
    roadmap: ["Lembretes de consulta", "Histórico do cliente para recomendações", "Avaliações pós-atendimento"],
  },
  {
    id: "personalizado",
    nome: "Personalizado",
    descricao: "Para clínicas que querem mais",
    precoMinimo: 799,
    popular: false,
    recursos: [
      "Tudo dos planos anteriores",
      "Configuração sob medida para o seu fluxo de atendimento",
      "Conversa direta com o time durante a implantação",
    ],
    roadmap: ["Cadastro automático de clientes", "Envio de links de pagamento", "Campanhas por data", "Triagem inicial"],
  },
];

const Plans = () => {
  const [cobranca, setCobranca] = useState<"mensal" | "anual">("anual");

  return (
    <section id="planos" className="section-space">
      <div className="container">
        <div className="mx-auto max-w-3xl text-center">
          <div className="eyebrow mb-6"><Sparkles className="h-4 w-4" /> Planos</div>
          <h2 className="section-title">
            Escolha o plano e comece <span className="gradient-text">pelo teste grátis</span>.
          </h2>
          <p className="section-copy mx-auto mt-6">
            São 7 dias de teste antes de qualquer cobrança. Você configura seus serviços e horários e vê a
            recepção funcionando com o seu próprio atendimento.
          </p>
        </div>

        <div className="mt-10 flex justify-center">
          <div
            className="inline-flex rounded-full border border-foreground/[.08] bg-white p-1 shadow-sm"
            role="group"
            aria-label="Periodicidade da cobrança"
          >
            {(["mensal", "anual"] as const).map((opcao) => (
              <button
                key={opcao}
                type="button"
                onClick={() => setCobranca(opcao)}
                aria-pressed={cobranca === opcao}
                className={`rounded-full px-6 py-2.5 text-sm font-bold transition ${
                  cobranca === opcao ? "surface-green" : "text-foreground/70 hover:text-primary"
                }`}
              >
                {opcao === "mensal" ? "Mensal" : "Anual"}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-12 grid items-start gap-6 lg:grid-cols-3">
          {planos.map((plano) => {
            const preco = plano.precoMinimo ?? (cobranca === "anual" ? plano.precoAnual : plano.precoMensal);

            return (
              <article
                key={plano.id}
                className={`reveal relative flex h-full flex-col rounded-3xl p-8 ${
                  plano.popular
                    ? "surface-green shadow-card lg:-mt-4 lg:pb-10 lg:pt-12"
                    : "card-soft card-lift"
                }`}
              >
                {plano.popular && (
                  <>
                    <span className="glow -right-16 -top-16 h-48 w-48 bg-apricot/30" aria-hidden="true" />
                    <span className="absolute -top-3.5 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-gradient-to-r from-coral to-apricot px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-ink">
                      <Star className="h-3 w-3" /> Mais escolhido
                    </span>
                  </>
                )}

                <div className={plano.popular ? "text-white" : ""}>
                  <h3 className="font-display text-2xl font-bold">{plano.nome}</h3>
                  <p className={`mt-1 text-sm ${plano.popular ? "text-white/70" : "text-foreground/65"}`}>
                    {plano.descricao}
                  </p>

                  <p className="mt-6 flex items-end gap-1.5">
                    {plano.precoMinimo && (
                      <span className={`pb-2 text-sm ${plano.popular ? "text-white/70" : "text-foreground/65"}`}>
                        a partir de
                      </span>
                    )}
                    <span className={`pb-1.5 text-lg font-bold ${plano.popular ? "text-white/80" : "text-foreground/70"}`}>
                      R$
                    </span>
                    <strong className="font-display text-5xl font-bold leading-none">{preco}</strong>
                    <span className={`pb-1.5 text-sm ${plano.popular ? "text-white/70" : "text-foreground/65"}`}>
                      /mês
                    </span>
                  </p>
                  <p className={`mt-1.5 text-xs ${plano.popular ? "text-white/70" : "text-foreground/65"}`}>
                    {plano.precoMinimo
                      ? "valor final definido junto com o time"
                      : cobranca === "anual"
                        ? `no plano anual · R$ ${plano.precoMensal} no mensal`
                        : "no plano mensal"}
                  </p>
                </div>

                <ul className={`mt-7 space-y-3 text-sm ${plano.popular ? "text-white/85" : "text-foreground/70"}`}>
                  {plano.recursos.map((recurso) => (
                    <li key={recurso} className="flex gap-3">
                      <Check className={`mt-0.5 h-4 w-4 shrink-0 ${plano.popular ? "text-apricot" : "text-primary"}`} />
                      <span>{recurso}</span>
                    </li>
                  ))}
                </ul>

                {plano.roadmap.length > 0 && (
                  <div
                    className={`mt-5 rounded-2xl px-4 py-3.5 ${
                      plano.popular ? "bg-white/10" : "bg-cream border border-foreground/[.06]"
                    }`}
                  >
                    <p
                      className={`flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.12em] ${
                        plano.popular ? "text-apricot" : "text-coral-deep"
                      }`}
                    >
                      <Clock3 className="h-3.5 w-3.5" /> Ainda não disponível
                    </p>
                    <ul className={`mt-2 space-y-1 text-xs ${plano.popular ? "text-white/65" : "text-foreground/65"}`}>
                      {plano.roadmap.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <a
                  href={plano.id === "personalizado" ? "#contato" : appLinks.plano(plano.id)}
                  className={`btn btn-lg mt-8 w-full ${plano.popular ? "btn-warm" : "btn-primary"}`}
                >
                  {plano.id === "personalizado" ? "Falar com o time" : "Começar grátis"}
                  <ArrowRight className="h-4 w-4" />
                </a>
              </article>
            );
          })}
        </div>

        <p className="mt-8 text-center text-sm text-foreground/65">
          Os itens marcados como “ainda não disponível” estão no plano de evolução do produto e não fazem parte do
          que você recebe hoje.
        </p>
      </div>
    </section>
  );
};

export default Plans;
