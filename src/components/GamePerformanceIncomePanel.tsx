import React, { useEffect, useState } from 'react';
import { Lock, RefreshCw } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../api';
import type { AdminGameAnalyticsResponse, AuthUser, OrdalDatabase } from '../types';
import { formatRupiah } from './ScrimArena';

interface GamePerformanceIncomePanelProps {
  user: AuthUser;
  db: OrdalDatabase;
}

const GAME_COLORS = [
  '#00F0FF',
  '#CCFF00',
  '#FF2E5B',
  '#F59E0B',
  '#38BDF8',
  '#A78BFA',
  '#34D399',
];

function formatCompactIdr(value: number): string {
  if (value >= 1_000_000) {
    const jt = value / 1_000_000;
    return `Rp ${jt % 1 === 0 ? jt.toFixed(0) : jt.toFixed(1)}jt`;
  }
  if (value >= 1_000) {
    return `Rp ${Math.round(value / 1_000)}rb`;
  }
  return `Rp ${value}`;
}

export const GamePerformanceIncomePanel: React.FC<GamePerformanceIncomePanelProps> = ({
  user,
  db,
}) => {
  const [selectedGame, setSelectedGame] = useState<string>('ALL');
  const [data, setData] = useState<AdminGameAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const isSuperAdmin = user.role === 'SUPER_ADMIN';

  // Refresh whenever selectedGame or underlying db counts change
  const dbFingerprint = `${db.tournaments.length}-${db.scrims.length}-${db.matches.length}-${db.squads.length}`;

  useEffect(() => {
    if (!isSuperAdmin) return;
    let active = true;
    setLoading(true);
    setError('');
    api
      .getAdminGameAnalytics(selectedGame)
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Gagal memuat analitik game & income.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isSuperAdmin, selectedGame, dbFingerprint]);

  // Strict RBAC guard: never render for non-SUPER_ADMIN roles
  if (!isSuperAdmin) return null;

  const summary = data?.summary;
  const rows = data?.byGame || [];
  const availableGames = data?.availableGames || [];

  const barChartData = rows.map((r) => ({
    game: r.game,
    netOrdal: r.netOrdalIncome,
    casterVolume: r.casterFeeVolume,
    gross: r.grossIncome,
    scrims: r.scrimsCount,
    confirmed: r.confirmedScrimsCount,
  }));

  const isSingleGame = selectedGame !== 'ALL';
  const singleRow = isSingleGame ? rows[0] : null;

  const donutData = isSingleGame
    ? [
        {
          name: 'Lobby Fee ORDAL',
          value: singleRow?.lobbyFeeIncome || 0,
          color: '#CCFF00',
        },
        {
          name: 'Caster Fee Volume',
          value: singleRow?.casterFeeVolume || 0,
          color: '#00F0FF',
        },
        ...(singleRow && singleRow.tournamentFeeIncome > 0
          ? [
              {
                name: 'Biaya Daftar Turnamen',
                value: singleRow.tournamentFeeIncome,
                color: '#F59E0B',
              },
            ]
          : []),
      ].filter((d) => d.value > 0)
    : rows
        .map((r, idx) => ({
          name: r.game,
          value: r.grossIncome,
          color: GAME_COLORS[idx % GAME_COLORS.length],
        }))
        .filter((d) => d.value > 0);

  const safeDonutData =
    donutData.length > 0
      ? donutData
      : [{ name: 'Belum Ada Income', value: 1, color: '#1E293B' }];

  return (
    <section className="bg-[#12161F] border border-white/[0.08] rounded-[6px] p-5 sm:p-6 space-y-6">
      {/* Header + Super Admin Scope */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-white/[0.08]">
        <div>
          <div className="flex items-center gap-2 font-telemetry text-[11px] font-semibold uppercase tracking-[0.08em] text-[#CCFF00]">
            <Lock className="w-3.5 h-3.5" />
            <span>Super Admin Only</span>
            <span aria-hidden="true" className="text-white/25">
              ·
            </span>
            <span className="text-[#94A3B8]">Game Performance &amp; Revenue Telemetry</span>
          </div>
          <h2 className="mt-1 font-display text-xl sm:text-2xl font-bold uppercase text-[#F8FAFC]">
            Performa Game &amp; Income Keseluruhan
          </h2>
          <p className="mt-0.5 font-telemetry text-xs text-[#94A3B8]">
            Ringkasan pendapatan kotor (GMV), net lobby fee ORDAL, volume caster, dan aktivitas turnamen per judul game.
          </p>
        </div>

        {/* Game Filter Bar */}
        <div className="flex items-center gap-1.5 flex-wrap bg-[#0A0C10] border border-white/[0.08] rounded-[4px] p-1">
          <button
            type="button"
            onClick={() => setSelectedGame('ALL')}
            className={`px-3 py-1.5 font-telemetry text-[11px] font-bold uppercase rounded-[3px] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              selectedGame === 'ALL'
                ? 'bg-[#CCFF00] text-[#0A0C10]'
                : 'text-[#94A3B8] hover:text-[#F8FAFC]'
            }`}
          >
            Semua Game
          </button>
          {availableGames.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setSelectedGame(g)}
              className={`px-3 py-1.5 font-telemetry text-[11px] font-bold uppercase rounded-[3px] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                selectedGame === g
                  ? 'bg-[#00F0FF] text-[#0A0C10]'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC]'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="p-5 bg-[#0A0C10] border border-[#FF2E5B]/40 rounded-[6px] font-telemetry text-xs text-[#FF2E5B]">
          {error}
        </div>
      ) : loading && !data ? (
        <div className="py-12 flex items-center justify-center gap-2 font-telemetry text-xs text-[#94A3B8]">
          <RefreshCw className="w-4 h-4 animate-spin text-[#00F0FF]" />
          Memuat data performa game &amp; income...
        </div>
      ) : (
        <>
          {/* 4-Column KPI Summary Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-4 bg-[#0A0C10] border border-white/[0.08] rounded-[6px]">
              <div className="font-telemetry text-[11px] uppercase tracking-[0.06em] text-[#94A3B8]">
                Gross Income (GMV)
              </div>
              <div className="mt-1.5 font-display text-2xl sm:text-3xl font-bold text-[#00F0FF] tabular-nums">
                {formatRupiah(summary?.grossIncome || 0)}
              </div>
              <div className="mt-1 font-telemetry text-[11px] text-[#94A3B8] tabular-nums">
                Caster Vol: {formatRupiah(summary?.casterFeeVolume || 0)}
              </div>
            </div>

            <div className="p-4 bg-[#0A0C10] border border-white/[0.08] rounded-[6px]">
              <div className="font-telemetry text-[11px] uppercase tracking-[0.06em] text-[#94A3B8]">
                Net Income ORDAL
              </div>
              <div className="mt-1.5 font-display text-2xl sm:text-3xl font-bold text-[#CCFF00] tabular-nums">
                {formatRupiah(summary?.netOrdalIncome || 0)}
              </div>
              <div className="mt-1 font-telemetry text-[11px] text-[#94A3B8] tabular-nums">
                Lobby Fee: {formatRupiah(summary?.lobbyFeeIncome || 0)}
              </div>
            </div>

            <div className="p-4 bg-[#0A0C10] border border-white/[0.08] rounded-[6px]">
              <div className="font-telemetry text-[11px] uppercase tracking-[0.06em] text-[#94A3B8]">
                Total Aktivitas Match
              </div>
              <div className="mt-1.5 font-display text-2xl sm:text-3xl font-bold text-[#F8FAFC] tabular-nums">
                {(summary?.scrimsCount || 0) + (summary?.tournamentMatchesCount || 0)}
              </div>
              <div className="mt-1 font-telemetry text-[11px] text-[#94A3B8] tabular-nums">
                {summary?.scrimsCount || 0} Scrim · {summary?.tournamentMatchesCount || 0} Match Turnamen
              </div>
            </div>

            <div className="p-4 bg-[#0A0C10] border border-white/[0.08] rounded-[6px]">
              <div className="font-telemetry text-[11px] uppercase tracking-[0.06em] text-[#94A3B8]">
                Scrim Confirmation Rate
              </div>
              <div className="mt-1.5 font-display text-2xl sm:text-3xl font-bold text-[#F8FAFC] tabular-nums">
                {summary?.scrimCompletionRate || 0}%
              </div>
              <div className="mt-1 font-telemetry text-[11px] text-[#94A3B8] tabular-nums">
                {summary?.confirmedScrimsCount || 0}/{summary?.scrimsCount || 0} Confirmed ·{' '}
                {summary?.squadsCount || 0} Squad
              </div>
            </div>
          </div>

          {/* Recharts Grid: Stacked Income Bar + Income Share Donut */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            <div className="lg:col-span-8 p-5 bg-[#0A0C10] border border-white/[0.08] rounded-[6px] flex flex-col justify-between">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-display text-lg font-bold uppercase text-[#F8FAFC]">
                    Komposisi Income per Game
                  </h3>
                  <p className="mt-0.5 font-telemetry text-xs text-[#94A3B8]">
                    Net Income ORDAL (Lobby Fee) vs Volume Honor Caster
                  </p>
                </div>
                <div className="flex items-center gap-4 font-telemetry text-[11px] text-[#94A3B8]">
                  <span className="text-[#CCFF00]">■ Net ORDAL</span>
                  <span className="text-[#00F0FF]">■ Caster Volume</span>
                </div>
              </div>

              <div className="h-[250px] w-full mt-4">
                {barChartData.length === 0 ? (
                  <div className="h-full flex items-center justify-center font-telemetry text-xs text-[#94A3B8]">
                    Belum ada data income pada filter game ini.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={barChartData}
                      margin={{ top: 10, right: 12, left: 4, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis
                        dataKey="game"
                        tick={{ fill: '#94A3B8', fontSize: 11 }}
                        axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={formatCompactIdr}
                        tick={{ fill: '#94A3B8', fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        width={68}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#12161F',
                          borderColor: 'rgba(255,255,255,0.14)',
                          borderRadius: 6,
                          fontSize: 12,
                          color: '#F8FAFC',
                        }}
                        formatter={(val: unknown, name: unknown) => [
                          formatRupiah(Number(val) || 0),
                          String(name),
                        ]}
                      />
                      <Bar
                        dataKey="netOrdal"
                        name="Net Income ORDAL"
                        stackId="income"
                        fill="#CCFF00"
                        maxBarSize={44}
                      />
                      <Bar
                        dataKey="casterVolume"
                        name="Caster Fee Volume"
                        stackId="income"
                        fill="#00F0FF"
                        radius={[3, 3, 0, 0]}
                        maxBarSize={44}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="lg:col-span-4 p-5 bg-[#0A0C10] border border-white/[0.08] rounded-[6px] flex flex-col justify-between">
              <div>
                <h3 className="font-display text-lg font-bold uppercase text-[#F8FAFC]">
                  {isSingleGame ? `Rincian ${selectedGame}` : 'Distribusi Gross Income'}
                </h3>
                <p className="mt-0.5 font-telemetry text-xs text-[#94A3B8]">
                  {isSingleGame
                    ? 'Proporsi Net ORDAL vs Caster Volume'
                    : 'Kontribusi pendapatan tiap judul game'}
                </p>
              </div>

              <div className="relative h-[210px] w-full mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={safeDonutData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={58}
                      outerRadius={82}
                      paddingAngle={donutData.length > 1 ? 3 : 0}
                      stroke="none"
                    >
                      {safeDonutData.map((entry, idx) => (
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
                      formatter={(val: unknown, name: unknown) => [
                        formatRupiah(Number(val) || 0),
                        String(name),
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>

                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-4 text-center">
                  <span className="font-display text-lg sm:text-xl font-bold text-[#F8FAFC] tabular-nums">
                    {formatCompactIdr(summary?.grossIncome || 0)}
                  </span>
                  <span className="font-telemetry text-[10px] uppercase text-[#94A3B8]">
                    Gross Income
                  </span>
                </div>
              </div>

              <div className="mt-2 pt-3 border-t border-white/[0.06] space-y-1.5 font-telemetry text-[11px] tabular-nums">
                {donutData.slice(0, 4).map((item) => (
                  <div key={item.name} className="flex items-center justify-between gap-2">
                    <span className="truncate" style={{ color: item.color }}>
                      {item.name}
                    </span>
                    <span className="text-[#F8FAFC] font-semibold">
                      {formatRupiah(item.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* High-Density Per-Game Breakdown Table */}
          <div className="overflow-x-auto border border-white/[0.08] rounded-[6px] bg-[#0A0C10]">
            <table className="w-full text-left border-collapse min-w-[760px]">
              <thead>
                <tr className="border-b border-white/[0.08] font-telemetry text-[11px] uppercase tracking-[0.06em] text-[#94A3B8]">
                  <th className="py-2.5 px-4 font-semibold">Game</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Turnamen</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Squad</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Scrim (Conf/Total)</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Rate</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Net ORDAL</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Caster Vol</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Gross Income</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06] font-telemetry text-xs tabular-nums">
                {rows.map((r) => (
                  <tr
                    key={r.game}
                    onClick={() => setSelectedGame((prev) => (prev === r.game ? 'ALL' : r.game))}
                    className={`hover:bg-white/[0.03] transition-colors cursor-pointer ${
                      selectedGame === r.game ? 'bg-[#00F0FF]/[0.05]' : ''
                    }`}
                  >
                    <td className="py-3 px-4 font-display text-sm font-bold uppercase text-[#F8FAFC]">
                      {r.game}
                    </td>
                    <td className="py-3 px-4 text-right text-[#E2E2E8]">{r.tournamentsCount}</td>
                    <td className="py-3 px-4 text-right text-[#E2E2E8]">{r.squadsCount}</td>
                    <td className="py-3 px-4 text-right text-[#E2E2E8]">
                      {r.confirmedScrimsCount} / {r.scrimsCount}
                    </td>
                    <td className="py-3 px-4 text-right text-[#00F0FF] font-semibold">
                      {r.scrimCompletionRate}%
                    </td>
                    <td className="py-3 px-4 text-right text-[#CCFF00] font-bold">
                      {formatRupiah(r.netOrdalIncome)}
                    </td>
                    <td className="py-3 px-4 text-right text-[#94A3B8]">
                      {formatRupiah(r.casterFeeVolume)}
                    </td>
                    <td className="py-3 px-4 text-right text-[#F8FAFC] font-bold">
                      {formatRupiah(r.grossIncome)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
};
