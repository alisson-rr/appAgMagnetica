// Somente configurações públicas podem usar o prefixo VITE_.
const config = {
  BACKEND_URL: import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000',
};

export default config;
