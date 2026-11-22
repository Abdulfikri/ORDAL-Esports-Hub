import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, Flame, GitBranch, Timer, Trophy, Users, Zap } from 'lucide-react';
import type { GameTitle, Tournament } from '../types';

interface FeatureTournamentCountdownProps {
  tournaments: Tournament[];
  activeTeamGame?: GameTitle;
  onRegister: (tournamentId: string) => void;
  onOpenBracket: (tournament: Tournament) => void;
}

interface TimeRemaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalMs: number;
}

/**
 * Parses tournament startDate strings like "2026-11-24 20:00 WIB" into a UTC timestamp.
 */
function parseKickoffTimestamp(startDate: string): number {
  const match = String(startDate || '').match(
    /(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/
  );
  if (!match) {
    // Fallback: 3 days from now if unparseable
    return Date.now() + 3 * 24 * 60 * 60 * 1000;
  }
  const [, y, m, d, hh = '19', mm = '00'] = match;
  // Interpret WIB as UTC+07:00
  const iso = `${y}-${m}-${d}T${hh}:${mm}:00+07:00`;
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? Date.now() + 3 * 24 * 60 * 60 * 1000 : parsed;
}

function getTimeRemaining(targetMs: number, nowMs: number): TimeRemaining {
  const diff = Math.max(0, targetMs - nowMs);
  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { days, hours, minutes, seconds, totalMs: diff };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export const FeatureTournamentCountdown: React.FC<FeatureTournamentCountdownProps> = ({
  tournaments,
  activeTeamGame,
  onRegister,
  onOpenBracket,
}) => {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [selectedId, setSelectedId] = useState<string>('');

  // Tick every 1 second for live visual countdown
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Prioritize activeTeamGame first, then OPEN tournaments, ordered by nearest kick-off
  const featuredCandidates = useMemo(() => {
    const eligible = tournaments.filter((t) => t.status !== 'COMPLETED');
    return [...eligible].sort((a, b) => {
      if (activeTeamGame) {
        if (a.game === activeTeamGame && b.game !== activeTeamGame) return -1;
        if (b.game === activeTeamGame && a.game !== activeTeamGame) return 1;
      }
      if (a.status === 'OPEN' && b.status !== 'OPEN') return -1;
      if (b.status === 'OPEN' && a.status !== 'OPEN') return 1;
      return parseKickoffTimestamp(a.startDate) - parseKickoffTimestamp(b.startDate);
    });
  }, [tournaments, activeTeamGame]);

  const activeTournament = useMemo(() => {
    if (featuredCandidates.length === 0) return null;
    if (selectedId) {
      const found = featuredCandidates.find((t) => t.id === selectedId);
      if (found) return found;
    }
    return featuredCandidates[0];
  }, [featuredCandidates, selectedId]);

  if (!activeTournament) return null;

  const targetMs = parseKickoffTimestamp(activeTournament.startDate);
  const remaining = getTimeRemaining(targetMs, nowMs);
  const isStarted = remaining.totalMs === 0;

  const maxTeams = Math.max(1, activeTournament.maxTeams);
  const registered = Math.min(maxTeams, activeTournament.registeredTeams);
  const remainingSlots = Math.max(0, maxTeams - registered);
  const fillPercent = Math.round((registered / maxTeams) * 100);
  const isAlmostFull = remainingSlots > 0 && (remainingSlots <= 4 || fillPercent >= 75);
  const isFull = remainingSlots === 0;

  // Urgency accent shifts to crimson when < 24h left or almost full
  const isHighUrgency = (!isStarted && remaining.days === 0) || isAlmostFull;

  const countdownBlocks = [
    { label: 'HARI', value: pad2(remaining.days) },
    { label: 'JAM', value: pad2(remaining.hours) },
    { label: 'MENIT', value: pad2(remaining.minutes) },
    { label: 'DETIK', value: pad2(remaining.seconds), isSeconds: true },
  ];

  return (
    <div className="mt-8 relative overflow-hidden rounded-[8px] border border-[#00F0FF]/35 bg-gradient-to-br from-[#12161F] via-[#0E131D] to-[#0A0C10] p-5 sm:p-7 shadow-[0_16px_48px_rgba(0,0,0,0.45)]">
      {/* Subtle Tactical Corner Glow */}
      <div
        className="pointer-events-none absolute -top-24 -right-24 w-64 h-64 rounded-full blur-3xl opacity-20"
        style={{ backgroundColor: isHighUrgency ? '#FF2E5B' : '#00F0FF' }}
      />

      {/* Top Row: Feature Tag + Tournament Switcher */}
      <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/[0.08]">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] bg-[#FF2E5B]/15 border border-[#FF2E5B]/40 font-telemetry text-[11px] font-bold uppercase tracking-[0.08em] text-[#FF2E5B]">
            <Flame className="w-3.5 h-3.5" />
            FEATURE TOURNAMENT
          </span>
          <span className="font-telemetry text-[11px] font-semibold uppercase tracking-[0.08em] text-[#00F0FF]">
            {activeTournament.game} · {activeTournament.format}
          </span>
          {isAlmostFull && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] bg-[#CCFF00]/15 border border-[#CCFF00]/35 font-telemetry text-[10px] font-bold uppercase tracking-[0.06em] text-[#CCFF00]">
              <Zap className="w-3 h-3" />
              Sisa {remainingSlots} Slot!
            </span>
          )}
        </div>

        {/* Multi-Tournament Quick Switcher */}
        {featuredCandidates.length > 1 && (
          <div className="w-full sm:w-auto overflow-x-auto no-scrollbar">
            <div className="inline-flex items-center gap-1.5 min-w-max">
              {featuredCandidates.slice(0, 4).map((trn) => {
                const isSelected = trn.id === activeTournament.id;
                return (
                  <button
                    key={trn.id}
                    type="button"
                    onClick={() => setSelectedId(trn.id)}
                    className={`px-2.5 py-1 rounded-[4px] font-telemetry text-[10px] font-bold uppercase tracking-[0.06em] border transition-colors cursor-pointer whitespace-nowrap ${
                      isSelected
                        ? 'bg-[#00F0FF]/15 border-[#00F0FF]/60 text-[#00F0FF]'
                        : 'bg-[#0A0C10]/70 border-white/10 text-[#94A3B8] hover:text-[#F8FAFC]'
                    }`}
                  >
                    {trn.game}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Main Content Split */}
      <div className="relative mt-5 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* Left: Tournament Spotlight & Slot Urgency */}
        <div className="lg:col-span-6 space-y-4">
          <div>
            <h3 className="font-display text-2xl sm:text-3xl font-bold uppercase tracking-[0.01em] text-[#F8FAFC] leading-tight">
              {activeTournament.name}
            </h3>
            <p className="mt-1.5 text-sm text-[#94A3B8] leading-relaxed line-clamp-2">
              {activeTournament.description}
            </p>
          </div>

          {/* Key Metadata Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 font-telemetry text-xs">
            <div className="p-3 rounded-[4px] bg-[#0A0C10]/85 border border-white/[0.07]">
              <div className="text-[10px] uppercase tracking-[0.08em] text-[#94A3B8] flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5 text-[#CCFF00]" />
                Prize Pool
              </div>
              <div className="mt-1 font-bold text-[#CCFF00] text-sm">
                {activeTournament.prizePool}
              </div>
            </div>

            <div className="p-3 rounded-[4px] bg-[#0A0C10]/85 border border-white/[0.07]">
              <div className="text-[10px] uppercase tracking-[0.08em] text-[#94A3B8] flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-[#00F0FF]" />
                Kick-Off
              </div>
              <div className="mt-1 font-bold text-[#F8FAFC] text-xs sm:text-sm truncate">
                {activeTournament.startDate}
              </div>
            </div>

            <div className="p-3 rounded-[4px] bg-[#0A0C10]/85 border border-white/[0.07]">
              <div className="text-[10px] uppercase tracking-[0.08em] text-[#94A3B8] flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-[#FF2E5B]" />
                Kuota Tim
              </div>
              <div className="mt-1 font-bold text-[#F8FAFC] text-sm tabular-nums">
                {registered} / {maxTeams} Squad
              </div>
            </div>
          </div>

          {/* Urgency Slot Progress Bar */}
          <div>
            <div className="flex items-center justify-between font-telemetry text-[11px] mb-1.5">
              <span className="text-[#94A3B8] uppercase tracking-[0.06em]">
                Progres Pendaftaran Slot
              </span>
              <span
                className={`font-bold uppercase tracking-[0.05em] ${
                  isFull
                    ? 'text-[#FF2E5B]'
                    : isAlmostFull
                      ? 'text-[#CCFF00]'
                      : 'text-[#00F0FF]'
                }`}
              >
                {isFull
                  ? 'KUOTA PENUH (100%)'
                  : `${fillPercent}% TERISI · SISA ${remainingSlots} SLOT`}
              </span>
            </div>
            <div className="h-2 w-full bg-[#0A0C10] border border-white/[0.06] rounded-[3px] overflow-hidden">
              <div
                className="h-full transition-all duration-500"
                style={{
                  width: `${fillPercent}%`,
                  background: isFull
                    ? '#FF2E5B'
                    : isAlmostFull
                      ? 'linear-gradient(90deg, #00F0FF, #CCFF00)'
                      : '#00F0FF',
                }}
              />
            </div>
          </div>
        </div>

        {/* Right: Visual Countdown Blocks + Conversion CTA */}
        <div className="lg:col-span-6 flex flex-col justify-between gap-4 bg-[#0A0C10]/75 border border-white/[0.08] rounded-[6px] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 font-telemetry text-[11px] font-bold uppercase tracking-[0.08em] text-[#94A3B8]">
              <Timer className="w-4 h-4 text-[#00F0FF]" />
              {isStarted
                ? 'Turnamen Sedang Berlangsung'
                : 'Hitung Mundur Menuju Kick-Off'}
            </span>
            <span className="inline-flex items-center gap-1.5 font-telemetry text-[10px] font-bold uppercase text-[#CCFF00]">
              <span className="w-2 h-2 rounded-full bg-[#CCFF00] live-dot-pulse" />
              {isStarted ? 'LIVE NOW' : 'SIGN-UP OPEN'}
            </span>
          </div>

          {/* 4-Block Tactical Countdown */}
          <div className="grid grid-cols-4 gap-2 sm:gap-3">
            {countdownBlocks.map((block) => (
              <div
                key={block.label}
                className={`py-3 sm:py-4 px-2 rounded-[5px] border text-center transition-colors ${
                  block.isSeconds
                    ? 'bg-[#00F0FF]/[0.08] border-[#00F0FF]/45'
                    : 'bg-[#12161F] border-white/[0.08]'
                }`}
              >
                <div
                  className={`font-display text-2xl sm:text-4xl font-bold leading-none tabular-nums ${
                    block.isSeconds
                      ? isHighUrgency
                        ? 'text-[#FF2E5B]'
                        : 'text-[#00F0FF]'
                      : 'text-[#F8FAFC]'
                  }`}
                >
                  {block.value}
                </div>
                <div className="mt-1.5 font-telemetry text-[9px] sm:text-[10px] font-semibold uppercase tracking-[0.1em] text-[#94A3B8]">
                  {block.label}
                </div>
              </div>
            ))}
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-1">
            {(() => {
              const wrongGame = Boolean(
                activeTeamGame && activeTeamGame !== activeTournament.game
              );
              return (
                <button
                  type="button"
                  disabled={!wrongGame && isFull}
                  onClick={() => onRegister(activeTournament.id)}
                  className={`flex-1 min-h-[46px] px-5 py-2.5 font-display text-sm sm:text-base font-bold uppercase tracking-[0.05em] rounded-[4px] transition-all cursor-pointer ${
                    wrongGame
                      ? 'bg-white/[0.04] border border-white/15 text-[#94A3B8] hover:border-[#FF2E5B]/50 hover:text-[#F8FAFC]'
                      : 'bg-[#CCFF00] text-[#0A0C10] hover:brightness-110 hover:shadow-[0_0_20px_rgba(204,255,0,0.35)] disabled:opacity-45 disabled:cursor-not-allowed'
                  }`}
                >
                  {wrongGame
                    ? `Khusus Tim ${activeTournament.game}`
                    : isFull
                      ? 'Slot Turnamen Penuh'
                      : 'Amankan Slot · Daftar Squad Sekarang'}
                </button>
              );
            })()}
            <button
              type="button"
              onClick={() => onOpenBracket(activeTournament)}
              className="min-h-[46px] px-4 py-2.5 border border-white/20 text-[#F8FAFC] font-display text-sm font-semibold uppercase tracking-[0.05em] rounded-[4px] hover:border-[#00F0FF] hover:bg-[#00F0FF]/[0.06] inline-flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
            >
              <GitBranch className="w-4 h-4 text-[#00F0FF]" />
              Live Bracket
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
