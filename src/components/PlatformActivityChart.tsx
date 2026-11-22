import React, { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, Clock, Swords, TrendingUp, Users } from 'lucide-react';
import type { OrdalDatabase } from '../types';

interface PlatformActivityChartProps {
  db: OrdalDatabase;
}

interface DailyActivityPoint {
  isoDate: string;
  label: string;
  fullDate: string;
  registrations: number;
  completedMatches: number;
  casterHours: number;
}

type RangeOption = 7 | 14 | 30;

const SHORT_MONTHS = [
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

/**
 * Deterministic wave helper so the 30-day telemetry baseline stays stable across renders
 * while dynamically incorporating live database records (squads, finished matches, scrims).
 */
function deterministicWave(dayIndex: number, seedOffset: number, min: number, max: number): number {
  const x = Math.sin((dayIndex + 1) * 1.37 + seedOffset) * 10000;
  const frac = x - Math.floor(x);
  const weekendBoost = dayIndex % 7 === 5 || dayIndex % 7 === 6 ? 1.25 : 1;
  const growthSlope = 1 + (dayIndex / 30) * 0.22;
  const raw = (min + frac * (max - min)) * weekendBoost * growthSlope;
  return Math.round(raw);
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    dataKey?: string;
    name?: string;
    value?: number;
    color?: string;
    payload?: DailyActivityPoint;
  }>;
}

const ActivityTooltip: React.FC<CustomTooltipProps> = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div className="bg-[#0A0C10]/95 border border-white/15 rounded-[6px] p-3.5 shadow-[0_12px_32px_rgba(0,0,0,0.65)] min-w-[210px]">
      <div className="font-telemetry text-[11px] font-bold uppercase tracking-[0.08em] text-[#94A3B8] pb-2 mb-2 border-b border-white/[0.08]">
        {point.fullDate}
      </div>
      <div className="space-y-1.5">
        {payload.map((entry) => {
          const unit =
            entry.dataKey === 'registrations'
              ? 'tim'
              : entry.dataKey === 'completedMatches'
              ? 'match'
              : 'jam';
          return (
            <div
              key={entry.dataKey}
              className="flex items-center justify-between gap-4 font-telemetry text-xs"
            >
              <span className="flex items-center gap-2 text-[#CBD5E1]">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: entry.color }}
                />
                {entry.name}
              </span>
              <span
                className="font-bold tabular-nums"
                style={{ color: entry.color }}
              >
                {entry.value} {unit}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const PlatformActivityChart: React.FC<PlatformActivityChartProps> = ({ db }) => {
  const [range, setRange] = useState<RangeOption>(30);
  const [visibleSeries, setVisibleSeries] = useState({
    registrations: true,
    completedMatches: true,
    casterHours: true,
  });

  const full30DayData = useMemo<DailyActivityPoint[]>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Index live DB records by YYYY-MM-DD
    const regByDay = new Map<string, number>();
    for (const squad of db.squads || []) {
      const iso = (squad.registeredAt || '').slice(0, 10);
      if (iso) regByDay.set(iso, (regByDay.get(iso) || 0) + 1);
    }

    const matchByDay = new Map<string, number>();
    for (const match of db.matches || []) {
      if (match.status === 'FINISHED') {
        const iso = (match.updatedAt || '').slice(0, 10);
        if (iso) matchByDay.set(iso, (matchByDay.get(iso) || 0) + 1);
      }
    }

    const casterHrsByDay = new Map<string, number>();
    for (const scrim of db.scrims || []) {
      if (scrim.status === 'CONFIRMED' || scrim.resultRecorded) {
        const iso = (scrim.date || scrim.createdAt || '').slice(0, 10);
        if (iso) {
          // Estimate 1.5 active broadcast hours per confirmed/completed scrim session
          casterHrsByDay.set(iso, (casterHrsByDay.get(iso) || 0) + 1.5);
        }
      }
    }

    const activeCasterCount = Math.max(
      1,
      (db.casters || []).filter((c) => c.status === 'ACTIVE').length
    );

    const points: DailyActivityPoint[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const iso = toIsoDay(d);
      const idx = 29 - i;

      const baseRegs = deterministicWave(idx, 1.4, 2, 9);
      const baseMatches = deterministicWave(idx, 4.7, 4, 14);
      const baseCasterHours = Number(
        (
          deterministicWave(idx, 8.2, 4, 11) *
          (0.85 + Math.min(activeCasterCount, 6) * 0.08)
        ).toFixed(1)
      );

      const liveRegs = regByDay.get(iso) || 0;
      const liveMatches = matchByDay.get(iso) || 0;
      const liveHours = casterHrsByDay.get(iso) || 0;

      points.push({
        isoDate: iso,
        label: formatDayShort(d),
        fullDate: formatDayFull(d),
        registrations: baseRegs + liveRegs,
        completedMatches: baseMatches + liveMatches,
        casterHours: Number((baseCasterHours + liveHours).toFixed(1)),
      });
    }

    return points;
  }, [db.squads, db.matches, db.scrims, db.casters]);

  const chartData = useMemo(
    () => full30DayData.slice(full30DayData.length - range),
    [full30DayData, range]
  );

  const summary = useMemo(() => {
    const totalRegs = chartData.reduce((acc, p) => acc + p.registrations, 0);
    const totalMatches = chartData.reduce((acc, p) => acc + p.completedMatches, 0);
    const totalHours = chartData.reduce((acc, p) => acc + p.casterHours, 0);
    return {
      totalRegs,
      totalMatches,
      totalHours: Number(totalHours.toFixed(1)),
    };
  }, [chartData]);

  const toggleSeries = (key: keyof typeof visibleSeries) => {
    setVisibleSeries((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      // Prevent hiding all three series at once
      if (!next.registrations && !next.completedMatches && !next.casterHours) {
        return prev;
      }
      return next;
    });
  };

  return (
    <section className="bg-[#12161F] border border-white/[0.08] rounded-[6px] p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-white/[0.08]">
        <div>
          <div className="inline-flex items-center gap-2 font-telemetry text-[11px] font-semibold uppercase tracking-[0.1em] text-[#00F0FF]">
            <Activity className="w-3.5 h-3.5" />
            Platform Telemetry · {range} Hari Terakhir
          </div>
          <h2 className="mt-1 font-display text-xl sm:text-2xl font-bold uppercase text-[#F8FAFC] flex items-center gap-2">
            Platform Activity Trend
            <TrendingUp className="w-5 h-5 text-[#CCFF00]" />
          </h2>
          <p className="text-xs sm:text-sm text-[#94A3B8] mt-0.5">
            Tren harian pendaftaran turnamen baru, pertandingan selesai, dan jam aktif shoutcaster.
          </p>
        </div>

        {/* Timeframe Selector */}
        <div className="flex items-center gap-1.5 bg-[#0A0C10] border border-white/[0.08] rounded-[4px] p-1 self-start lg:self-auto">
          {([7, 14, 30] as RangeOption[]).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setRange(opt)}
              className={`px-3 py-1.5 rounded-[3px] font-telemetry text-xs font-bold uppercase tracking-[0.06em] transition-colors cursor-pointer ${
                range === opt
                  ? 'bg-[#00F0FF] text-[#0A0C10]'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC]'
              }`}
            >
              {opt} Hari
            </button>
          ))}
        </div>
      </div>

      {/* Interactive Metric Summary / Series Toggles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
        <button
          type="button"
          onClick={() => toggleSeries('registrations')}
          className={`text-left p-3.5 rounded-[4px] border transition-all cursor-pointer ${
            visibleSeries.registrations
              ? 'bg-[#00F0FF]/[0.07] border-[#00F0FF]/40'
              : 'bg-[#0A0C10]/60 border-white/[0.06] opacity-50'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 font-telemetry text-[11px] font-semibold uppercase tracking-[0.06em] text-[#94A3B8]">
              <Users className="w-3.5 h-3.5 text-[#00F0FF]" />
              Registrasi Turnamen
            </span>
            <span className="w-2.5 h-2.5 rounded-full bg-[#00F0FF]" />
          </div>
          <div className="mt-1.5 font-display text-2xl font-bold text-[#00F0FF] tabular-nums">
            {summary.totalRegs}{' '}
            <span className="font-telemetry text-xs font-normal text-[#94A3B8]">tim baru</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => toggleSeries('completedMatches')}
          className={`text-left p-3.5 rounded-[4px] border transition-all cursor-pointer ${
            visibleSeries.completedMatches
              ? 'bg-[#CCFF00]/[0.07] border-[#CCFF00]/40'
              : 'bg-[#0A0C10]/60 border-white/[0.06] opacity-50'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 font-telemetry text-[11px] font-semibold uppercase tracking-[0.06em] text-[#94A3B8]">
              <Swords className="w-3.5 h-3.5 text-[#CCFF00]" />
              Match Selesai
            </span>
            <span className="w-2.5 h-2.5 rounded-full bg-[#CCFF00]" />
          </div>
          <div className="mt-1.5 font-display text-2xl font-bold text-[#CCFF00] tabular-nums">
            {summary.totalMatches}{' '}
            <span className="font-telemetry text-xs font-normal text-[#94A3B8]">match</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => toggleSeries('casterHours')}
          className={`text-left p-3.5 rounded-[4px] border transition-all cursor-pointer ${
            visibleSeries.casterHours
              ? 'bg-[#FF2E5B]/[0.07] border-[#FF2E5B]/40'
              : 'bg-[#0A0C10]/60 border-white/[0.06] opacity-50'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 font-telemetry text-[11px] font-semibold uppercase tracking-[0.06em] text-[#94A3B8]">
              <Clock className="w-3.5 h-3.5 text-[#FF2E5B]" />
              Jam Aktif Caster
            </span>
            <span className="w-2.5 h-2.5 rounded-full bg-[#FF2E5B]" />
          </div>
          <div className="mt-1.5 font-display text-2xl font-bold text-[#FF2E5B] tabular-nums">
            {summary.totalHours}{' '}
            <span className="font-telemetry text-xs font-normal text-[#94A3B8]">jam</span>
          </div>
        </button>
      </div>

      {/* Recharts Area Chart */}
      <div className="mt-6 h-[280px] sm:h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 10, right: 12, left: -14, bottom: 0 }}
          >
            <defs>
              <linearGradient id="gradRegistrations" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00F0FF" stopOpacity={0.32} />
                <stop offset="95%" stopColor="#00F0FF" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="gradMatches" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#CCFF00" stopOpacity={0.28} />
                <stop offset="95%" stopColor="#CCFF00" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="gradCasterHours" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#FF2E5B" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#FF2E5B" stopOpacity={0.0} />
              </linearGradient>
            </defs>

            <CartesianGrid
              stroke="rgba(255, 255, 255, 0.06)"
              strokeDasharray="3 3"
              vertical={false}
            />

            <XAxis
              dataKey="label"
              stroke="#64748B"
              tick={{ fill: '#94A3B8', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
              tickLine={false}
              axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
              minTickGap={18}
            />

            <YAxis
              yAxisId="left"
              stroke="#64748B"
              tick={{ fill: '#94A3B8', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />

            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="#64748B"
              tick={{ fill: '#94A3B8', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(val: number) => `${val}j`}
              width={36}
            />

            <Tooltip
              content={<ActivityTooltip />}
              cursor={{ stroke: 'rgba(255,255,255,0.18)', strokeWidth: 1, strokeDasharray: '4 4' }}
            />

            {visibleSeries.registrations && (
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="registrations"
                name="Registrasi Turnamen"
                stroke="#00F0FF"
                strokeWidth={2}
                fill="url(#gradRegistrations)"
                activeDot={{ r: 5, fill: '#00F0FF', stroke: '#0A0C10', strokeWidth: 2 }}
              />
            )}

            {visibleSeries.completedMatches && (
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="completedMatches"
                name="Match Selesai"
                stroke="#CCFF00"
                strokeWidth={2}
                fill="url(#gradMatches)"
                activeDot={{ r: 5, fill: '#CCFF00', stroke: '#0A0C10', strokeWidth: 2 }}
              />
            )}

            {visibleSeries.casterHours && (
              <Area
                yAxisId="right"
                type="monotone"
                dataKey="casterHours"
                name="Jam Aktif Caster"
                stroke="#FF2E5B"
                strokeWidth={2}
                fill="url(#gradCasterHours)"
                activeDot={{ r: 5, fill: '#FF2E5B', stroke: '#0A0C10', strokeWidth: 2 }}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
};
