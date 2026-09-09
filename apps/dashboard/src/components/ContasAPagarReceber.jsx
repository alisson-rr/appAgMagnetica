import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Check, Trash2 } from 'lucide-react';
import api from '../services/api';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

// O dinheiro dos atendimentos já é somado acima, a partir da agenda. Isto aqui
// é o resto: aluguel, material, fornecedor, a parcela que alguém ficou de pagar.
const VAZIO = { tipo: 'pagar', descricao: '', valor: '', vencimento: '' };

function emReais(valor) {
  const numero = Number(valor);
  if (Number.isNaN(numero)) return '—';
  return numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function emDia(iso) {
  if (!iso) return '';
  // `iso` é uma data pura (sem hora). `new Date('2026-09-20')` seria lida como
  // UTC e, no fuso de São Paulo, mostraria o dia 19.
  const [ano, mes, dia] = String(iso).split('-');
  return dia && mes ? `${dia}/${mes}/${ano}` : iso;
}

export default function ContasAPagarReceber() {
  const [contas, setContas] = useState([]);
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState(VAZIO);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const { data } = await api.get('/lancamentos');
      setContas(Array.isArray(data) ? data : []);
    } catch {
      /* a lista continua como está; a próxima abertura tenta de novo */
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const salvar = async (evento) => {
    evento.preventDefault();
    if (salvando) return;
    setSalvando(true);
    try {
      await api.post('/lancamentos', {
        tipo: form.tipo,
        descricao: form.descricao.trim(),
        valor: form.valor,
        vencimento: form.vencimento,
      });
      setForm(VAZIO);
      setAberto(false);
      await carregar();
      toast.success('Conta cadastrada.');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Não consegui salvar a conta.');
    } finally {
      setSalvando(false);
    }
  };

  const quitar = async (conta) => {
    try {
      await api.post(`/lancamentos/${conta.id}/quitar`);
      await carregar();
    } catch {
      toast.error('Não consegui atualizar agora.');
    }
  };

  const apagar = async (conta) => {
    try {
      await api.delete(`/lancamentos/${conta.id}`);
      await carregar();
    } catch {
      toast.error('Não consegui apagar agora.');
    }
  };

  const emAberto = contas.filter((c) => !c.quitado_em);
  const total = (tipo) => emAberto
    .filter((c) => c.tipo === tipo)
    .reduce((soma, c) => soma + Number(c.valor || 0), 0);

  return (
    <Card className="mt-6 p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-bold text-ink">Contas a pagar e a receber</h2>
          <p className="text-sm text-muted-foreground">
            O que não vem dos atendimentos: aluguel, material, fornecedor.
          </p>
        </div>
        <Button
          onClick={() => setAberto((atual) => !atual)}
          aria-expanded={aberto}
          className="flex items-center gap-2"
        >
          <Plus size={18} aria-hidden="true" />
          Nova conta
        </Button>
      </div>

      {emAberto.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-4 text-sm">
          <span>A pagar em aberto: <strong>{emReais(total('pagar'))}</strong></span>
          <span>A receber em aberto: <strong>{emReais(total('receber'))}</strong></span>
        </div>
      )}

      {aberto && (
        <form onSubmit={salvar} className="mb-6 grid gap-3 rounded-md border p-4 md:grid-cols-4">
          <div>
            <Label htmlFor="conta-tipo">Tipo</Label>
            <select
              id="conta-tipo"
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.tipo}
              onChange={(e) => setForm({ ...form, tipo: e.target.value })}
            >
              <option value="pagar">A pagar</option>
              <option value="receber">A receber</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="conta-descricao">Descrição</Label>
            <Input
              id="conta-descricao"
              className="mt-1"
              required
              maxLength={200}
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              placeholder="Aluguel da sala"
            />
          </div>
          <div>
            <Label htmlFor="conta-valor">Valor</Label>
            <Input
              id="conta-valor"
              className="mt-1"
              required
              type="number"
              min="0.01"
              step="0.01"
              value={form.valor}
              onChange={(e) => setForm({ ...form, valor: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="conta-vencimento">Vencimento</Label>
            <Input
              id="conta-vencimento"
              className="mt-1"
              required
              type="date"
              value={form.vencimento}
              onChange={(e) => setForm({ ...form, vencimento: e.target.value })}
            />
          </div>
          <div className="flex items-end md:col-span-4">
            <Button type="submit" disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar conta'}
            </Button>
          </div>
        </form>
      )}

      {contas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma conta cadastrada ainda.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Contas a pagar e a receber</caption>
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th scope="col" className="py-2">Descrição</th>
                <th scope="col" className="py-2">Tipo</th>
                <th scope="col" className="py-2">Vence</th>
                <th scope="col" className="py-2 text-right">Valor</th>
                <th scope="col" className="py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {contas.map((conta) => (
                <tr key={conta.id} className={`border-b ${conta.quitado_em ? 'opacity-50' : ''}`}>
                  <td className="py-2">{conta.descricao}</td>
                  <td className="py-2">{conta.tipo === 'pagar' ? 'A pagar' : 'A receber'}</td>
                  <td className="py-2">{emDia(conta.vencimento)}</td>
                  <td className="py-2 text-right tabular-nums">{emReais(conta.valor)}</td>
                  <td className="py-2">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => quitar(conta)}
                        title={conta.quitado_em ? 'Marcar como em aberto' : 'Marcar como quitada'}
                      >
                        <Check size={16} aria-hidden="true" />
                        <span className="sr-only">
                          {conta.quitado_em ? 'Reabrir' : 'Quitar'} {conta.descricao}
                        </span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => apagar(conta)}
                        title="Apagar"
                      >
                        <Trash2 size={16} aria-hidden="true" />
                        <span className="sr-only">Apagar {conta.descricao}</span>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
