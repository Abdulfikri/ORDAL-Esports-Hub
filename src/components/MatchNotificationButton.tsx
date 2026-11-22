import React from 'react';
import { Bell, BellRing } from 'lucide-react';

interface MatchNotificationButtonProps {
  active: boolean;
  matchLabel: string;
  onToggle: (e: React.MouseEvent<HTMLButtonElement>) => void;
  showLabel?: boolean;
  compact?: boolean;
}

export const MatchNotificationButton: React.FC<MatchNotificationButtonProps> = ({
  active,
  matchLabel,
  onToggle,
  showLabel = false,
  compact = false,
}) => {
  const actionLabel = active
    ? `Matikan pengingat untuk ${matchLabel}`
    : `Aktifkan pengingat untuk ${matchLabel}`;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle(e);
      }}
      aria-pressed={active}
      aria-label={actionLabel}
      title={actionLabel}
      className={`inline-flex items-center justify-center gap-1.5 rounded-[4px] border transition-colors cursor-pointer shrink-0 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00F0FF] ${
        compact ? 'min-h-[34px] min-w-[34px] px-2 py-1' : 'min-h-[38px] min-w-[38px] px-2.5 py-1.5'
      } ${
        active
          ? 'bg-[#CCFF00]/15 border-[#CCFF00]/60 text-[#CCFF00] hover:bg-[#CCFF00]/25'
          : 'bg-[#12161F] border-white/15 text-[#94A3B8] hover:text-[#00F0FF] hover:border-[#00F0FF]/50'
      }`}
    >
      {active ? (
        <BellRing className="w-3.5 h-3.5 shrink-0" />
      ) : (
        <Bell className="w-3.5 h-3.5 shrink-0" />
      )}
      {showLabel && (
        <span className="font-telemetry text-[10px] font-bold uppercase tracking-[0.06em]">
          {active ? 'Notifikasi Aktif' : 'Ingatkan'}
        </span>
      )}
    </button>
  );
};
