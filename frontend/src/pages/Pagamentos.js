import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { toast } from 'sonner';
import { Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const ITEMS_PER_PAGE = 10;

const Pagamentos = () => {
  const [consultas, setConsultas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  
  const getDefaultDates = () => {
    const now = new Date();
    return {
      inicio: format(startOfMonth(now), 'yyyy-MM-dd'),
      fim: format(endOfMonth(now), 'yyyy-MM-dd')
    };
  };

  const defaultDates = getDefaultDates();
  
  const [filters, setFilters] = useState({
    dataInicio: defaultDates.inicio,
    dataFim: defaultDates.fim,
    status: 'todos',
    profissional: 'todos'
  });
  
  const [profissionais, setProfissionais] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [consultasRes, profissionaisRes] = await Promise.all([
        api.get('/consultas'),
        api.get('/profissionais')
      ]);
      
      const allConsultas = consultasRes.data || [];
      const concluidas = allConsultas.filter(c => c.status === 'concluido');
      setConsultas(concluidas);
      setProfissionais(profissionaisRes.data || []);
    } catch (error) {
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  const parseDataFromIntervalo = (intervalo) => {
    if (!intervalo) return null;
    const match = intervalo.match(/(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : null;
  };

  const filteredConsultas = consultas.filter(consulta => {
    const dataConsulta = parseDataFromIntervalo(consulta.intervalo);
    
    if (filters.dataInicio && dataConsulta && dataConsulta < filters.dataInicio) {
      return false;
    }
    if (filters.dataFim && dataConsulta && dataConsulta > filters.dataFim) {
      return false;
    }
    if (filters.status !== 'todos' && consulta.status !== filters.status) {
      return false;
    }
    if (filters.profissional !== 'todos' && consulta.id_profissional?.toString() !== filters.profissional) {
      return false;
    }
    
    return true;
  });

  const totalPages = Math.ceil(filteredConsultas.length / ITEMS_PER_PAGE);
  const paginatedConsultas = filteredConsultas.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const totalValor = filteredConsultas.reduce((acc, c) => acc + (c.procedimento?.valor || 0), 0);

  const getStatusBadge = (status) => {
    const styles = {
      concluido: { bg: '#d1fae5', color: '#065f46', text: 'Pago' },
      pendente: { bg: '#fef3c7', color: '#92400e', text: 'Pendente' },
      cancelado: { bg: '#fee2e2', color: '#991b1b', text: 'Cancelado' }
    };
    const style = styles[status] || styles.pendente;
    
    return (
      <span 
        className="px-3 py-1 text-xs font-medium rounded-full"
        style={{ backgroundColor: style.bg, color: style.color }}
      >
        {style.text}
      </span>
    );
  };

  const formatDate = (intervalo) => {
    const dataStr = parseDataFromIntervalo(intervalo);
    if (!dataStr) return '-';
    try {
      return format(parseISO(dataStr), 'dd/MM/yyyy', { locale: ptBR });
    } catch {
      return dataStr;
    }
  };

  const gerarReciboPDF = (consulta) => {
    const dataServico = formatDate(consulta.intervalo);
    const valor = (consulta.procedimento?.valor || 0).toFixed(2);
    const cliente = consulta.cliente?.nome || 'Cliente';
    const profissional = consulta.profissional?.nome || 'Profissional';
    const procedimento = consulta.procedimento?.nome || 'Serviço';
    
    const conteudoHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Recibo - Agenda Magnética</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; color: #292726; }
          .header { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #2C7464; padding-bottom: 20px; }
          .header h1 { color: #2C7464; margin: 0; font-size: 28px; }
          .header p { color: #666; margin: 5px 0 0; }
          .recibo-title { text-align: center; font-size: 24px; color: #2C7464; margin: 30px 0; }
          .info { margin: 20px 0; }
          .info-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #eee; }
          .info-label { font-weight: bold; color: #666; }
          .info-value { color: #292726; }
          .valor-total { background: #2C7464; color: white; padding: 20px; text-align: center; margin-top: 30px; border-radius: 8px; }
          .valor-total span { font-size: 28px; font-weight: bold; }
          .footer { text-align: center; margin-top: 50px; color: #999; font-size: 12px; }
          .assinatura { margin-top: 60px; text-align: center; }
          .linha-assinatura { border-top: 1px solid #292726; width: 250px; margin: 0 auto; padding-top: 10px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Agenda Magnética</h1>
          <p>Recibo de Pagamento</p>
        </div>
        
        <div class="recibo-title">RECIBO</div>
        
        <div class="info">
          <div class="info-row">
            <span class="info-label">Data do Serviço:</span>
            <span class="info-value">${dataServico}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Cliente:</span>
            <span class="info-value">${cliente}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Profissional:</span>
            <span class="info-value">${profissional}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Procedimento:</span>
            <span class="info-value">${procedimento}</span>
          </div>
        </div>
        
        <div class="valor-total">
          <p style="margin: 0 0 10px; font-size: 14px;">Valor Pago</p>
          <span>R$ ${valor}</span>
        </div>
        
        <div class="assinatura">
          <div class="linha-assinatura">
            Assinatura do Responsável
          </div>
        </div>
        
        <div class="footer">
          <p>Documento gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
          <p>Agenda Magnética - Sistema de Gestão</p>
        </div>
      </body>
      </html>
    `;
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(conteudoHTML);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.print();
    };
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold" style={{ color: '#2C7464', fontFamily: 'Playfair Display, serif' }}>
          Pagamentos
        </h1>
        <p className="mt-2 text-base" style={{ color: '#292726' }}>
          Controle financeiro dos serviços concluídos
        </p>
      </div>

      <Card className="p-6 rounded-2xl shadow-lg" style={{ backgroundColor: 'white' }}>
        <h2 className="text-lg font-semibold mb-4" style={{ color: '#2C7464' }}>Filtros</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <Label>Data Início</Label>
            <Input
              type="date"
              value={filters.dataInicio}
              onChange={(e) => {
                setFilters({ ...filters, dataInicio: e.target.value });
                setCurrentPage(1);
              }}
              className="rounded-xl"
              style={{ borderColor: '#2C7464' }}
            />
          </div>
          <div>
            <Label>Data Fim</Label>
            <Input
              type="date"
              value={filters.dataFim}
              onChange={(e) => {
                setFilters({ ...filters, dataFim: e.target.value });
                setCurrentPage(1);
              }}
              className="rounded-xl"
              style={{ borderColor: '#2C7464' }}
            />
          </div>
          <div>
            <Label>Profissional</Label>
            <Select
              value={filters.profissional}
              onValueChange={(value) => {
                setFilters({ ...filters, profissional: value });
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="rounded-xl" style={{ borderColor: '#2C7464' }}>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {profissionais.map((p) => (
                  <SelectItem key={p.id} value={p.id.toString()}>{p.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select
              value={filters.status}
              onValueChange={(value) => {
                setFilters({ ...filters, status: value });
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="rounded-xl" style={{ borderColor: '#2C7464' }}>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="concluido">Pago</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="rounded-2xl shadow-lg overflow-hidden" style={{ backgroundColor: 'white' }}>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: '#2C7464' }} />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ backgroundColor: 'white' }}>
                    <th className="px-6 py-4 text-left text-sm font-semibold" style={{ color: '#292726' }}>Data</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold" style={{ color: '#292726' }}>Descrição</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold" style={{ color: '#292726' }}>Valor</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold" style={{ color: '#292726' }}>Profissional</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold" style={{ color: '#292726' }}>Status</th>
                    <th className="px-6 py-4 text-center text-sm font-semibold" style={{ color: '#292726' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedConsultas.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center" style={{ color: '#292726' }}>
                        Nenhum registro encontrado
                      </td>
                    </tr>
                  ) : (
                    paginatedConsultas.map((consulta) => (
                      <tr key={consulta.id} className="border-t hover:bg-gray-50" style={{ borderColor: '#F7F1EB' }}>
                        <td className="px-6 py-4 text-sm" style={{ color: '#292726' }}>
                          {formatDate(consulta.intervalo)}
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm font-medium" style={{ color: '#292726' }}>
                            {consulta.procedimento?.nome || 'Serviço'}
                          </p>
                          <p className="text-xs" style={{ color: '#666' }}>
                            Cliente: {consulta.cliente?.nome || '-'}
                          </p>
                        </td>
                        <td className="px-6 py-4 text-sm font-semibold" style={{ color: '#2C7464' }}>
                          R$ {(consulta.procedimento?.valor || 0).toFixed(2)}
                        </td>
                        <td className="px-6 py-4 text-sm" style={{ color: '#292726' }}>
                          {consulta.profissional?.nome || '-'}
                        </td>
                        <td className="px-6 py-4">
                          {getStatusBadge(consulta.status)}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <button
                            onClick={() => gerarReciboPDF(consulta)}
                            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                            title="Baixar recibo"
                          >
                            <Download className="w-4 h-4" style={{ color: '#2C7464' }} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-4 border-t flex items-center justify-between" style={{ borderColor: '#F7F1EB' }}>
              <p className="text-sm" style={{ color: '#292726' }}>
                Mostrando {((currentPage - 1) * ITEMS_PER_PAGE) + 1} a {Math.min(currentPage * ITEMS_PER_PAGE, filteredConsultas.length)} de {filteredConsultas.length} registros
                <span className="ml-4 font-semibold" style={{ color: '#2C7464' }}>
                  Total: R$ {totalValor.toFixed(2)}
                </span>
              </p>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-5 h-5" style={{ color: '#2C7464' }} />
                </button>
                <span 
                  className="px-4 py-2 rounded-lg text-white text-sm font-medium"
                  style={{ backgroundColor: '#2C7464' }}
                >
                  {currentPage}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-5 h-5" style={{ color: '#2C7464' }} />
                </button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
};

export default Pagamentos;