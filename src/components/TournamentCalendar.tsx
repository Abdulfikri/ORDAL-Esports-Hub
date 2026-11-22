import React, { useMemo, useState } from 'react';
import {
  Calendar,
  Clock,
  Filter,
  GitBranch,
  Swords,
  Trophy,
  Users,
} from 'lucide-react';
import { useMatchNotifications } from '../hooks/useMatchNotifications';
import type { GameTitle, Match, MatchStatus, Tournament } from '../types';
import { MatchNotificationButton } from './MatchNotificationButton';

type CalendarEventType = 'ALL' | 'REGISTRATION' | 'MATCH';

interface CalendarTimelineItem {
  id: string;
  type: 'REGISTRATION' | 'MATCH';
  dateKey: string; // YYYY-MM-DD
  timeLabel: string; // e.g. 19:00 WIB
  sortMinutes: number;
  game: GameTitle;
  title: string;
  subtitle: string;
  statusLabel: string;
  accent: 'lime' | 'cyan' | 'crimson';
  tournament?: Tournament;
  match?: Match;
}

interface TournamentCalendarProps {
  tournaments: Tournament[];
  matches: Match[];
  activeTeamGame?: GameTitle;
  onRegisterTournament: (tournamentId: string) => void;
  onSelectMatch: (match: Match) => void;
  onOpenBracket: (tournament: Tournament) => void;
  onNotify?: (msg: string) => void;
  embedded?: boolean;
}

const GAME_OPTIONS: readonly ('ALL' | GameTitle)[] = [
  'ALL',
  'POINT BLANK',
  'FREE FIRE',
  'EFOOTBALL',
];

function parseDateAndTime(raw: string): { dateKey: string; timeLabel: string; sortMinutes: number } {
  const dateMatch = raw.match(/(\d{4}-\d{2}-\d{2})/);
  const timeMatch = raw.match(/(\d{1,2}):(\d{2})/);
  const dateKey = dateMatch ? dateMatch[1] : '2026-11-20';
  const hours = timeMatch ? Number(timeMatch[1]) : 19;
  const mins = timeMatch ? Number(timeMatch[2]) : 0;
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    dateKey,
    timeLabel: `${pad(hours)}:${pad(mins)} WIB`,
    sortMinutes: hours * 60 + mins,
  };
}

function addMinutesToTime(
  baseMinutes: number,
  offsetMinutes: number
): { timeLabel: string; sortMinutes: number } {
  const total = (baseMinutes + offsetMinutes) % (24 * 60);
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    timeLabel: `${pad(hours)}:${pad(mins)} WIB`,
    sortMinutes: baseMinutes + offsetMinutes,
  };
}

function formatIndonesianDateHeader(dateKey: string): {
  weekday: string;
  dayNum: string;
  monthYear: string;
} {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y || 2026, (m || 11) - 1, d || 20);
  const weekday = dt
    .toLocaleDateString('id-ID', { weekday: 'short' })
    .toUpperCase();
  const monthYear = dt
    .toLocaleDateString('id-ID', { month: 'short', year: 'numeric' })
    .toUpperCase();
  return {
    weekday,
    dayNum: String(dt.getDate()).padStart(2, '0'),
    monthYear,
  };
}

export const TournamentCalendar: React.FC<TournamentCalendarProps> = ({
  tournaments,
  matches,
  activeTeamGame,
  onRegisterTournament,
  onSelectMatch,
  onOpenBracket,
  onNotify,
  embedded = false,
}) => {
  const [gameFilter, setGameFilter] = useState<'ALL' | GameTitle>('ALL');
  const [typeFilter, setTypeFilter] = useState<CalendarEventType>('ALL');
  const [matchStatusFilter, setMatchStatusFilter] = useState<'ALL' | MatchStatus>('ALL');
  const [focusedDate, setFocusedDate] = useState<string | null>(null);
  const { isNotified, toggleMatchNotification } = useMatchNotifications(onNotify);

  const tournamentMap = useMemo(() => {
    const map = new Map<string, Tournament>();
    for (const t of tournaments) {
      map.set(t.id, t);
    }
    return map;
  }, [tournaments]);

  const allItems = useMemo<CalendarTimelineItem[]>(() => {
    const items: CalendarTimelineItem[] = [];

    // 1. Upcoming & Open Tournament Registrations
    for (const trn of tournaments) {
      if (trn.status === 'COMPLETED') continue;
      const parsed = parseDateAndTime(trn.startDate);
      items.push({
        id: `reg-${trn.id}`,
        type: 'REGISTRATION',
        dateKey: parsed.dateKey,
        timeLabel: parsed.timeLabel,
        sortMinutes: Math.max(0, parsed.sortMinutes - 60),
        game: trn.game,
        title: trn.name,
        subtitle: `${trn.format} · ${trn.registeredTeams}/${trn.maxTeams} Squad · ${trn.prizePool}`,
        statusLabel: trn.status === 'OPEN' ? 'OPEN REGISTRATION' : 'ONGOING CHECK-IN',
        accent: trn.status === 'OPEN' ? 'lime' : 'cyan',
        tournament: trn,
      });
    }

    // 2. Upcoming, Live & Finished Matches
    for (const match of matches) {
      const parent = tournamentMap.get(match.tournamentId);
      const parsed = parseDateAndTime(parent?.startDate || '2026-11-20 19:00 WIB');
      const roundOffset =
        match.round === 'QUARTERFINAL'
          ? 0
          : match.round === 'SEMIFINAL'
            ? 60
            : 120;
      const slotOffset = roundOffset + Math.max(0, (match.bracketOrder - 1) * 15);
      const timeInfo = addMinutesToTime(parsed.sortMinutes, slotOffset);

      items.push({
        id: `mch-${match.id}`,
        type: 'MATCH',
        dateKey: parsed.dateKey,
        timeLabel: timeInfo.timeLabel,
        sortMinutes: timeInfo.sortMinutes,
        game: match.game,
        title: `${match.teamATag} vs ${match.teamBTag}`,
        subtitle: `${match.round} · ${match.mapName}${parent ? ` · ${parent.name}` : ''}`,
        statusLabel:
          match.status === 'LIVE'
            ? 'LIVE MATCH'
            : match.status === 'FINISHED'
              ? 'FINISHED'
              : 'UPCOMING MATCH',
        accent:
          match.status === 'LIVE'
            ? 'crimson'
            : match.status === 'FINISHED'
              ? 'lime'
              : 'cyan',
        match,
        tournament: parent,
      });
    }

    return items.sort((a, b) => {
      if (a.dateKey !== b.dateKey) return a.dateKey.localeCompare(b.dateKey);
      return a.sortMinutes - b.sortMinutes;
    });
  }, [tournaments, matches, tournamentMap]);

  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      if (gameFilter !== 'ALL' && item.game !== gameFilter) return false;
      if (typeFilter !== 'ALL' && item.type !== typeFilter) return false;
      if (matchStatusFilter !== 'ALL') {
        if (item.type !== 'MATCH' || !item.match || item.match.status !== matchStatusFilter) {
          return false;
        }
      }
      return true;
    });
  }, [allItems, gameFilter, typeFilter, matchStatusFilter]);

  const groupedByDate = useMemo(() => {
    const groups = new Map<string, CalendarTimelineItem[]>();
    for (const item of filteredItems) {
      const list = groups.get(item.dateKey) || [];
      list.push(item);
      groups.set(item.dateKey, list);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredItems]);

  const visibleGroups = useMemo(() => {
    if (!focusedDate) return groupedByDate;
    const matched = groupedByDate.filter(([dateKey]) => dateKey === focusedDate);
    return matched.length > 0 ? matched : groupedByDate;
  }, [groupedByDate, focusedDate]);

  return (
    <section
      id={embedded ? undefined : 'kalender'}
      className={embedded ? '' : 'scroll-mt-20 border-t border-white/[0.08] bg-[#0A0C10]'}
      aria-label="Tournament Calendar"
    >
      <div className={embedded ? 'space-y-0' : 'max-w-[1440px] mx-auto px-4 sm:px-8 py-16'}>
        {/* Section Header + Game Title Filter */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5 pb-6 border-b border-white/[0.08]">
          <div>
            <p className="font-telemetry text-xs font-semibold uppercase tracking-[0.1em] text-[#00F0FF]">
              TOURNAMENT CALENDAR &amp; MATCH TIMELINE
            </p>
            <h2 className="mt-1 font-display text-3xl sm:text-4xl font-bold uppercase tracking-[0.01em] text-[#F8FAFC]">
              Kalender Turnamen &amp; Jadwal Match
            </h2>
            <p className="mt-1.5 text-sm text-[#94A3B8] max-w-2xl">
              Pantau timeline registrasi turnamen aktif serta jadwal pertandingan yang akan berlangsung berdasarkan judul game.
            </p>
          </div>

          {/* Game Title Filter Bar */}
          <div className="w-full lg:w-auto overflow-x-auto no-scrollbar">
            <div className="inline-flex items-center gap-1 p-1 bg-[#12161F] border border-white/[0.08] rounded-[4px] min-w-max">
              {GAME_OPTIONS.map((game) => (
                <button
                  key={game}
                  type="button"
                  onClick={() => {
                    setGameFilter(game);
                    setFocusedDate(null);
                  }}
                  className={`min-h-[38px] px-3 py-1.5 font-telemetry text-xs font-semibold uppercase tracking-[0.06em] rounded-[2px] transition-colors cursor-pointer whitespace-nowrap ${
                    gameFilter === game
                      ? 'bg-[#00F0FF] text-[#0A0C10]'
                      : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                  }`}
                >
                  {game === 'ALL' ? 'Semua Game' : game}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Secondary Controls: Event Type Filter + Match Status Filter + Date Jump Strip */}
        <div className="mt-5 flex flex-col gap-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="overflow-x-auto no-scrollbar">
              <div className="inline-flex items-center gap-2 font-telemetry text-[11px] font-semibold uppercase tracking-[0.06em] min-w-max">
                <span className="inline-flex items-center gap-1.5 text-[#94A3B8] mr-1">
                  <Filter className="w-3.5 h-3.5 text-[#00F0FF]" />
                  Tipe:
                </span>
                {(
                  [
                    { id: 'ALL', label: 'Semua Event' },
                    { id: 'REGISTRATION', label: 'Registrasi' },
                    { id: 'MATCH', label: 'Daftar Match' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setTypeFilter(tab.id);
                      if (tab.id === 'REGISTRATION') {
                        setMatchStatusFilter('ALL');
                      }
                    }}
                    className={`min-h-[36px] px-3 py-1.5 rounded-[4px] border transition-colors cursor-pointer whitespace-nowrap ${
                      typeFilter === tab.id
                        ? 'bg-[#12161F] border-[#00F0FF] text-[#00F0FF]'
                        : 'bg-transparent border-white/10 text-[#94A3B8] hover:text-[#F8FAFC]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto no-scrollbar">
              <div className="inline-flex items-center gap-1.5 font-telemetry text-[11px] font-semibold uppercase tracking-[0.06em] min-w-max">
                <span className="text-[#94A3B8] mr-1">Status Match:</span>
                {(
                  [
                    { id: 'ALL', label: 'Semua' },
                    { id: 'UPCOMING', label: 'Upcoming' },
                    { id: 'LIVE', label: 'Live' },
                    { id: 'FINISHED', label: 'Finished' },
                  ] as const
                ).map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => {
                      setMatchStatusFilter(st.id);
                      if (st.id !== 'ALL') {
                        setTypeFilter('MATCH');
                      }
                    }}
                    className={`min-h-[36px] px-3 py-1.5 rounded-[4px] border transition-colors cursor-pointer whitespace-nowrap ${
                      matchStatusFilter === st.id
                        ? st.id === 'LIVE'
                          ? 'bg-[#FF2E5B]/15 border-[#FF2E5B] text-[#FF2E5B]'
                          : st.id === 'UPCOMING'
                            ? 'bg-[#00F0FF]/15 border-[#00F0FF] text-[#00F0FF]'
                            : st.id === 'FINISHED'
                              ? 'bg-[#CCFF00]/15 border-[#CCFF00] text-[#CCFF00]'
                              : 'bg-[#12161F] border-[#00F0FF] text-[#00F0FF]'
                        : 'bg-transparent border-white/10 text-[#94A3B8] hover:text-[#F8FAFC]'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Date Strip Navigator */}
          {groupedByDate.length > 0 && (
            <div className="overflow-x-auto no-scrollbar">
              <div className="inline-flex items-center gap-1.5 font-telemetry text-[11px] min-w-max">
                <button
                  type="button"
                  onClick={() => setFocusedDate(null)}
                  className={`min-h-[36px] px-2.5 py-1.5 rounded-[4px] border uppercase font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                    focusedDate === null
                      ? 'bg-[#CCFF00]/15 border-[#CCFF00]/50 text-[#CCFF00]'
                      : 'bg-[#12161F] border-white/10 text-[#94A3B8] hover:text-[#F8FAFC]'
                  }`}
                >
                  Semua Tanggal ({groupedByDate.length})
                </button>
                {groupedByDate.map(([dateKey, list]) => {
                  const { dayNum, monthYear } = formatIndonesianDateHeader(dateKey);
                  const isSelected = focusedDate === dateKey;
                  return (
                    <button
                      key={dateKey}
                      type="button"
                      onClick={() => setFocusedDate(isSelected ? null : dateKey)}
                      className={`min-h-[36px] px-2.5 py-1.5 rounded-[4px] border uppercase font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                        isSelected
                          ? 'bg-[#00F0FF]/15 border-[#00F0FF] text-[#00F0FF]'
                          : 'bg-[#12161F] border-white/10 text-[#94A3B8] hover:text-[#F8FAFC]'
                      }`}
                    >
                      {dayNum} {monthYear.split(' ')[0]} · {list.length}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Grid-Based Timeline */}
        {visibleGroups.length === 0 ? (
          <div className="mt-8 p-10 bg-[#12161F] border border-white/[0.08] rounded-[6px] text-center">
            <Calendar className="w-8 h-8 text-[#94A3B8] mx-auto mb-3" />
            <p className="font-display text-xl uppercase text-[#F8FAFC]">
              Tidak Ada Jadwal untuk Filter Ini
            </p>
            <p className="mt-1 text-sm text-[#94A3B8]">
              Pilih judul game lain atau ubah filter tipe event untuk melihat jadwal turnamen &amp; match mendatang.
            </p>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {visibleGroups.map(([dateKey, dayItems]) => {
              const { weekday, dayNum, monthYear } = formatIndonesianDateHeader(dateKey);
              const regCount = dayItems.filter((i) => i.type === 'REGISTRATION').length;
              const matchCount = dayItems.filter((i) => i.type === 'MATCH').length;

              return (
                <div
                  key={dateKey}
                  className="bg-[#12161F] border border-white/[0.08] rounded-[6px] flex flex-col overflow-hidden"
                >
                  {/* Date Column Header */}
                  <div className="px-5 py-4 bg-[#0A0C10]/80 border-b border-white/[0.08] flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-[4px] bg-[#12161F] border border-[#00F0FF]/35 flex flex-col items-center justify-center shrink-0">
                        <span className="font-telemetry text-[10px] font-bold uppercase text-[#00F0FF] leading-none">
                          {weekday}
                        </span>
                        <span className="font-display text-xl font-bold text-[#F8FAFC] leading-none mt-0.5 tabular-nums">
                          {dayNum}
                        </span>
                      </div>
                      <div>
                        <div className="font-display text-lg font-bold uppercase text-[#F8FAFC] leading-tight">
                          {monthYear}
                        </div>
                        <div className="font-telemetry text-[11px] uppercase tracking-[0.06em] text-[#94A3B8]">
                          {dateKey}
                        </div>
                      </div>
                    </div>

                    <div className="text-right font-telemetry text-[10px] uppercase tracking-[0.06em] space-y-0.5">
                      {regCount > 0 && (
                        <div className="text-[#CCFF00] font-bold">{regCount} Registrasi</div>
                      )}
                      {matchCount > 0 && (
                        <div className="text-[#00F0FF] font-bold">{matchCount} Match</div>
                      )}
                    </div>
                  </div>

                  {/* Vertical Timeline Slots */}
                  <div className="p-4 space-y-3 flex-1">
                    {dayItems.map((item) => {
                      const borderAccent =
                        item.accent === 'crimson'
                          ? 'border-l-[#FF2E5B]'
                          : item.accent === 'lime'
                            ? 'border-l-[#CCFF00]'
                            : 'border-l-[#00F0FF]';
                      const statusColor =
                        item.accent === 'crimson'
                          ? 'text-[#FF2E5B]'
                          : item.accent === 'lime'
                            ? 'text-[#CCFF00]'
                            : 'text-[#00F0FF]';

                      return (
                        <div
                          key={item.id}
                          className={`p-4 bg-[#0A0C10] border border-white/[0.07] border-l-[3px] ${borderAccent} rounded-[4px] space-y-2.5 hover:border-white/20 transition-colors`}
                        >
                          {/* Time + Game + Status */}
                          <div className="flex flex-wrap items-center justify-between gap-2 font-telemetry text-[10px] font-bold uppercase tracking-[0.08em]">
                            <span className="inline-flex items-center gap-1.5 text-[#E2E2E8]">
                              <Clock className="w-3 h-3 text-[#00F0FF]" />
                              {item.timeLabel}
                              <span className="text-white/25">·</span>
                              <span className="text-[#00F0FF]">{item.game}</span>
                            </span>
                            <span className={`inline-flex items-center gap-1 ${statusColor}`}>
                              {item.accent === 'crimson' && (
                                <span className="w-1.5 h-1.5 rounded-full bg-[#FF2E5B] live-dot-pulse" />
                              )}
                              {item.statusLabel}
                            </span>
                          </div>

                          {/* Title & Subtitle */}
                          <div>
                            <div className="flex items-center gap-1.5">
                              {item.type === 'REGISTRATION' ? (
                                <Trophy className="w-4 h-4 text-[#CCFF00] shrink-0" />
                              ) : (
                                <Swords className="w-4 h-4 text-[#00F0FF] shrink-0" />
                              )}
                              <h3 className="font-display text-lg font-bold uppercase text-[#F8FAFC] leading-snug">
                                {item.title}
                              </h3>
                            </div>
                            <p className="mt-1 font-telemetry text-[11px] text-[#94A3B8]">
                              {item.subtitle}
                            </p>
                          </div>

                          {/* Action Row */}
                          {item.type === 'REGISTRATION' && item.tournament && (
                            <div className="pt-2 border-t border-white/[0.06] flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => onRegisterTournament(item.tournament!.id)}
                                className={`flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-3 font-display text-xs font-bold uppercase tracking-[0.05em] rounded-[4px] transition-all cursor-pointer ${
                                  activeTeamGame && activeTeamGame !== item.tournament.game
                                    ? 'bg-white/[0.04] border border-white/15 text-[#94A3B8] hover:border-[#FF2E5B]/50 hover:text-[#F8FAFC]'
                                    : 'bg-[#CCFF00] text-[#0A0C10] hover:brightness-110'
                                }`}
                              >
                                <Users className="w-3.5 h-3.5" />
                                {activeTeamGame && activeTeamGame !== item.tournament.game
                                  ? `Khusus ${item.tournament.game}`
                                  : 'Daftar Squad'}
                              </button>
                              <button
                                type="button"
                                onClick={() => onOpenBracket(item.tournament!)}
                                className="inline-flex items-center justify-center gap-1 py-1.5 px-3 border border-white/15 text-[#F8FAFC] hover:border-[#00F0FF] hover:text-[#00F0FF] font-telemetry text-[11px] font-semibold uppercase rounded-[4px] transition-colors cursor-pointer"
                              >
                                <GitBranch className="w-3.5 h-3.5" />
                                Bracket
                              </button>
                            </div>
                          )}

                          {item.type === 'MATCH' && item.match && (
                            <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between gap-2">
                              <span className="font-telemetry text-xs font-bold text-[#F8FAFC] tabular-nums">
                                SKOR: {item.match.scoreA} - {item.match.scoreB}
                              </span>
                              <div className="flex items-center gap-2">
                                {item.match.status === 'UPCOMING' && (
                                  <MatchNotificationButton
                                    compact
                                    active={isNotified(item.match.id)}
                                    matchLabel={`${item.match.teamATag} vs ${item.match.teamBTag}`}
                                    onToggle={() => toggleMatchNotification(item.match!)}
                                  />
                                )}
                                <button
                                  type="button"
                                  onClick={() => onSelectMatch(item.match!)}
                                  className="font-telemetry text-[11px] font-bold uppercase text-[#00F0FF] hover:underline cursor-pointer"
                                >
                                  Detail Match →
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
