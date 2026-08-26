import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  CheckCircle,
  ExternalLink,
  Loader2,
  Power,
  QrCode,
  RefreshCw,
  XCircle,
} from 'lucide-react';

import api from '../services/api';
import { Button } from './ui/button';
import { formatarNumeroWa, linkWa, passoDoItem, tituloDoItem } from '../lib/onboarding';

/**
 * Conexão do WhatsApp: um componente só, usado no passo 6 do onboarding e em
 * Configurações > Automação (contrato §4.3). Duas telas com o mesmo QR e o
 * mesmo botão de ativar sempre acabam divergindo em um dos dois.
 *
 * O nome da instância NUNCA aparece: ele carrega o id do usuário.
 */
const SEGUNDOS_QR = 45;
const INTERVALO_STATUS_MS = 5000;

const ROTULOS_ESTADO = {
  open: 'Conectado',
  close: 'Desconectado',
  connecting: 'Conectando…',
  disconnected: 'Desconectado',
  not_configured: 'Não configurado',
  carregando: 'Verificando…',
  error: 'Não foi possível verificar',
};

const ConexaoWhatsApp = ({ automacaoAtiva = false, aoMudarAutomacao, aoMudarConexao }) => {
  const [status, setStatus] = useState({ connected: false, state: 'carregando', numero: null });
  const [qrcode, setQrcode] = useState(null);
  const [restante, setRestante] = useState(SEGUNDOS_QR);
  const [preparando, setPreparando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [ativando, setAtivando] = useState(false);
  const [pendencias, setPendencias] = useState([]);
  const [erroPreparo, setErroPreparo] = useState(null);

  // Evita `setState` depois que a tela saiu (o passo 6 fecha ao concluir).
  const montado = useRef(true);
  const conectadoAntes = useRef(false);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  const buscarStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/whatsapp/status');
      if (!montado.current) return data;
      setStatus(data);
      if (data.connected) {
        setQrcode(null);
        if (!conectadoAntes.current) {
          conectadoAntes.current = true;
          aoMudarConexao?.(true);
        }
      } else if (conectadoAntes.current) {
        conectadoAntes.current = false;
        aoMudarConexao?.(false);
      }
      return data;
    } catch {
      if (montado.current) setStatus({ connected: false, state: 'error', numero: null });
      return null;
    }
  }, [aoMudarConexao]);

  const gerarQr = useCallback(async () => {
    try {
      const { data } = await api.get('/whatsapp/qrcode');
      if (!montado.current) return;
      setQrcode(data.qrcode || null);
      setRestante(SEGUNDOS_QR);
      setErroPreparo(data.qrcode ? null : 'O código não veio agora. Tente gerar de novo.');
    } catch (error) {
      if (!montado.current) return;
      setQrcode(null);
      setRestante(SEGUNDOS_QR);
      setErroPreparo(error.response?.data?.detail || 'Não foi possível preparar o WhatsApp agora.');
    }
  }, []);

  // Garante a instância antes de qualquer QR (contrato §3.6/P7).
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        await api.post('/whatsapp/instancia');
      } catch (error) {
        if (!cancelado && montado.current) {
          setErroPreparo(error.response?.data?.detail || 'Não foi possível preparar o WhatsApp agora.');
        }
      }
      const atual = await buscarStatus();
      if (!cancelado && montado.current) {
        setPreparando(false);
        if (!atual?.connected) await gerarQr();
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [buscarStatus, gerarQr]);

  // Status a cada 5 s enquanto esta tela estiver aberta.
  useEffect(() => {
    const id = setInterval(buscarStatus, INTERVALO_STATUS_MS);
    return () => clearInterval(id);
  }, [buscarStatus]);

  // Contagem regressiva do QR; o código da Evolution expira antes de 1 minuto.
  useEffect(() => {
    if (status.connected || !qrcode) return undefined;
    const id = setInterval(() => setRestante((valor) => Math.max(0, valor - 1)), 1000);
    return () => clearInterval(id);
  }, [status.connected, qrcode]);

  useEffect(() => {
    if (restante === 0 && !status.connected) gerarQr();
  }, [restante, status.connected, gerarQr]);

  const comOcupado = async (acao) => {
    setOcupado(true);
    try {
      await acao();
    } finally {
      if (montado.current) setOcupado(false);
    }
  };

  const reiniciar = () =>
    comOcupado(async () => {
      try {
        await api.post('/whatsapp/restart');
        toast.success('Conexão reiniciada.');
        setQrcode(null);
        await buscarStatus();
        await gerarQr();
      } catch (error) {
        toast.error(error.response?.data?.detail || 'Não foi possível reiniciar agora.');
      }
    });

  const desconectar = () =>
    comOcupado(async () => {
      try {
        await api.post('/whatsapp/disconnect');
        toast.success('WhatsApp desconectado.');
        setStatus({ connected: false, state: 'disconnected', numero: null });
        conectadoAntes.current = false;
        aoMudarConexao?.(false);
        await gerarQr();
      } catch (error) {
        toast.error(error.response?.data?.detail || 'Não foi possível desconectar agora.');
      }
    });

  const alternarAtendimento = async (ativa) => {
    setAtivando(true);
    setPendencias([]);
    try {
      const { data } = await api.put('/config/automacao', { ativa });
      aoMudarAutomacao?.(Boolean(data.ativa));
      toast.success(data.ativa ? 'Atendimento ativado.' : 'Atendimento desligado.');
    } catch (error) {
      // 409 vem com a lista do que falta; o servidor é quem decide (contrato P6).
      if (error.response?.status === 409) {
        setPendencias(error.response.data?.pendencias || []);
      } else {
        toast.error(error.response?.data?.detail || 'Não foi possível alterar o atendimento agora.');
      }
    } finally {
      if (montado.current) setAtivando(false);
    }
  };

  const numeroFormatado = formatarNumeroWa(status.numero);
  const conversa = linkWa(status.numero);
  const rotuloEstado = ROTULOS_ESTADO[status.state] || 'Desconectado';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-base font-bold text-ink">Conexão do WhatsApp</h3>
        <span
          className={`badge ${status.connected ? 'badge-success' : 'badge-neutral'}`}
          role="status"
        >
          {status.connected ? <CheckCircle size={14} /> : <XCircle size={14} />}
          {rotuloEstado}
        </span>
      </div>

      {preparando ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground" role="status">
          <Loader2 size={18} className="animate-spin" />
          Preparando a conexão…
        </div>
      ) : status.connected ? (
        <div className="surface-muted p-5">
          <p className="text-sm text-muted-foreground">Número conectado</p>
          <p className="mt-1 font-display text-xl font-bold text-ink">
            {numeroFormatado || 'Número indisponível'}
          </p>
          <p className="mt-4 text-sm leading-6 text-foreground">
            Agora mande um <strong>“oi”</strong> para esse número <strong>de outro telefone</strong>.
            É assim que você vê a sua recepção respondendo de verdade.
          </p>
          {conversa && (
            <a
              href={conversa}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-brand mt-4 inline-flex"
            >
              Abrir conversa <ExternalLink size={16} />
            </a>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center py-4 text-center">
          {qrcode ? (
            <>
              <img
                src={qrcode}
                alt="Código QR para conectar o WhatsApp"
                className="h-64 w-64 rounded-xl border border-border/70 bg-white"
              />
              <p className="mt-4 max-w-sm text-sm text-muted-foreground">
                No celular, abra o WhatsApp em <strong>Aparelhos conectados</strong> e aponte a câmera
                para o código.
              </p>
              <p className="mt-2 text-xs font-semibold text-muted-foreground" aria-live="polite">
                Novo código em {restante}s
              </p>
            </>
          ) : (
            <>
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
                <QrCode size={36} className="text-primary" />
              </span>
              <p className="mt-4 max-w-sm text-sm text-muted-foreground">
                {erroPreparo || 'Gere o código para conectar o número que atende seus clientes.'}
              </p>
            </>
          )}

          <Button type="button" onClick={gerarQr} disabled={ocupado} className="mt-5">
            {ocupado ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
            {qrcode ? 'Gerar outro código' : 'Gerar código'}
          </Button>
        </div>
      )}

      {status.connected && (
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="outline" onClick={reiniciar} disabled={ocupado}>
            <RefreshCw size={18} />
            Reiniciar conexão
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={desconectar}
            disabled={ocupado}
            className="border-destructive/40 text-destructive hover:bg-destructive/10"
          >
            <Power size={18} />
            Desconectar
          </Button>
        </div>
      )}

      <div className="rounded-2xl border border-border/70 p-5">
        <h4 className="font-display text-base font-bold text-ink">Atendimento automático</h4>
        <p className="mt-1 text-sm text-muted-foreground">
          {automacaoAtiva
            ? 'Sua recepção está respondendo as mensagens que chegam nesse número.'
            : 'Enquanto estiver desligado, nenhuma mensagem recebe resposta automática.'}
        </p>

        {pendencias.length > 0 && (
          <div role="alert" className="mt-4 rounded-xl bg-coral-soft px-4 py-3 text-sm text-coral-deep">
            <p className="font-semibold">Falta configurar antes de ativar:</p>
            <ul className="mt-2 space-y-1">
              {pendencias.map((item) => (
                <li key={item}>
                  <Link
                    to={`/onboarding?passo=${passoDoItem(item)}`}
                    className="font-semibold underline underline-offset-4"
                  >
                    {tituloDoItem(item)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Button
          type="button"
          variant={automacaoAtiva ? 'outline' : 'default'}
          onClick={() => alternarAtendimento(!automacaoAtiva)}
          disabled={ativando}
          className={`mt-4 ${automacaoAtiva ? 'border-destructive/40 text-destructive hover:bg-destructive/10' : ''}`}
        >
          {ativando ? <Loader2 size={18} className="animate-spin" /> : <Power size={18} />}
          {automacaoAtiva ? 'Desligar atendimento' : 'Ativar atendimento'}
        </Button>
      </div>
    </div>
  );
};

export default ConexaoWhatsApp;
