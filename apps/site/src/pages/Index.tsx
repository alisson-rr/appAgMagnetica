import {
  ArrowRight,
  BadgeCheck,
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  CirclePause,
  Clock3,
  FileText,
  HeartHandshake,
  Inbox,
  LayoutDashboard,
  LockKeyhole,
  MessageCircle,
  MessagesSquare,
  QrCode,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
  Users,
  WandSparkles,
} from "lucide-react";
import SiteNav from "@/components/SiteNav";
import ProductMock from "@/components/ProductMock";
import Plans from "@/components/Plans";
import LeadForm from "@/components/LeadForm";
import LegalDialog from "@/components/LegalDialog";
import { politicaPrivacidade, termosDeUso } from "@/lib/legal";
import { appLinks } from "@/lib/appUrl";

const publicos = [
  "Estética e beleza",
  "Odontologia",
  "Quiropraxia",
  "Podologia",
  "Fisioterapia",
  "Psicologia",
  "Bem-estar",
  "Outros serviços com hora marcada",
];

const dores = [
  {
    titulo: "Durante o atendimento",
    texto: "As mensagens chegam e quem está do outro lado espera — às vezes até desistir.",
  },
  {
    titulo: "No fim do dia",
    texto: "Confirmações, encaixes e retornos continuam pendentes no seu celular.",
  },
  {
    titulo: "Quando alguém cancela",
    texto: "O horário fica vazio antes de você conseguir oferecê-lo a outra pessoa.",
  },
];

const passos = [
  {
    icon: MessageCircle,
    numero: "01",
    titulo: "Responde",
    texto: "Acolhe o contato no WhatsApp, entende o pedido e responde as dúvidas que você autorizou.",
  },
  {
    icon: CalendarCheck2,
    numero: "02",
    titulo: "Agenda",
    texto: "Consulta os horários reais do seu negócio, oferece opções e registra o agendamento.",
  },
  {
    icon: ShieldCheck,
    numero: "03",
    titulo: "Organiza",
    texto: "Mantém status, cancelamentos e alterações refletidos na mesma agenda que você usa.",
  },
  {
    icon: UserRoundCheck,
    numero: "04",
    titulo: "Chama você",
    texto: "Diante de uma exceção, de um assunto sensível ou de uma decisão sua, a conversa vai para você.",
  },
];

const beneficios = [
  {
    icon: MessagesSquare,
    titulo: "Atendimento no WhatsApp",
    texto: "O número do seu negócio é conectado pelo painel, com QR Code, e pode ser desconectado quando quiser.",
  },
  {
    icon: CalendarClock,
    titulo: "Agenda com horários reais",
    texto: "Funcionamento do negócio, disponibilidade por profissional e duração de cada serviço.",
  },
  {
    icon: LayoutDashboard,
    titulo: "Central do dia",
    texto: "Atendimentos de hoje, confirmados, aguardando confirmação e os próximos horários em uma tela.",
  },
  {
    icon: Users,
    titulo: "Vários profissionais",
    texto: "Cada profissional com seus serviços e seus horários, na mesma agenda do negócio.",
  },
  {
    icon: FileText,
    titulo: "Financeiro dos atendimentos",
    texto: "Serviços concluídos, filtros por período e profissional, e recibo pronto para imprimir.",
  },
  {
    icon: QrCode,
    titulo: "Configuração no seu painel",
    texto: "Serviços, horários, dados do negócio e conexão do WhatsApp ficam sob o seu controle.",
  },
];

const controles = [
  {
    icon: CirclePause,
    titulo: "Pause quando quiser",
    texto: "Você desconecta o WhatsApp ou assume a conversa a qualquer momento, sem perder o histórico.",
  },
  {
    icon: HeartHandshake,
    titulo: "Humano no momento certo",
    texto: "Assuntos sensíveis, reclamações e negociações saem do automático e chegam até você.",
  },
  {
    icon: ShieldCheck,
    titulo: "Dados sob cuidado",
    texto: "Coleta mínima, acesso separado por empresa e nenhuma orientação clínica criada pela automação.",
  },
];

const faqs = [
  {
    pergunta: "Ela substitui meu atendimento humano?",
    resposta:
      "Não. Ela assume o operacional repetitivo e chama você quando a conversa precisa de julgamento, cuidado ou negociação. Você pode pausar a automação e assumir a qualquer momento.",
  },
  {
    pergunta: "A conversa não fica com cara de robô?",
    resposta:
      "A Agenda Magnética usa o tom, os serviços e as regras do seu negócio. Ainda assim, ela não finge ser você: trabalha como assistente e mantém uma saída clara para o atendimento humano.",
  },
  {
    pergunta: "Serve para quem trabalha sozinho?",
    resposta:
      "É justamente onde o ganho fica mais visível. Enquanto você está atendendo, dirigindo ou descansando, os contatos não ficam sem orientação e a agenda continua organizada.",
  },
  {
    pergunta: "E para serviços de saúde?",
    resposta:
      "O foco é administrativo: informações autorizadas, agendamento, confirmação e encaminhamento. Dúvidas clínicas e situações sensíveis devem ser transferidas a uma pessoa, com coleta mínima de dados.",
  },
  {
    pergunta: "Como funciona o teste grátis?",
    resposta:
      "Você cria a conta, configura o negócio e usa por 7 dias antes de qualquer cobrança. Ao final do período, escolhe o plano que faz sentido para continuar.",
  },
  {
    pergunta: "Preciso trocar de agenda ou de número?",
    resposta:
      "A agenda passa a ser a do próprio sistema, com os seus horários e serviços. O número usado no atendimento é conectado por você, pelo painel, no momento da implantação.",
  },
];

const Index = () => (
  <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
    <SiteNav />

    <main>
      {/* 1. Hero */}
      <section id="inicio" className="cream-shell relative isolate overflow-hidden pt-28 md:pt-36">
        <div className="dot-grid absolute inset-0 -z-10 opacity-60" aria-hidden="true" />
        <span className="glow -left-40 top-10 h-[26rem] w-[26rem] bg-coral/30" aria-hidden="true" />
        <span className="glow -right-40 top-1/3 h-[30rem] w-[30rem] bg-green-lum/25" aria-hidden="true" />
        <span className="glow bottom-0 left-1/3 h-72 w-72 bg-apricot/25" aria-hidden="true" />

        <div className="container grid items-center gap-14 pb-20 lg:grid-cols-[1.04fr_.96fr] lg:gap-12 lg:pb-28">
          <div className="animate-fade-up">
            <div className="eyebrow mb-7">
              <Sparkles className="h-4 w-4" />
              Recepção inteligente no WhatsApp
            </div>

            <h1 className="font-display text-[clamp(2.75rem,6vw,5.5rem)] font-bold leading-[.95]">
              Você cuida dos clientes.{" "}
              <span className="gradient-text">A agenda cuida do resto.</span>
            </h1>

            <p className="mt-7 max-w-xl text-lg leading-relaxed text-foreground/70 md:text-xl">
              A Agenda Magnética responde no WhatsApp, marca horários na sua agenda de verdade e mostra, em uma tela
              só, o que precisa de você hoje.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <a href={appLinks.cadastro} className="btn btn-primary btn-lg">
                Começar grátis <ArrowRight className="h-5 w-5" />
              </a>
              <a href="#planos" className="btn btn-ghost btn-lg">
                Ver planos
              </a>
            </div>

            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm text-foreground/70">
              {["7 dias de teste grátis", "Você mantém o controle", "Implantação acompanhada"].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" /> {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative mx-auto w-full max-w-[560px] animate-fade-up lg:mx-0" style={{ animationDelay: ".15s" }}>
            <ProductMock compact />

            <div className="float-card animate-float absolute -left-4 top-24 hidden w-52 sm:block lg:-left-10">
              <p className="text-[11px] font-bold uppercase tracking-[.12em] text-primary">Agenda</p>
              <p className="mt-1 font-display text-base font-bold text-ink">14h ficou livre</p>
              <p className="mt-0.5 text-xs text-foreground/65">Cancelamento registrado agora</p>
            </div>

            <div className="float-card animate-float-alt absolute -right-3 bottom-16 hidden w-56 sm:block lg:-right-8">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[.12em] text-coral-deep">
                <MessagesSquare className="h-3.5 w-3.5" /> WhatsApp
              </p>
              <p className="mt-1 text-sm font-semibold leading-snug text-ink">
                “Consegue me encaixar amanhã de manhã?”
              </p>
              <p className="mt-1 text-xs text-foreground/65">Respondida com os horários livres</p>
            </div>

            <div className="float-card absolute -bottom-5 left-1/2 flex w-max -translate-x-1/2 items-center gap-2 !rounded-full !py-2.5">
              <span className="live-dot" />
              <span className="text-xs font-bold text-ink">Ações do dia: 1 para você</span>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Públicos atendidos */}
      <section className="border-y border-foreground/[.07] bg-white/70 py-8">
        <div className="container">
          <p className="mb-5 text-center text-[11px] font-bold uppercase tracking-[.18em] text-foreground/65">
            Feita para negócios em que cada horário importa
          </p>
          <ul className="flex flex-wrap justify-center gap-2.5">
            {publicos.map((publico) => (
              <li key={publico} className="chip">{publico}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* 3. Problema da rotina */}
      <section className="section-space">
        <div className="container grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
          <div className="reveal">
            <div className="eyebrow eyebrow-coral mb-6"><Inbox className="h-4 w-4" /> O problema invisível</div>
            <h2 className="section-title">
              Seu trabalho termina. <span className="gradient-text">O WhatsApp, não.</span>
            </h2>
            <p className="section-copy mt-6">
              Entre um atendimento e outro, você tenta responder preço, procurar horário, confirmar amanhã e lembrar
              quem prometeu retornar. Não é falta de organização: é trabalho demais disputando a mesma pessoa.
            </p>
          </div>

          <div className="reveal space-y-3">
            {dores.map((dor, index) => (
              <article
                key={dor.titulo}
                className="flex items-start gap-5 rounded-3xl border border-foreground/[.07] bg-white/80 p-5 transition hover:-translate-y-0.5 hover:border-primary/25 hover:bg-white"
              >
                <span className="font-display text-sm font-bold text-coral-deep">0{index + 1}</span>
                <div>
                  <h3 className="font-display text-lg font-bold">{dor.titulo}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-foreground/70">{dor.texto}</p>
                </div>
              </article>
            ))}
            <div className="surface-green relative overflow-hidden rounded-3xl px-6 py-6 shadow-card">
              <span className="glow -right-10 -top-10 h-40 w-40 bg-apricot/30" aria-hidden="true" />
              <p className="relative font-display text-xl font-bold">A agenda não precisa de mais uma tela.</p>
              <p className="relative mt-1 text-sm text-white/75">Precisa de alguém cuidando do processo.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Funcionamento */}
      <section id="como-funciona" className="section-space relative isolate overflow-hidden bg-green-dark text-white">
        <span className="glow -left-32 top-0 h-96 w-96 bg-green-lum/40" aria-hidden="true" />
        <span className="glow -right-24 bottom-0 h-96 w-96 bg-coral/25" aria-hidden="true" />

        <div className="container relative">
          <div className="max-w-3xl">
            <div className="eyebrow eyebrow-dark mb-6"><WandSparkles className="h-4 w-4" /> Da mensagem ao horário marcado</div>
            <h2 className="section-title text-white">Uma recepção inteira em quatro movimentos.</h2>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/65">
              O diferencial não é “ter IA”. É fazer o atendimento avançar com regras claras até a agenda — e saber
              parar quando precisa de você.
            </p>
          </div>

          <div className="mt-14 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {passos.map((passo) => (
              <article
                key={passo.numero}
                className="reveal rounded-3xl border border-white/10 bg-white/[.05] p-6 transition duration-300 hover:-translate-y-1.5 hover:border-apricot/40 hover:bg-white/[.09]"
              >
                <div className="flex items-center justify-between">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-apricot">
                    <passo.icon className="h-6 w-6" />
                  </span>
                  <span className="font-display text-3xl font-bold text-white/40">{passo.numero}</span>
                </div>
                <h3 className="mt-7 font-display text-2xl font-bold">{passo.titulo}</h3>
                <p className="mt-3 text-sm leading-relaxed text-white/65">{passo.texto}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 5. Demonstração visual do produto */}
      <section id="produto" className="section-space">
        <div className="container">
          <div className="mx-auto max-w-3xl text-center">
            <div className="eyebrow mb-6"><LayoutDashboard className="h-4 w-4" /> Por dentro do produto</div>
            <h2 className="section-title">
              Abra e saiba <span className="gradient-text">o que importa</span>. Em segundos.
            </h2>
            <p className="section-copy mx-auto mt-6">
              Nada de painel decorativo. A primeira tela responde: como está meu dia, o que ainda não foi confirmado e
              onde eu preciso entrar.
            </p>
          </div>

          <div className="mt-14 grid gap-5 lg:grid-cols-[1.35fr_.65fr]">
            <div className="reveal relative isolate">
              <span className="glow -bottom-10 -left-10 h-64 w-64 bg-green-lum/25" aria-hidden="true" />
              <ProductMock />
            </div>

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
              {[
                {
                  icon: CalendarCheck2,
                  titulo: "Agenda do dia e da semana",
                  texto: "Horários lado a lado, arrastar para reposicionar e status visível em cada atendimento.",
                },
                {
                  icon: Inbox,
                  titulo: "Só o que precisa de você",
                  texto: "As confirmações pendentes ficam em destaque; o resto segue sem pedir sua atenção.",
                },
                {
                  icon: BadgeCheck,
                  titulo: "Serviços com regra própria",
                  texto: "Duração, valor e orientações de cada serviço definem como a agenda é oferecida.",
                },
              ].map((item) => (
                <article key={item.titulo} className="reveal card-soft card-lift">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <item.icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-5 font-display text-xl font-bold">{item.titulo}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-foreground/70">{item.texto}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 6. Benefícios comprováveis */}
      <section className="section-space bg-white/70 pt-0 md:pt-0">
        <div className="container pt-20 md:pt-28">
          <div className="mx-auto max-w-3xl text-center">
            <div className="eyebrow mb-6"><CheckCircle2 className="h-4 w-4" /> O que já está funcionando</div>
            <h2 className="section-title">Sem promessa que o produto ainda não cumpre.</h2>
            <p className="section-copy mx-auto mt-6">
              Esta é a lista do que existe hoje no painel e no atendimento. O que ainda está em construção aparece
              marcado como tal, na página de planos.
            </p>
          </div>

          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {beneficios.map((beneficio, index) => (
              <article
                key={beneficio.titulo}
                className={`reveal card-lift relative overflow-hidden rounded-3xl p-7 ${
                  index === 0
                    ? "surface-green shadow-card sm:col-span-2"
                    : "border border-foreground/[.07] bg-white shadow-soft"
                }`}
              >
                {index === 0 && <span className="glow -right-16 -top-16 h-56 w-56 bg-apricot/30" aria-hidden="true" />}
                <div className="relative">
                  <span
                    className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
                      index === 0 ? "bg-white/15 text-apricot" : "bg-primary/10 text-primary"
                    }`}
                  >
                    <beneficio.icon className="h-6 w-6" />
                  </span>
                  <h3 className="mt-6 font-display text-2xl font-bold">{beneficio.titulo}</h3>
                  <p className={`mt-2.5 leading-relaxed ${index === 0 ? "text-white/75" : "text-foreground/70"}`}>
                    {beneficio.texto}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 7. Segurança e controle humano */}
      <section className="section-space">
        <div className="container">
          <div className="grid overflow-hidden rounded-3xl shadow-card lg:grid-cols-[.92fr_1.08fr]">
            <div className="surface-green relative overflow-hidden p-8 sm:p-12 lg:p-14">
              <span className="glow -bottom-20 -left-20 h-72 w-72 bg-coral/30" aria-hidden="true" />
              <div className="relative">
                <div className="eyebrow eyebrow-dark mb-6"><LockKeyhole className="h-4 w-4" /> Automação com limites</div>
                <h2 className="font-display text-3xl font-bold leading-tight md:text-4xl">
                  Inteligente o bastante para ajudar. Responsável o bastante para parar.
                </h2>
                <p className="mt-6 text-base leading-relaxed text-white/70">
                  Você define horários, serviços, valores autorizados e quando a conversa deve ir para uma pessoa. A
                  automação não decide por conta própria o que não foi combinado.
                </p>
              </div>
            </div>

            <div className="bg-white p-8 sm:p-12 lg:p-14">
              <div className="space-y-7">
                {controles.map((item) => (
                  <div key={item.titulo} className="flex gap-4">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <item.icon className="h-5 w-5" />
                    </span>
                    <div>
                      <h3 className="font-display text-xl font-bold">{item.titulo}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-foreground/70">{item.texto}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 8. Planos */}
      <Plans />

      {/* Alternativa comercial para plano personalizado */}
      <LeadForm />

      {/* 9. Dúvidas */}
      <section id="duvidas" className="section-space bg-white/70">
        <div className="container grid gap-12 lg:grid-cols-[.75fr_1.25fr] lg:gap-20">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <div className="eyebrow mb-6"><MessageCircle className="h-4 w-4" /> Perguntas honestas</div>
            <h2 className="section-title">
              Antes de colocar alguém no seu WhatsApp, você precisa <span className="gradient-text">confiar</span>.
            </h2>
            <p className="section-copy mt-6">E confiança começa com limites claros — não com promessa de “zero falhas”.</p>
          </div>

          <div className="space-y-3">
            {faqs.map((faq) => (
              <details key={faq.pergunta} className="faq-item group">
                <summary className="flex cursor-pointer items-center justify-between gap-5 px-6 py-5 font-display text-lg font-bold">
                  {faq.pergunta}
                  <span className="faq-plus" aria-hidden="true">+</span>
                </summary>
                <p className="px-6 pb-6 pr-12 leading-relaxed text-foreground/70">{faq.resposta}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* 10. CTA final */}
      <section className="section-space">
        <div className="container">
          <div className="surface-green relative isolate overflow-hidden rounded-3xl px-6 py-16 text-center shadow-card sm:px-12 sm:py-20">
            <span className="glow -left-24 -top-24 h-80 w-80 bg-apricot/30" aria-hidden="true" />
            <span className="glow -bottom-24 -right-24 h-80 w-80 bg-coral/30" aria-hidden="true" />

            <div className="relative mx-auto max-w-3xl">
              <div className="eyebrow eyebrow-dark mb-6"><Clock3 className="h-4 w-4" /> 7 dias de teste grátis</div>
              <h2 className="font-display text-[clamp(2.25rem,5vw,4rem)] font-bold leading-[1.02]">
                Termine um atendimento e encontre o próximo já organizado.
              </h2>
              <p className="mx-auto mt-6 max-w-xl text-lg text-white/70">
                Crie sua conta, configure seus serviços e horários e veja a recepção trabalhando com a sua rotina real.
              </p>
              <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
                <a href={appLinks.cadastro} className="btn btn-warm btn-lg">
                  Começar grátis <ArrowRight className="h-5 w-5" />
                </a>
                <a href={appLinks.login} className="btn btn-on-dark btn-lg">
                  Já tenho conta
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>

    {/* 11. Rodapé */}
    <footer className="border-t border-foreground/[.07] bg-cream">
      <div className="container grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-foreground/10">
              <img src="/images/logo.png" alt="" className="h-7 w-7 object-contain" />
            </span>
            <span className="font-display text-lg font-bold">Agenda Magnética</span>
          </div>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-foreground/65">
            Recepção inteligente no WhatsApp para profissionais e pequenos negócios que atendem com hora marcada.
          </p>
          <a
            href="mailto:contato@agendamagnetica.com.br"
            className="mt-4 inline-block text-sm font-semibold text-primary transition hover:text-green-deep"
          >
            contato@agendamagnetica.com.br
          </a>
        </div>

        <nav aria-labelledby="rodape-produto">
          <h2 id="rodape-produto" className="font-display text-sm font-bold uppercase tracking-[.12em] text-foreground/65">
            Produto
          </h2>
          <ul className="mt-4 space-y-2.5 text-sm">
            {[
              { label: "Por dentro do produto", href: "#produto" },
              { label: "Como funciona", href: "#como-funciona" },
              { label: "Planos", href: "#planos" },
              { label: "Dúvidas", href: "#duvidas" },
            ].map((link) => (
              <li key={link.href}>
                <a href={link.href} className="text-foreground/70 transition hover:text-primary">{link.label}</a>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-labelledby="rodape-conta">
          <h2 id="rodape-conta" className="font-display text-sm font-bold uppercase tracking-[.12em] text-foreground/65">
            Sua conta
          </h2>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li><a href={appLinks.login} className="text-foreground/70 transition hover:text-primary">Entrar</a></li>
            <li><a href={appLinks.cadastro} className="text-foreground/70 transition hover:text-primary">Começar grátis</a></li>
            <li><a href="#contato" className="text-foreground/70 transition hover:text-primary">Falar com o time</a></li>
          </ul>
        </nav>

        <nav aria-labelledby="rodape-legal">
          <h2 id="rodape-legal" className="font-display text-sm font-bold uppercase tracking-[.12em] text-foreground/65">
            Legal
          </h2>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li>
              <LegalDialog
                documento={politicaPrivacidade}
                label="Política de Privacidade"
                className="text-foreground/70 transition hover:text-primary"
              />
            </li>
            <li>
              <LegalDialog
                documento={termosDeUso}
                label="Termos de Uso"
                className="text-foreground/70 transition hover:text-primary"
              />
            </li>
          </ul>
        </nav>
      </div>

      <div className="border-t border-foreground/[.07]">
        <p className="container py-6 text-xs text-foreground/65">
          © {new Date().getFullYear()} Agenda Magnética. Feita no Rio Grande do Sul.
        </p>
      </div>
    </footer>
  </div>
);

export default Index;
