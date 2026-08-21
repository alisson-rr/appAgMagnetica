import { useEffect, useState } from "react";
import { ArrowRight, Menu, X } from "lucide-react";
import { appLinks } from "@/lib/appUrl";

const links = [
  { label: "Produto", href: "#produto" },
  { label: "Como funciona", href: "#como-funciona" },
  { label: "Planos", href: "#planos" },
  { label: "Dúvidas", href: "#duvidas" },
];

const SiteNav = () => {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${scrolled ? "py-2" : "py-4"}`}>
      <div className="container px-4 sm:px-6">
        <div
          className={`flex items-center justify-between gap-4 rounded-full px-4 py-2.5 transition-all duration-300 sm:px-5 ${
            scrolled ? "glass" : "border border-transparent"
          }`}
        >
          <a href="#inicio" className="flex shrink-0 items-center gap-2.5" aria-label="Agenda Magnética, ir para o início">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-foreground/10">
              <img src="/images/logo.png" alt="" className="h-7 w-7 object-contain" />
            </span>
            <span className="font-display text-base font-bold tracking-tight sm:text-lg">
              Agenda <span className="text-primary">Magnética</span>
            </span>
          </a>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Navegação principal">
            {links.map((link) => (
              <a key={link.href} href={link.href} className="nav-link">
                {link.label}
              </a>
            ))}
          </nav>

          <div className="hidden items-center gap-2 lg:flex">
            <a href={appLinks.login} className="nav-link">Entrar</a>
            <a href={appLinks.cadastro} className="btn btn-primary">
              Começar grátis <ArrowRight className="h-4 w-4" />
            </a>
          </div>

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="rounded-full p-2 text-foreground lg:hidden"
            aria-expanded={open}
            aria-controls="menu-mobile"
            aria-label={open ? "Fechar menu" : "Abrir menu"}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {open && (
          <div id="menu-mobile" className="glass mt-2 rounded-3xl p-5 lg:hidden">
            <nav className="grid gap-1" aria-label="Navegação principal (móvel)">
              {links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="rounded-2xl px-3 py-3 text-base font-semibold text-foreground/75 transition hover:bg-primary/[.07] hover:text-primary"
                >
                  {link.label}
                </a>
              ))}
              <a
                href={appLinks.login}
                onClick={() => setOpen(false)}
                className="rounded-2xl px-3 py-3 text-base font-semibold text-foreground/75 transition hover:bg-primary/[.07] hover:text-primary"
              >
                Entrar
              </a>
              <a
                href={appLinks.cadastro}
                onClick={() => setOpen(false)}
                className="btn btn-primary mt-2 w-full"
              >
                Começar grátis <ArrowRight className="h-4 w-4" />
              </a>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
};

export default SiteNav;
