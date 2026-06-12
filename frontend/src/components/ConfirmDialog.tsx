import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Power, PowerOff, Trash2, X, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ConfirmVariant = 'default' | 'danger' | 'warning' | 'success';

interface Props {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  icon?: LucideIcon;
  busy?: boolean;
  /** Message d'erreur à afficher (le dialogue reste ouvert tant qu'il est présent). */
  error?: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

const VARIANTS: Record<
  ConfirmVariant,
  { iconBg: string; iconText: string; confirmCls: string; defaultIcon: LucideIcon }
> = {
  default: {
    iconBg: 'bg-[#EFF6FF]',
    iconText: 'text-[#1A6DB5]',
    confirmCls: 'bg-[#0F4C81] hover:bg-[#1A6DB5] text-white',
    defaultIcon: Power,
  },
  warning: {
    iconBg: 'bg-[#FFFBEB]',
    iconText: 'text-[#92400E]',
    confirmCls: 'bg-[#F59E0B] hover:bg-[#D97706] text-white',
    defaultIcon: PowerOff,
  },
  danger: {
    iconBg: 'bg-[#FEF3F2]',
    iconText: 'text-[#B42318]',
    confirmCls: 'bg-[#B42318] hover:bg-[#7F1D1D] text-white',
    defaultIcon: Trash2,
  },
  success: {
    iconBg: 'bg-[#ECFDF5]',
    iconText: 'text-[#047857]',
    confirmCls: 'bg-[#047857] hover:bg-[#065F46] text-white',
    defaultIcon: AlertTriangle,
  },
};

/**
 * Boîte de dialogue de confirmation modale.
 * Remplace `window.confirm()` qui ne respecte pas la charte de l'app
 * et bloque le thread principal.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  variant = 'default',
  icon,
  busy = false,
  error,
  onConfirm,
  onCancel,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
      if (e.key === 'Enter' && !busy) onConfirm();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel, onConfirm]);

  if (!open) return null;

  const v = VARIANTS[variant];
  const Icon = icon ?? v.defaultIcon;

  // Rendu via Portal pour échapper aux contextes parents (button, overflow:hidden,
  // transform, etc.) qui pourraient piéger ou rogner le modal.
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0A1628]/60 p-4"
      onClick={busy ? undefined : onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-[14px] border border-[rgba(15,76,129,0.1)] bg-white shadow-[0_20px_50px_rgba(15,23,42,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-[rgba(15,76,129,0.08)] px-5 py-4">
          <div
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]',
              v.iconBg,
              v.iconText,
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 pt-0.5">
            <div id="confirm-dialog-title" className="font-display text-[14px] font-semibold text-[#0F172A]">
              {title}
            </div>
            {description && (
              <div className="mt-1 text-[12px] text-[#64748B]">{description}</div>
            )}
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label="Fermer"
            className="flex h-7 w-7 items-center justify-center rounded-[7px] text-[#94A3B8] transition-colors hover:bg-[#F8FAFC] hover:text-[#0F172A] disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 border-t border-[rgba(15,76,129,0.08)] bg-[#FEF3F2] px-5 py-3 text-[12px] text-[#B42318]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 bg-[#F8FAFC] px-5 py-3">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded-[9px] px-4 py-2 text-xs font-semibold transition-colors disabled:opacity-50',
              v.confirmCls,
            )}
          >
            {busy ? 'Traitement…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
