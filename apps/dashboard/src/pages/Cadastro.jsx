import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import api from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Checkbox } from '../components/ui/checkbox';
import { toast } from 'sonner';
import { CheckCircle2, Eye, EyeOff, Sparkles } from 'lucide-react';
import { politicaPrivacidade, termosDeUso } from '../data/legal';
import { encontrarPlano } from '../data/planos';

const vantagens = [
  '7 dias de teste antes de qualquer cobrança',
  'Configure seus serviços, horários e profissionais',
  'Conecte o WhatsApp quando quiser começar',
];

const LegalDialog = ({ documento, open, onOpenChange }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="font-display text-xl text-primary">{documento.titulo}</DialogTitle>
      </DialogHeader>
      <div className="space-y-5">
        {documento.secoes.map((secao) => (
          <section key={secao.titulo}>
            <h3 className="font-display text-base font-bold text-ink">{secao.titulo}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{secao.texto}</p>
          </section>
        ))}
      </div>
      <div className="flex justify-end">
        <Button onClick={() => onOpenChange(false)}>Fechar</Button>
      </div>
    </DialogContent>
  </Dialog>
);

const Cadastro = () => {
  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    senha: '',
    confirmarSenha: ''
  });
  const [aceitouTermos, setAceitouTermos] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [modalTermos, setModalTermos] = useState(false);
  const [modalPrivacidade, setModalPrivacidade] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Plano indicado pela landing page. Valor desconhecido é simplesmente ignorado.
  const planoEscolhido = encontrarPlano(searchParams.get('plano'));

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.nome.trim()) {
      toast.error('Por favor, informe seu nome');
      return;
    }

    if (!formData.email.trim()) {
      toast.error('Por favor, informe seu e-mail');
      return;
    }

    if (formData.senha.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres');
      return;
    }

    if (formData.senha !== formData.confirmarSenha) {
      toast.error('As senhas não conferem');
      return;
    }

    if (!aceitouTermos) {
      toast.error('Você precisa aceitar os termos de uso e política de privacidade');
      return;
    }

    setLoading(true);

    try {
      await api.post('/auth/register', {
        nome: formData.nome,
        email: formData.email,
        senha: formData.senha
      });

      toast.success('Cadastro realizado com sucesso! Você tem 7 dias de teste grátis.');
      navigate('/login');
    } catch (error) {
      const message = error.response?.data?.detail || 'Erro ao realizar cadastro';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[1fr_1.05fr]">
      <main className="order-2 flex items-center justify-center px-5 py-12 lg:order-1">
        <div className="w-full max-w-md">
          <img src="/assets/logo.png" alt="Agenda Magnética" className="mx-auto h-16 lg:hidden" />

          <div className="mt-8 text-center lg:mt-0 lg:text-left">
            <h1 className="font-display text-3xl font-bold text-ink">Crie sua conta</h1>
            <p className="mt-2 text-muted-foreground">São 7 dias de teste antes de qualquer cobrança.</p>
          </div>

          {planoEscolhido && (
            <p className="mt-5 flex items-center gap-2 rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-green-deep">
              <Sparkles className="h-4 w-4 shrink-0 text-primary" />
              Plano escolhido: {planoEscolhido.nome}
            </p>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="nome">Nome completo</Label>
              <Input
                id="nome"
                type="text"
                autoComplete="name"
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                required
                placeholder="Seu nome"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
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
                  autoComplete="new-password"
                  value={formData.senha}
                  onChange={(e) => setFormData({ ...formData, senha: e.target.value })}
                  required
                  placeholder="Mínimo 6 caracteres"
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

            <div className="space-y-1.5">
              <Label htmlFor="confirmarSenha">Confirmar senha</Label>
              <div className="relative">
                <Input
                  id="confirmarSenha"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={formData.confirmarSenha}
                  onChange={(e) => setFormData({ ...formData, confirmarSenha: e.target.value })}
                  required
                  placeholder="Repita a senha"
                  className="pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  aria-label={showConfirmPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted-foreground transition hover:text-primary"
                >
                  {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <div className="flex items-start gap-3 pt-1">
              <Checkbox
                id="termos"
                checked={aceitouTermos}
                onCheckedChange={setAceitouTermos}
                className="mt-0.5"
              />
              <label htmlFor="termos" className="text-sm leading-relaxed text-muted-foreground">
                Li e aceito os{' '}
                <button
                  type="button"
                  onClick={() => setModalTermos(true)}
                  className="font-semibold text-primary hover:underline"
                >
                  Termos de Uso
                </button>
                {' '}e a{' '}
                <button
                  type="button"
                  onClick={() => setModalPrivacidade(true)}
                  className="font-semibold text-primary hover:underline"
                >
                  Política de Privacidade
                </button>
              </label>
            </div>

            <Button type="submit" size="lg" disabled={loading || !aceitouTermos} className="w-full">
              {loading ? 'Cadastrando...' : 'Criar conta'}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Já tem uma conta?{' '}
              <Link to="/login" className="font-semibold text-primary hover:underline">
                Faça login
              </Link>
            </p>
          </form>
        </div>
      </main>

      {/* Painel da marca */}
      <aside
        className="relative order-1 flex flex-col justify-between overflow-hidden p-8 text-white lg:order-2 lg:p-12"
        style={{ background: 'var(--gradient-sidebar)' }}
      >
        <span className="pointer-events-none absolute -right-24 top-0 h-80 w-80 rounded-full bg-coral/25 blur-3xl" />
        <span className="pointer-events-none absolute -left-20 bottom-0 h-80 w-80 rounded-full bg-apricot/20 blur-3xl" />

        <img src="/assets/logo.png" alt="Agenda Magnética" className="relative hidden h-14 w-auto self-start lg:block" />

        <div className="relative max-w-md">
          <h2 className="font-display text-2xl font-bold leading-tight lg:text-4xl">
            Comece hoje e veja sua agenda se organizar sozinha.
          </h2>
          <ul className="mt-6 space-y-3 lg:mt-8">
            {vantagens.map((vantagem) => (
              <li key={vantagem} className="flex items-center gap-3 rounded-2xl bg-white/10 p-3.5 text-sm">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-apricot" />
                {vantagem}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative hidden text-xs text-white/70 lg:block">
          Você mantém o controle do que a automação pode e não pode fazer.
        </p>
      </aside>

      <LegalDialog documento={termosDeUso} open={modalTermos} onOpenChange={setModalTermos} />
      <LegalDialog documento={politicaPrivacidade} open={modalPrivacidade} onOpenChange={setModalPrivacidade} />
    </div>
  );
};

export default Cadastro;
