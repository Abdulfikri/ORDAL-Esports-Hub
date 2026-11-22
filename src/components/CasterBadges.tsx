import React from 'react';
import { BadgeCheck, Crown } from 'lucide-react';

interface CasterBadgesProps {
  isVerified?: boolean;
  isTopCaster?: boolean;
  size?: 'xs' | 'sm' | 'md';
  showEmptyLabel?: boolean;
  className?: string;
}

export const CasterBadges: React.FC<CasterBadgesProps> = ({
  isVerified = false,
  isTopCaster = false,
  size = 'sm',
  showEmptyLabel = false,
  className = '',
}) => {
  if (!isVerified && !isTopCaster) {
    if (!showEmptyLabel) return null;
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-[3px] border border-white/10 bg-[#0A0C10] font-telemetry text-[10px] font-semibold uppercase tracking-[0.06em] text-[#94A3B8] whitespace-nowrap shrink-0 ${className}`}
      >
        Talent Resmi
      </span>
    );
  }

  const sizeClasses =
    size === 'xs'
      ? 'px-1.5 py-0.5 text-[9px] gap-1'
      : size === 'md'
        ? 'px-2.5 py-1 text-[11px] gap-1.5'
        : 'px-2 py-0.5 text-[10px] gap-1';

  const iconClass = size === 'xs' ? 'w-3 h-3 shrink-0' : size === 'md' ? 'w-3.5 h-3.5 shrink-0' : 'w-3 h-3 shrink-0';

  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`}>
      {isVerified && (
        <span
          title="Verified — Shoutcaster Terverifikasi Resmi ORDAL"
          aria-label="Verified Caster"
          className={`inline-flex items-center ${sizeClasses} rounded-[3px] border border-[#00F0FF]/45 bg-[#00F0FF]/12 text-[#00F0FF] font-telemetry font-bold uppercase tracking-[0.06em] whitespace-nowrap shrink-0`}
        >
          <BadgeCheck className={iconClass} />
          <span>Verified</span>
        </span>
      )}
      {isTopCaster && (
        <span
          title="Top Caster — Shoutcaster Unggulan & Prioritas Event ORDAL"
          aria-label="Top Caster"
          className={`inline-flex items-center ${sizeClasses} rounded-[3px] border border-[#CCFF00]/45 bg-[#CCFF00]/12 text-[#CCFF00] font-telemetry font-bold uppercase tracking-[0.06em] whitespace-nowrap shrink-0`}
        >
          <Crown className={iconClass} />
          <span>Top Caster</span>
        </span>
      )}
    </span>
  );
};
