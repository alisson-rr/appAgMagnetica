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
