import { FormEvent, useState } from "react";
import { ArrowRight, CheckCircle2, MessageCircle, ShieldCheck } from "lucide-react";
import { submitLead } from "@/lib/googleSheets";
import { appLinks } from "@/lib/appUrl";

const initialForm = {
  nome: "",
  negocio: "",
  segmento: "",
  telefone: "",
};

const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

const LeadForm = () => {
  const [form, setForm] = useState(initialForm);
  const [accepted, setAccepted] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setStatus("sending");
    setMessage("");

    try {
      const result = await submitLead({ ...form, consentimento: accepted });
      setStatus("success");
      setMessage(
        result === "whatsapp"
          ? "Abrimos o WhatsApp com sua mensagem pronta."
          : "Recebemos seu pedido. Vamos falar sobre a sua rotina, sem pressão.",
      );
      if (result === "webhook") {
        setForm(initialForm);
        setAccepted(false);
      }
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Não foi possível enviar agora. Tente novamente.");
    }
  };

  return (
    <section id="contato" className="section-space pt-0">
      <div className="container">
        <div className="grid overflow-hidden rounded-3xl border border-foreground/[.07] shadow-card lg:grid-cols-[.92fr_1.08fr]">
          <div className="surface-green relative overflow-hidden p-8 sm:p-12">
            <span className="glow -bottom-20 -left-16 h-60 w-60 bg-apricot/25" aria-hidden="true" />
            <div className="relative">
              <div className="eyebrow eyebrow-dark mb-6">
                <MessageCircle className="h-4 w-4" /> Plano personalizado
              </div>
              <h2 className="font-display text-3xl font-bold leading-tight md:text-4xl">
                Precisa de algo fora dos planos prontos?
              </h2>
              <p className="mt-5 text-base leading-relaxed text-white/70">
                Conte como sua rotina funciona. A conversa parte do seu cenário e serve para decidir junto o que faz
                sentido automatizar — e o que não faz.
              </p>

              <ul className="mt-8 space-y-3.5 text-sm text-white/75">
                {[
                  "Leitura do atendimento que você já faz hoje",
                  "Demonstração do fluxo com os seus serviços",
                  "Clareza sobre o que existe e o que ainda não existe",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-apricot" /> {item}
                  </li>
                ))}
              </ul>

              <p className="mt-9 text-sm text-white/70">
                Se você já sabe o que precisa,{" "}
                <a href={appLinks.cadastro} className="font-semibold text-apricot underline underline-offset-4">
                  crie sua conta e comece o teste grátis
                </a>
                .
              </p>
            </div>
          </div>

          <div className="bg-white p-8 sm:p-12">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <label className="field-label" htmlFor="lead-nome">
                  Seu nome
                  <input
                    id="lead-nome"
                    required
                    value={form.nome}
                    onChange={(event) => setForm({ ...form, nome: event.target.value })}
                    className="field-input"
                    placeholder="Como podemos te chamar?"
                  />
                </label>
                <label className="field-label" htmlFor="lead-negocio">
                  Nome do negócio
                  <input
                    id="lead-negocio"
                    required
                    value={form.negocio}
                    onChange={(event) => setForm({ ...form, negocio: event.target.value })}
                    className="field-input"
                    placeholder="Ex.: Espaço Marina"
                  />
                </label>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <label className="field-label" htmlFor="lead-segmento">
                  Área de atuação
                  <select
                    id="lead-segmento"
                    required
                    value={form.segmento}
                    onChange={(event) => setForm({ ...form, segmento: event.target.value })}
                    className="field-input"
                  >
                    <option value="">Selecione</option>
                    <option>Estética e beleza</option>
                    <option>Odontologia</option>
                    <option>Quiropraxia ou fisioterapia</option>
                    <option>Podologia</option>
                    <option>Psicologia ou terapia</option>
                    <option>Outro serviço com hora marcada</option>
                  </select>
                </label>
                <label className="field-label" htmlFor="lead-telefone">
                  Seu WhatsApp
                  <input
                    id="lead-telefone"
                    required
                    type="tel"
                    inputMode="tel"
                    value={form.telefone}
                    onChange={(event) => setForm({ ...form, telefone: formatPhone(event.target.value) })}
                    className="field-input"
                    placeholder="(00) 00000-0000"
                  />
                </label>
              </div>

              <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-foreground/70">
                <input
                  required
                  type="checkbox"
                  checked={accepted}
                  onChange={(event) => setAccepted(event.target.checked)}
                  className="mt-1 h-4 w-4 accent-primary"
                />
                Autorizo o contato da Agenda Magnética sobre este pedido. Posso pedir a exclusão dos meus dados a
                qualquer momento.
              </label>

              <button
                disabled={status === "sending"}
                type="submit"
                className="btn btn-primary btn-lg w-full disabled:cursor-wait disabled:opacity-65"
              >
                {status === "sending" ? "Enviando…" : "Falar com o time"}
                <ArrowRight className="h-5 w-5" />
              </button>

              {message && (
                <div
                  role="status"
                  className={`rounded-xl px-4 py-3 text-sm ${
                    status === "success" ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"
                  }`}
                >
                  {message}
                </div>
              )}

              <p className="flex items-center justify-center gap-2 text-xs text-foreground/65">
                <ShieldCheck className="h-4 w-4" /> Seus dados não são vendidos nem usados para disparos
                indiscriminados.
              </p>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
};

export default LeadForm;
