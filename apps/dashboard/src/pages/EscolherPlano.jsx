import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Star } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { toast } from 'sonner';

const planos = [
  {
    id: 'essencial',
    nome: 'Plano Essencial',
    precoAnual: 297,
    precoMensal: 399,
    descricao: 'Ideal para começar',
    popular: false,
    recursos: [
      'Atendente Humanizado 24h/dia',
      'Resposta automática instantânea',
      'Agendamento automático',
      'Suporte e manutenção contínuos'
    ]
  },
  {
    id: 'premium',
    nome: 'Plano Premium',
    precoAnual: 467,
    precoMensal: 599,
    descricao: 'O mais escolhido',
    popular: true,
    recursos: [
      'Tudo do Plano Essencial',
      'Multi profissionais',
      'Lembretes de consulta',
      'Histórico do cliente para recomendações',
      'Avaliações pós-consulta',
      'Acompanhamento por 90 dias'
    ]
  },
  {
    id: 'personalizado',
    nome: 'Plano Personalizado',
    precoMinimo: 799,
    descricao: 'Para clínicas que querem mais',
    popular: false,
    recursos: [
      'Tudo dos planos anteriores',
      'Cadastro automático de clientes',
      'Envio de links de pagamento',
      'Campanhas inteligentes (aniversários, retornos)',
      'Triagem inicial inteligente',
      'Funcionalidades exclusivas para sua clínica'
    ]
  }
];

const EscolherPlano = () => {
  const [planoSelecionado, setPlanoSelecionado] = useState(null);
  const [tipoCobranca, setTipoCobranca] = useState('anual');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleEscolherPlano = async (plano) => {
    setPlanoSelecionado(plano.id);
    setLoading(true);
    
    try {
      if (plano.id === 'personalizado') {
        toast.success('Entraremos em contato para personalizar seu plano!');
      } else {
        toast.success(`Plano ${plano.nome} selecionado com sucesso!`);
      }
      
      setTimeout(() => {
        navigate('/login');
      }, 1500);
    } catch (error) {
      toast.error('Erro ao selecionar plano');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen py-12 px-4" style={{ backgroundColor: '#F7F1EB' }}>
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-center mb-8">
          <img src="/assets/logo.png" alt="Agenda Magnética" className="h-20" />
        </div>

        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4" style={{ color: '#2C7464', fontFamily: 'Playfair Display, serif' }}>
            Escolha o Plano <span style={{ color: '#FEA5A4' }}>Ideal</span> Para Sua Clínica
          </h1>
          <p className="text-lg" style={{ color: '#292726' }}>
            Todos os planos incluem setup gratuito e suporte completo
          </p>
        </div>

        <div className="flex justify-center mb-8">
          <div className="inline-flex rounded-full p-1" style={{ backgroundColor: 'white' }}>
            <button
              onClick={() => setTipoCobranca('mensal')}
              className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
                tipoCobranca === 'mensal' ? 'text-white' : ''
              }`}
              style={{ 
                backgroundColor: tipoCobranca === 'mensal' ? '#2C7464' : 'transparent',
                color: tipoCobranca === 'mensal' ? 'white' : '#292726'
              }}
            >
              Mensal
            </button>
            <button
              onClick={() => setTipoCobranca('anual')}
              className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
                tipoCobranca === 'anual' ? 'text-white' : ''
              }`}
              style={{ 
                backgroundColor: tipoCobranca === 'anual' ? '#2C7464' : 'transparent',
                color: tipoCobranca === 'anual' ? 'white' : '#292726'
              }}
            >
              Anual <span style={{ color: tipoCobranca === 'anual' ? '#FEA5A4' : '#2C7464' }}>(Economia)</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {planos.map((plano) => (
            <Card
              key={plano.id}
              className={`relative p-8 rounded-2xl transition-all hover:shadow-xl ${
                plano.popular ? 'ring-2 scale-105' : ''
              }`}
              style={{ 
                backgroundColor: 'white',
                ringColor: plano.popular ? '#2C7464' : 'transparent'
              }}
            >
              {plano.popular && (
                <div 
                  className="absolute -top-4 left-1/2 transform -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold text-white flex items-center gap-1"
                  style={{ backgroundColor: '#FEA5A4' }}
                >
                  <Star className="w-3 h-3" />
                  MAIS POPULAR
                </div>
              )}

              <div className="text-center mb-6">
                <h3 className="text-lg font-bold mb-2" style={{ color: '#2C7464' }}>
                  {plano.nome.toUpperCase()}
                </h3>
                
                {plano.precoMinimo ? (
                  <div>
                    <p className="text-sm" style={{ color: '#292726' }}>A partir de</p>
                    <p className="text-4xl font-bold" style={{ color: '#2C7464' }}>
                      R$ {plano.precoMinimo}
                    </p>
                    <p className="text-sm" style={{ color: '#292726' }}>/mês</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-4xl font-bold" style={{ color: '#2C7464' }}>
                      R$ {tipoCobranca === 'anual' ? plano.precoAnual : plano.precoMensal}
                    </p>
                    <p className="text-sm" style={{ color: '#292726' }}>
                      /mês ({tipoCobranca === 'anual' ? 'Plano Anual' : 'Plano Mensal'})
                    </p>
                    {tipoCobranca === 'anual' && plano.precoMensal && (
                      <p className="text-xs mt-1" style={{ color: '#FEA5A4' }}>
                        ou R$ {plano.precoMensal}/mês no mensal
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-3 mb-8">
                {plano.recursos.map((recurso, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <Check className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#2C7464' }} />
                    <span className="text-sm" style={{ color: '#292726' }}>{recurso}</span>
                  </div>
                ))}
              </div>

              <Button
                onClick={() => handleEscolherPlano(plano)}
                disabled={loading && planoSelecionado === plano.id}
                className="w-full py-6 rounded-full text-base font-medium transition-all"
                style={{ 
                  backgroundColor: plano.popular ? '#2C7464' : 'transparent',
                  color: plano.popular ? 'white' : '#2C7464',
                  border: plano.popular ? 'none' : '2px solid #2C7464'
                }}
              >
                {loading && planoSelecionado === plano.id 
                  ? 'Processando...' 
                  : plano.id === 'personalizado' 
                    ? 'QUERO UM PLANO PERSONALIZADO'
                    : plano.popular 
                      ? 'ESCOLHER ESTE PLANO - MAIS POPULAR' 
                      : 'ESCOLHER ESTE PLANO'
                }
              </Button>
            </Card>
          ))}
        </div>

        <div className="text-center mt-12">
          <p className="text-sm" style={{ color: '#292726' }}>
            Dúvidas? Entre em contato conosco pelo WhatsApp ou e-mail.
          </p>
        </div>
      </div>
    </div>
  );
};

export default EscolherPlano;
