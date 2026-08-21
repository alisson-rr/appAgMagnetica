/**
 * Endereço público do aplicativo. Fonte única para todos os CTAs do site —
 * nenhum componente deve montar essas URLs por conta própria.
 */
const APP_URL = (import.meta.env.VITE_APP_URL || "http://localhost:3000").replace(/\/+$/, "");

export const appLinks = {
  login: `${APP_URL}/login`,
  cadastro: `${APP_URL}/cadastro`,
  /** CTA de um plano específico: leva ao cadastro já com o plano escolhido. */
  plano: (codigo: string) => `${APP_URL}/cadastro?plano=${encodeURIComponent(codigo)}`,
};
