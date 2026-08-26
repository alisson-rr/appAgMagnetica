import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Search } from 'lucide-react';
import { formatPhone } from '../utils/formatters';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { EmptyState, Loading, PageHeader } from '../components/PageChrome';
import ProfissionalForm from '../components/ProfissionalForm';

const Profissionais = () => {
  const [profissionais, setProfissionais] = useState([]);
  const [areas, setAreas] = useState([]);
  const [procedimentos, setProcedimentos] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState(null);
  const [valoresIniciais, setValoresIniciais] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [profsRes, areasRes, procsRes] = await Promise.all([
        api.get('/profissionais'),
        api.get('/areas-atuacao'),
        api.get('/procedimentos')
      ]);
      setProfissionais(profsRes.data || []);
      setAreas(areasRes.data || []);
      setProcedimentos(procsRes.data || []);
    } catch (error) {
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  const openModal = async (profissional = null) => {
    setEditando(profissional);

    if (!profissional) {
      setValoresIniciais(null);
      setModalOpen(true);
      return;
    }

    let procs = [];
    let disps = [];
    try {
      const [procsRes, dispsRes] = await Promise.all([
        api.get(`/profissionais/${profissional.id}/procedimentos`),
        api.get(`/profissionais/${profissional.id}/disponibilidade`)
      ]);
      procs = procsRes.data || [];
      disps = (dispsRes.data || []).map(d => ({
        dia_semana: d.dia_semana,
        hora_inicio: d.hora_inicio?.substring(0, 5) || '',
        hora_fim: d.hora_fim?.substring(0, 5) || ''
      }));
    } catch (error) {
      toast.error('Não foi possível carregar os serviços e horários desta pessoa.');
    }

    setValoresIniciais({
      nome: profissional.nome || '',
      email: profissional.email || '',
      whats: formatPhone(profissional.whats || ''),
      id_area_atuacao: profissional.id_area_atuacao?.toString() || '',
      ativo: profissional.ativo ?? true,
      observacoes: profissional.observacoes || '',
      procedimentos: procs,
      disponibilidades: disps
    });
    setModalOpen(true);
  };

  const salvar = async ({ procedimentos: escolhidos, disponibilidades, ...dadosPessoa }) => {
    setSalvando(true);
    try {
      let profId;
      if (editando) {
        await api.put(`/profissionais/${editando.id}`, dadosPessoa);
        profId = editando.id;
        toast.success('Profissional atualizado!');
      } else {
        const response = await api.post('/profissionais', dadosPessoa);
        profId = response.data.id;
        toast.success('Profissional criado!');
      }

      // Ambos os endpoints substituem a lista inteira, então enviar sempre —
      // inclusive vazia — é o que faz "desmarquei tudo" realmente valer.
      await api.post(`/profissionais/${profId}/procedimentos`, escolhidos || []);
      await api.post(`/profissionais/${profId}/disponibilidade`, disponibilidades || []);

      setModalOpen(false);
      fetchData();
      return true;
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erro ao salvar profissional');
      return false;
    } finally {
      setSalvando(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Deletar profissional?')) return;
    try {
      await api.delete(`/profissionais/${id}`);
      toast.success('Profissional deletado!');
      fetchData();
    } catch (error) {
      toast.error('Erro ao deletar');
    }
  };

  const filteredProfissionais = profissionais.filter(prof =>
    prof.nome.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="page-shell">
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <PageHeader title="Profissionais" description="Cada pessoa com seus serviços e seus horários de atendimento.">
          <DialogTrigger asChild>
            <Button data-testid="novo-profissional-button" onClick={() => openModal()} size="lg">
              <Plus className="w-5 h-5" />
              Novo profissional
            </Button>
          </DialogTrigger>
        </PageHeader>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar' : 'Novo'} Profissional</DialogTitle>
          </DialogHeader>
          {/* `key` remonta o formulário ao trocar de pessoa. */}
          <ProfissionalForm
            key={editando?.id ?? 'novo'}
            valoresIniciais={valoresIniciais}
            areas={areas}
            procedimentos={procedimentos}
            enviando={salvando}
            aoSalvar={salvar}
            aoCancelar={() => setModalOpen(false)}
          />
        </DialogContent>
      </Dialog>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-primary" />
        <label htmlFor="busca-profissionais" className="sr-only">Buscar profissional</label>
        <Input
          id="busca-profissionais"
          data-testid="search-profissionais"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar..."
          className="pl-10"
        />
      </div>

      {loading ? (
        <Loading />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProfissionais.map((prof) => (
            <Card
              key={prof.id}
              data-testid={`profissional-card-${prof.id}`}
              className="p-6 transition hover:-translate-y-0.5 hover:border-primary/30"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="font-display text-lg font-bold text-ink">
                    {prof.nome}
                  </h3>
                  {prof.area_atuacao && (
                    <p className="text-sm mt-1 text-foreground">
                      {prof.area_atuacao.nome}
                    </p>
                  )}
                  <span className={`badge mt-2 ${prof.ativo ? 'badge-success' : 'badge-neutral'}`}>
                    {prof.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => openModal(prof)}
                    data-testid={`edit-profissional-${prof.id}`}
                    aria-label={`Editar ${prof.nome}`}
                    className="icon-action"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(prof.id)}
                    data-testid={`delete-profissional-${prof.id}`}
                    aria-label={`Excluir ${prof.nome}`}
                    className="icon-action icon-action-danger"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {prof.email && (
                  <p className="text-sm text-foreground">
                    <span className="font-medium">Email:</span> {prof.email}
                  </p>
                )}
                {prof.whats && (
                  <p className="text-sm text-foreground">
                    <span className="font-medium">WhatsApp:</span> {formatPhone(prof.whats)}
                  </p>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {!loading && filteredProfissionais.length === 0 && (
        <Card>
          <EmptyState
            icon={Search}
            title={searchTerm ? 'Nenhum profissional com esse nome' : 'Nenhum profissional cadastrado'}
            description="Cadastre quem atende para definir serviços e horários por pessoa."
          />
        </Card>
      )}
    </div>
  );
};

export default Profissionais;
