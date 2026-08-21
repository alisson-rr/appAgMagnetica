import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { CalendarCheck2, Eye, EyeOff, LayoutDashboard, MessagesSquare } from 'lucide-react';

const destaques = [
  { icon: MessagesSquare, texto: 'Atendimento no WhatsApp com as suas regras' },
  { icon: CalendarCheck2, texto: 'Agenda com os horários reais do seu negócio' },
  { icon: LayoutDashboard, texto: 'Central do dia com o que precisa de você' },
];

const Login = () => {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const result = await login(email, senha);

    if (result.success) {
      toast.success('Login realizado com sucesso!');
      navigate('/dashboard');
    } else {
      toast.error(result.error || 'Erro ao fazer login');
    }

    setLoading(false);
  };

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[1.05fr_1fr]">
      {/* Painel da marca */}
      <aside
        className="relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col lg:justify-between"
        style={{ background: 'var(--gradient-sidebar)' }}
      >
        <span className="pointer-events-none absolute -left-24 top-10 h-80 w-80 rounded-full bg-coral/25 blur-3xl" />
        <span className="pointer-events-none absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-apricot/20 blur-3xl" />

        <img src="/assets/logo.png" alt="Agenda Magnética" className="relative h-14 w-auto self-start" />

        <div className="relative max-w-md">
          <h2 className="font-display text-4xl font-bold leading-tight">
            Você cuida dos clientes. A agenda cuida do resto.
          </h2>
          <ul className="mt-8 space-y-3">
            {destaques.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.texto} className="flex items-center gap-3 rounded-2xl bg-white/10 p-3.5 text-sm">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 text-apricot">
                    <Icon className="h-4 w-4" />
                  </span>
                  {item.texto}
                </li>
              );
            })}
          </ul>
        </div>

        <p className="relative text-xs text-white/70">
          Recepção inteligente no WhatsApp para quem atende com hora marcada.
        </p>
      </aside>

      {/* Formulário */}
      <main className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-md">
          <img src="/assets/logo.png" alt="Agenda Magnética" className="mx-auto h-16 lg:hidden" />

          <div className="mt-8 text-center lg:mt-0 lg:text-left">
            <h1 className="font-display text-3xl font-bold text-ink">Bem-vindo de volta</h1>
            <p className="mt-2 text-muted-foreground">Entre para acompanhar sua agenda de hoje.</p>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                data-testid="login-email-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="seu@email.com"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="senha">Senha</Label>
              <div className="relative">
                <Input
                  id="senha"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  data-testid="login-password-input"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted-foreground transition hover:text-primary"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              size="lg"
              data-testid="login-submit-button"
              disabled={loading}
              className="w-full"
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Não tem uma conta?{' '}
              <Link to="/cadastro" className="font-semibold text-primary hover:underline">
                Comece grátis
              </Link>
            </p>
          </form>
        </div>
      </main>
    </div>
  );
};

export default Login;
