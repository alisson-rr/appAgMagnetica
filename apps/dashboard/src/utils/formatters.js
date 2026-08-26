// Formatação de telefone/WhatsApp
export const formatPhone = (value) => {
  if (!value) return '';
  
  // Remove tudo que não é número
  const numbers = value.replace(/\D/g, '');
  
  // Formata conforme o tamanho
  if (numbers.length <= 10) {
    // (XX) XXXX-XXXX
    return numbers.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3').replace(/-$/, '');
  } else {
    // (XX) XXXXX-XXXX
    return numbers.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3').replace(/-$/, '');
  }
};

export const unformatPhone = (value) => {
  return value.replace(/\D/g, '');
};

const ESCAPES_HTML = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escapa texto que vai para dentro de um HTML montado à mão (hoje: o recibo
 * do Financeiro). Nome de cliente e de serviço chegam pelo WhatsApp, então são
 * texto de terceiro: interpolar cru abre XSS na janela do recibo.
 */
export const escaparHtml = (valor) =>
  String(valor ?? '').replace(/[&<>"']/g, (caractere) => ESCAPES_HTML[caractere]);
