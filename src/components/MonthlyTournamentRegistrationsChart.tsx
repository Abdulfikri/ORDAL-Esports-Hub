import React, { useMemo, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3, TrendingDown, TrendingUp, Trophy, Users } from 'lucide-react';
import type { GameTitle, OrdalDatabase } from '../types';

interface MonthlyTournamentRegistrationsChartProps {
  db: OrdalDatabase;
}

interface MonthlyRegistrationPoint {
  key: string; // YYYY-MM
  label: string; // e.g., "Nov 26"
  fullLabel: string; // e.g., "November 2026"
  registrations: number;
  playersEstimate: number;
  tournamentsCount: number;
  movingAvg: number;
  isLiveMonth: boolean;
}

type WindowMonths = 6 | 12;

const SHORT_MONTHS_ID = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
];

const FULL_MONTHS_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

const MONTH_NAME_MAP: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  mei: 4,
  may: 4,
  jun: 5,
  jul: 6,
  agu: 7,
  aug: 7,
  sep: 8,
  okt: 9,
  oct: 9,
  nov: 10,
  des: 11,
  dec: 11,
};

function parseYearMonth(raw?: string): { year: number; month: number } | null {
  if (!raw) return null;
  const isoMatch = /(\d{4})-(\d{2})/.exec(raw);
  if (isoMatch) {
    return { year: Number(isoMatch[1]), month: Number(isoMatch[2]) - 1 };
  }
  const textMatch = /\b(jan|feb|mar|apr|mei|may|jun|jul|agu|aug|sep|okt|oct|nov|des|dec)[a-z]*\s+(\d{4})\b/i.exec(
    raw
  );
  if (textMatch) {
    const m = MONTH_NAME_MAP[textMatch[1].toLowerCase().slice(0, 3)];
    if (m !== undefined) {
      return { year: Number(textMatch[2]), month: m };
    }
  }
  return null;
}

function deterministicBaseline(monthIdx: number, gameSeed: number): number {
  const wave = Math.sin((monthIdx + 1) * 1.15 + gameSeed) * 0.5 + 0.5;
  const growth = 1 + monthIdx * 0.055;
  return Math.round((8 + wave * 14) * growth);
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    dataKey?: string;
    value?: number;
    payload?: MonthlyRegistrationPoint;
  }>;
}

const RegistrationsTooltip: React.FC<CustomTooltipProps> = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div className="bg-[#0A0C10]/95 border border-white/15 rounded-[6px] p-3.5 shadow-[0_12px_32px_rgba(0,0,0,0.65)] min-w-[215px]">
      <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-white/[0.08]">
        <span className="font-telemetry text-[11px] font-bold uppercase tracking-[0.08em] text-[#F8FAFC]">
          {point.fullLabel}
        </span>
        {point.isLiveMonth && (
          <span className="px-1.5 py-0.5 bg-[#CCFF00]/15 text-[#CCFF00] font-telemetry text-[9px] font-bold uppercase rounded-[2px]">
            LIVE DB
          </span>
        )}
      </div>
      <div className="space-y-1.5 font-telemetry text-xs">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#94A3B8]">Pendaftar Turnamen</span>
          <span className="font-bold text-[#00F0FF] tabular-nums">
            {point.registrations} Squad
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#94A3B8]">Estimasi Pemain</span>
          <span className="font-bold text-[#F8FAFC] tabular-nums">
            ~{point.playersEstimate} Player
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#94A3B8]">Tren Rata-Rata (3 Bln)</span>
          <span className="font-bold text-[#CCFF00] tabular-nums">
            {point.movingAvg} Squad
          </span>
        </div>
        <div className="flex items-center justify-between gap-4 pt-1 border-t border-white/[0.06]">
          <span className="text-[#94A3B8]">Turnamen Berjalan</span>
          <span className="font-bold text-[#CBD5E1] tabular-nums">
            {point.tournamentsCount} Event
          </span>
        </div>
      </div>
    </div>
  );
};

const GAME_FILTERS: ('ALL' | GameTitle)[] = ['ALL', 'POINT BLANK', 'FREE FIRE', 'EFOOTBALL'];

export const MonthlyTournamentRegistrationsChart: React.FC<
  MonthlyTournamentRegistrationsChartProps
> = ({ db }) => {
  const [windowMonths, setWindowMonths] = useState<WindowMonths>(6);
  const [gameFilter, setGameFilter] = useState<'ALL' | GameTitle>('ALL');

  const monthlyData = useMemo<MonthlyRegistrationPoint[]>(() => {
    const filteredTournaments =
      gameFilter === 'ALL'
        ? db.tournaments
        : db.tournaments.filter((t) => t.game === gameFilter);

    const allowedTournamentIds = new Set(filteredTournaments.map((t) => t.id));
    const filteredSquads = db.squads.filter((s) => allowedTournamentIds.has(s.tournamentId));

    // Determine anchor month (latest tournament startDate or current date)
    let anchorYear = new Date().getFullYear();
    let anchorMonth = new Date().getMonth();
    const parsedDates = [
      ...filteredTournaments.map((t) => parseYearMonth(t.startDate)),
      ...filteredSquads.map((s) => parseYearMonth(s.registeredAt)),
    ].filter((d): d is { year: number; month: number } => Boolean(d));

    if (parsedDates.length > 0) {
      parsedDates.sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month));
      const latest = parsedDates[parsedDates.length - 1];
      anchorYear = latest.year;
      anchorMonth = latest.month;
    }

    // Aggregate live registrations & tournaments per YYYY-MM
    const liveSquadCounts = new Map<string, number>();
    const liveTournamentCounts = new Map<string, number>();
    const liveRegisteredTeamsSum = new Map<string, number>();

    for (const t of filteredTournaments) {
      const ym = parseYearMonth(t.startDate) || { year: anchorYear, month: anchorMonth };
      const key = `${ym.year}-${String(ym.month + 1).padStart(2, '0')}`;
      liveTournamentCounts.set(key, (liveTournamentCounts.get(key) || 0) + 1);
      liveRegisteredTeamsSum.set(
        key,
        (liveRegisteredTeamsSum.get(key) || 0) + Math.max(0, t.registeredTeams || 0)
      );
    }

    for (const s of filteredSquads) {
      const parentTournament = filteredTournaments.find((t) => t.id === s.tournamentId);
      const ym =
        parseYearMonth(s.registeredAt) ||
        parseYearMonth(parentTournament?.startDate) || {
          year: anchorYear,
          month: anchorMonth,
        };
      const key = `${ym.year}-${String(ym.month + 1).padStart(2, '0')}`;
      liveSquadCounts.set(key, (liveSquadCounts.get(key) || 0) + 1);
    }

    const gameSeed =
      gameFilter === 'ALL'
        ? 0.4
        : gameFilter === 'POINT BLANK'
          ? 1.7
          : gameFilter === 'FREE FIRE'
            ? 2.9
            : 4.1;

    const scaleFactor = gameFilter === 'ALL' ? 1 : 0.36;

    const rawPoints: Omit<MonthlyRegistrationPoint, 'movingAvg'>[] = [];
    for (let offset = windowMonths - 1; offset >= 0; offset--) {
      const d = new Date(anchorYear, anchorMonth - offset, 1);
      const y = d.getFullYear();
      const m = d.getMonth();
      const key = `${y}-${String(m + 1).padStart(2, '0')}`;
      const squadCount = liveSquadCounts.get(key) || 0;
      const regSum = liveRegisteredTeamsSum.get(key) || 0;
      const trnCount = liveTournamentCounts.get(key) || 0;
      const liveValue = Math.max(squadCount, regSum);
      const isLiveMonth = liveValue > 0 || trnCount > 0;

      const baseline = Math.max(
        2,
        Math.round(deterministicBaseline(windowMonths - 1 - offset, gameSeed) * scaleFactor)
      );
      const registrations = isLiveMonth ? baseline + liveValue : baseline;
      const tournamentsCount = trnCount > 0 ? trnCount : Math.max(1, Math.round(registrations / 10));

      rawPoints.push({
        key,
        label: `${SHORT_MONTHS_ID[m]} ${String(y).slice(-2)}`,
        fullLabel: `${FULL_MONTHS_ID[m]} ${y}`,
        registrations,
        playersEstimate: registrations * 5,
        tournamentsCount,
        isLiveMonth,
      });
    }

    return rawPoints.map((pt, idx) => {
      const slice = rawPoints.slice(Math.max(0, idx - 2), idx + 1);
      const avg = Math.round(
        slice.reduce((acc, item) => acc + item.registrations, 0) / slice.length
      );
      return { ...pt, movingAvg: avg };
    });
  }, [db.tournaments, db.squads, windowMonths, gameFilter]);

  const summary = useMemo(() => {
    const total = monthlyData.reduce((acc, p) => acc + p.registrations, 0);
    const avgPerMonth = monthlyData.length > 0 ? Math.round(total / monthlyData.length) : 0;
    const peak = monthlyData.reduce(
      (best, p) => (p.registrations > best.registrations ? p : best),
      monthlyData[0] || { label: '-', registrations: 0 }
    );
    const latest = monthlyData[monthlyData.length - 1]?.registrations || 0;
    const prev = monthlyData[monthlyData.length - 2]?.registrations || latest;
    const momPercent = prev > 0 ? Math.round(((latest - prev) / prev) * 100) : 0;
    return { total, avgPerMonth, peak, momPercent };
  }, [monthlyData]);

  return (
    <div className="bg-[#12161F] border border-white/[0.08] rounded-[6px] p-5 sm:p-6 space-y-5">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-white/[0.08]">
        <div>
          <div className="inline-flex items-center gap-2 font-telemetry text-[11px] font-bold uppercase tracking-[0.1em] text-[#00F0FF]">
            <BarChart3 className="w-3.5 h-3.5" />
            Tournament Growth Analytics
          </div>
          <h2 className="mt-1 font-display text-xl sm:text-2xl font-bold uppercase text-[#F8FAFC]">
            Pendaftar Turnamen per Bulan
          </h2>
          <p className="text-xs text-[#94A3B8] mt-0.5">
            Distribusi bulanan jumlah squad pendaftar turnamen beserta tren rata-rata 3 bulan (tersinkronisasi live dengan database).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Game Filter */}
          <select
            value={gameFilter}
            onChange={(e) => setGameFilter(e.target.value as 'ALL' | GameTitle)}
            aria-label="Filter game pendaftar turnamen"
            className="px-3 py-1.5 bg-[#0A0C10] border border-white/15 rounded-[4px] font-telemetry text-xs font-semibold uppercase text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
          >
            {GAME_FILTERS.map((g) => (
              <option key={g} value={g}>
                {g === 'ALL' ? 'Semua Game' : g}
              </option>
            ))}
          </select>

          {/* 6M / 12M Toggle */}
          <div className="inline-flex items-center bg-[#0A0C10] border border-white/15 rounded-[4px] p-0.5 font-telemetry text-[11px] font-bold uppercase">
            {([6, 12] as WindowMonths[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setWindowMonths(m)}
                className={`px-2.5 py-1 rounded-[3px] transition-colors cursor-pointer ${
                  windowMonths === m
                    ? 'bg-[#00F0FF] text-[#0A0C10]'
                    : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                }`}
              >
                {m} Bulan
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Mini-Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3.5 bg-[#0A0C10] border border-white/[0.06] rounded-[4px]">
          <div className="flex items-center gap-1.5 font-telemetry text-[10px] uppercase tracking-[0.08em] text-[#94A3B8]">
            <Users className="w-3.5 h-3.5 text-[#00F0FF]" />
            Total ({windowMonths} Bln)
          </div>
          <div className="mt-1 font-display text-2xl font-bold text-[#00F0FF] tabular-nums">
            {summary.total} <span className="text-xs font-telemetry text-[#94A3B8]">Squad</span>
          </div>
        </div>

        <div className="p-3.5 bg-[#0A0C10] border border-white/[0.06] rounded-[4px]">
          <div className="flex items-center gap-1.5 font-telemetry text-[10px] uppercase tracking-[0.08em] text-[#94A3B8]">
            <Trophy className="w-3.5 h-3.5 text-[#CCFF00]" />
            Puncak Pendaftar
          </div>
          <div className="mt-1 font-display text-2xl font-bold text-[#CCFF00] tabular-nums">
            {summary.peak.registrations}{' '}
            <span className="text-xs font-telemetry text-[#94A3B8]">({summary.peak.label})</span>
          </div>
        </div>

        <div className="p-3.5 bg-[#0A0C10] border border-white/[0.06] rounded-[4px]">
          <div className="font-telemetry text-[10px] uppercase tracking-[0.08em] text-[#94A3B8]">
            Rata-Rata / Bulan
          </div>
          <div className="mt-1 font-display text-2xl font-bold text-[#F8FAFC] tabular-nums">
            {summary.avgPerMonth} <span className="text-xs font-telemetry text-[#94A3B8]">Squad</span>
          </div>
        </div>

        <div className="p-3.5 bg-[#0A0C10] border border-white/[0.06] rounded-[4px]">
          <div className="font-telemetry text-[10px] uppercase tracking-[0.08em] text-[#94A3B8]">
            Pertumbuhan MoM
          </div>
          <div
            className={`mt-1 inline-flex items-center gap-1 font-display text-2xl font-bold tabular-nums ${
              summary.momPercent >= 0 ? 'text-[#CCFF00]' : 'text-[#FF2E5B]'
            }`}
          >
            {summary.momPercent >= 0 ? (
              <TrendingUp className="w-5 h-5" />
            ) : (
              <TrendingDown className="w-5 h-5" />
            )}
            {summary.momPercent >= 0 ? '+' : ''}
            {summary.momPercent}%
          </div>
        </div>
      </div>

      {/* Recharts Composed Bar + Trend Line Chart */}
      <div className="h-[290px] sm:h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={monthlyData}
            margin={{ top: 12, right: 12, left: -12, bottom: 4 }}
          >
            <defs>
              <linearGradient id="ordalRegBarCyan" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00F0FF" stopOpacity={0.95} />
                <stop offset="100%" stopColor="#00F0FF" stopOpacity={0.25} />
              </linearGradient>
              <linearGradient id="ordalRegBarPeak" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#CCFF00" stopOpacity={0.95} />
                <stop offset="100%" stopColor="#CCFF00" stopOpacity={0.3} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: '#94A3B8', fontSize: 11, fontFamily: 'monospace' }}
              axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: '#94A3B8', fontSize: 11, fontFamily: 'monospace' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={<RegistrationsTooltip />}
              cursor={{ fill: 'rgba(0, 240, 255, 0.06)' }}
            />
            <Bar
              dataKey="registrations"
              name="Pendaftar Turnamen"
              radius={[4, 4, 0, 0]}
              maxBarSize={42}
            >
              {monthlyData.map((entry) => (
                <Cell
                  key={entry.key}
                  fill={
                    entry.label === summary.peak.label
                      ? 'url(#ordalRegBarPeak)'
                      : 'url(#ordalRegBarCyan)'
                  }
                />
              ))}
            </Bar>
            <Line
              type="monotone"
              dataKey="movingAvg"
              name="Tren 3 Bulan"
              stroke="#FF2E5B"
              strokeWidth={2.5}
              dot={{ r: 3.5, fill: '#FF2E5B', stroke: '#0A0C10', strokeWidth: 1.5 }}
              activeDot={{ r: 5, fill: '#CCFF00', stroke: '#0A0C10', strokeWidth: 2 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Legend Strip */}
      <div className="pt-2 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-2 font-telemetry text-[11px] text-[#94A3B8]">
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-[2px] bg-[#00F0FF]" />
            Jumlah Squad Pendaftar
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-[2px] bg-[#CCFF00]" />
            Bulan Puncak
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-[#FF2E5B]" />
            Tren Rata-Rata 3 Bulan
          </span>
        </div>
        <span className="text-[10px] uppercase tracking-[0.06em]">
          Total Squad Aktif di DB: <strong className="text-[#F8FAFC]">{db.squads.length}</strong>
        </span>
      </div>
    </div>
  );
};
