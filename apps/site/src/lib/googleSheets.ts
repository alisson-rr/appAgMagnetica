type Lead = {
  nome: string;
  negocio: string;
  segmento: string;
  telefone: string;
  consentimento: boolean;
};

export const submitLead = async (lead: Lead): Promise<"webhook" | "whatsapp"> => {
  const webhookUrl = import.meta.env.VITE_LEAD_WEBHOOK_URL?.trim();
  const whatsappNumber = import.meta.env.VITE_WHATSAPP_NUMBER?.replace(/\D/g, "");

  if (webhookUrl) {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...lead,
        origem: "site-agenda-magnetica",
        enviado_em: new Date().toISOString(),
      }),
    });

    if (!response.ok) throw new Error("Não foi possível enviar agora. Tente novamente em alguns instantes.");
    return "webhook";
  }

  if (whatsappNumber) {
    const text = [
      "Olá! Quero conhecer a Agenda Magnética no meu negócio.",
      `Nome: ${lead.nome}`,
      `Negócio: ${lead.negocio}`,
      `Área: ${lead.segmento}`,
    ].join("\n");
    window.open(`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    return "whatsapp";
  }

  throw new Error("O canal de contato ainda não foi configurado. Escreva para contato@agendamagnetica.com.br.");
};
