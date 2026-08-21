import { FormEvent, useState } from "react";
import { ArrowRight, CheckCircle2, MessageCircle, ShieldCheck } from "lucide-react";
import { submitLead } from "@/lib/googleSheets";

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
      setMessage(result === "whatsapp" ? "Abrimos o WhatsApp com sua mensagem pronta." : "Recebemos seu pedido. Vamos falar sobre a sua rotina, sem pressão.");
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
    <section id="lead-form" className="section-space bg-coral-soft">
      <div className="container">
        <div className="lead-shell grid overflow-hidden rounded-[2rem] lg:grid-cols-[.9fr_1.1fr]">
          <div className="bg-ink p-8 text-white sm:p-12 lg:p-16">
            <div className="eyebrow eyebrow-dark mb-6"><MessageCircle className="h-4 w-4" /> Veja no seu negócio</div>
            <h2 className="section-title text-white">Imagine terminar um atendimento e encontrar o próximo já confirmado.</h2>
            <p className="mt-6 text-lg leading-relaxed text-white/60">Conte como sua rotina funciona. A demonstração parte do seu cenário — não de uma apresentação genérica.</p>

            <div className="mt-9 space-y-4 text-sm text-white/70">
              <p className="flex items-center gap-3"><CheckCircle2 className="h-5 w-5 text-coral" /> Diagnóstico rápido do atendimento atual</p>
              <p className="flex items-center gap-3"><CheckCircle2 className="h-5 w-5 text-coral" /> Demonstração do fluxo ideal para o negócio</p>
              <p className="flex items-center gap-3"><CheckCircle2 className="h-5 w-5 text-coral" /> Clareza sobre integrações e próximos passos</p>
            </div>
          </div>

          <div className="bg-white p-8 sm:p-12 lg:p-16">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <label className="field-label">Seu nome
                  <input required value={form.nome} onChange={(event) => setForm({ ...form, nome: event.target.value })} className="field-input" placeholder="Como podemos te chamar?" />
                </label>
                <label className="field-label">Nome do negócio
                  <input required value={form.negocio} onChange={(event) => setForm({ ...form, negocio: event.target.value })} className="field-input" placeholder="Ex.: Espaço Marina" />
                </label>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <label className="field-label">Área de atuação
                  <select required value={form.segmento} onChange={(event) => setForm({ ...form, segmento: event.target.value })} className="field-input">
                    <option value="">Selecione</option>
                    <option>Estética e beleza</option>
                    <option>Odontologia</option>
                    <option>Quiropraxia ou fisioterapia</option>
                    <option>Podologia</option>
                    <option>Psicologia ou terapia</option>
                    <option>Outro serviço com hora marcada</option>
                  </select>
                </label>
                <label className="field-label">Seu WhatsApp
                  <input required type="tel" inputMode="tel" value={form.telefone} onChange={(event) => setForm({ ...form, telefone: formatPhone(event.target.value) })} className="field-input" placeholder="(00) 00000-0000" />
                </label>
              </div>

              <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-foreground/60">
                <input required type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-1 h-4 w-4 accent-primary" />
                Autorizo o contato da Agenda Magnética sobre esta demonstração. Posso pedir a exclusão dos meus dados a qualquer momento.
              </label>

              <button disabled={status === "sending"} type="submit" className="brand-button brand-button-large w-full justify-center disabled:cursor-wait disabled:opacity-65">
                {status === "sending" ? "Enviando…" : "Quero ver no meu negócio"}<ArrowRight className="h-5 w-5" />
              </button>

              {message && (
                <div role="status" className={`rounded-xl px-4 py-3 text-sm ${status === "success" ? "bg-primary/10 text-primary" : "bg-red-50 text-red-700"}`}>
                  {message}
                </div>
              )}

              <p className="flex items-center justify-center gap-2 text-xs text-foreground/40"><ShieldCheck className="h-4 w-4" /> Seus dados não são vendidos nem usados para disparos indiscriminados.</p>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
};

export default LeadForm;
