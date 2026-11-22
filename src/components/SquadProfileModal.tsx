import React, { useMemo, useState } from 'react';
import { ArrowUpRight, Shield, Trophy, Users, X } from 'lucide-react';
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useEscapeKey } from '../hooks/useEscapeKey';
import type { Match, ScrimSession, Squad, Tournament } from '../types';

export interface SquadProfileTarget {
  teamName: string;
  teamTag?: string;
  tournamentId?: string;
}

interface SquadProfileModalProps {
  target: SquadProfileTarget | null;
  squads: Squad[];
  matches: Match[];
  tournaments: Tournament[];
  scrims?: ScrimSession[];
  onClose: () => void;
  onSelectOpponent?: (next: SquadProfileTarget) => void;
  onSelectMatch?: (match: Match) => void;
}

interface UnifiedMatchRow {
  id: string;
  source: 'TOURNAMENT' | 'SCRIM';
  eventLabel: string;
  roundLabel: string;
  opponentName: string;
  opponentTag: string;
  mapName: string;
  teamScore: number;
  opponentScore: number;
  status: 'FINISHED' | 'LIVE' | 'UPCOMING';
  outcome: 'WIN' | 'LOSS' | 'DRAW' | 'LIVE' | 'UPCOMING';
  mvpIgn?: string;
  timestamp: string;
  rawMatch?: Match;
}

function normalizeKey(v?: string): string {
  return (v || '').trim().toLowerCase();
}

export const SquadProfileModal: React.FC<SquadProfileModalProps> = ({
  target,
  squads,
  matches,
  tournaments,
  scrims = [],
  onClose,
  onSelectOpponent,
  onSelectMatch,
}) => {
  const [historyFilter, setHistoryFilter] = useState<'ALL' | 'TOURNAMENT' | 'SCRIM'>('ALL');

  const resolvedData = useMemo(() => {
    if (!target) return null;

    const targetNameKey = normalizeKey(target.teamName);
    const targetTagKey = normalizeKey(target.teamTag);

    // Find matching Squad record (prefer same tournamentId if available)
    const matchedSquad =
      squads.find(
        (s) =>
          (!target.tournamentId || s.tournamentId === target.tournamentId) &&
          (normalizeKey(s.name) === targetNameKey ||
            (targetTagKey && normalizeKey(s.tag) === targetTagKey))
      ) ||
      squads.find(
        (s) =>
          normalizeKey(s.name) === targetNameKey ||
          (targetTagKey && normalizeKey(s.tag) === targetTagKey)
      ) ||
      null;

    const displayName = matchedSquad?.name || target.teamName;
    const displayTag =
      matchedSquad?.tag ||
      target.teamTag ||
      displayName
        .split(' ')
        .map((w) => w[0])
        .join('')
        .slice(0, 3)
        .toUpperCase();

    const nameKey = normalizeKey(displayName);
    const tagKey = normalizeKey(displayTag);

    const tournamentNameMap = new Map<string, string>();
    for (const trn of tournaments) {
      tournamentNameMap.set(trn.id, trn.name);
    }

    const isSameTeam = (name?: string, tag?: string): boolean => {
      const n = normalizeKey(name);
      const t = normalizeKey(tag);
      return (Boolean(n) && n === nameKey) || (Boolean(t) && Boolean(tagKey) && t === tagKey);
    };

    const rows: UnifiedMatchRow[] = [];

    // 1. Tournament Matches
    for (const m of matches) {
      const isA = isSameTeam(m.teamA, m.teamATag);
      const isB = !isA && isSameTeam(m.teamB, m.teamBTag);
      if (!isA && !isB) continue;

      const teamScore = isA ? m.scoreA : m.scoreB;
      const opponentScore = isA ? m.scoreB : m.scoreA;
      const opponentName = isA ? m.teamB : m.teamA;
      const opponentTag = isA ? m.teamBTag : m.teamATag;

      let outcome: UnifiedMatchRow['outcome'] = 'UPCOMING';
      if (m.status === 'LIVE') {
        outcome = 'LIVE';
      } else if (m.status === 'FINISHED') {
        if (m.winnerTag) {
          outcome =
            normalizeKey(m.winnerTag) === normalizeKey(isA ? m.teamATag : m.teamBTag)
              ? 'WIN'
              : 'LOSS';
        } else if (teamScore > opponentScore) {
          outcome = 'WIN';
        } else if (teamScore < opponentScore) {
          outcome = 'LOSS';
        } else {
          outcome = 'DRAW';
        }
      }

      rows.push({
        id: m.id,
        source: 'TOURNAMENT',
        eventLabel: tournamentNameMap.get(m.tournamentId) || 'ORDAL Tournament',
        roundLabel: m.round,
        opponentName,
        opponentTag,
        mapName: m.mapName,
        teamScore,
        opponentScore,
        status: m.status,
        outcome,
        mvpIgn: m.mvpIgn,
        timestamp: m.updatedAt,
        rawMatch: m,
      });
    }

    // 2. Recorded Scrims (adds depth when team also plays Scrim Arena)
    for (const sc of scrims) {
      if (!sc.resultRecorded) continue;
      const isHost = isSameTeam(sc.hostTeamName);
      const isChallenger = !isHost && isSameTeam(sc.challengerTeamName);
      if (!isHost && !isChallenger) continue;

      const teamScore = isHost ? (sc.hostScore ?? 0) : (sc.challengerScore ?? 0);
      const opponentScore = isHost ? (sc.challengerScore ?? 0) : (sc.hostScore ?? 0);
      const opponentName = isHost ? sc.challengerTeamName || 'TBA' : sc.hostTeamName;
      const opponentTag = opponentName
        .split(' ')
        .map((w) => w[0])
        .join('')
        .slice(0, 3)
        .toUpperCase();

      let outcome: UnifiedMatchRow['outcome'] = 'DRAW';
      if (sc.winnerSide === 'host') outcome = isHost ? 'WIN' : 'LOSS';
      else if (sc.winnerSide === 'challenger') outcome = isChallenger ? 'WIN' : 'LOSS';
      else if (teamScore > opponentScore) outcome = 'WIN';
      else if (teamScore < opponentScore) outcome = 'LOSS';

      rows.push({
        id: sc.id,
        source: 'SCRIM',
        eventLabel: `Scrim · ${sc.game}`,
        roundLabel: sc.mode === 'DIRECT_CHALLENGE' ? 'DIRECT' : 'OPEN LOBBY',
        opponentName,
        opponentTag,
        mapName: sc.game,
        teamScore,
        opponentScore,
        status: 'FINISHED',
        outcome,
        timestamp: sc.date,
      });
    }

    // Fallback roster from scrims if squad record is not found in db.squads
    let rosterList: string[] = matchedSquad?.roster || [];
    if (rosterList.length === 0) {
      const scrimWithRoster = scrims.find(
        (sc) => isSameTeam(sc.hostTeamName) || isSameTeam(sc.challengerTeamName)
      );
      if (scrimWithRoster) {
        rosterList = isSameTeam(scrimWithRoster.hostTeamName)
          ? [...scrimWithRoster.hostRosterCore, ...scrimWithRoster.hostRosterSub]
          : [...scrimWithRoster.challengerRosterCore, ...scrimWithRoster.challengerRosterSub];
      }
    }

    // Count MVP awards per player IGN from tournament matches
    const mvpCountByIgn = new Map<string, number>();
    for (const r of rows) {
      if (r.mvpIgn) {
        const key = normalizeKey(r.mvpIgn);
        mvpCountByIgn.set(key, (mvpCountByIgn.get(key) || 0) + 1);
      }
    }

    return {
      matchedSquad,
      displayName,
      displayTag,
      rows,
      rosterList,
      mvpCountByIgn,
    };
  }, [target, squads, matches, tournaments, scrims]);

  const metrics = useMemo(() => {
    if (!resolvedData) return null;
    const filteredRows =
      historyFilter === 'ALL'
        ? resolvedData.rows
        : resolvedData.rows.filter((r) => r.source === historyFilter);

    const finished = filteredRows.filter((r) => r.status === 'FINISHED');
    const wins = finished.filter((r) => r.outcome === 'WIN').length;
    const losses = finished.filter((r) => r.outcome === 'LOSS').length;
    const draws = finished.filter((r) => r.outcome === 'DRAW').length;
    const liveOrUpcoming = filteredRows.length - finished.length;
    const winRate = finished.length > 0 ? Math.round((wins / finished.length) * 1000) / 10 : 0;

    const totalScored = finished.reduce((acc, r) => acc + r.teamScore, 0);
    const totalConceded = finished.reduce((acc, r) => acc + r.opponentScore, 0);
    const avgMargin =
      finished.length > 0
        ? Math.round(((totalScored - totalConceded) / finished.length) * 10) / 10
        : 0;

    const recentForm = finished.slice(-5).map((r) => (r.outcome === 'WIN' ? 'W' : r.outcome === 'LOSS' ? 'L' : 'D'));

    // Pie chart data for Win/Loss/Draw distribution
    const donutData =
      finished.length > 0
        ? [
            { name: 'Wins', value: wins, color: '#CCFF00' },
            { name: 'Losses', value: losses, color: '#FF2E5B' },
            ...(draws > 0 ? [{ name: 'Draws', value: draws, color: '#00F0FF' }] : []),
          ].filter((d) => d.value > 0)
        : [{ name: 'No Finished Matches', value: 1, color: '#1E293B' }];

    // Match-by-match performance & cumulative win-rate trend
    let runningWins = 0;
    const trendData = finished.map((r, idx) => {
      if (r.outcome === 'WIN') runningWins += 1;
      const cumulativeWinRate = Math.round((runningWins / (idx + 1)) * 100);
      return {
        label: `M${idx + 1} · ${r.opponentTag}`,
        opponent: r.opponentName,
        round: r.roundLabel,
        map: r.mapName,
        teamScore: r.teamScore,
        opponentScore: r.opponentScore,
        winRate: cumulativeWinRate,
        outcome: r.outcome,
      };
    });

    return {
      filteredRows,
      finishedCount: finished.length,
      wins,
      losses,
      draws,
      liveOrUpcoming,
      winRate,
      totalScored,
      totalConceded,
      avgMargin,
      recentForm,
      donutData,
      trendData,
    };
  }, [resolvedData, historyFilter]);

  useEscapeKey(Boolean(target), onClose);

  if (!target || !resolvedData || !metrics) return null;

  const { matchedSquad, displayName, displayTag, rosterList, mvpCountByIgn } = resolvedData;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-[#0A0C10]/88 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Squad Profile ${displayName}`}
    >
      <div className="w-full max-w-5xl max-h-[92vh] bg-[#12161F] border border-white/12 rounded-[8px] flex flex-col overflow-hidden">
        {/* Top Bar Header */}
        <div className="px-5 sm:px-7 py-5 bg-[#0A0C10] border-b border-white/[0.08] flex items-start justify-between gap-4 shrink-0">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-13 h-13 rounded-[6px] bg-[#12161F] border border-[#00F0FF]/40 flex items-center justify-center font-display text-lg font-bold tracking-wider text-[#00F0FF] shrink-0">
              {displayTag.slice(0, 4)}
            </div>
            <div className="min-w-0">
              <p className="font-telemetry text-[11px] font-semibold uppercase tracking-[0.1em] text-[#00F0FF]">
                Squad Profile
              </p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold uppercase tracking-[0.01em] text-[#F8FAFC] truncate">
                {displayName}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-telemetry text-xs text-[#94A3B8]">
                <span>[{displayTag}]</span>
                {matchedSquad && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">Seed #{matchedSquad.seed}</span>
                    <span aria-hidden="true">·</span>
                    <span
                      className={
                        matchedSquad.checkInStatus === 'CHECKED IN'
                          ? 'text-[#CCFF00]'
                          : matchedSquad.checkInStatus === 'DISQUALIFIED'
                            ? 'text-[#FF2E5B]'
                            : 'text-[#94A3B8]'
                      }
                    >
                      {matchedSquad.checkInStatus}
                    </span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{rosterList.length} Players</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Squad Profile"
            className="p-2 min-w-[40px] min-h-[40px] flex items-center justify-center border border-white/12 rounded-[4px] text-[#94A3B8] hover:text-[#F8FAFC] hover:border-white/25 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-7">
          {/* Scope Filter + 4-Column KPI Strip */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-telemetry text-xs text-[#94A3B8]">
                Statistik performa dihitung langsung dari riwayat pertandingan resmi.
              </p>
              <div className="inline-flex items-center gap-1 p-1 bg-[#0A0C10] border border-white/[0.08] rounded-[4px]">
                {(
                  [
                    { id: 'ALL', label: 'All Matches' },
                    { id: 'TOURNAMENT', label: 'Tournament' },
                    { id: 'SCRIM', label: 'Scrims' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setHistoryFilter(tab.id)}
                    className={`px-3 py-1.5 font-telemetry text-xs font-semibold rounded-[3px] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      historyFilter === tab.id
                        ? 'bg-[#00F0FF] text-[#0A0C10]'
                        : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-4 bg-[#0A0C10] border border-white/[0.08] rounded-[6px]">
                <div className="font-telemetry text-xs text-[#94A3B8]">Win Rate</div>
                <div className="mt-1.5 font-display text-3xl font-bold text-[#CCFF00] tabular-nums">
                  {metrics.winRate}%
                </div>
                <div className="mt-1 font-telemetry text-xs text-[#94A3B8] tabular-nums">
                  {metrics.wins}W · {metrics.losses}L
                  {metrics.draws > 0 ? ` · ${metrics.draws}D` : ''}
                </div>
              </div>

              <div className="p-4 bg-[#0A0C10] border border-white/[0.08] rounded-[6px]">
                <div className="font-telemetry text-xs text-[#94A3B8]">Matches Played</div>
                <div className="mt-1.5 font-display text-3xl font-bold text-[#F8FAFC] tabular-nums">
                  {metrics.finishedCount}
                </div>
                <div className="mt-1 font-telemetry text-xs text-[#94A3B8] tabular-nums">
                  {metrics.liveOrUpcoming > 0
                    ? `${metrics.liveOrUpcoming} live / upcoming`
                    : 'All matches concluded'}
                </div>
              </div>

              <div className="p-4 bg-[#0A0C10] border border-white/[0.08] rounded-[6px]">
                <div className="font-telemetry text-xs text-[#94A3B8]">Avg Score Margin</div>
                <div
                  className={`mt-1.5 font-display text-3xl font-bold tabular-nums ${
                    metrics.avgMargin > 0
                      ? 'text-[#00F0FF]'
                      : metrics.avgMargin < 0
                        ? 'text-[#FF2E5B]'
                        : 'text-[#F8FAFC]'
                  }`}
                >
                  {metrics.avgMargin > 0 ? `+${metrics.avgMargin}` : metrics.avgMargin}
                </div>
                <div className="mt-1 font-telemetry text-xs text-[#94A3B8] tabular-nums">
                  {metrics.totalScored} scored · {metrics.totalConceded} conceded
                </div>
              </div>

              <div className="p-4 bg-[#0A0C10] border border-white/[0.08] rounded-[6px]">
                <div className="font-telemetry text-xs text-[#94A3B8]">Recent Form</div>
                <div className="mt-1.5 font-telemetry text-2xl font-bold tracking-[0.14em] tabular-nums">
                  {metrics.recentForm.length > 0 ? (
                    metrics.recentForm.map((f, idx) => (
                      <span
                        key={`${f}-${idx}`}
                        className={
                          f === 'W'
                            ? 'text-[#CCFF00]'
                            : f === 'L'
                              ? 'text-[#FF2E5B]'
                              : 'text-[#00F0FF]'
                        }
                      >
                        {f}
                        {idx < metrics.recentForm.length - 1 ? ' ' : ''}
                      </span>
                    ))
                  ) : (
                    <span className="text-[#94A3B8]">—</span>
                  )}
                </div>
                <div className="mt-1 font-telemetry text-xs text-[#94A3B8]">
                  {matchedSquad ? `Captain: ${matchedSquad.captainIgn}` : 'Bracket Competitor'}
                </div>
              </div>
            </div>
          </div>

          {/* Recharts Analytics Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            {/* Win Rate Breakdown Donut */}
            <div className="lg:col-span-4 p-5 bg-[#0A0C10] border border-white/[0.08] rounded-[6px] flex flex-col justify-between">
              <div>
                <h3 className="font-display text-lg font-bold uppercase text-[#F8FAFC]">
                  Win Rate Breakdown
                </h3>
                <p className="mt-0.5 font-telemetry text-xs text-[#94A3B8]">
                  Proporsi hasil pertandingan selesai
                </p>
              </div>

              <div className="relative h-[220px] w-full mt-3">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={metrics.donutData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={62}
                      outerRadius={86}
                      paddingAngle={metrics.finishedCount > 0 ? 3 : 0}
                      stroke="none"
                    >
                      {metrics.donutData.map((entry, idx) => (
                        <Cell key={`${entry.name}-${idx}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#12161F',
                        borderColor: 'rgba(255,255,255,0.14)',
                        borderRadius: 6,
                        fontSize: 12,
                        color: '#F8FAFC',
                      }}
                      formatter={(val: unknown, name: unknown) => [`${val} match`, String(name)]}
                    />
                  </PieChart>
                </ResponsiveContainer>

                {/* Center KPI Readout */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="font-display text-3xl font-bold text-[#F8FAFC] tabular-nums">
                    {metrics.winRate}%
                  </span>
                  <span className="font-telemetry text-[11px] text-[#94A3B8]">Win Rate</span>
                </div>
              </div>

              <div className="mt-2 pt-3 border-t border-white/[0.06] flex items-center justify-between font-telemetry text-xs tabular-nums">
                <span className="text-[#CCFF00]">Wins: {metrics.wins}</span>
                <span className="text-[#FF2E5B]">Losses: {metrics.losses}</span>
                <span className="text-[#00F0FF]">Draws: {metrics.draws}</span>
              </div>
            </div>

            {/* Score Differential & Cumulative Win Rate Chart */}
            <div className="lg:col-span-8 p-5 bg-[#0A0C10] border border-white/[0.08] rounded-[6px] flex flex-col justify-between">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-display text-lg font-bold uppercase text-[#F8FAFC]">
                    Match Score &amp; Win Rate Trend
                  </h3>
                  <p className="mt-0.5 font-telemetry text-xs text-[#94A3B8]">
                    Perbandingan skor tim vs lawan serta tren win rate kumulatif
                  </p>
                </div>
                <div className="flex items-center gap-4 font-telemetry text-[11px] text-[#94A3B8]">
                  <span className="text-[#00F0FF]">■ {displayTag} Score</span>
                  <span className="text-[#64748B]">■ Opponent</span>
                  <span className="text-[#CCFF00]">— Win Rate %</span>
                </div>
              </div>

              <div className="h-[245px] w-full mt-4">
                {metrics.trendData.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center border border-dashed border-white/10 rounded-[4px] p-6">
                    <Trophy className="w-6 h-6 text-[#94A3B8] mb-2" />
                    <p className="font-display text-base uppercase text-[#F8FAFC]">
                      Belum Ada Pertandingan Selesai
                    </p>
                    <p className="mt-1 font-telemetry text-xs text-[#94A3B8] max-w-sm">
                      Grafik perbandingan skor dan tren win rate akan muncul otomatis setelah tim ini menyelesaikan minimal satu pertandingan.
                    </p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={metrics.trendData}
                      margin={{ top: 10, right: 12, left: -12, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: '#94A3B8', fontSize: 11 }}
                        axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                        tickLine={false}
                      />
                      <YAxis
                        yAxisId="score"
                        allowDecimals={false}
                        tick={{ fill: '#94A3B8', fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        yAxisId="rate"
                        orientation="right"
                        domain={[0, 100]}
                        unit="%"
                        tick={{ fill: '#CCFF00', fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#12161F',
                          borderColor: 'rgba(255,255,255,0.14)',
                          borderRadius: 6,
                          fontSize: 12,
                          color: '#F8FAFC',
                        }}
                        labelFormatter={(_label, payload) => {
                          const item = payload?.[0]?.payload;
                          if (!item) return '';
                          return `vs ${item.opponent} (${item.round} · ${item.map})`;
                        }}
                      />
                      <Bar
                        yAxisId="score"
                        dataKey="teamScore"
                        name={`${displayTag} Score`}
                        fill="#00F0FF"
                        radius={[3, 3, 0, 0]}
                        maxBarSize={28}
                      />
                      <Bar
                        yAxisId="score"
                        dataKey="opponentScore"
                        name="Opponent Score"
                        fill="#475569"
                        radius={[3, 3, 0, 0]}
                        maxBarSize={28}
                      />
                      <Line
                        yAxisId="rate"
                        type="monotone"
                        dataKey="winRate"
                        name="Cumulative Win Rate (%)"
                        stroke="#CCFF00"
                        strokeWidth={2.5}
                        dot={{ r: 4, fill: '#CCFF00', stroke: '#0A0C10', strokeWidth: 1.5 }}
                        activeDot={{ r: 6 }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          {/* Roster Details */}
          <div className="border-t border-white/[0.08] pt-6 space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-[#00F0FF]" />
                <h3 className="font-display text-xl font-bold uppercase text-[#F8FAFC]">
                  Active Roster
                </h3>
              </div>
              {matchedSquad && (
                <div className="font-telemetry text-xs text-[#94A3B8]">
                  Registered {matchedSquad.registeredAt}
                  {matchedSquad.captainContact ? ` · Contact: ${matchedSquad.captainContact}` : ''}
                </div>
              )}
            </div>

            {rosterList.length === 0 ? (
              <div className="p-5 bg-[#0A0C10] border border-white/[0.08] rounded-[6px] font-telemetry text-xs text-[#94A3B8]">
                Detail roster pemain belum terdaftar di database turnamen untuk tim ini.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {rosterList.map((ign, idx) => {
                  const isCaptain =
                    matchedSquad &&
                    normalizeKey(matchedSquad.captainIgn) === normalizeKey(ign);
                  const mvpCount = mvpCountByIgn.get(normalizeKey(ign)) || 0;
                  return (
                    <div
                      key={`${ign}-${idx}`}
                      className="px-4 py-3 bg-[#0A0C10] border border-white/[0.08] rounded-[6px] flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="font-telemetry text-sm font-semibold text-[#F8FAFC] truncate">
                          {ign}
                        </div>
                        <div className="mt-0.5 font-telemetry text-[11px] text-[#94A3B8]">
                          {isCaptain ? (
                            <span className="text-[#CCFF00]">Team Captain</span>
                          ) : idx < 5 ? (
                            `Core Slot #${idx + 1}`
                          ) : (
                            'Substitute'
                          )}
                          {mvpCount > 0 && (
                            <>
                              <span aria-hidden="true"> · </span>
                              <span className="text-[#00F0FF] tabular-nums">
                                {mvpCount}x Match MVP
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      {isCaptain && (
                        <Shield className="w-4 h-4 text-[#CCFF00] shrink-0" aria-hidden="true" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Match History Table */}
          <div className="border-t border-white/[0.08] pt-6 space-y-4">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="font-display text-xl font-bold uppercase text-[#F8FAFC]">
                Match History
              </h3>
              <span className="font-telemetry text-xs text-[#94A3B8] tabular-nums">
                {metrics.filteredRows.length} recorded match{metrics.filteredRows.length === 1 ? '' : 'es'}
              </span>
            </div>

            {metrics.filteredRows.length === 0 ? (
              <div className="p-6 bg-[#0A0C10] border border-white/[0.08] rounded-[6px] text-center font-telemetry text-xs text-[#94A3B8]">
                Tidak ada riwayat pertandingan pada filter ini.
              </div>
            ) : (
              <div className="overflow-x-auto border border-white/[0.08] rounded-[6px] bg-[#0A0C10]">
                <table className="w-full text-left border-collapse min-w-[640px]">
                  <thead>
                    <tr className="border-b border-white/[0.08] font-telemetry text-[11px] uppercase tracking-[0.06em] text-[#94A3B8]">
                      <th className="py-2.5 px-4 font-semibold">Event / Round</th>
                      <th className="py-2.5 px-4 font-semibold">Opponent</th>
                      <th className="py-2.5 px-4 font-semibold">Map</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Score</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Result</th>
                      <th className="py-2.5 px-4 font-semibold text-right">MVP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06] font-telemetry text-xs">
                    {metrics.filteredRows.map((row) => {
                      const canJumpOpponent =
                        Boolean(onSelectOpponent) &&
                        row.opponentName &&
                        row.opponentName !== 'TBD' &&
                        row.opponentName !== 'TBA';
                      return (
                        <tr
                          key={row.id}
                          className="hover:bg-white/[0.03] transition-colors"
                        >
                          <td className="py-3 px-4">
                            <div className="text-[#F8FAFC] font-medium truncate max-w-[210px]">
                              {row.eventLabel}
                            </div>
                            <div className="text-[11px] text-[#94A3B8]">{row.roundLabel}</div>
                          </td>
                          <td className="py-3 px-4">
                            {canJumpOpponent ? (
                              <button
                                type="button"
                                onClick={() =>
                                  onSelectOpponent?.({
                                    teamName: row.opponentName,
                                    teamTag: row.opponentTag,
                                    tournamentId: row.rawMatch?.tournamentId,
                                  })
                                }
                                className="inline-flex items-center gap-1 text-[#F8FAFC] hover:text-[#00F0FF] transition-colors cursor-pointer font-semibold"
                              >
                                <span>{row.opponentName}</span>
                                <ArrowUpRight className="w-3.5 h-3.5 text-[#94A3B8]" />
                              </button>
                            ) : (
                              <span className="text-[#94A3B8]">{row.opponentName}</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-[#94A3B8]">{row.mapName}</td>
                          <td className="py-3 px-4 text-right font-bold text-[#F8FAFC] tabular-nums">
                            {row.rawMatch && onSelectMatch ? (
                              <button
                                type="button"
                                onClick={() => onSelectMatch(row.rawMatch!)}
                                className="hover:text-[#00F0FF] underline-offset-4 hover:underline cursor-pointer"
                                title="Lihat detail pertandingan"
                              >
                                {row.teamScore} - {row.opponentScore}
                              </button>
                            ) : (
                              `${row.teamScore} - ${row.opponentScore}`
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-bold tabular-nums">
                            <span
                              className={
                                row.outcome === 'WIN'
                                  ? 'text-[#CCFF00]'
                                  : row.outcome === 'LOSS'
                                    ? 'text-[#FF2E5B]'
                                    : row.outcome === 'LIVE'
                                      ? 'text-[#FF2E5B]'
                                      : 'text-[#94A3B8]'
                              }
                            >
                              {row.outcome}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right text-[#94A3B8]">
                            {row.mvpIgn || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
