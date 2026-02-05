import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Checkbox } from '../components/ui/checkbox';
import { toast } from 'sonner';
import { Eye, EyeOff } from 'lucide-react';

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
  const navigate = useNavigate();

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
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F7F1EB' }}>
      <div className="w-full max-w-md p-8 space-y-6">
        <div className="flex justify-center">
          <img src="/assets/logo.png" alt="Agenda Magnética" className="h-24" />
        </div>

        <div className="text-center">
          <h2 className="text-3xl font-bold" style={{ color: '#2C7464', fontFamily: 'Playfair Display, serif' }}>
            Crie sua conta
          </h2>
          <p className="mt-2 text-base" style={{ color: '#292726' }}>
            Preencha os dados abaixo para começar
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="nome" style={{ color: '#292726' }}>Nome completo</Label>
            <Input
              id="nome"
              type="text"
              value={formData.nome}
              onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
              required
              className="mt-1"
              style={{ 
                backgroundColor: 'white',
                borderColor: '#2C7464',
                color: '#292726'
              }}
              placeholder="Seu nome"
            />
          </div>

          <div>
            <Label htmlFor="email" style={{ color: '#292726' }}>E-mail</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
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
                value={formData.senha}
                onChange={(e) => setFormData({ ...formData, senha: e.target.value })}
                required
                style={{ 
                  backgroundColor: 'white',
                  borderColor: '#2C7464',
                  color: '#292726',
                  paddingRight: '40px'
                }}
                placeholder="Mínimo 6 caracteres"
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

          <div>
            <Label htmlFor="confirmarSenha" style={{ color: '#292726' }}>Confirmar senha</Label>
            <div className="relative mt-1">
              <Input
                id="confirmarSenha"
                type={showConfirmPassword ? 'text' : 'password'}
                value={formData.confirmarSenha}
                onChange={(e) => setFormData({ ...formData, confirmarSenha: e.target.value })}
                required
                style={{ 
                  backgroundColor: 'white',
                  borderColor: '#2C7464',
                  color: '#292726',
                  paddingRight: '40px'
                }}
                placeholder="Repita a senha"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: '#2C7464' }}
              >
                {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div className="flex items-start space-x-3 pt-2">
            <Checkbox
              id="termos"
              checked={aceitouTermos}
              onCheckedChange={setAceitouTermos}
              className="mt-1"
              style={{ borderColor: '#2C7464' }}
            />
            <label htmlFor="termos" className="text-sm" style={{ color: '#292726' }}>
              Li e aceito os{' '}
              <button
                type="button"
                onClick={() => setModalTermos(true)}
                className="font-medium hover:underline"
                style={{ color: '#2C7464' }}
              >
                Termos de Uso
              </button>
              {' '}e a{' '}
              <button
                type="button"
                onClick={() => setModalPrivacidade(true)}
                className="font-medium hover:underline"
                style={{ color: '#2C7464' }}
              >
                Política de Privacidade
              </button>
            </label>
          </div>

          <Button
            type="submit"
            disabled={loading || !aceitouTermos}
            className="w-full py-6 text-base font-medium text-white transition-all rounded-full disabled:opacity-50"
            style={{ backgroundColor: '#2C7464' }}
          >
            {loading ? 'Cadastrando...' : 'Criar conta'}
          </Button>

          <div className="text-center">
            <p className="text-sm" style={{ color: '#292726' }}>
              Já tem uma conta?{' '}
              <Link
                to="/login"
                className="font-medium hover:underline"
                style={{ color: '#2C7464' }}
              >
                Faça login
              </Link>
            </p>
          </div>
        </form>
      </div>

      <Dialog open={modalTermos} onOpenChange={setModalTermos}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ color: '#2C7464' }}>Termos de Uso</DialogTitle>
          </DialogHeader>
          <div className="prose prose-sm" style={{ color: '#292726' }}>
            <h3>1. Aceitação dos Termos</h3>
            <p>
              Ao acessar e utilizar o sistema Agenda Magnética, você concorda em cumprir e estar 
              vinculado aos seguintes termos e condições de uso. Se você não concordar com qualquer 
              parte destes termos, não deverá utilizar nosso serviço.
            </p>
            
            <h3>2. Descrição do Serviço</h3>
            <p>
              O Agenda Magnética é um sistema de gestão de agendamentos para clínicas e profissionais 
              de saúde e beleza. O serviço permite o gerenciamento de consultas, clientes, profissionais 
              e procedimentos.
            </p>
            
            <h3>3. Responsabilidades do Usuário</h3>
            <p>
              O usuário é responsável por manter a confidencialidade de sua conta e senha, bem como 
              por todas as atividades realizadas em sua conta. O usuário concorda em notificar 
              imediatamente sobre qualquer uso não autorizado de sua conta.
            </p>
            
            <h3>4. Uso Adequado</h3>
            <p>
              O usuário concorda em utilizar o serviço apenas para fins legais e de acordo com 
              estes termos. É proibido o uso do sistema para atividades ilegais ou não autorizadas.
            </p>
            
            <h3>5. Modificações</h3>
            <p>
              Reservamo-nos o direito de modificar estes termos a qualquer momento. As alterações 
              entrarão em vigor imediatamente após a publicação. O uso continuado do serviço após 
              tais modificações constitui aceitação dos novos termos.
            </p>
            
            <h3>6. Limitação de Responsabilidade</h3>
            <p>
              O Agenda Magnética não será responsável por quaisquer danos diretos, indiretos, 
              incidentais ou consequenciais decorrentes do uso ou incapacidade de uso do serviço.
            </p>
          </div>
          <div className="flex justify-end mt-4">
            <Button
              onClick={() => setModalTermos(false)}
              style={{ backgroundColor: '#2C7464', color: 'white' }}
            >
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={modalPrivacidade} onOpenChange={setModalPrivacidade}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ color: '#2C7464' }}>Política de Privacidade</DialogTitle>
          </DialogHeader>
          <div className="prose prose-sm" style={{ color: '#292726' }}>
            <h3>1. Coleta de Informações</h3>
            <p>
              Coletamos informações que você nos fornece diretamente, como nome, e-mail e outros 
              dados necessários para a prestação do serviço. Também podemos coletar informações 
              automaticamente sobre seu uso do sistema.
            </p>
            
            <h3>2. Uso das Informações</h3>
            <p>
              Utilizamos as informações coletadas para:
            </p>
            <ul>
              <li>Fornecer e manter nosso serviço</li>
              <li>Notificá-lo sobre alterações em nosso serviço</li>
              <li>Permitir a participação em recursos interativos</li>
              <li>Fornecer suporte ao cliente</li>
              <li>Monitorar o uso do serviço</li>
            </ul>
            
            <h3>3. Proteção de Dados</h3>
            <p>
              Implementamos medidas de segurança técnicas e organizacionais apropriadas para 
              proteger suas informações pessoais contra acesso não autorizado, alteração, 
              divulgação ou destruição.
            </p>
            
            <h3>4. Compartilhamento de Informações</h3>
            <p>
              Não vendemos, comercializamos ou transferimos suas informações pessoais para 
              terceiros, exceto quando necessário para fornecer o serviço ou quando exigido por lei.
            </p>
            
            <h3>5. Seus Direitos</h3>
            <p>
              Você tem o direito de acessar, corrigir ou excluir suas informações pessoais. 
              Para exercer esses direitos, entre em contato conosco através dos canais disponíveis.
            </p>
            
            <h3>6. Cookies</h3>
            <p>
              Utilizamos cookies e tecnologias similares para melhorar sua experiência em nosso 
              sistema. Você pode configurar seu navegador para recusar cookies, mas isso pode 
              afetar a funcionalidade do serviço.
            </p>
            
            <h3>7. Alterações nesta Política</h3>
            <p>
              Podemos atualizar nossa Política de Privacidade periodicamente. Notificaremos sobre 
              quaisquer alterações publicando a nova política nesta página.
            </p>
          </div>
          <div className="flex justify-end mt-4">
            <Button
              onClick={() => setModalPrivacidade(false)}
              style={{ backgroundColor: '#2C7464', color: 'white' }}
            >
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Cadastro;
