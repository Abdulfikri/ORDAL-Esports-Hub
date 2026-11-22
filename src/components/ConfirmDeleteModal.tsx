import React from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';

interface ConfirmDeleteModalProps {
  open: boolean;
  categoryLabel: string;
  itemName: string;
  warningText?: string;
  deleting?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({
  open,
  categoryLabel,
  itemName,
  warningText = 'Tindakan ini bersifat permanen dan tidak dapat dibatalkan.',
  deleting = false,
  onCancel,
  onConfirm,
}) => {
  useEscapeKey(open && !deleting, onCancel);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-[#0A0C10]/85 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Konfirmasi Hapus ${categoryLabel}`}
      onClick={() => {
        if (!deleting) onCancel();
      }}
    >
      <div
        className="w-full max-w-md bg-[#1A202C] border border-[#FF2E5B]/45 rounded-[6px] overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 bg-[#12161F] border-b border-white/[0.08] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[#FF2E5B]">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <h3 className="font-display text-lg font-bold uppercase text-[#F8FAFC]">
              Konfirmasi Hapus {categoryLabel}
            </h3>
          </div>
          <button
            type="button"
            disabled={deleting}
            onClick={onCancel}
            aria-label="Tutup konfirmasi hapus"
            className="p-1 text-[#94A3B8] hover:text-[#F8FAFC] disabled:opacity-40 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-[#E2E2E8] leading-relaxed">
            Anda akan menghapus {categoryLabel.toLowerCase()}{' '}
            <strong className="text-[#00F0FF]">{itemName}</strong>.
          </p>
          <div className="p-3 bg-[#FF2E5B]/10 border border-[#FF2E5B]/35 rounded-[4px] font-telemetry text-xs text-[#FFDADB] leading-relaxed">
            {warningText}
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              disabled={deleting}
              onClick={onCancel}
              className="min-h-[40px] px-4 py-2 border border-white/20 text-[#F8FAFC] hover:border-[#00F0FF] font-display text-xs font-semibold uppercase rounded-[4px] disabled:opacity-40 cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={onConfirm}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 bg-[#FF2E5B] text-white font-display text-xs font-bold uppercase rounded-[4px] hover:brightness-110 disabled:opacity-50 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {deleting ? 'Menghapus...' : `Ya, Hapus ${categoryLabel}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
