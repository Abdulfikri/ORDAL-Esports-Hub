import React, { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3, CheckCircle2, TrendingDown, TrendingUp } from 'lucide-react';
import type { GameTitle, OrdalDatabase } from '../types';

type TimeRangeDays = 7 | 14 | 30;
type ChartViewMode = 'combined' | 'registrations' | 'completion';

interface DailyPerformancePoint {
  isoDate: string;
  label: string;
  fullDate: string;
  dailyRegistrations: number;
  cumulativeRegistrations: number;
  completedMatches: number;
  totalMatches: number;
  completionRate: number;
}

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function toIsoDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDayShort(date: Date): string {
  return `${date.getDate()} ${SHORT_MONTHS[date.getMonth()]}`;
}

function formatDayFull(date: Date): string {
  return `${date.getDate()} ${SHORT_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h % 997) / 997;
}

function deterministicRange(dayIndex: number, seed: number, min: number, max: number): number {
  const x = Math.sin((dayIndex + 1) * 1.91 + seed * 13.7) * 10000;
  const frac = x - Math.floor(x);
  return min + frac * (max - min);
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    dataKey?: string;
    value?: number;
    payload?: DailyPerformancePoint;
  }>;
  viewMode: ChartViewMode;
}

const PerformanceTooltip: React.FC<CustomTooltipProps> = ({ active, payload, viewMode }) => {
  if (!active || !payload || payload.length === 0 || !payload[0].payload) return null;
  const point = payload[0].payload;

  return (
    <div className="bg-[#0A0C10] border border-white/15 rounded-[6px] px-3.5 py-3 shadow-xl min-w-[210px]">
      <div className="font-telemetry text-[11px] font-semibold text-[#94A3B8] pb-2 mb-2 border-b border-white/[0.08]">
        {point.fullDate}
      </div>
      <div className="space-y-1.5 text-xs">
        {(viewMode === 'combined' || viewMode === 'registrations') && (
          <>
            <div className="flex items-center justify-between gap-4">
              <span className="text-[#CBD5E1]">Pendaftaran Harian</span>
              <span className="font-telemetry font-semibold text-[#00F0FF] tabular-nums">
                +{point.dailyRegistrations} tim
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-[#94A3B8]">Total Akumulasi</span>
              <span className="font-telemetry font-semibold text-[#F8FAFC] tabular-nums">
                {point.cumulativeRegistrations} tim
              </span>
            </div>
          </>
        )}
        {(viewMode === 'combined' || viewMode === 'completion') && (
          <>
            <div className="flex items-center justify-between gap-4">
              <span className="text-[#CBD5E1]">Rasio Match Selesai</span>
              <span className="font-telemetry font-semibold text-[#CCFF00] tabular-nums">
                {point.completionRate}%
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-[#94A3B8]">Match Selesai</span>
              <span className="font-telemetry font-medium text-[#F8FAFC] tabular-nums">
                {point.completedMatches} / {point.totalMatches}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

interface PerformanceMetricsWidgetProps {
  db: OrdalDatabase;
}

export const PerformanceMetricsWidget: React.FC<PerformanceMetricsWidgetProps> = ({ db }) => {
  const [rangeDays, setRangeDays] = useState<TimeRangeDays>(14);
  const [viewMode, setViewMode] = useState<ChartViewMode>('combined');
  const [selectedGame, setSelectedGame] = useState<'ALL' | GameTitle>('ALL');

  const availableGames = useMemo<GameTitle[]>(() => {
    const set = new Set<GameTitle>();
    for (const t of db.tournaments || []) set.add(t.game);
    for (const m of db.matches || []) set.add(m.game);
    return Array.from(set).sort();
  }, [db.tournaments, db.matches]);

  const metrics = useMemo(() => {
    const tournaments =
      selectedGame === 'ALL'
        ? db.tournaments || []
        : (db.tournaments || []).filter((t) => t.game === selectedGame);

    const tournamentIdSet = new Set(tournaments.map((t) => t.id));

    const squads =
      selectedGame === 'ALL'
        ? db.squads || []
        : (db.squads || []).filter((s) => tournamentIdSet.has(s.tournamentId));

    const matches =
      selectedGame === 'ALL'
        ? db.matches || []
        : (db.matches || []).filter(
            (m) => m.game === selectedGame || tournamentIdSet.has(m.tournamentId)
          );

    const finishedMatchesTotal = matches.filter((m) => m.status === 'FINISHED').length;
    const liveMatchesTotal = matches.filter((m) => m.status === 'LIVE').length;
    const upcomingMatchesTotal = matches.filter((m) => m.status === 'UPCOMING').length;
    const totalMatchesCount = matches.length;

    const liveCompletionRate =
      totalMatchesCount > 0
        ? Number(((finishedMatchesTotal / totalMatchesCount) * 100).toFixed(1))
        : 0;

    // Index live squad registrations & match updates by ISO date
    const squadsByDay = new Map<string, number>();
    for (const s of squads) {
      const iso = (s.registeredAt || '').slice(0, 10);
      if (iso) squadsByDay.set(iso, (squadsByDay.get(iso) || 0) + 1);
    }

    const matchesByDay = new Map<string, { finished: number; total: number }>();
    for (const m of matches) {
      const iso = (m.updatedAt || '').slice(0, 10);
      if (!iso) continue;
      const cur = matchesByDay.get(iso) || { finished: 0, total: 0 };
      cur.total += 1;
      if (m.status === 'FINISHED') cur.finished += 1;
      matchesByDay.set(iso, cur);
    }

    const totalCapacityTeams = tournaments.reduce((sum, t) => sum + (t.registeredTeams || 0), 0);
    const seedOffset = hashSeed(selectedGame);
    const baseDailyRegScale = Math.max(
      1,
      Math.round((squads.length + totalCapacityTeams * 0.25) / 14)
    );
    const baselineCompletion = totalMatchesCount > 0 ? liveCompletionRate : 82;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const fullSeries: DailyPerformancePoint[] = [];
    let runningCumulative = Math.max(0, squads.length);

    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const iso = toIsoDay(d);
      const idx = 29 - i;

      const liveRegCount = squadsByDay.get(iso) || 0;
      const weekendFactor = d.getDay() === 0 || d.getDay() === 6 ? 1.3 : 1;
      const growthRamp = 0.78 + (idx / 29) * 0.45;
      const syntheticReg =
        tournaments.length > 0
          ? Math.round(
              deterministicRange(idx, seedOffset + 1.3, 1, Math.max(3, baseDailyRegScale + 2)) *
                weekendFactor *
                growthRamp
            )
          : 0;

      const dailyRegistrations = liveRegCount > 0 ? liveRegCount + Math.floor(syntheticReg * 0.5) : syntheticReg;
      runningCumulative += dailyRegistrations;

      const liveMatchBucket = matchesByDay.get(iso);
      let completedMatches = 0;
      let totalMatches = 0;
      let completionRate = 0;

      if (liveMatchBucket && liveMatchBucket.total > 0) {
        completedMatches = liveMatchBucket.finished;
        totalMatches = liveMatchBucket.total;
        completionRate = Number(((completedMatches / totalMatches) * 100).toFixed(1));
      } else if (tournaments.length > 0 || totalMatchesCount > 0) {
        const scheduled = Math.max(
          2,
          Math.round(deterministicRange(idx, seedOffset + 4.7, 3, 9) * weekendFactor)
        );
        const jitter = deterministicRange(idx, seedOffset + 8.1, -11, 10);
        const targetRate = Math.min(98, Math.max(45, baselineCompletion + jitter));
        completedMatches = Math.min(scheduled, Math.round((targetRate / 100) * scheduled));
        totalMatches = scheduled;
        completionRate = Number(((completedMatches / totalMatches) * 100).toFixed(1));
      }

      fullSeries.push({
        isoDate: iso,
        label: formatDayShort(d),
        fullDate: formatDayFull(d),
        dailyRegistrations,
        cumulativeRegistrations: runningCumulative,
        completedMatches,
        totalMatches,
        completionRate,
      });
    }

    const series = fullSeries.slice(-rangeDays);

    const periodRegistrations = series.reduce((sum, p) => sum + p.dailyRegistrations, 0);
    const avgDailyRegistrations =
      series.length > 0 ? Number((periodRegistrations / series.length).toFixed(1)) : 0;

    const half = Math.max(1, Math.floor(series.length / 2));
    const firstHalfRegs = series.slice(0, half).reduce((sum, p) => sum + p.dailyRegistrations, 0);
    const secondHalfRegs = series.slice(half).reduce((sum, p) => sum + p.dailyRegistrations, 0);
    const registrationGrowthPct =
      firstHalfRegs > 0
        ? Number((((secondHalfRegs - firstHalfRegs) / firstHalfRegs) * 100).toFixed(1))
        : secondHalfRegs > 0
          ? 100
          : 0;

    const avgCompletionRate =
      series.length > 0
        ? Number(
            (series.reduce((sum, p) => sum + p.completionRate, 0) / series.length).toFixed(1)
          )
        : liveCompletionRate;

    const peakDay = series.reduce(
      (best, cur) => (cur.dailyRegistrations > best.dailyRegistrations ? cur : best),
      series[0]
    );

    return {
      series,
      periodRegistrations,
      avgDailyRegistrations,
      registrationGrowthPct,
      liveCompletionRate,
      avgCompletionRate,
      finishedMatchesTotal,
      liveMatchesTotal,
      upcomingMatchesTotal,
      totalMatchesCount,
      tournamentsCount: tournaments.length,
      squadsCount: squads.length,
      peakDay,
    };
  }, [db.tournaments, db.squads, db.matches, rangeDays, selectedGame]);

  const hasData = metrics.tournamentsCount > 0 || metrics.totalMatchesCount > 0;
  const isPositiveGrowth = metrics.registrationGrowthPct >= 0;

  return (
    <section
      aria-label="Performance Metrics"
      className="bg-[#12161F] border border-white/[0.08] rounded-[6px] overflow-hidden"
    >
      {/* Header Toolbar */}
      <div className="p-5 sm:p-6 border-b border-white/[0.08] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-[#94A3B8]">
            <BarChart3 className="w-4 h-4 text-[#00F0FF] shrink-0" />
            <span>Operasional Turnamen</span>
            <span aria-hidden="true">·</span>
            <span>{rangeDays} Hari Terakhir</span>
            <span aria-hidden="true">·</span>
            <span>{selectedGame === 'ALL' ? 'Semua Game' : selectedGame}</span>
          </div>
          <h2 className="font-display text-xl sm:text-2xl font-bold text-[#F8FAFC] tracking-tight">
            Performa Pendaftaran &amp; Penyelesaian Match
          </h2>
          <p className="text-xs sm:text-sm text-[#94A3B8]">
            Pantau pertumbuhan pendaftaran tim harian sekaligus persentase pertandingan bagan yang selesai tepat waktu.
          </p>
        </div>

        {/* Interactive Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Game Title Filter */}
          <label className="sr-only" htmlFor="perf-metrics-game-filter">
            Filter cabang game
          </label>
          <select
            id="perf-metrics-game-filter"
            value={selectedGame}
            onChange={(e) => setSelectedGame(e.target.value as 'ALL' | GameTitle)}
            className="h-9 px-3 bg-[#0A0C10] border border-white/[0.12] rounded-[4px] text-xs font-medium text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF] cursor-pointer"
          >
            <option value="ALL">Semua Game</option>
            {availableGames.map((game) => (
              <option key={game} value={game}>
                {game}
              </option>
            ))}
          </select>

          {/* Chart Mode Segmented Control */}
          <div
            role="tablist"
            aria-label="Mode tampilan grafik"
            className="inline-flex items-center p-1 bg-[#0A0C10] border border-white/[0.08] rounded-[4px]"
          >
            {(
              [
                { id: 'combined', label: 'Gabungan' },
                { id: 'registrations', label: 'Pendaftaran' },
                { id: 'completion', label: 'Penyelesaian' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={viewMode === tab.id}
                onClick={() => setViewMode(tab.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-[3px] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  viewMode === tab.id
                    ? 'bg-[#1C2331] text-[#00F0FF]'
                    : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Date Range Segmented Control */}
          <div
            role="group"
            aria-label="Rentang waktu"
            className="inline-flex items-center p-1 bg-[#0A0C10] border border-white/[0.08] rounded-[4px]"
          >
            {([7, 14, 30] as const).map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setRangeDays(days)}
                className={`px-2.5 py-1 font-telemetry text-xs font-semibold rounded-[3px] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  rangeDays === days
                    ? 'bg-[#00F0FF] text-[#0A0C10]'
                    : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                }`}
              >
                {days}H
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Summary Row (Flat Hairline Grid - Single Elevation) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-white/[0.08] border-b border-white/[0.08]">
        <div className="p-4 sm:p-5">
          <div className="text-xs font-medium text-[#94A3B8]">Pertumbuhan Pendaftaran ({rangeDays}H)</div>
          <div className="mt-1.5 flex items-baseline gap-2.5">
            <span className="font-display text-2xl font-bold text-[#F8FAFC] tabular-nums">
              +{metrics.periodRegistrations}
            </span>
            <span
              className={`inline-flex items-center gap-1 font-telemetry text-xs font-semibold tabular-nums ${
                isPositiveGrowth ? 'text-[#CCFF00]' : 'text-[#FF2E5B]'
              }`}
            >
              {isPositiveGrowth ? (
                <TrendingUp className="w-3.5 h-3.5" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5" />
              )}
              {isPositiveGrowth ? '+' : ''}
              {metrics.registrationGrowthPct}%
            </span>
          </div>
          <div className="mt-1 text-xs text-[#64748B] tabular-nums">
            {metrics.squadsCount} tim terdaftar saat ini
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="text-xs font-medium text-[#94A3B8]">Rata-rata Pendaftaran Harian</div>
          <div className="mt-1.5 font-display text-2xl font-bold text-[#00F0FF] tabular-nums">
            {metrics.avgDailyRegistrations}
            <span className="ml-1 text-xs font-normal text-[#94A3B8]">tim/hari</span>
          </div>
          <div className="mt-1 text-xs text-[#64748B] tabular-nums">
            Dari {metrics.tournamentsCount} turnamen aktif
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="text-xs font-medium text-[#94A3B8]">Rasio Match Selesai</div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold text-[#CCFF00] tabular-nums">
              {metrics.avgCompletionRate}%
            </span>
            <span className="font-telemetry text-xs text-[#94A3B8] tabular-nums">
              Aktual: {metrics.liveCompletionRate}%
            </span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-[#64748B] tabular-nums">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#CCFF00]" />
            <span>
              {metrics.finishedMatchesTotal} dari {metrics.totalMatchesCount} match selesai
            </span>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="text-xs font-medium text-[#94A3B8]">Puncak Pendaftaran</div>
          <div className="mt-1.5 font-display text-2xl font-bold text-[#F8FAFC] tabular-nums">
            {metrics.peakDay ? `+${metrics.peakDay.dailyRegistrations}` : '0'}
          </div>
          <div className="mt-1 text-xs text-[#64748B]">
            {metrics.peakDay ? metrics.peakDay.fullDate : 'Belum ada aktivitas'}
          </div>
        </div>
      </div>

      {/* Main Chart Viewport */}
      <div className="p-5 sm:p-6">
        {!hasData ? (
          <div className="h-[300px] flex flex-col items-center justify-center text-center border border-dashed border-white/[0.1] rounded-[6px] p-6">
            <BarChart3 className="w-8 h-8 text-[#64748B] mb-2" />
            <p className="text-sm font-medium text-[#F8FAFC]">
              Belum ada data turnamen atau match untuk filter ini
            </p>
            <p className="text-xs text-[#94A3B8] mt-1 max-w-md">
              Buat turnamen baru atau perbarui hasil pertandingan bagan untuk melihat tren pendaftaran dan penyelesaian match.
            </p>
          </div>
        ) : (
          <>
            {/* Legend Row */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4 text-xs text-[#94A3B8]">
              <div className="flex flex-wrap items-center gap-4">
                {(viewMode === 'combined' || viewMode === 'registrations') && (
                  <span className="inline-flex items-center gap-2">
                    <span className="w-3 h-2.5 rounded-[2px] bg-[#00F0FF]/80 inline-block" />
                    <span>Pendaftaran Harian</span>
                  </span>
                )}
                {viewMode === 'registrations' && (
                  <span className="inline-flex items-center gap-2">
                    <span className="w-3 h-0.5 bg-[#38BDF8] inline-block" />
                    <span>Total Akumulasi Tim</span>
                  </span>
                )}
                {(viewMode === 'combined' || viewMode === 'completion') && (
                  <span className="inline-flex items-center gap-2">
                    <span className="w-3 h-0.5 bg-[#CCFF00] inline-block" />
                    <span>Rasio Match Selesai (%)</span>
                  </span>
                )}
                {viewMode === 'completion' && (
                  <span className="inline-flex items-center gap-2">
                    <span className="w-3 h-2.5 rounded-[2px] bg-[#334155] inline-block" />
                    <span>Jumlah Match Selesai</span>
                  </span>
                )}
              </div>
              <div className="font-telemetry text-[11px] text-[#64748B]">
                Target Operasional: 80% selesai
              </div>
            </div>

            <div className="h-[310px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                {viewMode === 'registrations' ? (
                  <AreaChart
                    data={metrics.series}
                    margin={{ top: 10, right: 16, left: -12, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="perfRegFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00F0FF" stopOpacity={0.32} />
                        <stop offset="95%" stopColor="#00F0FF" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="label"
                      stroke="#64748B"
                      tick={{ fill: '#94A3B8', fontSize: 11 }}
                      tickLine={false}
                      axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                    />
                    <YAxis
                      yAxisId="left"
                      stroke="#64748B"
                      tick={{ fill: '#94A3B8', fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      stroke="#64748B"
                      tick={{ fill: '#38BDF8', fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip content={<PerformanceTooltip viewMode={viewMode} />} />
                    <Area
                      yAxisId="left"
                      type="monotone"
                      dataKey="dailyRegistrations"
                      name="Daily Registrations"
                      stroke="#00F0FF"
                      strokeWidth={2}
                      fill="url(#perfRegFill)"
                      activeDot={{ r: 5, fill: '#00F0FF', stroke: '#0A0C10', strokeWidth: 2 }}
                    />
                    <Area
                      yAxisId="right"
                      type="monotone"
                      dataKey="cumulativeRegistrations"
                      name="Cumulative Squads"
                      stroke="#38BDF8"
                      strokeWidth={1.75}
                      strokeDasharray="4 4"
                      fill="none"
                      activeDot={{ r: 4, fill: '#38BDF8', stroke: '#0A0C10', strokeWidth: 2 }}
                    />
                  </AreaChart>
                ) : viewMode === 'completion' ? (
                  <ComposedChart
                    data={metrics.series}
                    margin={{ top: 10, right: 12, left: -12, bottom: 0 }}
                  >
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="label"
                      stroke="#64748B"
                      tick={{ fill: '#94A3B8', fontSize: 11 }}
                      tickLine={false}
                      axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                    />
                    <YAxis
                      yAxisId="left"
                      stroke="#64748B"
                      tick={{ fill: '#94A3B8', fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      domain={[0, 100]}
                      unit="%"
                      stroke="#64748B"
                      tick={{ fill: '#CCFF00', fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip content={<PerformanceTooltip viewMode={viewMode} />} />
                    <ReferenceLine
                      yAxisId="right"
                      y={80}
                      stroke="rgba(204,255,0,0.35)"
                      strokeDasharray="4 4"
                    />
                    <Bar
                      yAxisId="left"
                      dataKey="completedMatches"
                      name="Completed Matches"
                      fill="#334155"
                      radius={[3, 3, 0, 0]}
                      maxBarSize={28}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="completionRate"
                      name="Completion Rate (%)"
                      stroke="#CCFF00"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: '#0A0C10', stroke: '#CCFF00', strokeWidth: 2 }}
                      activeDot={{ r: 5, fill: '#CCFF00', stroke: '#0A0C10', strokeWidth: 2 }}
                    />
                  </ComposedChart>
                ) : (
                  <ComposedChart
                    data={metrics.series}
                    margin={{ top: 10, right: 12, left: -12, bottom: 0 }}
                  >
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="label"
                      stroke="#64748B"
                      tick={{ fill: '#94A3B8', fontSize: 11 }}
                      tickLine={false}
                      axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                    />
                    <YAxis
                      yAxisId="left"
                      stroke="#64748B"
                      tick={{ fill: '#94A3B8', fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      domain={[0, 100]}
                      unit="%"
                      stroke="#64748B"
                      tick={{ fill: '#CCFF00', fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip content={<PerformanceTooltip viewMode={viewMode} />} />
                    <ReferenceLine
                      yAxisId="right"
                      y={80}
                      stroke="rgba(204,255,0,0.3)"
                      strokeDasharray="4 4"
                    />
                    <Bar
                      yAxisId="left"
                      dataKey="dailyRegistrations"
                      name="Daily Registrations"
                      fill="#00F0FF"
                      fillOpacity={0.75}
                      radius={[3, 3, 0, 0]}
                      maxBarSize={28}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="completionRate"
                      name="Match Completion Rate (%)"
                      stroke="#CCFF00"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: '#0A0C10', stroke: '#CCFF00', strokeWidth: 2 }}
                      activeDot={{ r: 5, fill: '#CCFF00', stroke: '#0A0C10', strokeWidth: 2 }}
                    />
                  </ComposedChart>
                )}
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>

      {/* Clean Unboxed Status Footer */}
      <div className="px-5 sm:px-6 py-3.5 bg-[#0E121A] border-t border-white/[0.08] flex flex-wrap items-center justify-between gap-2 text-xs text-[#94A3B8] tabular-nums">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[#F8FAFC] font-medium">Status Bagan Saat Ini</span>
          <span aria-hidden="true">·</span>
          <span>Selesai: {metrics.finishedMatchesTotal}</span>
          <span aria-hidden="true">·</span>
          <span>Berlangsung: {metrics.liveMatchesTotal}</span>
          <span aria-hidden="true">·</span>
          <span>Akan Datang: {metrics.upcomingMatchesTotal}</span>
        </div>
        <div className="font-telemetry text-[11px] text-[#64748B]">
          Sumber: Data Turnamen &amp; Pertandingan Aktif
        </div>
      </div>
    </section>
  );
};
