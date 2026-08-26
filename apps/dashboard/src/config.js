// Somente configurações públicas podem usar o prefixo VITE_.
const backendUrl = import.meta.env.VITE_BACKEND_URL;

// Em produção, cair em `localhost` em silêncio é o pior dos mundos: o painel
// sobe, todas as chamadas falham e o erro que aparece é de rede, não de
// configuração. Sem a variável, a origem do próprio painel é o palpite honesto
// (deploy atrás do mesmo domínio) e o console diz o que faltou.
if (!backendUrl && import.meta.env.PROD) {
  console.error(
    'VITE_BACKEND_URL não foi definida neste build. As chamadas à API vão usar a própria origem do painel.',
  );
}

const config = {
  BACKEND_URL: backendUrl || (import.meta.env.PROD ? '' : 'http://localhost:8000'),
};

export default config;
