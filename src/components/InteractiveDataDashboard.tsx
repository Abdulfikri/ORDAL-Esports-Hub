import React, { useMemo, useState } from 'react';
import {
  ArrowDownUp,
  ArrowUpDown,
  BarChart3,
  Download,
  Filter,
  RotateCcw,
  Search,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
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
import type { AuthUser, GameTitle, MatchStatus, OrdalDatabase } from '../types';
import { formatRupiah } from './ScrimArena';

type MetricMode = 'activity' | 'squads' | 'tournaments' | 'revenue';
type ExplorerDataset = 'matches' | 'squads' | 'tournaments' | 'casters';
type SortDir = 'asc' | 'desc';

interface InteractiveDataDashboardProps {
  db: OrdalDatabase;
  mode: 'public' | 'admin';
  user?: AuthUser | null;
  onSelectTournamentId?: (tournamentId: string) => void;
}

const GAME_PALETTE: Record<string, string> = {
  'POINT BLANK': '#00F0FF',
  'FREE FIRE': '#CCFF00',
  EFOOTBALL: '#F59E0B',
};

const FALLBACK_COLORS = ['#00F0FF', '#CCFF00', '#F59E0B', '#38BDF8', '#FF2E5B'];

function getGameColor(game: string, idx: number): string {
  return GAME_PALETTE[game] || FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
}

function sanitizeCsvCell(val: string | number): string {
  const str = String(val ?? '');
  const escaped = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  return `"${escaped.replace(/"/g, '""')}"`;
}

function downloadCsvFile(filename: string, headers: string[], rows: Array<Array<string | number>>): void {
  const lines = [
    headers.map(sanitizeCsvCell).join(','),
    ...rows.map((row) => row.map(sanitizeCsvCell).join(',')),
  ];
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function parsePrizeNumber(raw: string): number {
  const digits = String(raw || '').replace(/[^\d]/g, '');
  const num = Number(digits);
  return Number.isFinite(num) ? num : 0;
}

function formatCompactCurrency(val: number): string {
  if (val >= 1_000_000) {
    const jt = val / 1_000_000;
    return `Rp ${jt % 1 === 0 ? jt.toFixed(0) : jt.toFixed(1)}jt`;
  }
  if (val >= 1_000) {
    return `Rp ${Math.round(val / 1_000)}rb`;
  }
  return `Rp ${val}`;
}

export const InteractiveDataDashboard: React.FC<InteractiveDataDashboardProps> = ({
  db,
  mode,
  user,
  onSelectTournamentId,
}) => {
  const isAdminScope = mode === 'admin' && user?.role === 'SUPER_ADMIN';

  const [selectedGame, setSelectedGame] = useState<'ALL' | GameTitle>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | MatchStatus>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [metricMode, setMetricMode] = useState<MetricMode>('activity');
  const [explorerDataset, setExplorerDataset] = useState<ExplorerDataset>('matches');
  const [selectedGameSlice, setSelectedGameSlice] = useState<string | null>(null);
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);
  const [sortField, setSortField] = useState<string>('primary');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const availableGames = useMemo<GameTitle[]>(() => {
    const set = new Set<GameTitle>();
    for (const t of db.tournaments || []) set.add(t.game);
    for (const m of db.matches || []) set.add(m.game);
    for (const s of db.scrims || []) set.add(s.game);
    return Array.from(set).sort();
  }, [db.tournaments, db.matches, db.scrims]);

  const effectiveGameFilter = selectedGameSlice || (selectedGame === 'ALL' ? null : selectedGame);
  const queryLower = searchQuery.trim().toLowerCase();

  // Filtered core collections driven by global dashboard controls
  const filteredTournaments = useMemo(() => {
    return (db.tournaments || []).filter((t) => {
      if (effectiveGameFilter && t.game !== effectiveGameFilter) return false;
      if (queryLower) {
        const matchesQuery =
          t.name.toLowerCase().includes(queryLower) ||
          t.game.toLowerCase().includes(queryLower) ||
          t.region.toLowerCase().includes(queryLower);
        if (!matchesQuery) return false;
      }
      return true;
    });
  }, [db.tournaments, effectiveGameFilter, queryLower]);

  const filteredMatches = useMemo(() => {
    return (db.matches || []).filter((m) => {
      if (effectiveGameFilter && m.game !== effectiveGameFilter) return false;
      if (statusFilter !== 'ALL' && m.status !== statusFilter) return false;
      if (queryLower) {
        const hit =
          m.teamA.toLowerCase().includes(queryLower) ||
          m.teamB.toLowerCase().includes(queryLower) ||
          m.teamATag.toLowerCase().includes(queryLower) ||
          m.teamBTag.toLowerCase().includes(queryLower) ||
          m.mapName.toLowerCase().includes(queryLower) ||
          m.round.toLowerCase().includes(queryLower);
        if (!hit) return false;
      }
      return true;
    });
  }, [db.matches, effectiveGameFilter, statusFilter, queryLower]);

  const filteredScrims = useMemo(() => {
    return (db.scrims || []).filter((s) => {
      if (effectiveGameFilter && s.game !== effectiveGameFilter) return false;
      if (queryLower) {
        const hit =
          s.hostTeamName.toLowerCase().includes(queryLower) ||
          s.challengerTeamName.toLowerCase().includes(queryLower) ||
          s.casterName.toLowerCase().includes(queryLower) ||
          s.mode.toLowerCase().includes(queryLower) ||
          s.game.toLowerCase().includes(queryLower);
        if (!hit) return false;
      }
      return true;
    });
  }, [db.scrims, effectiveGameFilter, queryLower]);

  // Squad standings computed from real matches + scrims
  const squadStats = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        name: string;
        tag: string;
        game: string;
        wins: number;
        losses: number;
        played: number;
        pointsFor: number;
        pointsAgainst: number;
        winRate: number;
      }
    >();

    const ensure = (name: string, tag: string, game: string) => {
      const cleanName = name.trim();
      const key = cleanName.toUpperCase();
      if (!map.has(key)) {
        map.set(key, {
          key,
          name: cleanName,
          tag: tag.trim() || cleanName.slice(0, 4).toUpperCase(),
          game,
          wins: 0,
          losses: 0,
          played: 0,
          pointsFor: 0,
          pointsAgainst: 0,
          winRate: 0,
        });
      }
      return map.get(key)!;
    };

    for (const sq of db.squads || []) {
      const trn = db.tournaments.find((t) => t.id === sq.tournamentId);
      const game = trn?.game || 'POINT BLANK';
      if (effectiveGameFilter && game !== effectiveGameFilter) continue;
      ensure(sq.name, sq.tag, game);
    }

    for (const m of filteredMatches) {
      if (m.status !== 'FINISHED' && m.status !== 'LIVE') continue;
      if (m.teamA === 'TBD' || m.teamB === 'TBD') continue;
      const a = ensure(m.teamA, m.teamATag, m.game);
      const b = ensure(m.teamB, m.teamBTag, m.game);
      a.pointsFor += m.scoreA;
      a.pointsAgainst += m.scoreB;
      b.pointsFor += m.scoreB;
      b.pointsAgainst += m.scoreA;
      if (m.status === 'FINISHED') {
        a.played += 1;
        b.played += 1;
        if (m.scoreA > m.scoreB || m.winnerTag === m.teamATag) {
          a.wins += 1;
          b.losses += 1;
        } else if (m.scoreB > m.scoreA || m.winnerTag === m.teamBTag) {
          b.wins += 1;
          a.losses += 1;
        }
      }
    }

    for (const s of filteredScrims) {
      if (!s.resultRecorded || !s.winnerSide) continue;
      const host = ensure(s.hostTeamName, s.hostTeamName.slice(0, 4), s.game);
      const chal = ensure(s.challengerTeamName, s.challengerTeamName.slice(0, 4), s.game);
      host.played += 1;
      chal.played += 1;
      host.pointsFor += s.hostScore || 0;
      host.pointsAgainst += s.challengerScore || 0;
      chal.pointsFor += s.challengerScore || 0;
      chal.pointsAgainst += s.hostScore || 0;
      if (s.winnerSide === 'host') {
        host.wins += 1;
        chal.losses += 1;
      } else {
        chal.wins += 1;
        host.losses += 1;
      }
    }

    return Array.from(map.values())
      .map((item) => ({
        ...item,
        winRate: item.played > 0 ? Math.round((item.wins / item.played) * 100) : 0,
      }))
      .filter((item) => {
        if (!queryLower) return true;
        return (
          item.name.toLowerCase().includes(queryLower) ||
          item.tag.toLowerCase().includes(queryLower) ||
          item.game.toLowerCase().includes(queryLower)
        );
      });
  }, [db.squads, db.tournaments, filteredMatches, filteredScrims, effectiveGameFilter, queryLower]);

  // Caster metrics
  const casterStats = useMemo(() => {
    return (db.casters || [])
      .filter((c) => {
        if (effectiveGameFilter && !c.specialtyGames.includes(effectiveGameFilter as GameTitle)) {
          return false;
        }
        if (queryLower) {
          return (
            c.name.toLowerCase().includes(queryLower) ||
            c.alias.toLowerCase().includes(queryLower) ||
            c.specialtyGames.some((g) => g.toLowerCase().includes(queryLower))
          );
        }
        return true;
      })
      .map((c) => {
        const assignedScrims = filteredScrims.filter((s) => s.casterId === c.id);
        const completedScrims = assignedScrims.filter(
          (s) =>
            (s.casterApprovalStatus === 'APPROVED' || s.casterApprovalStatus === 'NOT_REQUIRED') &&
            s.status !== 'CANCELLED'
        ).length;
        return {
          key: c.id,
          id: c.id,
          name: c.name,
          alias: c.alias,
          games: c.specialtyGames.join(' / '),
          rateCard: c.rateCard,
          assignedCount: assignedScrims.length,
          completedCount: completedScrims,
          status: c.status,
          isVerified: Boolean(c.isVerified),
          isTopCaster: Boolean(c.isTopCaster),
        };
      });
  }, [db.casters, filteredScrims, effectiveGameFilter, queryLower]);

  // Aggregate KPI metrics
  const kpis = useMemo(() => {
    const totalSlots = filteredTournaments.reduce((sum, t) => sum + (t.maxTeams || 0), 0);
    const filledSlots = filteredTournaments.reduce((sum, t) => sum + (t.registeredTeams || 0), 0);
    const occupancyPct = totalSlots > 0 ? Math.round((filledSlots / totalSlots) * 100) : 0;

    const liveCount = filteredMatches.filter((m) => m.status === 'LIVE').length;
    const finishedMatches = filteredMatches.filter((m) => m.status === 'FINISHED');
    const avgMargin =
      finishedMatches.length > 0
        ? (
            finishedMatches.reduce((acc, m) => acc + Math.abs(m.scoreA - m.scoreB), 0) /
            finishedMatches.length
          ).toFixed(1)
        : '0.0';

    const confirmedScrims = filteredScrims.filter(
      (s) => s.status === 'CONFIRMED' || s.resultRecorded
    ).length;

    const totalPrize = filteredTournaments.reduce((sum, t) => sum + parsePrizeNumber(t.prizePool), 0);

    const paidPayments = isAdminScope
      ? (db.payments || []).filter((p) => {
          if (p.status !== 'VERIFIED') return false;
          if (p.category === 'CASTER_PAYOUT' || p.category === 'SCRIM_REFUND') return false;
          if (effectiveGameFilter) {
            const sc = p.scrimId ? db.scrims.find((s) => s.id === p.scrimId) : null;
            const resolvedGame = p.game || sc?.game;
            if (resolvedGame && resolvedGame !== effectiveGameFilter) return false;
          }
          return true;
        })
      : [];
    const totalVolumeIdr = paidPayments.reduce((s, p) => s + p.amount, 0);

    return {
      tournamentsCount: filteredTournaments.length,
      filledSlots,
      totalSlots,
      occupancyPct,
      matchesCount: filteredMatches.length,
      liveCount,
      finishedCount: finishedMatches.length,
      avgMargin,
      scrimsCount: filteredScrims.length,
      confirmedScrims,
      totalPrize,
      totalVolumeIdr,
    };
  }, [
    filteredTournaments,
    filteredMatches,
    filteredScrims,
    isAdminScope,
    db.payments,
    db.scrims,
    effectiveGameFilter,
  ]);

  // Primary Chart Data
  const gameActivityChartData = useMemo(() => {
    const gamesToShow = effectiveGameFilter ? [effectiveGameFilter] : availableGames;
    return gamesToShow.map((game) => {
      const mList = filteredMatches.filter((m) => m.game === game);
      const sList = filteredScrims.filter((s) => s.game === game);
      const tList = filteredTournaments.filter((t) => t.game === game);
      const live = mList.filter((m) => m.status === 'LIVE').length;
      const finished = mList.filter((m) => m.status === 'FINISHED').length;
      const upcoming = mList.filter((m) => m.status === 'UPCOMING').length;
      const slotsFilled = tList.reduce((acc, t) => acc + t.registeredTeams, 0);
      const slotsMax = tList.reduce((acc, t) => acc + t.maxTeams, 0);
      const fillRate = slotsMax > 0 ? Math.round((slotsFilled / slotsMax) * 100) : 0;

      return {
        game,
        matchesTotal: mList.length,
        scrimsTotal: sList.length,
        liveAndUpcoming: live + upcoming,
        finished,
        slotsFilled,
        slotsMax,
        fillRate,
        prizeTotal: tList.reduce((acc, t) => acc + parsePrizeNumber(t.prizePool), 0),
      };
    });
  }, [availableGames, effectiveGameFilter, filteredMatches, filteredScrims, filteredTournaments]);

  const topSquadChartData = useMemo(() => {
    return [...squadStats]
      .sort((a, b) => b.wins - a.wins || b.winRate - a.winRate || b.pointsFor - a.pointsFor)
      .slice(0, 8)
      .map((s) => ({
        name: s.tag,
        fullName: s.name,
        wins: s.wins,
        losses: s.losses,
        winRate: s.winRate,
        pointsFor: s.pointsFor,
      }));
  }, [squadStats]);

  const revenueByGameData = useMemo(() => {
    if (!isAdminScope) return [];
    const scrimGameById = new Map((db.scrims || []).map((s) => [s.id, s.game]));
    const gamesToShow = effectiveGameFilter ? [effectiveGameFilter] : availableGames;
    return gamesToShow.map((game) => {
      let gross = 0;
      let platformFee = 0;
      let casterFee = 0;
      for (const p of db.payments || []) {
        if (p.status !== 'VERIFIED') continue;
        if (p.category === 'CASTER_PAYOUT' || p.category === 'SCRIM_REFUND') continue;
        const resolvedGame = p.game || (p.scrimId ? scrimGameById.get(p.scrimId) : undefined);
        if (resolvedGame !== game) continue;
        gross += p.amount;
        platformFee += p.platformFeeShare || 0;
        casterFee += p.casterFeeShare || 0;
      }
      return {
        game,
        gross,
        platformFee,
        casterFee,
      };
    });
  }, [isAdminScope, availableGames, effectiveGameFilter, db.scrims, db.payments]);

  // Distribution Donut Data
  const donutBreakdownData = useMemo(() => {
    if (metricMode === 'tournaments') {
      const open = filteredTournaments.filter((t) => t.status === 'OPEN').length;
      const ongoing = filteredTournaments.filter((t) => t.status === 'ONGOING').length;
      const completed = filteredTournaments.filter((t) => t.status === 'COMPLETED').length;
      return [
        { name: 'OPEN', value: open, color: '#00F0FF', filterType: 'status' as const },
        { name: 'ONGOING', value: ongoing, color: '#CCFF00', filterType: 'status' as const },
        { name: 'COMPLETED', value: completed, color: '#94A3B8', filterType: 'status' as const },
      ].filter((d) => d.value > 0);
    }

    return availableGames
      .map((game, idx) => {
        const count =
          filteredMatches.filter((m) => m.game === game).length +
          filteredScrims.filter((s) => s.game === game).length;
        return {
          name: game,
          value: count,
          color: getGameColor(game, idx),
          filterType: 'game' as const,
        };
      })
      .filter((d) => d.value > 0);
  }, [metricMode, filteredTournaments, availableGames, filteredMatches, filteredScrims]);

  const totalDonutValue = useMemo(
    () => donutBreakdownData.reduce((sum, item) => sum + item.value, 0),
    [donutBreakdownData]
  );

  // Sorted Table Rows
  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const sortedMatches = useMemo(() => {
    const arr = [...filteredMatches];
    arr.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortField === 'score') {
        return (a.scoreA + a.scoreB - (b.scoreA + b.scoreB)) * dir;
      }
      if (sortField === 'status') {
        return a.status.localeCompare(b.status) * dir;
      }
      if (sortField === 'game') {
        return a.game.localeCompare(b.game) * dir;
      }
      return a.bracketOrder - b.bracketOrder * (dir * -1);
    });
    return arr;
  }, [filteredMatches, sortField, sortDir]);

  const sortedSquads = useMemo(() => {
    const arr = [...squadStats];
    arr.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortField === 'winRate') return (a.winRate - b.winRate) * dir;
      if (sortField === 'played') return (a.played - b.played) * dir;
      if (sortField === 'name') return a.name.localeCompare(b.name) * dir;
      return (a.wins - b.wins || a.pointsFor - b.pointsFor) * dir;
    });
    return arr;
  }, [squadStats, sortField, sortDir]);

  const sortedTournaments = useMemo(() => {
    const arr = [...filteredTournaments];
    arr.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortField === 'occupancy') {
        const occA = a.maxTeams > 0 ? a.registeredTeams / a.maxTeams : 0;
        const occB = b.maxTeams > 0 ? b.registeredTeams / b.maxTeams : 0;
        return (occA - occB) * dir;
      }
      if (sortField === 'prize') {
        return (parsePrizeNumber(a.prizePool) - parsePrizeNumber(b.prizePool)) * dir;
      }
      return a.name.localeCompare(b.name) * dir;
    });
    return arr;
  }, [filteredTournaments, sortField, sortDir]);

  const sortedCasters = useMemo(() => {
    const arr = [...casterStats];
    arr.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortField === 'rateCard') return (a.rateCard - b.rateCard) * dir;
      if (sortField === 'name') return a.name.localeCompare(b.name) * dir;
      return (a.completedCount - b.completedCount || a.assignedCount - b.assignedCount) * dir;
    });
    return arr;
  }, [casterStats, sortField, sortDir]);

  const hasActiveFilters =
    selectedGame !== 'ALL' ||
    statusFilter !== 'ALL' ||
    searchQuery.trim() !== '' ||
    selectedGameSlice !== null;

  const resetAllFilters = () => {
    setSelectedGame('ALL');
    setStatusFilter('ALL');
    setSearchQuery('');
    setSelectedGameSlice(null);
    setSelectedRowKey(null);
  };

  const handleExportCurrentCsv = () => {
    if (explorerDataset === 'matches') {
      downloadCsvFile(
        'ordal-matches-analytics.csv',
        ['Game', 'Round', 'Map', 'Team A', 'Skor A', 'Team B', 'Skor B', 'Status', 'MVP'],
        sortedMatches.map((m) => [
          m.game,
          m.round,
          m.mapName,
          `${m.teamA} (${m.teamATag})`,
          m.scoreA,
          `${m.teamB} (${m.teamBTag})`,
          m.scoreB,
          m.status,
          m.mvpIgn || '-',
        ])
      );
      return;
    }
    if (explorerDataset === 'squads') {
      downloadCsvFile(
        'ordal-squad-standings.csv',
        ['Squad', 'Tag', 'Game', 'Main', 'Menang', 'Kalah', 'Win Rate %', 'Skor Masuk', 'Skor Kebobolan'],
        sortedSquads.map((s) => [
          s.name,
          s.tag,
          s.game,
          s.played,
          s.wins,
          s.losses,
          s.winRate,
          s.pointsFor,
          s.pointsAgainst,
        ])
      );
      return;
    }
    if (explorerDataset === 'tournaments') {
      downloadCsvFile(
        'ordal-tournaments-analytics.csv',
        ['Nama Turnamen', 'Game', 'Format', 'Status', 'Terdaftar', 'Kapasitas', 'Prize Pool', 'Jadwal'],
        sortedTournaments.map((t) => [
          t.name,
          t.game,
          t.format,
          t.status,
          t.registeredTeams,
          t.maxTeams,
          t.prizePool,
          t.startDate,
        ])
      );
      return;
    }
    downloadCsvFile(
      'ordal-casters-analytics.csv',
      ['Nama', 'Alias', 'Spesialisasi Game', 'Ratecard', 'Scrim Dipandu', 'Total Booking', 'Status'],
      sortedCasters.map((c) => [
        c.name,
        c.alias,
        c.games,
        c.rateCard,
        c.completedCount,
        c.assignedCount,
        c.status,
      ])
    );
  };

  const selectedDetailRecord = useMemo(() => {
    if (!selectedRowKey) return null;
    if (explorerDataset === 'matches') {
      const m = sortedMatches.find((x) => x.id === selectedRowKey);
      if (!m) return null;
      const trn = db.tournaments.find((t) => t.id === m.tournamentId);
      return {
        title: `${m.teamATag} vs ${m.teamBTag}`,
        subtitle: `${m.game} · ${m.round} · ${m.mapName}`,
        items: [
          { label: 'Turnamen', value: trn?.name || m.tournamentId },
          { label: 'Skor Pertandingan', value: `${m.scoreA} : ${m.scoreB}` },
          { label: 'Status', value: m.status },
          { label: 'MVP Match', value: m.mvpIgn || 'Belum ditetapkan' },
        ],
        tournamentId: m.tournamentId,
      };
    }
    if (explorerDataset === 'squads') {
      const s = sortedSquads.find((x) => x.key === selectedRowKey);
      if (!s) return null;
      return {
        title: `${s.name} (${s.tag})`,
        subtitle: `Kompetitor · ${s.game}`,
        items: [
          { label: 'Rekor Pertandingan', value: `${s.wins}M - ${s.losses}K (${s.played} main)` },
          { label: 'Win Rate', value: `${s.winRate}%` },
          { label: 'Selisih Skor', value: `${s.pointsFor - s.pointsAgainst >= 0 ? '+' : ''}${s.pointsFor - s.pointsAgainst}` },
          { label: 'Total Skor Masuk', value: `${s.pointsFor}` },
        ],
      };
    }
    if (explorerDataset === 'tournaments') {
      const t = sortedTournaments.find((x) => x.id === selectedRowKey);
      if (!t) return null;
      const pct = t.maxTeams > 0 ? Math.round((t.registeredTeams / t.maxTeams) * 100) : 0;
      return {
        title: t.name,
        subtitle: `${t.game} · ${t.format} · ${t.region}`,
        items: [
          { label: 'Okupansi Slot', value: `${t.registeredTeams}/${t.maxTeams} Squad (${pct}%)` },
          { label: 'Prize Pool', value: t.prizePool },
          { label: 'Status', value: t.status },
          { label: 'Jadwal Mulai', value: t.startDate },
        ],
        tournamentId: t.id,
      };
    }
    const c = sortedCasters.find((x) => x.key === selectedRowKey);
    if (!c) return null;
    return {
      title: `${c.name} (${c.alias})`,
      subtitle: `Shoutcaster · ${c.games}`,
      items: [
        { label: 'Ratecard', value: `${formatRupiah(c.rateCard)} / Match` },
        { label: 'Scrim Disetujui', value: `${c.completedCount} Sesi` },
        { label: 'Total Booking', value: `${c.assignedCount} Sesi` },
        { label: 'Ketersediaan', value: c.status },
      ],
    };
  }, [
    selectedRowKey,
    explorerDataset,
    sortedMatches,
    sortedSquads,
    sortedTournaments,
    sortedCasters,
    db.tournaments,
  ]);

  if (!isAdminScope) {
    return (
      <div className="p-8 bg-[#12161F] border border-[#FF2E5B]/35 rounded-[6px] text-center space-y-2">
        <p className="font-telemetry text-xs font-bold uppercase tracking-[0.08em] text-[#FF2E5B]">
          Akses Terbatas · Super Admin Only
        </p>
        <p className="text-sm text-[#94A3B8]">
          Interactive Data Dashboard hanya dapat diakses oleh role Super Admin.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header + Action Toolbar */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4 pb-5 border-b border-white/[0.08]">
        <div>
          <p className="font-telemetry text-xs font-semibold uppercase tracking-[0.08em] text-[#00F0FF]">
            {isAdminScope ? 'Executive Telemetry & Operations' : 'Statistik Kompetitif Arena'}
          </p>
          <h2 className="mt-1 font-display text-2xl sm:text-3xl font-bold uppercase text-[#F8FAFC] text-balance">
            Interactive Data Dashboard
          </h2>
          <p className="mt-1 text-sm text-[#94A3B8] max-w-2xl">
            Eksplorasi statistik turnamen, performa squad, aktivitas scrim, dan distribusi pertandingan secara real-time dengan filter silang.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetAllFilters}
              className="inline-flex items-center gap-1.5 px-3 min-h-[40px] border border-white/15 bg-[#12161F] hover:border-[#FF2E5B]/50 text-xs font-semibold text-[#F8FAFC] rounded-[4px] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#FF2E5B]" />
              Reset Filter
            </button>
          )}
          <button
            type="button"
            onClick={handleExportCurrentCsv}
            className="inline-flex items-center gap-2 px-4 min-h-[40px] bg-[#00F0FF] text-[#0A0C10] hover:bg-[#33F3FF] font-display text-xs font-bold uppercase tracking-[0.05em] rounded-[4px] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Cross-Filter Controls Bar */}
      <div className="bg-[#12161F] border border-white/[0.08] rounded-[6px] p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Game Filter Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#94A3B8] mr-1">
            <Filter className="w-3.5 h-3.5 text-[#00F0FF]" />
            Game:
          </span>
          <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-[#0A0C10] border border-white/[0.08] rounded-[4px]">
            <button
              type="button"
              onClick={() => {
                setSelectedGame('ALL');
                setSelectedGameSlice(null);
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-[3px] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                !effectiveGameFilter
                  ? 'bg-[#00F0FF] text-[#0A0C10]'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC]'
              }`}
            >
              Semua
            </button>
            {availableGames.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => {
                  setSelectedGame(g);
                  setSelectedGameSlice(null);
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-[3px] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  effectiveGameFilter === g
                    ? 'bg-[#00F0FF] text-[#0A0C10]'
                    : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        {/* Status Filter + Search */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex items-center gap-1 p-1 bg-[#0A0C10] border border-white/[0.08] rounded-[4px]">
            {(['ALL', 'LIVE', 'UPCOMING', 'FINISHED'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-[3px] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  statusFilter === st
                    ? 'bg-[#CCFF00] text-[#0A0C10]'
                    : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                }`}
              >
                {st === 'ALL' ? 'Semua Status' : st}
              </button>
            ))}
          </div>

          <div className="relative min-w-[210px] flex-1 sm:flex-initial">
            <Search className="w-3.5 h-3.5 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari squad, turnamen, map..."
              aria-label="Cari data di dashboard"
              className="w-full pl-8 pr-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] text-xs text-[#F8FAFC] placeholder:text-[#64748B] focus:outline-none focus:border-[#00F0FF]"
            />
          </div>
        </div>
      </div>

      {/* Interactive KPI Strip (Single-Elevation, Clickable Cross-View Triggers) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => {
            setMetricMode('tournaments');
            setExplorerDataset('tournaments');
          }}
          className="text-left p-5 bg-[#12161F] border border-white/[0.08] hover:border-[#00F0FF]/50 rounded-[6px] transition-colors cursor-pointer"
        >
          <div className="text-xs font-medium text-[#94A3B8]">Okupansi Turnamen</div>
          <div className="mt-2 font-display text-3xl font-bold text-[#00F0FF] tabular-nums">
            {kpis.occupancyPct}%
          </div>
          <div className="mt-1.5 text-xs text-[#CBD5E1] font-mono tabular-nums">
            {kpis.filledSlots}/{kpis.totalSlots} slot · {kpis.tournamentsCount} event
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setMetricMode('activity');
            setExplorerDataset('matches');
          }}
          className="text-left p-5 bg-[#12161F] border border-white/[0.08] hover:border-[#00F0FF]/50 rounded-[6px] transition-colors cursor-pointer"
        >
          <div className="text-xs font-medium text-[#94A3B8]">Pertandingan &amp; Scrim</div>
          <div className="mt-2 font-display text-3xl font-bold text-[#F8FAFC] tabular-nums">
            {kpis.matchesCount + kpis.scrimsCount}
          </div>
          <div className="mt-1.5 text-xs text-[#CBD5E1] font-mono tabular-nums">
            {kpis.liveCount} LIVE · {kpis.finishedCount} selesai · {kpis.scrimsCount} scrim
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setMetricMode('squads');
            setExplorerDataset('squads');
          }}
          className="text-left p-5 bg-[#12161F] border border-white/[0.08] hover:border-[#CCFF00]/50 rounded-[6px] transition-colors cursor-pointer"
        >
          <div className="text-xs font-medium text-[#94A3B8]">Margin Skor Rata-Rata</div>
          <div className="mt-2 font-display text-3xl font-bold text-[#CCFF00] tabular-nums">
            {kpis.avgMargin}
          </div>
          <div className="mt-1.5 text-xs text-[#CBD5E1] font-mono tabular-nums">
            {squadStats.length} squad terpantau · {kpis.confirmedScrims} scrim terkonfirmasi
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            if (isAdminScope) {
              setMetricMode('revenue');
            } else {
              setMetricMode('tournaments');
              setExplorerDataset('casters');
            }
          }}
          className="text-left p-5 bg-[#12161F] border border-white/[0.08] hover:border-[#F59E0B]/50 rounded-[6px] transition-colors cursor-pointer"
        >
          <div className="text-xs font-medium text-[#94A3B8]">
            {isAdminScope ? 'Volume Transaksi Terverifikasi' : 'Total Prize Pool Arena'}
          </div>
          <div className="mt-2 font-display text-3xl font-bold text-[#F59E0B] tabular-nums">
            {formatCompactCurrency(isAdminScope ? kpis.totalVolumeIdr : kpis.totalPrize)}
          </div>
          <div className="mt-1.5 text-xs text-[#CBD5E1] font-mono tabular-nums">
            {isAdminScope
              ? `Prize Pool: ${formatCompactCurrency(kpis.totalPrize)}`
              : `${casterStats.length} shoutcaster aktif`}
          </div>
        </button>
      </div>

      {/* Main Visualization Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Primary Interactive Chart */}
        <div className="lg:col-span-7 bg-[#12161F] border border-white/[0.08] rounded-[6px] p-5 sm:p-6 flex flex-col justify-between space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/[0.08]">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-[#00F0FF]">
                <BarChart3 className="w-4 h-4" />
                <span>
                  {metricMode === 'activity' && 'Aktivitas Match & Scrim per Game'}
                  {metricMode === 'squads' && 'Peringkat Kemenangan Squad'}
                  {metricMode === 'tournaments' && 'Okupansi Slot Turnamen (%)'}
                  {metricMode === 'revenue' && 'Perbandingan Gross Volume & Fee per Game'}
                </span>
              </div>
              <p className="text-xs text-[#94A3B8] mt-0.5">
                Klik grafik atau pilih mode metrik di samping untuk memfilter data tabel di bawah.
              </p>
            </div>

            {/* Metric Mode Switcher */}
            <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-[#0A0C10] border border-white/[0.08] rounded-[4px] shrink-0">
              {(
                [
                  { id: 'activity', label: 'Aktivitas' },
                  { id: 'squads', label: 'Squad' },
                  { id: 'tournaments', label: 'Turnamen' },
                  ...(isAdminScope ? [{ id: 'revenue' as const, label: 'Revenue' }] : []),
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setMetricMode(tab.id)}
                  className={`px-2.5 py-1.5 text-xs font-semibold rounded-[3px] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    metricMode === tab.id
                      ? 'bg-[#00F0FF] text-[#0A0C10]'
                      : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="h-[290px] w-full">
            {metricMode === 'activity' && (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={gameActivityChartData}
                  margin={{ top: 10, right: 12, left: -12, bottom: 0 }}
                  onClick={(state) => {
                    const clickedGame = state?.activeLabel;
                    if (typeof clickedGame === 'string' && clickedGame) {
                      setSelectedGameSlice((prev) => (prev === clickedGame ? null : clickedGame));
                    }
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis
                    dataKey="game"
                    tick={{ fill: '#94A3B8', fontSize: 11 }}
                    axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: '#94A3B8', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0A0C10',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: '#F8FAFC',
                    }}
                  />
                  <Bar
                    dataKey="matchesTotal"
                    name="Match Turnamen"
                    fill="#00F0FF"
                    radius={[4, 4, 0, 0]}
                    barSize={28}
                  />
                  <Bar
                    dataKey="scrimsTotal"
                    name="Sesi Scrim"
                    fill="#CCFF00"
                    radius={[4, 4, 0, 0]}
                    barSize={28}
                  />
                  <Line
                    type="monotone"
                    dataKey="finished"
                    name="Match Selesai"
                    stroke="#F59E0B"
                    strokeWidth={2}
                    dot={{ r: 4, fill: '#F59E0B' }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}

            {metricMode === 'squads' && (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={topSquadChartData}
                  margin={{ top: 10, right: 12, left: -12, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: '#94A3B8', fontSize: 11 }}
                    axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: '#94A3B8', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0A0C10',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: '#F8FAFC',
                    }}
                  />
                  <Bar dataKey="wins" name="Menang" fill="#CCFF00" radius={[4, 4, 0, 0]} barSize={24} />
                  <Bar dataKey="losses" name="Kalah" fill="#FF2E5B" radius={[4, 4, 0, 0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
            )}

            {metricMode === 'tournaments' && (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={gameActivityChartData}
                  margin={{ top: 10, right: 12, left: -12, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="fillRateGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00F0FF" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#00F0FF" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis
                    dataKey="game"
                    tick={{ fill: '#94A3B8', fontSize: 11 }}
                    axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tickFormatter={(v) => `${v}%`}
                    tick={{ fill: '#94A3B8', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(val: unknown) => [`${val}%`, 'Okupansi Slot']}
                    contentStyle={{
                      backgroundColor: '#0A0C10',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: '#F8FAFC',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="fillRate"
                    name="Okupansi Slot"
                    stroke="#00F0FF"
                    strokeWidth={2}
                    fill="url(#fillRateGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}

            {metricMode === 'revenue' && isAdminScope && (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={revenueByGameData}
                  margin={{ top: 10, right: 12, left: 4, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis
                    dataKey="game"
                    tick={{ fill: '#94A3B8', fontSize: 11 }}
                    axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) => formatCompactCurrency(Number(v))}
                    tick={{ fill: '#94A3B8', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(val: unknown) => formatRupiah(Number(val) || 0)}
                    contentStyle={{
                      backgroundColor: '#0A0C10',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: '#F8FAFC',
                    }}
                  />
                  <Bar dataKey="gross" name="Total Transaksi" fill="#00F0FF" radius={[4, 4, 0, 0]} barSize={24} />
                  <Bar dataKey="platformFee" name="Lobby Fee ORDAL" fill="#CCFF00" radius={[4, 4, 0, 0]} barSize={24} />
                  <Bar dataKey="casterFee" name="Honor Caster" fill="#F59E0B" radius={[4, 4, 0, 0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Interactive Proportion Donut + Clickable Legend */}
        <div className="lg:col-span-5 bg-[#12161F] border border-white/[0.08] rounded-[6px] p-5 sm:p-6 flex flex-col justify-between space-y-5">
          <div className="pb-4 border-b border-white/[0.08] flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-[#CCFF00]">
                <TrendingUp className="w-4 h-4" />
                <span>
                  {metricMode === 'tournaments'
                    ? 'Proporsi Status Turnamen'
                    : 'Distribusi Aktivitas per Game'}
                </span>
              </div>
              <p className="text-xs text-[#94A3B8] mt-0.5">
                Klik item di daftar untuk mengisolasi data pada satu segmen.
              </p>
            </div>
            {selectedGameSlice && (
              <button
                type="button"
                onClick={() => setSelectedGameSlice(null)}
                className="text-xs font-semibold text-[#00F0FF] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
              >
                Tampilkan Semua
              </button>
            )}
          </div>

          <div className="h-[190px] w-full">
            {donutBreakdownData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutBreakdownData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={80}
                    paddingAngle={3}
                    onClick={(entry: { name?: string; filterType?: string }) => {
                      if (entry?.filterType === 'game' && entry.name) {
                        setSelectedGameSlice((prev) => (prev === entry.name ? null : entry.name!));
                      }
                    }}
                  >
                    {donutBreakdownData.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={entry.color}
                        opacity={
                          selectedGameSlice && entry.filterType === 'game' && selectedGameSlice !== entry.name
                            ? 0.35
                            : 1
                        }
                        className="cursor-pointer"
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0A0C10',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: '#F8FAFC',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-[#94A3B8]">
                Tidak ada data yang sesuai dengan filter saat ini.
              </div>
            )}
          </div>

          <div className="divide-y divide-white/[0.06] border-t border-white/[0.06]">
            {donutBreakdownData.map((item) => {
              const pct = totalDonutValue > 0 ? Math.round((item.value / totalDonutValue) * 100) : 0;
              const isSelected = selectedGameSlice === item.name;
              return (
                <button
                  key={item.name}
                  type="button"
                  onClick={() => {
                    if (item.filterType === 'game') {
                      setSelectedGameSlice((prev) => (prev === item.name ? null : item.name));
                    }
                  }}
                  className={`w-full py-2.5 px-2 flex items-center justify-between text-xs transition-colors cursor-pointer ${
                    isSelected ? 'bg-[#00F0FF]/10 text-[#F8FAFC]' : 'hover:bg-white/[0.03] text-[#CBD5E1]'
                  }`}
                >
                  <span className="flex items-center gap-2.5 font-medium">
                    <span
                      className="w-2.5 h-2.5 rounded-[2px] shrink-0"
                      style={{ backgroundColor: item.color }}
                      aria-hidden="true"
                    />
                    <span>{item.name}</span>
                  </span>
                  <span className="font-mono tabular-nums text-[#F8FAFC]">
                    {item.value} ({pct}%)
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Interactive Data Explorer Table + Drill-Down Detail */}
      <div className="bg-[#12161F] border border-white/[0.08] rounded-[6px] overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-bold uppercase text-[#F8FAFC]">
              Eksplorasi Data Detail
            </h3>
            <p className="text-xs text-[#94A3B8]">
              Klik header kolom untuk mengurutkan atau klik baris untuk melihat ringkasan detail.
            </p>
          </div>

          <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-[#0A0C10] border border-white/[0.08] rounded-[4px]">
            {(
              [
                { id: 'matches', label: `Match (${sortedMatches.length})` },
                { id: 'squads', label: `Squad (${sortedSquads.length})` },
                { id: 'tournaments', label: `Turnamen (${sortedTournaments.length})` },
                { id: 'casters', label: `Caster (${sortedCasters.length})` },
              ] as const
            ).map((ds) => (
              <button
                key={ds.id}
                type="button"
                onClick={() => {
                  setExplorerDataset(ds.id);
                  setSelectedRowKey(null);
                  setSortField('primary');
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-[3px] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  explorerDataset === ds.id
                    ? 'bg-[#00F0FF] text-[#0A0C10]'
                    : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                }`}
              >
                {ds.label}
              </button>
            ))}
          </div>
        </div>

        {/* Drill-Down Inspector Banner when a row is clicked */}
        {selectedDetailRecord && (
          <div className="px-5 py-4 bg-[#0A0C10] border-b border-white/[0.08] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-xs text-[#94A3B8]">{selectedDetailRecord.subtitle}</div>
              <div className="font-display text-xl font-bold uppercase text-[#F8FAFC]">
                {selectedDetailRecord.title}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-6">
              {selectedDetailRecord.items.map((kv) => (
                <div key={kv.label}>
                  <div className="text-[11px] text-[#94A3B8]">{kv.label}</div>
                  <div className="text-xs font-semibold text-[#F8FAFC] font-mono tabular-nums mt-0.5">
                    {kv.value}
                  </div>
                </div>
              ))}
              {selectedDetailRecord.tournamentId && onSelectTournamentId && (
                <button
                  type="button"
                  onClick={() => onSelectTournamentId(selectedDetailRecord.tournamentId!)}
                  className="px-3 py-1.5 bg-[#00F0FF]/15 border border-[#00F0FF]/40 text-[#00F0FF] hover:bg-[#00F0FF] hover:text-[#0A0C10] text-xs font-semibold rounded-[4px] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Buka Turnamen
                </button>
              )}
              <button
                type="button"
                aria-label="Tutup detail baris"
                onClick={() => setSelectedRowKey(null)}
                className="p-1.5 text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          {explorerDataset === 'matches' && (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/[0.08] text-xs font-semibold text-[#94A3B8] bg-[#0A0C10]/60">
                  <th className="py-3 px-4">
                    <button
                      type="button"
                      onClick={() => toggleSort('game')}
                      className="inline-flex items-center gap-1 hover:text-[#F8FAFC] cursor-pointer"
                    >
                      Game / Babak
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-3 px-4">Pertandingan</th>
                  <th className="py-3 px-4">Map</th>
                  <th className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => toggleSort('score')}
                      className="inline-flex items-center gap-1 hover:text-[#F8FAFC] cursor-pointer"
                    >
                      Skor
                      <ArrowDownUp className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => toggleSort('status')}
                      className="inline-flex items-center gap-1 hover:text-[#F8FAFC] cursor-pointer"
                    >
                      Status
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06] text-xs">
                {sortedMatches.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 px-4 text-center text-[#94A3B8]">
                      Tidak ada data pertandingan yang cocok dengan filter Anda.
                    </td>
                  </tr>
                ) : (
                  sortedMatches.map((m) => (
                    <tr
                      key={m.id}
                      onClick={() => setSelectedRowKey((prev) => (prev === m.id ? null : m.id))}
                      className={`transition-colors cursor-pointer ${
                        selectedRowKey === m.id ? 'bg-[#00F0FF]/10' : 'hover:bg-white/[0.03]'
                      }`}
                    >
                      <td className="py-3 px-4 text-[#CBD5E1] whitespace-nowrap">
                        <span className="font-medium text-[#F8FAFC]">{m.game}</span>
                        <span className="text-[#64748B] mx-1.5">·</span>
                        <span className="text-[#94A3B8]">{m.round}</span>
                      </td>
                      <td className="py-3 px-4 font-semibold text-[#F8FAFC]">
                        {m.teamATag} <span className="text-[#64748B] font-normal">vs</span> {m.teamBTag}
                      </td>
                      <td className="py-3 px-4 text-[#94A3B8]">{m.mapName}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-[#00F0FF] tabular-nums">
                        {m.scoreA} : {m.scoreB}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-semibold whitespace-nowrap ${
                          m.status === 'LIVE'
                            ? 'text-[#FF2E5B]'
                            : m.status === 'FINISHED'
                              ? 'text-[#CCFF00]'
                              : 'text-[#94A3B8]'
                        }`}
                      >
                        {m.status}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {explorerDataset === 'squads' && (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/[0.08] text-xs font-semibold text-[#94A3B8] bg-[#0A0C10]/60">
                  <th className="py-3 px-4">
                    <button
                      type="button"
                      onClick={() => toggleSort('name')}
                      className="inline-flex items-center gap-1 hover:text-[#F8FAFC] cursor-pointer"
                    >
                      Nama Squad
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-3 px-4">Game</th>
                  <th className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => toggleSort('played')}
                      className="inline-flex items-center gap-1 hover:text-[#F8FAFC] cursor-pointer"
                    >
                      Main
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-3 px-4 text-right">Menang / Kalah</th>
                  <th className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => toggleSort('winRate')}
                      className="inline-flex items-center gap-1 hover:text-[#F8FAFC] cursor-pointer"
                    >
                      Win Rate
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06] text-xs">
                {sortedSquads.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 px-4 text-center text-[#94A3B8]">
                      Belum ada statistik squad untuk filter yang dipilih.
                    </td>
                  </tr>
                ) : (
                  sortedSquads.map((s) => (
                    <tr
                      key={s.key}
                      onClick={() => setSelectedRowKey((prev) => (prev === s.key ? null : s.key))}
                      className={`transition-colors cursor-pointer ${
                        selectedRowKey === s.key ? 'bg-[#00F0FF]/10' : 'hover:bg-white/[0.03]'
                      }`}
                    >
                      <td className="py-3 px-4 font-semibold text-[#F8FAFC]">
                        {s.name}{' '}
                        <span className="text-[#94A3B8] font-mono font-normal">({s.tag})</span>
                      </td>
                      <td className="py-3 px-4 text-[#94A3B8]">{s.game}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-[#F8FAFC]">
                        {s.played}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-[#CBD5E1]">
                        {s.wins}M · {s.losses}K
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold tabular-nums text-[#CCFF00]">
                        {s.winRate}%
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {explorerDataset === 'tournaments' && (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/[0.08] text-xs font-semibold text-[#94A3B8] bg-[#0A0C10]/60">
                  <th className="py-3 px-4">Nama Turnamen</th>
                  <th className="py-3 px-4">Game / Format</th>
                  <th className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => toggleSort('occupancy')}
                      className="inline-flex items-center gap-1 hover:text-[#F8FAFC] cursor-pointer"
                    >
                      Okupansi Slot
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => toggleSort('prize')}
                      className="inline-flex items-center gap-1 hover:text-[#F8FAFC] cursor-pointer"
                    >
                      Prize Pool
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-3 px-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06] text-xs">
                {sortedTournaments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 px-4 text-center text-[#94A3B8]">
                      Tidak ada turnamen yang cocok dengan filter pencarian.
                    </td>
                  </tr>
                ) : (
                  sortedTournaments.map((t) => {
                    const pct =
                      t.maxTeams > 0 ? Math.round((t.registeredTeams / t.maxTeams) * 100) : 0;
                    return (
                      <tr
                        key={t.id}
                        onClick={() => setSelectedRowKey((prev) => (prev === t.id ? null : t.id))}
                        className={`transition-colors cursor-pointer ${
                          selectedRowKey === t.id ? 'bg-[#00F0FF]/10' : 'hover:bg-white/[0.03]'
                        }`}
                      >
                        <td className="py-3 px-4 font-semibold text-[#F8FAFC]">{t.name}</td>
                        <td className="py-3 px-4 text-[#94A3B8]">
                          {t.game} · {t.format}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-[#00F0FF]">
                          {t.registeredTeams}/{t.maxTeams} ({pct}%)
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-[#CCFF00]">
                          {t.prizePool}
                        </td>
                        <td className="py-3 px-4 text-right font-semibold text-[#CBD5E1]">
                          {t.status}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}

          {explorerDataset === 'casters' && (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/[0.08] text-xs font-semibold text-[#94A3B8] bg-[#0A0C10]/60">
                  <th className="py-3 px-4">
                    <button
                      type="button"
                      onClick={() => toggleSort('name')}
                      className="inline-flex items-center gap-1 hover:text-[#F8FAFC] cursor-pointer"
                    >
                      Shoutcaster
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-3 px-4">Spesialisasi</th>
                  <th className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => toggleSort('rateCard')}
                      className="inline-flex items-center gap-1 hover:text-[#F8FAFC] cursor-pointer"
                    >
                      Ratecard
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-3 px-4 text-right">Scrim Dipandu</th>
                  <th className="py-3 px-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06] text-xs">
                {sortedCasters.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 px-4 text-center text-[#94A3B8]">
                      Tidak ada data shoutcaster untuk filter saat ini.
                    </td>
                  </tr>
                ) : (
                  sortedCasters.map((c) => (
                    <tr
                      key={c.key}
                      onClick={() => setSelectedRowKey((prev) => (prev === c.key ? null : c.key))}
                      className={`transition-colors cursor-pointer ${
                        selectedRowKey === c.key ? 'bg-[#00F0FF]/10' : 'hover:bg-white/[0.03]'
                      }`}
                    >
                      <td className="py-3 px-4 font-semibold text-[#F8FAFC]">
                        {c.name}{' '}
                        <span className="text-[#94A3B8] font-mono font-normal">({c.alias})</span>
                      </td>
                      <td className="py-3 px-4 text-[#94A3B8]">{c.games}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-[#CCFF00]">
                        {formatRupiah(c.rateCard)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-[#00F0FF]">
                        {c.completedCount} / {c.assignedCount}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-[#CBD5E1]">
                        {c.status}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
