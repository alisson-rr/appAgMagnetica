// Configuração da aplicação
const config = {
  // URL do backend - ajuste conforme necessário
  BACKEND_URL: process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001',
  
  // Configurações do Supabase (caso necessário no frontend)
  SUPABASE_URL: process.env.REACT_APP_SUPABASE_URL || 'https://nkeiylfzzrqpjjlstpcj.supabase.co',
  SUPABASE_ANON_KEY: process.env.REACT_APP_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5rZWl5bGZ6enJxcGpqbHN0cGNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5MzUxMDQsImV4cCI6MjA3NTUxMTEwNH0.6CXM9QAe7dI8fsdLi7186DukOKqdw-y0SBjPfpbYl4I'
};

// Sobrescrever process.env para usar as configurações locais
if (!process.env.REACT_APP_BACKEND_URL) {
  process.env.REACT_APP_BACKEND_URL = config.BACKEND_URL;
}
if (!process.env.REACT_APP_SUPABASE_URL) {
  process.env.REACT_APP_SUPABASE_URL = config.SUPABASE_URL;
}
if (!process.env.REACT_APP_SUPABASE_ANON_KEY) {
  process.env.REACT_APP_SUPABASE_ANON_KEY = config.SUPABASE_ANON_KEY;
}

export default config;
