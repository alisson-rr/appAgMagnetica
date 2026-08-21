import { useRef } from "react";
import { X } from "lucide-react";
import type { Documento } from "@/lib/legal";

type Props = {
  documento: Documento;
  /** Texto do link que abre o documento. */
  label: string;
  className?: string;
};

const LegalDialog = ({ documento, label, className = "" }: Props) => {
  const ref = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} className={className}>
        {label}
      </button>

      <dialog
        ref={ref}
        className="legal"
        aria-label={documento.titulo}
        onClick={(event) => {
          if (event.target === ref.current) ref.current?.close();
        }}
      >
        <div className="sticky top-0 flex items-center justify-between gap-4 border-b border-foreground/[.08] bg-white/95 px-6 py-4 backdrop-blur">
          <h2 className="font-display text-xl font-bold text-primary">{documento.titulo}</h2>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            className="rounded-full p-2 text-foreground/65 transition hover:bg-foreground/[.06] hover:text-foreground"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-5 px-6 py-6">
          {documento.secoes.map((secao) => (
            <section key={secao.titulo}>
              <h3 className="font-display text-base font-bold text-ink">{secao.titulo}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-foreground/65">{secao.texto}</p>
            </section>
          ))}
        </div>
      </dialog>
    </>
  );
};

export default LegalDialog;
