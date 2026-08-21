import { CalendarCheck2, CheckCircle2, Clock3, MessagesSquare, UserRoundCheck } from "lucide-react";

const horarios = [
  { hora: "09:00", cliente: "Marina Duarte", servico: "Avaliação inicial", confirmado: true },
  { hora: "10:30", cliente: "Rafael Antunes", servico: "Sessão de manutenção", confirmado: true },
  { hora: "14:00", cliente: "Cláudia Reis", servico: "Retorno", confirmado: false },
];

type Props = {
  /** Versão curta, usada no hero ao lado do texto. */
  compact?: boolean;
  className?: string;
};

/**
 * Representação do produto feita apenas com HTML e CSS.
 * Os dados são ilustrativos e a janela é rotulada como exemplo.
 */
const ProductMock = ({ compact = false, className = "" }: Props) => (
  <div className={`product-window ${className}`}>
    <div className="surface-green flex items-center justify-between gap-4 px-5 py-4">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.16em] text-white/75">
          <span className="live-dot bg-apricot" /> Central do dia
        </p>
        <p className="mt-1 truncate font-display text-lg font-bold">Quinta, 14 de agosto</p>
      </div>
      <span className="shrink-0 rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-semibold text-white">
        Exemplo da interface
      </span>
    </div>

    <div className="grid gap-3 p-4 sm:p-5">
      <div className="grid grid-cols-3 gap-2.5">
        <div className="metric-tile">
          <span className="metric-label">Hoje</span>
          <strong className="mt-1.5 block font-display text-2xl text-ink">8</strong>
          <span className="text-[11px] text-foreground/65">atendimentos</span>
        </div>
        <div className="metric-tile border-primary/15 bg-primary/[.06]">
          <span className="metric-label text-primary">Confirmados</span>
          <strong className="mt-1.5 block font-display text-2xl text-primary">6</strong>
          <span className="text-[11px] text-primary">sem retorno seu</span>
        </div>
        <div className="metric-tile border-coral/30 bg-coral-soft">
          <span className="metric-label text-coral-deep">Aguardando</span>
          <strong className="mt-1.5 block font-display text-2xl text-coral-deep">2</strong>
          <span className="text-[11px] text-coral-deep">confirmação</span>
        </div>
      </div>

      <div className="rounded-2xl border border-foreground/[.07] bg-white">
        <div className="flex items-center justify-between border-b border-foreground/[.07] px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-bold text-ink">
            <CalendarCheck2 className="h-4 w-4 text-primary" /> Próximos horários
          </p>
          <span className="text-[11px] font-semibold text-foreground/65">Agenda</span>
        </div>
        <ul className="divide-y divide-foreground/[.06]">
          {(compact ? horarios.slice(0, 2) : horarios).map((item) => (
            <li key={item.hora} className="flex items-center gap-3 px-4 py-3">
              <span className="flex h-11 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-cream text-primary">
                <Clock3 className="h-3.5 w-3.5" />
                <strong className="text-xs">{item.hora}</strong>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">{item.cliente}</span>
                <span className="block truncate text-xs text-foreground/65">{item.servico}</span>
              </span>
              <span
                className={`hidden shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold sm:inline-block ${
                  item.confirmado ? "bg-primary/10 text-primary" : "bg-coral-soft text-coral-deep"
                }`}
              >
                {item.confirmado ? "Confirmado" : "Aguardando"}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl border border-foreground/[.07] bg-white p-4">
        <div className="flex items-center justify-between border-b border-foreground/[.07] pb-3">
          <span className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
              <MessagesSquare className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-ink">Conversa no WhatsApp</span>
              <span className="block text-[11px] text-foreground/65">agendamento concluído</span>
            </span>
          </span>
          <CheckCircle2 className="h-5 w-5 text-primary" />
        </div>
        <div className="mt-3 grid gap-2 text-sm">
          <p className="max-w-[85%] rounded-2xl rounded-tl-md bg-foreground/[.05] px-3 py-2 text-foreground/75">
            Tem horário depois das 18h?
          </p>
          <p className="surface-green ml-auto max-w-[90%] rounded-2xl rounded-tr-md px-3 py-2">
            Tenho sim. Amanhã às 18h30 ou quinta às 19h. Qual fica melhor?
          </p>
        </div>
        {!compact && (
          <p className="mt-3 flex items-center gap-2 rounded-xl bg-coral-soft px-3 py-2.5 text-xs font-semibold text-coral-deep">
            <UserRoundCheck className="h-4 w-4 shrink-0" />
            Pediu desconto: a conversa foi encaminhada para você decidir.
          </p>
        )}
      </div>
    </div>
  </div>
);

export default ProductMock;
