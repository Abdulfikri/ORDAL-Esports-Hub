import React from 'react';
import type { Match } from '../types';

interface LiveMatchTickerProps {
  matches: Match[];
  onSelectMatch: (match: Match) => void;
}

export const LiveMatchTicker: React.FC<LiveMatchTickerProps> = ({ matches, onSelectMatch }) => {
  if (matches.length === 0) return null;

  // Duplicate items for seamless continuous marquee loop
  const items = [...matches, ...matches];

  return (
    <div
      className="w-full bg-[#0A0C10] border-y border-white/[0.08] overflow-hidden select-none"
      aria-label="Live Match Ticker"
    >
      <div className="animate-ticker py-2.5">
        {items.map((match, index) => {
          const isLive = match.status === 'LIVE';
          const isFinished = match.status === 'FINISHED';
          return (
            <button
              key={`${match.id}-${index}`}
              type="button"
              onClick={() => onSelectMatch(match)}
              className="group flex items-center gap-3 px-5 border-r border-white/[0.08] hover:bg-[#12161F] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              {/* Status Indicator */}
              {isLive ? (
                <span className="inline-flex items-center gap-1.5 font-telemetry text-[11px] font-bold uppercase tracking-[0.08em] text-[#FF2E5B]">
                  <span className="w-2 h-2 rounded-full bg-[#FF2E5B] live-dot-pulse" />
                  LIVE
                </span>
              ) : (
                <span className="font-telemetry text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">
                  {isFinished ? 'FINISHED' : 'UPCOMING'}
                </span>
              )}

              {/* Game Identifier */}
              <span className="font-telemetry text-[11px] font-semibold uppercase tracking-[0.06em] text-[#00F0FF]">
                {match.game}
              </span>

              {/* Teams & Score */}
              <span className="font-telemetry text-xs font-bold tracking-[0.04em] text-[#F8FAFC] group-hover:text-[#00F0FF] transition-colors">
                {match.teamATag}
                <span className="mx-1.5 text-[#94A3B8] font-normal">vs</span>
                {match.teamBTag}
              </span>

              <span
                className={`font-telemetry text-xs font-bold px-1.5 py-0.5 rounded-[2px] ${
                  isLive
                    ? 'bg-[#FF2E5B]/15 text-[#F8FAFC]'
                    : 'bg-[#12161F] text-[#94A3B8]'
                }`}
              >
                {match.scoreA} - {match.scoreB}
              </span>

              <span className="font-telemetry text-[10px] uppercase tracking-[0.08em] text-[#94A3B8]">
                {match.mapName}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
