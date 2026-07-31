import { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

type Props = {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Estilo do botão de confirmação: 'danger' (padrão) para ações destrutivas. */
  tone?: 'danger' | 'primary';
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

/** Modal de confirmação para ações sensíveis / irreversíveis. Fecha no ESC e no backdrop. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Voltar',
  tone = 'danger',
  loading = false,
  onConfirm,
  onClose,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, loading, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={() => !loading && onClose()}
    >
      <div className="card w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="card-header">
          <h3 className="font-semibold text-ink inline-flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </span>
            {title}
          </h3>
          <button
            className="text-ink-muted hover:text-ink"
            onClick={() => !loading && onClose()}
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="card-body">
          <div className="text-sm text-ink-soft">{message}</div>
          <div className="flex justify-end gap-2 mt-6">
            <button className="btn-secondary" onClick={onClose} disabled={loading}>
              {cancelLabel}
            </button>
            <button
              className={tone === 'danger' ? 'btn-danger' : 'btn-primary'}
              onClick={onConfirm}
              disabled={loading}
            >
              {loading ? 'Processando…' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
