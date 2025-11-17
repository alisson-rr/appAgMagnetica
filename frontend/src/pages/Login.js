import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { Eye, EyeOff } from 'lucide-react';

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
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F7F1EB' }}>
      <div className="w-full max-w-md p-8 space-y-8">
        {/* Logo */}
        <div className="flex justify-center">
          <img src="/assets/logo.png" alt="Agenda Magnética" className="h-24" />
        </div>

        {/* Title */}
        <div className="text-center">
          <h2 className="text-3xl font-bold" style={{ color: '#2C7464', fontFamily: 'Playfair Display, serif' }}>
            Bem-vindo de volta
          </h2>
          <p className="mt-2 text-base" style={{ color: '#292726' }}>
            Entre com suas credenciais para acessar
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <div className="space-y-4">
            <div>
              <Label htmlFor="email" style={{ color: '#292726' }}>E-mail</Label>
              <Input
                id="email"
                type="email"
                data-testid="login-email-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="mt-1"
                style={{ 
                  backgroundColor: 'white',
                  borderColor: '#2C7464',
                  color: '#292726'
                }}
                placeholder="seu@email.com"
              />
            </div>

            <div>
              <Label htmlFor="senha" style={{ color: '#292726' }}>Senha</Label>
              <div className="relative mt-1">
                <Input
                  id="senha"
                  type={showPassword ? 'text' : 'password'}
                  data-testid="login-password-input"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  required
                  style={{ 
                    backgroundColor: 'white',
                    borderColor: '#2C7464',
                    color: '#292726',
                    paddingRight: '40px'
                  }}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: '#2C7464' }}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <a
              href="#"
              className="text-sm font-medium hover:underline"
              style={{ color: '#FEA5A4' }}
            >
              Esqueci minha senha
            </a>
          </div>

          <Button
            type="submit"
            data-testid="login-submit-button"
            disabled={loading}
            className="w-full py-6 text-base font-medium text-white transition-all rounded-full"
            style={{ 
              backgroundColor: '#2C7464',
            }}
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default Login;