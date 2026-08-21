import {
  ArrowRight,
  BarChart3,
  CalendarCheck2,
  CheckCircle2,
  ChevronRight,
  CirclePause,
  Clock3,
  HeartHandshake,
  Inbox,
  LockKeyhole,
  MessageCircle,
  MessagesSquare,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
  WandSparkles,
} from "lucide-react";
import LeadForm from "@/components/LeadForm";

const audiences = [
  "Estética",
  "Odontologia",
  "Quiropraxia",
  "Podologia",
  "Fisioterapia",
  "Psicologia",
  "Bem-estar",
  "Outros serviços",
];

const routineSteps = [
  {
    icon: MessageCircle,
    number: "01",
    title: "Responde",
    text: "Acolhe cada contato no WhatsApp, entende o pedido e responde as dúvidas que você autorizou.",
  },
  {
    icon: CalendarCheck2,
    number: "02",
    title: "Agenda",
    text: "Consulta horários reais, oferece opções e registra o agendamento sem conversa perdida no caminho.",
  },
  {
    icon: ShieldCheck,
    number: "03",
    title: "Protege",
    text: "Confirma presenças, recebe cancelamentos a tempo e deixa o horário livre para ser recuperado.",
  },
  {
    icon: UserRoundCheck,
    number: "04",
    title: "Entrega para você",
    text: "Quando aparece uma exceção, uma dúvida sensível ou uma decisão humana, você assume com contexto.",
  },
];

const faqs = [
  {
    question: "Ela substitui meu atendimento humano?",
    answer:
      "Não. Ela assume o operacional repetitivo e chama você quando a conversa precisa de julgamento, cuidado ou negociação. Você pode pausar a automação e assumir a qualquer momento.",
  },
  {
    question: "A conversa não fica com cara de robô?",
    answer:
      "A Agenda Magnética usa o tom, os serviços e as regras do seu negócio. Ainda assim, ela não finge ser você: trabalha como assistente virtual e mantém uma saída clara para atendimento humano.",
  },
  {
    question: "Serve para quem trabalha sozinho?",
    answer:
      "É justamente onde o ganho fica mais visível. Enquanto você está atendendo, dirigindo ou descansando, os contatos não ficam sem orientação e a agenda continua organizada.",
  },
  {
    question: "E para serviços de saúde?",
    answer:
      "O foco é administrativo: informações autorizadas, agendamento, confirmação e encaminhamento. Dúvidas clínicas e situações sensíveis devem ser transferidas a uma pessoa, com coleta mínima de dados.",
  },
  {
    question: "Funciona com a agenda que eu já uso?",
    answer:
      "A compatibilidade depende da sua agenda e do seu fluxo atual. Na demonstração, mapeamos o cenário e deixamos claro o que integra, o que precisa ser ajustado e o que não vale automatizar.",
  },
];

const scrollTo = (id: string) => {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
};

const Index = () => {
  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-foreground/10 bg-background/90 backdrop-blur-xl">
        <div className="container flex items-center justify-between py-3">
          <button
            type="button"
            onClick={() => scrollTo("inicio")}
            className="flex items-center gap-3 text-left"
            aria-label="Voltar ao início"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-foreground/10">
              <img src="/images/logo.png" alt="" className="h-8 w-8 object-contain" />
            </span>
            <span className="font-display text-lg font-bold tracking-tight sm:text-xl">
              Agenda <span className="text-primary">Magnética</span>
            </span>
          </button>

          <nav className="hidden items-center gap-7 md:flex" aria-label="Navegação principal">
            <button onClick={() => scrollTo("por-dentro")} className="nav-link">Como funciona</button>
            <button onClick={() => scrollTo("controle")} className="nav-link">Controle</button>
            <button onClick={() => scrollTo("duvidas")} className="nav-link">Dúvidas</button>
          </nav>

          <button onClick={() => scrollTo("lead-form")} className="brand-button hidden sm:inline-flex">
            Ver no meu negócio <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main>
        <section id="inicio" className="hero-shell relative pt-32 md:pt-40">
          <div className="dot-grid absolute inset-0 opacity-45" />
          <div className="magnetic-glow magnetic-glow-left" />
          <div className="magnetic-glow magnetic-glow-right" />

          <div className="container relative grid items-center gap-14 pb-20 lg:grid-cols-[1.02fr_.98fr] lg:gap-16 lg:pb-28">
            <div className="max-w-3xl">
              <div className="eyebrow mb-7">
                <Sparkles className="h-4 w-4" />
                Recepção inteligente para quem atende com hora marcada
              </div>

              <h1 className="font-display text-[clamp(3rem,6.2vw,6.7rem)] font-bold leading-[.93] tracking-[-.055em]">
                Você cuida dos seus clientes.
                <span className="mt-3 block text-primary">A agenda cuida do resto.</span>
              </h1>

              <p className="mt-7 max-w-2xl text-lg leading-relaxed text-foreground/70 md:text-xl">
                A Agenda Magnética atende no WhatsApp, organiza horários, confirma presenças e mostra o que precisa da sua atenção — sem você viver de plantão no celular.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <button onClick={() => scrollTo("lead-form")} className="brand-button brand-button-large">
                  Quero ver funcionando <ArrowRight className="h-5 w-5" />
                </button>
                <button onClick={() => scrollTo("por-dentro")} className="secondary-button">
                  Conhecer por dentro <ChevronRight className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm text-foreground/60">
                <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> Implantação acompanhada</span>
                <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> Você mantém o controle</span>
                <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> Feita para rotina real</span>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-[650px] lg:mx-0">
              <div className="product-window">
                <div className="flex items-center justify-between border-b border-foreground/10 px-5 py-4 sm:px-6">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="live-dot" />
                      <p className="text-xs font-bold uppercase tracking-[.16em] text-primary">Central do dia</p>
                    </div>
                    <p className="mt-1 font-display text-xl font-bold">Bom dia, Marina.</p>
                  </div>
                  <span className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">Exemplo da experiência</span>
                </div>

                <div className="grid gap-3 p-4 sm:grid-cols-3 sm:p-6">
                  <div className="metric-card sm:col-span-2">
                    <div className="flex items-center justify-between">
                      <span className="metric-label">Sua agenda hoje</span>
                      <CalendarCheck2 className="h-5 w-5 text-primary" />
                    </div>
                    <div className="mt-3 flex items-end gap-3">
                      <strong className="font-display text-4xl">8</strong>
                      <span className="pb-1 text-sm text-foreground/55">atendimentos</span>
                    </div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-foreground/10">
                      <div className="h-full w-3/4 rounded-full bg-primary" />
                    </div>
                    <div className="mt-3 flex gap-4 text-xs text-foreground/60">
                      <span><b className="text-primary">6</b> confirmados</span>
                      <span><b className="text-coral-dark">2</b> aguardando</span>
                    </div>
                  </div>

                  <div className="metric-card bg-ink text-white">
                    <span className="metric-label text-white/55">Resolvido por você</span>
                    <strong className="mt-3 block font-display text-4xl">1</strong>
                    <span className="mt-1 block text-xs text-white/60">só uma exceção</span>
                  </div>

                  <div className="attention-card sm:col-span-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-coral/20 text-coral-dark">
                      <Clock3 className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold">Um horário pode ser recuperado</p>
                        <span className="rounded-full bg-coral/20 px-2.5 py-1 text-[11px] font-bold text-coral-dark">AÇÃO SUGERIDA</span>
                      </div>
                      <p className="mt-1 text-sm text-foreground/60">Cancelamento às 15h. Há 3 pessoas compatíveis na lista de espera.</p>
                    </div>
                  </div>

                  <div className="chat-card sm:col-span-3">
                    <div className="flex items-center justify-between border-b border-foreground/10 pb-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary"><MessagesSquare className="h-4 w-4" /></div>
                        <div><p className="text-sm font-semibold">Conversa concluída</p><p className="text-xs text-foreground/50">WhatsApp · há 2 min</p></div>
                      </div>
                      <CheckCircle2 className="h-5 w-5 text-primary" />
                    </div>
                    <div className="mt-4 grid gap-2 text-sm sm:grid-cols-[.92fr_1.08fr]">
                      <div className="rounded-2xl rounded-tl-md bg-foreground/5 p-3 text-foreground/70">Tem horário depois das 18h?</div>
                      <div className="rounded-2xl rounded-tr-md bg-primary p-3 text-white">Sim. Posso reservar amanhã às 18h30 ou quinta às 19h. Qual fica melhor?</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="absolute -bottom-6 -left-6 -z-10 h-36 w-36 rounded-full bg-coral/25 blur-3xl" />
            </div>
          </div>
        </section>

        <section className="border-y border-foreground/10 bg-white/60 py-7">
          <div className="container">
            <p className="mb-4 text-center text-xs font-bold uppercase tracking-[.18em] text-foreground/40">Para negócios em que cada horário importa</p>
            <div className="flex flex-wrap justify-center gap-2.5">
              {audiences.map((audience) => <span key={audience} className="audience-chip">{audience}</span>)}
            </div>
          </div>
        </section>

        <section className="section-space">
          <div className="container grid items-center gap-14 lg:grid-cols-2 lg:gap-24">
            <div>
              <div className="eyebrow mb-6"><Inbox className="h-4 w-4" /> O problema invisível</div>
              <h2 className="section-title">Seu trabalho termina. O WhatsApp, não.</h2>
              <p className="section-copy mt-6">
                Entre um atendimento e outro, você tenta responder preço, procurar horário, confirmar amanhã e lembrar quem prometeu retornar. Não é falta de organização. É trabalho demais disputando a mesma pessoa.
              </p>
            </div>

            <div className="space-y-3">
              {[
                ["Durante o atendimento", "Mensagens chegam e o possível cliente espera."],
                ["No fim do dia", "Confirmações, encaixes e retornos continuam pendentes."],
                ["Quando alguém cancela", "O horário fica vazio antes que você consiga oferecê-lo."],
              ].map(([title, text], index) => (
                <div key={title} className="pain-row">
                  <span className="pain-number">0{index + 1}</span>
                  <div><h3 className="font-display text-lg font-bold">{title}</h3><p className="mt-1 text-sm leading-relaxed text-foreground/60">{text}</p></div>
                </div>
              ))}
              <div className="rounded-2xl bg-primary px-6 py-5 text-white shadow-lg shadow-primary/20">
                <p className="font-display text-xl font-bold">A agenda não precisa de mais uma tela.</p>
                <p className="mt-1 text-sm text-white/75">Precisa de alguém cuidando do processo.</p>
              </div>
            </div>
          </div>
        </section>

        <section id="por-dentro" className="section-space bg-ink text-white">
          <div className="container">
            <div className="max-w-3xl">
              <div className="eyebrow eyebrow-dark mb-6"><WandSparkles className="h-4 w-4" /> Da mensagem ao horário protegido</div>
              <h2 className="section-title text-white">Uma recepção inteira em quatro movimentos.</h2>
              <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/60">O diferencial não é “ter IA”. É fazer o atendimento avançar com regras claras até a agenda — e saber parar quando precisa de você.</p>
            </div>

            <div className="mt-14 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {routineSteps.map((step) => {
                const Icon = step.icon;
                return (
                  <article key={step.number} className="flow-card">
                    <div className="flex items-center justify-between">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-coral"><Icon className="h-6 w-6" /></div>
                      <span className="font-display text-3xl font-bold text-white/10">{step.number}</span>
                    </div>
                    <h3 className="mt-7 font-display text-2xl font-bold">{step.title}</h3>
                    <p className="mt-3 text-sm leading-relaxed text-white/60">{step.text}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="section-space">
          <div className="container">
            <div className="mx-auto max-w-3xl text-center">
              <div className="eyebrow mb-6"><BarChart3 className="h-4 w-4" /> Central do dia</div>
              <h2 className="section-title">Abra e saiba o que importa. Em segundos.</h2>
              <p className="section-copy mx-auto mt-6">Nada de dashboard decorativo. A primeira tela responde: como está meu dia, o que está em risco e onde eu preciso agir?</p>
            </div>

            <div className="mt-14 grid gap-5 md:grid-cols-3">
              {[
                { icon: CalendarCheck2, title: "Agenda protegida", text: "Veja confirmações, cancelamentos e horários que ainda podem ser recuperados." },
                { icon: Inbox, title: "Exceções, não barulho", text: "Receba apenas as conversas que exigem decisão humana, já com todo o contexto." },
                { icon: BarChart3, title: "Resultado compreensível", text: "Acompanhe comparecimento, tempo poupado e oportunidades recuperadas — sem planilha paralela." },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <article key={item.title} className="feature-card">
                    <div className="feature-icon"><Icon className="h-6 w-6" /></div>
                    <h3 className="mt-7 font-display text-2xl font-bold">{item.title}</h3>
                    <p className="mt-3 leading-relaxed text-foreground/60">{item.text}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section id="controle" className="section-space pt-0">
          <div className="container">
            <div className="control-panel grid overflow-hidden rounded-[2rem] lg:grid-cols-[.92fr_1.08fr]">
              <div className="bg-primary p-8 text-white sm:p-12 lg:p-16">
                <div className="eyebrow eyebrow-primary mb-6"><LockKeyhole className="h-4 w-4" /> Automação com limites</div>
                <h2 className="section-title text-white">Inteligente o bastante para ajudar. Responsável o bastante para parar.</h2>
                <p className="mt-6 text-lg leading-relaxed text-white/70">Você define horários, serviços, preços autorizados, políticas e quando a conversa deve ir para uma pessoa.</p>
              </div>
              <div className="bg-white p-8 sm:p-12 lg:p-16">
                <div className="space-y-7">
                  {[
                    { icon: CirclePause, title: "Pause quando quiser", text: "Assuma uma conversa ou toda a operação sem perder o histórico." },
                    { icon: HeartHandshake, title: "Humano no momento certo", text: "Dúvidas sensíveis, reclamações e negociações saem do automático." },
                    { icon: ShieldCheck, title: "Dados sob cuidado", text: "Coleta mínima, acesso por empresa e rastreabilidade desde o desenho do produto." },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <div key={item.title} className="flex gap-4">
                        <div className="feature-icon shrink-0"><Icon className="h-5 w-5" /></div>
                        <div><h3 className="font-display text-xl font-bold">{item.title}</h3><p className="mt-1 text-sm leading-relaxed text-foreground/60">{item.text}</p></div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="section-space bg-white/65">
          <div className="container grid items-start gap-12 lg:grid-cols-[.88fr_1.12fr] lg:gap-24">
            <div className="lg:sticky lg:top-28">
              <div className="eyebrow mb-6"><Sparkles className="h-4 w-4" /> Implantação magnética</div>
              <h2 className="section-title">Ela aprende o seu processo. Você não precisa aprender tecnologia.</h2>
              <p className="section-copy mt-6">A implantação começa pela sua rotina real, não por uma tela cheia de configurações.</p>
              <button onClick={() => scrollTo("lead-form")} className="brand-button brand-button-large mt-8">Quero mapear meu atendimento <ArrowRight className="h-5 w-5" /></button>
            </div>
            <div className="space-y-4">
              {[
                ["01", "Entendemos seu negócio", "Serviços, horários, duração, equipe, dúvidas comuns e pontos que nunca devem ser automatizados."],
                ["02", "Configuramos sua recepção", "Tom de voz, regras de agenda, mensagens, confirmações e passagem para atendimento humano."],
                ["03", "Testamos cenários reais", "Preço, encaixe, cancelamento, áudio, cliente indeciso e tudo que costuma acontecer de verdade."],
                ["04", "Você acompanha e melhora", "A Central do Dia mostra o que funcionou e onde o processo precisa de ajuste."],
              ].map(([number, title, text]) => (
                <article key={number} className="setup-step">
                  <span className="setup-number">{number}</span>
                  <div><h3 className="font-display text-xl font-bold">{title}</h3><p className="mt-2 leading-relaxed text-foreground/60">{text}</p></div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="duvidas" className="section-space">
          <div className="container grid gap-12 lg:grid-cols-[.72fr_1.28fr] lg:gap-20">
            <div>
              <div className="eyebrow mb-6"><MessageCircle className="h-4 w-4" /> Perguntas honestas</div>
              <h2 className="section-title">Antes de colocar alguém no seu WhatsApp, você precisa confiar.</h2>
              <p className="section-copy mt-6">E confiança começa com limites claros — não com promessa de “zero falhas”.</p>
            </div>
            <div className="space-y-3">
              {faqs.map((faq) => (
                <details key={faq.question} className="faq-item group">
                  <summary className="flex cursor-pointer items-center justify-between gap-5 px-6 py-5 font-display text-lg font-bold">
                    {faq.question}<span className="faq-plus">+</span>
                  </summary>
                  <p className="px-6 pb-6 pr-12 leading-relaxed text-foreground/60">{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <LeadForm />
      </main>

      <footer className="border-t border-white/10 bg-ink py-10 text-white">
        <div className="container flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white"><img src="/images/logo.png" alt="" className="h-7 w-7" /></span>
              <span className="font-display text-xl font-bold">Agenda Magnética</span>
            </div>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-white/50">Recepção inteligente para profissionais e pequenos negócios que atendem com hora marcada.</p>
          </div>
          <div className="text-sm text-white/45 sm:text-right">
            <a href="mailto:contato@agendamagnetica.com.br" className="transition hover:text-white">contato@agendamagnetica.com.br</a>
            <p className="mt-2">© {new Date().getFullYear()} Agenda Magnética</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
