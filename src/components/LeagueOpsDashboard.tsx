import React, { useMemo, useState } from 'react';
import {
  Check,
  ExternalLink,
  FileSpreadsheet,
  GitBranch,
  LayoutDashboard,
  LogOut,
  Menu,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import { api } from '../api';
import type {
  AuthUser,
  BracketRound,
  CheckInStatus,
  GameTitle,
  Match,
  MatchStatus,
  OrdalDatabase,
  Squad,
  Tournament,
  TournamentFormat,
  TournamentStatus,
} from '../types';
import { OrdalMonogram, OrdalWordmark } from './BrandAssets';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import { LiveBracketCanvas } from './LiveBracketCanvas';
import { TournamentDetailHub } from './TournamentDetailHub';
import { TwoFactorManagerCard } from './TwoFactorManagerCard';
import { useEscapeKey } from '../hooks/useEscapeKey';

type LeagueOpsTab = 'overview' | 'tournaments' | 'matches' | 'squads';

interface LeagueOpsDashboardProps {
  user: AuthUser;
  db: OrdalDatabase;
  onUserUpdated?: (user: AuthUser) => void;
  onRefresh: () => Promise<void>;
  onBackToSite: () => void;
  onLogout: () => void;
  onNotify: (msg: string) => void;
}

const NAV_ITEMS: {
  id: LeagueOpsTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'overview', label: 'Overview Turnamen', icon: LayoutDashboard },
  { id: 'tournaments', label: 'Tournament Builder', icon: Trophy },
  { id: 'matches', label: 'Live Matches & Bracket', icon: GitBranch },
  { id: 'squads', label: 'Roster & Squads', icon: Users },
];

export const LeagueOpsDashboard: React.FC<LeagueOpsDashboardProps> = ({
  user,
  db,
  onUserUpdated,
  onRefresh,
  onBackToSite,
  onLogout,
  onNotify,
}) => {
  const [activeTab, setActiveTab] = useState<LeagueOpsTab>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [squadTournamentFilter, setSquadTournamentFilter] = useState<string>('ALL');
  const [selectedBracketTournamentId, setSelectedBracketTournamentId] = useState<string>('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkCheckingIn, setBulkCheckingIn] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [previewTournament, setPreviewTournament] = useState<Tournament | null>(null);
  const [twoFactorModalOpen, setTwoFactorModalOpen] = useState(false);
  const [confirmBracketTarget, setConfirmBracketTarget] = useState<{
    trn: Tournament;
    existingCount: number;
  } | null>(null);

  // Create / Edit Modal
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState<Record<string, string | number>>({});
  const [modalError, setModalError] = useState('');
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<{
    tab: Exclude<LeagueOpsTab, 'overview'>;
    id: string;
    label: string;
  } | null>(null);
  const [deletingTarget, setDeletingTarget] = useState(false);

  useEscapeKey(
    Boolean(!deleteTarget && (twoFactorModalOpen || confirmBracketTarget || modalMode)),
    () => {
      if (twoFactorModalOpen) {
        setTwoFactorModalOpen(false);
      } else if (confirmBracketTarget) {
        if (busyId !== confirmBracketTarget.trn.id) setConfirmBracketTarget(null);
      } else if (modalMode && !saving) {
        setModalMode(null);
        setEditingId(null);
        setModalError('');
        setFormState({});
      }
    }
  );

  const q = searchQuery.trim().toLowerCase();

  const filteredTournaments = useMemo(
    () =>
      db.tournaments.filter(
        (t) =>
          !q ||
          t.name.toLowerCase().includes(q) ||
          t.game.toLowerCase().includes(q) ||
          (t.organizer || '').toLowerCase().includes(q)
      ),
    [db.tournaments, q]
  );

  const filteredMatches = useMemo(
    () =>
      db.matches.filter(
        (m) =>
          !q ||
          m.teamA.toLowerCase().includes(q) ||
          m.teamB.toLowerCase().includes(q) ||
          m.teamATag.toLowerCase().includes(q) ||
          m.teamBTag.toLowerCase().includes(q) ||
          m.mapName.toLowerCase().includes(q)
      ),
    [db.matches, q]
  );

  const filteredSquads = useMemo(
    () =>
      db.squads.filter((s) => {
        if (squadTournamentFilter !== 'ALL' && s.tournamentId !== squadTournamentFilter) {
          return false;
        }
        if (!q) return true;
        return (
          s.name.toLowerCase().includes(q) ||
          s.tag.toLowerCase().includes(q) ||
          s.captainIgn.toLowerCase().includes(q)
        );
      }),
    [db.squads, q, squadTournamentFilter]
  );

  const activeTournamentsCount = db.tournaments.filter(
    (t) => t.status === 'OPEN' || t.status === 'ONGOING'
  ).length;
  const liveMatchesCount = db.matches.filter((m) => m.status === 'LIVE').length;
  const pendingCheckInCount = db.squads.filter((s) => s.checkInStatus === 'PENDING').length;
  const unbracketedOpenCount = db.tournaments.filter(
    (t) =>
      t.status !== 'COMPLETED' &&
      !db.matches.some((m) => m.tournamentId === t.id)
  ).length;

  const activeNav = NAV_ITEMS.find((n) => n.id === activeTab)!;

  const handleExportCsv = async (dataset: 'tournaments' | 'matches' | 'squads') => {
    setExportingCsv(true);
    try {
      const filename = await api.downloadAdminExport(dataset, 'csv');
      onNotify(`Berhasil mengunduh ${filename}`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal mengekspor data CSV.');
    } finally {
      setExportingCsv(false);
    }
  };

  const handleInlineBracketUpdate = async (matchId: string, patch: Partial<Match>) => {
    try {
      await api.updateMatch(matchId, patch);
      await onRefresh();
      onNotify(
        patch.status === 'FINISHED'
          ? 'Match selesai! Pemenang otomatis lolos ke babak berikutnya.'
          : 'Skor & status bagan berhasil diperbarui.'
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal memperbarui pertandingan di bagan.');
    }
  };

  const handleQuickScore = async (match: Match, team: 'A' | 'B', delta: number) => {
    setBusyId(match.id);
    try {
      const nextA = team === 'A' ? Math.max(0, match.scoreA + delta) : match.scoreA;
      const nextB = team === 'B' ? Math.max(0, match.scoreB + delta) : match.scoreB;
      await api.updateMatch(match.id, { scoreA: nextA, scoreB: nextB });
      await onRefresh();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal memperbarui skor match.');
    } finally {
      setBusyId(null);
    }
  };

  const handleQuickMatchStatus = async (match: Match, status: MatchStatus) => {
    setBusyId(match.id);
    try {
      await api.updateMatch(match.id, { status });
      await onRefresh();
      onNotify(
        status === 'FINISHED'
          ? `Match ${match.teamATag} vs ${match.teamBTag} selesai. Jalur bracket diperbarui.`
          : `Status match diubah ke ${status}.`
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal mengubah status match.');
    } finally {
      setBusyId(null);
    }
  };

  const executeGenerateBracket = async (trn: Tournament) => {
    setBusyId(trn.id);
    try {
      await api.generateBracket(trn.id);
      await onRefresh();
      setSelectedBracketTournamentId(trn.id);
      onNotify(`Bracket otomatis dibuat untuk ${trn.name}.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal membuat bracket otomatis.');
    } finally {
      setBusyId(null);
      setConfirmBracketTarget(null);
    }
  };

  const handleGenerateBracket = async (trn: Tournament) => {
    const existingCount = db.matches.filter((m) => m.tournamentId === trn.id).length;
    if (existingCount > 0) {
      setConfirmBracketTarget({ trn, existingCount });
      return;
    }
    await executeGenerateBracket(trn);
  };

  const handleToggleCheckIn = async (squad: Squad) => {
    setBusyId(squad.id);
    try {
      const nextStatus: CheckInStatus =
        squad.checkInStatus === 'CHECKED IN' ? 'PENDING' : 'CHECKED IN';
      await api.updateSquad(squad.id, { checkInStatus: nextStatus });
      await onRefresh();
      onNotify(`Status check-in ${squad.tag}: ${nextStatus}`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal memperbarui status check-in.');
    } finally {
      setBusyId(null);
    }
  };

  const handleBulkCheckInPending = async (pendingList: Squad[]) => {
    if (pendingList.length === 0) return;
    setBulkCheckingIn(true);
    try {
      for (const sq of pendingList) {
        await api.updateSquad(sq.id, { checkInStatus: 'CHECKED IN' });
      }
      await onRefresh();
      onNotify(`${pendingList.length} squad berhasil di-check-in sekaligus.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal memproses check-in massal.');
    } finally {
      setBulkCheckingIn(false);
    }
  };

  const openCreateModal = (tab: Exclude<LeagueOpsTab, 'overview'>) => {
    setActiveTab(tab);
    setEditingId(null);
    setModalError('');
    setModalMode('create');
    if (tab === 'tournaments') {
      setFormState({
        name: '',
        game: 'POINT BLANK',
        format: 'SINGLE ELIMINATION',
        prizePool: 'Rp 15.000.000',
        maxTeams: 8,
        registeredTeams: 0,
        startDate: '2026-12-05 19:00 WIB',
        region: 'ID / SEA',
        status: 'OPEN',
        description: '',
        organizer: 'ORDAL Esports Hub',
        registrationFee: 'GRATIS (FREE)',
        mode: '5v5 · Online',
        checkInInfo: '30 Menit Sebelum Kick-Off',
        prizeFirst: '',
        prizeSecond: '',
        prizeThird: '',
        prizeMvp: '',
        rules: '',
        liveStreamUrl: '',
        replayStreamUrl: '',
      });
    } else if (tab === 'matches') {
      setFormState({
        tournamentId: db.tournaments[0]?.id || '',
        game: db.tournaments[0]?.game || 'POINT BLANK',
        round: 'QUARTERFINAL',
        bracketOrder: 1,
        teamA: '',
        teamATag: '',
        teamB: '',
        teamBTag: '',
        scoreA: 0,
        scoreB: 0,
        mapName: 'DOWNTOWN',
        status: 'UPCOMING',
        mvpIgn: '',
      });
    } else if (tab === 'squads') {
      setFormState({
        name: '',
        tag: '',
        tournamentId: db.tournaments[0]?.id || '',
        captainIgn: '',
        captainContact: '',
        roster: '',
        seed: db.squads.length + 1,
        checkInStatus: 'PENDING',
      });
    }
  };

  const openEditModal = (
    tab: Exclude<LeagueOpsTab, 'overview'>,
    item: Tournament | Match | Squad
  ) => {
    setActiveTab(tab);
    setEditingId(item.id);
    setModalError('');
    setModalMode('edit');
    if (tab === 'squads') {
      const s = item as Squad;
      setFormState({
        name: s.name,
        tag: s.tag,
        tournamentId: s.tournamentId,
        captainIgn: s.captainIgn,
        captainContact: s.captainContact,
        roster: s.roster.join(', '),
        seed: s.seed,
        checkInStatus: s.checkInStatus,
      });
    } else {
      setFormState({ ...(item as unknown as Record<string, string | number>) });
    }
  };

  const closeModal = () => {
    setModalMode(null);
    setEditingId(null);
    setModalError('');
    setFormState({});
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');
    setSaving(true);
    try {
      if (activeTab === 'tournaments') {
        if (modalMode === 'create') {
          await api.createTournament(formState as unknown as Partial<Tournament>);
          onNotify('Turnamen baru berhasil dibuat.');
        } else if (editingId) {
          await api.updateTournament(editingId, formState as unknown as Partial<Tournament>);
          onNotify('Data turnamen diperbarui.');
        }
      } else if (activeTab === 'matches') {
        if (modalMode === 'create') {
          await api.createMatch(formState as unknown as Partial<Match>);
          onNotify('Match baru berhasil ditambahkan.');
        } else if (editingId) {
          await api.updateMatch(editingId, formState as unknown as Partial<Match>);
          onNotify('Skor & status match diperbarui.');
        }
      } else if (activeTab === 'squads') {
        if (modalMode === 'create') {
          await api.createSquad(formState as unknown as Partial<Squad>);
          onNotify('Squad baru berhasil didaftarkan.');
        } else if (editingId) {
          await api.updateSquad(editingId, formState as unknown as Partial<Squad>);
          onNotify('Data roster squad diperbarui.');
        }
      }
      await onRefresh();
      closeModal();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan data turnamen.';
      setModalError(msg);
      onNotify(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (
    tab: Exclude<LeagueOpsTab, 'overview'>,
    id: string,
    label: string
  ) => {
    setDeleteTarget({ tab, id, label });
  };

  const executeDelete = async () => {
    if (!deleteTarget) return;
    const { tab, id, label } = deleteTarget;
    setDeletingTarget(true);
    setBusyId(id);
    try {
      if (tab === 'tournaments') await api.deleteTournament(id);
      if (tab === 'matches') await api.deleteMatch(id);
      if (tab === 'squads') await api.deleteSquad(id);
      await onRefresh();
      setDeleteTarget(null);
      onNotify(`${label} berhasil dihapus.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : `Gagal menghapus ${label}.`);
    } finally {
      setDeletingTarget(false);
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0C10] text-[#F8FAFC] flex">
      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-black/70 lg:hidden"
        />
      )}

      {/* Left Sidebar Navigation (260px) */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-50 h-screen w-[260px] shrink-0 bg-[#12161F] border-r border-white/[0.08] flex flex-col justify-between overflow-y-auto transition-transform duration-200 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div>
          <div className="h-16 px-5 flex items-center justify-between border-b border-white/[0.08]">
            <button
              type="button"
              onClick={onBackToSite}
              className="flex items-center gap-2.5 cursor-pointer"
            >
              <OrdalMonogram size={32} />
              <div className="text-left">
                <div className="font-display text-base font-bold uppercase tracking-[0.06em] text-[#F8FAFC] leading-none">
                  LEAGUE OPS
                </div>
                <div className="font-telemetry text-[10px] uppercase tracking-[0.1em] text-[#00F0FF] mt-0.5">
                  TOURNAMENT OPS
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              aria-label="Tutup menu"
              className="lg:hidden text-[#94A3B8] hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="px-4 py-3 border-b border-white/[0.08] font-telemetry text-[11px] text-[#94A3B8] truncate">
            {user.displayName} · <span className="text-[#00F0FF]">{user.email}</span>
          </div>

          <nav className="p-3 space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              const badgeCount =
                item.id === 'matches'
                  ? liveMatchesCount
                  : item.id === 'squads'
                    ? pendingCheckInCount
                    : item.id === 'tournaments'
                      ? unbracketedOpenCount
                      : 0;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.id);
                    setSearchQuery('');
                    setSidebarOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-[4px] font-telemetry text-xs font-semibold uppercase tracking-[0.06em] transition-colors cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'bg-[#00F0FF]/12 text-[#00F0FF] border border-[#00F0FF]/35'
                      : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-white/[0.04] border border-transparent'
                  }`}
                >
                  <span className="flex items-center gap-2.5 truncate">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {badgeCount > 0 && (
                    <span
                      className={`font-telemetry text-[11px] font-bold tabular-nums ${
                        item.id === 'matches'
                          ? 'text-[#FF2E5B]'
                          : item.id === 'tournaments'
                            ? 'text-[#00F0FF]'
                            : 'text-[#FACC15]'
                      }`}
                    >
                      {badgeCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="mx-3 mt-2 p-3.5 bg-[#0A0C10] border border-white/[0.08] rounded-[6px] space-y-1">
            <div className="font-telemetry text-[10px] font-bold uppercase tracking-[0.08em] text-[#CCFF00]">
              Hak Akses Terbatas
            </div>
            <p className="text-[11px] text-[#94A3B8] leading-relaxed">
              Role League Ops hanya mengelola turnamen, bagan bracket, skor match, dan check-in squad peserta.
            </p>
          </div>
        </div>

        <div className="p-4 border-t border-white/[0.08] space-y-2">
          <button
            type="button"
            onClick={() => setTwoFactorModalOpen(true)}
            className={`w-full inline-flex items-center justify-between gap-2 px-4 py-2 border font-telemetry text-xs font-semibold uppercase rounded-[4px] transition-colors cursor-pointer whitespace-nowrap ${
              user.totpEnabled
                ? 'border-[#CCFF00]/45 text-[#CCFF00] bg-[#CCFF00]/10 hover:bg-[#CCFF00]/15'
                : 'border-white/15 text-[#94A3B8] hover:text-[#00F0FF] hover:border-[#00F0FF]/50'
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5" />
              Keamanan 2FA
            </span>
            <span className="text-[10px] font-bold">
              {user.totpEnabled ? 'AKTIF' : 'ATUR'}
            </span>
          </button>
          <button
            type="button"
            onClick={onBackToSite}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-white/20 text-[#F8FAFC] font-display text-sm font-semibold uppercase tracking-[0.05em] rounded-[4px] hover:border-[#00F0FF] hover:bg-[#00F0FF]/[0.06] transition-colors cursor-pointer whitespace-nowrap"
          >
            <ExternalLink className="w-4 h-4 text-[#00F0FF]" />
            Lihat Website Publik
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 border border-white/15 text-[#94A3B8] hover:text-[#FF2E5B] hover:border-[#FF2E5B]/50 font-telemetry text-xs font-semibold uppercase rounded-[4px] transition-colors cursor-pointer whitespace-nowrap"
          >
            <LogOut className="w-3.5 h-3.5" />
            Keluar Akun
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 min-h-16 px-3 sm:px-8 py-2 glass-shield border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-2.5 sm:gap-4">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Buka sidebar"
              className="lg:hidden min-h-[40px] min-w-[40px] flex items-center justify-center border border-white/15 rounded-[4px] text-[#F8FAFC] cursor-pointer shrink-0"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-1.5 sm:gap-2 font-telemetry text-xs uppercase tracking-[0.08em] truncate">
              <span className="text-[#94A3B8] hidden sm:inline">League Ops</span>
              <span className="text-white/25 hidden sm:inline">/</span>
              <span className="text-[#F8FAFC] font-bold truncate">{activeNav.label}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            {activeTab !== 'overview' && (
              <>
                <button
                  type="button"
                  disabled={exportingCsv}
                  onClick={() => handleExportCsv(activeTab)}
                  className="inline-flex items-center gap-1.5 px-3 min-h-[38px] border border-white/15 bg-white/[0.04] text-[#F8FAFC] font-telemetry text-xs font-semibold uppercase tracking-[0.05em] rounded-[4px] hover:border-[#00F0FF]/60 hover:text-[#00F0FF] transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-[#CCFF00]" />
                  {exportingCsv ? 'Mengunduh...' : 'CSV'}
                </button>
                <button
                  type="button"
                  onClick={() => openCreateModal(activeTab)}
                  className="inline-flex items-center gap-1.5 px-3.5 sm:px-4 min-h-[38px] bg-[#00F0FF] text-[#0A0C10] font-display text-xs sm:text-sm font-bold uppercase tracking-[0.05em] rounded-[4px] hover:shadow-[0_0_16px_rgba(0,240,255,0.45)] transition-all cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  Tambah
                </button>
              </>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-8 max-w-[1440px] w-full mx-auto">
          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <div className="space-y-8">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                  <h1 className="font-display text-3xl font-bold uppercase text-[#F8FAFC]">
                    Command Center League Ops
                  </h1>
                  <p className="text-sm text-[#94A3B8] mt-1">
                    Atur jadwal turnamen, kelola bagan bracket, pantau skor live, dan verifikasi check-in squad peserta.
                  </p>
                </div>
                <OrdalWordmark height={34} className="hidden sm:inline-flex" />
              </div>

              {/* KPI Strip (4 Columns) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  {
                    label: 'Total Turnamen',
                    value: db.tournaments.length,
                    sub: `${activeTournamentsCount} terbuka / berjalan`,
                    color: '#00F0FF',
                  },
                  {
                    label: 'Match Sedang LIVE',
                    value: liveMatchesCount,
                    sub: `${db.matches.filter((m) => m.status === 'UPCOMING').length} match upcoming`,
                    color: '#FF2E5B',
                  },
                  {
                    label: 'Menunggu Check-In',
                    value: pendingCheckInCount,
                    sub: `${db.squads.length} total squad terdaftar`,
                    color: '#FACC15',
                  },
                  {
                    label: 'Siap Generate Bracket',
                    value: unbracketedOpenCount,
                    sub: 'Turnamen belum memiliki node match',
                    color: '#CCFF00',
                  },
                ].map((kpi) => (
                  <div
                    key={kpi.label}
                    className="p-5 bg-[#12161F] border border-white/[0.08] rounded-[6px]"
                  >
                    <div className="font-telemetry text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">
                      {kpi.label}
                    </div>
                    <div
                      className="mt-2 font-display text-3xl font-bold tabular-nums"
                      style={{ color: kpi.color }}
                    >
                      {kpi.value}
                    </div>
                    <div className="mt-1 font-telemetry text-[11px] text-[#94A3B8]">
                      {kpi.sub}
                    </div>
                  </div>
                ))}
              </div>

              {/* Operational Queue */}
              <div className="p-5 bg-[#12161F] border border-white/[0.08] rounded-[6px] space-y-3">
                <div>
                  <h2 className="font-display text-lg font-bold uppercase text-[#F8FAFC]">
                    Antrean Operasional Turnamen
                  </h2>
                  <p className="font-telemetry text-[11px] text-[#94A3B8]">
                    Pintasan cepat ke tugas turnamen yang memerlukan tindakan operator.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[
                    {
                      title: 'Update Skor Match LIVE',
                      count: liveMatchesCount,
                      desc: 'Kelola skor langsung & tentukan pemenang bracket',
                      tab: 'matches' as LeagueOpsTab,
                      accent: '#FF2E5B',
                    },
                    {
                      title: 'Verifikasi Check-In Squad',
                      count: pendingCheckInCount,
                      desc: 'Konfirmasi kehadiran kapten & roster sebelum kick-off',
                      tab: 'squads' as LeagueOpsTab,
                      accent: '#FACC15',
                    },
                    {
                      title: 'Setup Bracket Turnamen',
                      count: unbracketedOpenCount,
                      desc: 'Buat bagan otomatis atau edit aturan & jadwal turnamen',
                      tab: 'tournaments' as LeagueOpsTab,
                      accent: '#00F0FF',
                    },
                  ].map((task) => (
                    <button
                      key={task.title}
                      type="button"
                      onClick={() => setActiveTab(task.tab)}
                      className="p-4 text-left bg-[#0A0C10] border border-white/[0.08] hover:border-[#00F0FF]/50 rounded-[4px] transition-colors cursor-pointer flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="font-telemetry text-xs font-bold uppercase text-[#F8FAFC] truncate">
                          {task.title}
                        </div>
                        <div className="font-telemetry text-[11px] text-[#94A3B8] truncate mt-0.5">
                          {task.desc}
                        </div>
                      </div>
                      <span
                        className="font-display text-2xl font-bold tabular-nums shrink-0"
                        style={{ color: task.count > 0 ? task.accent : '#64748B' }}
                      >
                        {task.count}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Quick Live Match Control & Active Tournaments */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7 bg-[#12161F] border border-white/[0.08] rounded-[6px] p-6">
                  <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
                    <h2 className="font-display text-xl font-bold uppercase text-[#F8FAFC]">
                      Kontrol Cepat Skor Live &amp; Bracket
                    </h2>
                    <button
                      type="button"
                      onClick={() => setActiveTab('matches')}
                      className="font-telemetry text-xs uppercase text-[#00F0FF] hover:underline cursor-pointer whitespace-nowrap"
                    >
                      Buka Chart Bracket →
                    </button>
                  </div>
                  <div className="mt-4 space-y-3">
                    {db.matches.slice(0, 5).map((m) => (
                      <div
                        key={m.id}
                        className="p-3.5 bg-[#0A0C10] border border-white/[0.08] rounded-[4px] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="font-telemetry text-[11px] text-[#94A3B8] uppercase">
                            {m.game} · {m.round} · {m.mapName}
                          </div>
                          <div className="mt-0.5 font-display text-base font-bold uppercase text-[#F8FAFC] truncate">
                            {m.teamA} ({m.teamATag}) <span className="text-[#94A3B8] text-xs">vs</span> {m.teamB} ({m.teamBTag})
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                          <button
                            type="button"
                            disabled={busyId === m.id}
                            onClick={() => handleQuickScore(m, 'A', 1)}
                            className="px-2.5 py-1 bg-[#12161F] border border-white/15 hover:border-[#00F0FF] rounded-[4px] font-telemetry text-xs font-bold tabular-nums text-[#F8FAFC] cursor-pointer"
                          >
                            {m.teamATag} {m.scoreA} +
                          </button>
                          <button
                            type="button"
                            disabled={busyId === m.id}
                            onClick={() => handleQuickScore(m, 'B', 1)}
                            className="px-2.5 py-1 bg-[#12161F] border border-white/15 hover:border-[#00F0FF] rounded-[4px] font-telemetry text-xs font-bold tabular-nums text-[#F8FAFC] cursor-pointer"
                          >
                            {m.teamBTag} {m.scoreB} +
                          </button>
                          <select
                            value={m.status}
                            disabled={busyId === m.id}
                            onChange={(e) =>
                              handleQuickMatchStatus(m, e.target.value as MatchStatus)
                            }
                            aria-label={`Status match ${m.teamATag} vs ${m.teamBTag}`}
                            className="px-2 py-1 bg-[#12161F] border border-white/15 rounded-[4px] font-telemetry text-xs font-semibold uppercase text-[#00F0FF] focus:outline-none focus:border-[#00F0FF]"
                          >
                            <option value="UPCOMING">UPCOMING</option>
                            <option value="LIVE">LIVE</option>
                            <option value="FINISHED">FINISHED</option>
                          </select>
                        </div>
                      </div>
                    ))}
                    {db.matches.length === 0 && (
                      <div className="p-6 text-center font-telemetry text-xs text-[#94A3B8]">
                        Belum ada pertandingan. Generate bracket di tab Tournament Builder.
                      </div>
                    )}
                  </div>
                </div>

                <div className="lg:col-span-5 bg-[#12161F] border border-white/[0.08] rounded-[6px] p-6">
                  <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
                    <h2 className="font-display text-xl font-bold uppercase text-[#F8FAFC]">
                      Daftar Turnamen Aktif
                    </h2>
                    <button
                      type="button"
                      onClick={() => setActiveTab('tournaments')}
                      className="font-telemetry text-xs uppercase text-[#00F0FF] hover:underline cursor-pointer whitespace-nowrap"
                    >
                      Semua Turnamen →
                    </button>
                  </div>
                  <div className="mt-4 space-y-3">
                    {db.tournaments.slice(0, 4).map((t) => {
                      const trnMatches = db.matches.filter((m) => m.tournamentId === t.id).length;
                      return (
                        <div
                          key={t.id}
                          className="p-3.5 bg-[#0A0C10] border border-white/[0.08] rounded-[4px] space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2 font-telemetry text-[11px] uppercase">
                            <span className="text-[#00F0FF] font-semibold">{t.game}</span>
                            <span
                              className={
                                t.status === 'ONGOING'
                                  ? 'text-[#FF2E5B] font-bold'
                                  : t.status === 'OPEN'
                                    ? 'text-[#CCFF00] font-bold'
                                    : 'text-[#94A3B8]'
                              }
                            >
                              {t.status}
                            </span>
                          </div>
                          <div className="font-display text-base font-bold uppercase text-[#F8FAFC] truncate">
                            {t.name}
                          </div>
                          <div className="flex items-center justify-between gap-2 font-telemetry text-[11px] text-[#94A3B8]">
                            <span className="tabular-nums">
                              {t.registeredTeams}/{t.maxTeams} Tim · {trnMatches} Match
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedBracketTournamentId(t.id);
                                setActiveTab('matches');
                              }}
                              className="text-[#CCFF00] font-semibold hover:underline cursor-pointer"
                            >
                              Kelola Bracket →
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SEARCH BAR FOR CRUD TABLES */}
          {activeTab !== 'overview' && (
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="relative max-w-md w-full">
                <Search className="w-4 h-4 text-[#94A3B8] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={`Cari di ${activeNav.label}...`}
                  className="w-full pl-10 pr-4 py-2.5 bg-[#12161F] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC] placeholder:text-[#94A3B8]/60 focus:outline-none focus:border-[#00F0FF]"
                />
              </div>
              <div className="font-telemetry text-xs uppercase tracking-[0.08em] text-[#94A3B8]">
                Sinkronisasi langsung dengan Website Publik
              </div>
            </div>
          )}

          {/* 1. TOURNAMENT BUILDER */}
          {activeTab === 'tournaments' && (
            <div className="bg-[#12161F] border border-white/[0.08] rounded-[6px] overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[860px]">
                <thead>
                  <tr className="border-b border-white/[0.08] font-telemetry text-[11px] uppercase tracking-[0.08em] text-[#94A3B8]">
                    <th className="py-3.5 px-4">Turnamen &amp; Organizer</th>
                    <th className="py-3.5 px-4">Game · Mode · Format</th>
                    <th className="py-3.5 px-4">Prize &amp; Biaya</th>
                    <th className="py-3.5 px-4">Slot &amp; Check-In</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06] text-sm">
                  {filteredTournaments.map((trn) => {
                    const trnSquads = db.squads.filter((s) => s.tournamentId === trn.id);
                    const checkedIn = trnSquads.filter((s) => s.checkInStatus === 'CHECKED IN').length;
                    const trnMatches = db.matches.filter((m) => m.tournamentId === trn.id).length;
                    return (
                      <tr key={trn.id} className="hover:bg-white/[0.02]">
                        <td className="py-3.5 px-4">
                          <div className="font-display text-base font-bold uppercase text-[#F8FAFC]">
                            {trn.name}
                          </div>
                          <div className="font-telemetry text-xs text-[#94A3B8]">
                            {trn.organizer || 'ORDAL Esports Hub'} · {trn.startDate} · {trn.region}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-telemetry text-xs">
                          <div className="text-[#00F0FF] font-semibold">
                            {trn.game} · {trn.mode || '5v5 · Online'}
                          </div>
                          <div className="text-[#94A3B8] tabular-nums">
                            {trn.format} · {trnMatches} Match
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-telemetry text-xs">
                          <div className="font-bold text-[#CCFF00]">{trn.prizePool}</div>
                          <div className="text-[#94A3B8]">
                            Daftar: {trn.registrationFee || 'GRATIS (FREE)'}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-telemetry text-xs">
                          <div className="text-[#F8FAFC] font-semibold tabular-nums">
                            {Math.max(trn.registeredTeams, trnSquads.length)} / {trn.maxTeams} Tim
                          </div>
                          <div className="text-[#CCFF00] text-[11px] tabular-nums">
                            {checkedIn} Checked In
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-telemetry text-xs font-bold uppercase">
                          <span
                            className={
                              trn.status === 'ONGOING'
                                ? 'text-[#FF2E5B]'
                                : trn.status === 'OPEN'
                                  ? 'text-[#CCFF00]'
                                  : 'text-[#94A3B8]'
                            }
                          >
                            {trn.status === 'OPEN'
                              ? 'Dibuka'
                              : trn.status === 'ONGOING'
                                ? 'Berlangsung'
                                : 'Selesai'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="inline-flex items-center gap-2">
                            {trnMatches > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedBracketTournamentId(trn.id);
                                  setActiveTab('matches');
                                }}
                                title="Edit skor & status langsung di Chart Bracket"
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-[#CCFF00]/12 border border-[#CCFF00]/40 text-[#CCFF00] font-telemetry text-[11px] font-semibold uppercase rounded-[4px] hover:bg-[#CCFF00]/20 cursor-pointer whitespace-nowrap"
                              >
                                <GitBranch className="w-3.5 h-3.5" />
                                Chart Bracket
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setPreviewTournament(trn)}
                              title="Preview Tampilan Tab Turnamen Publik"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white/[0.05] border border-white/15 text-[#F8FAFC] font-telemetry text-[11px] font-semibold uppercase rounded-[4px] hover:border-[#00F0FF] hover:text-[#00F0FF] cursor-pointer whitespace-nowrap"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              Preview
                            </button>
                            <button
                              type="button"
                              disabled={busyId === trn.id}
                              onClick={() => handleGenerateBracket(trn)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-[#00F0FF]/12 border border-[#00F0FF]/35 text-[#00F0FF] font-telemetry text-[11px] font-semibold uppercase rounded-[4px] hover:bg-[#00F0FF]/20 cursor-pointer whitespace-nowrap"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              {trnMatches > 0 ? 'Reset Bracket' : 'Auto Bracket'}
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditModal('tournaments', trn)}
                              aria-label="Edit turnamen"
                              className="p-1.5 text-[#94A3B8] hover:text-[#00F0FF] cursor-pointer"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              disabled={busyId === trn.id}
                              onClick={() => handleDelete('tournaments', trn.id, trn.name)}
                              aria-label="Hapus turnamen"
                              className="p-1.5 text-[#94A3B8] hover:text-[#FF2E5B] cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredTournaments.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="py-10 px-4 text-center font-telemetry text-xs text-[#94A3B8]"
                      >
                        Tidak ada turnamen yang cocok dengan pencarian.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* 2. LIVE MATCHES & BRACKET */}
          {activeTab === 'matches' && (() => {
            const activeBracketTrnId =
              selectedBracketTournamentId ||
              db.tournaments.find((t) => t.status === 'ONGOING')?.id ||
              db.tournaments[0]?.id ||
              '';
            const bracketMatches = db.matches.filter(
              (m) => m.tournamentId === activeBracketTrnId
            );
            return (
              <div className="space-y-6">
                <div className="bg-[#12161F] border border-white/[0.08] rounded-[6px] p-5 sm:p-6 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/[0.08]">
                    <div>
                      <h2 className="font-display text-xl font-bold uppercase text-[#F8FAFC]">
                        Chart Bracket Interaktif (Edit Langsung)
                      </h2>
                      <p className="text-xs text-[#94A3B8] mt-0.5">
                        Ubah status match, skor (+/-), map, dan MVP langsung dari bagan. Status FINISHED otomatis meloloskan pemenang.
                      </p>
                    </div>
                    <select
                      value={activeBracketTrnId}
                      onChange={(e) => setSelectedBracketTournamentId(e.target.value)}
                      aria-label="Pilih turnamen untuk chart bracket"
                      className="h-9 px-3 bg-[#0A0C10] border border-white/15 rounded-[4px] font-telemetry text-xs text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF] cursor-pointer"
                    >
                      {db.tournaments.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.game} · {t.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <LiveBracketCanvas
                    matches={bracketMatches}
                    onSelectMatch={(m) => openEditModal('matches', m)}
                    canEdit
                    onUpdateMatch={handleInlineBracketUpdate}
                  />
                </div>

                <div className="bg-[#12161F] border border-white/[0.08] rounded-[6px] overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[820px]">
                    <thead>
                      <tr className="border-b border-white/[0.08] font-telemetry text-[11px] uppercase tracking-[0.08em] text-[#94A3B8]">
                        <th className="py-3.5 px-4">Pertandingan</th>
                        <th className="py-3.5 px-4">Babak &amp; Map</th>
                        <th className="py-3.5 px-4">Skor Live</th>
                        <th className="py-3.5 px-4">Status</th>
                        <th className="py-3.5 px-4 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06] text-sm">
                      {filteredMatches.map((m) => (
                        <tr key={m.id} className="hover:bg-white/[0.02]">
                          <td className="py-3.5 px-4">
                            <div className="font-display text-base font-bold uppercase text-[#F8FAFC]">
                              {m.teamA} ({m.teamATag}){' '}
                              <span className="text-[#94A3B8] text-xs">VS</span> {m.teamB} ({m.teamBTag})
                            </div>
                            <div className="font-telemetry text-[11px] text-[#94A3B8]">
                              {m.game} · MVP: {m.mvpIgn || '-'}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 font-telemetry text-xs">
                            <div className="text-[#00F0FF] font-semibold">{m.round}</div>
                            <div className="text-[#94A3B8]">{m.mapName}</div>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="inline-flex items-center gap-2 font-telemetry tabular-nums">
                              <button
                                type="button"
                                onClick={() => handleQuickScore(m, 'A', 1)}
                                className="px-2 py-1 bg-[#0A0C10] border border-white/15 hover:border-[#00F0FF] rounded-[2px] text-xs font-bold text-[#F8FAFC] cursor-pointer"
                                title="Tambah skor Tim A"
                              >
                                {m.teamATag} {m.scoreA} +
                              </button>
                              <span className="text-[#94A3B8]">:</span>
                              <button
                                type="button"
                                onClick={() => handleQuickScore(m, 'B', 1)}
                                className="px-2 py-1 bg-[#0A0C10] border border-white/15 hover:border-[#00F0FF] rounded-[2px] text-xs font-bold text-[#F8FAFC] cursor-pointer"
                                title="Tambah skor Tim B"
                              >
                                {m.teamBTag} {m.scoreB} +
                              </button>
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <select
                              value={m.status}
                              onChange={(e) =>
                                handleQuickMatchStatus(m, e.target.value as MatchStatus)
                              }
                              aria-label={`Status ${m.teamATag} vs ${m.teamBTag}`}
                              className="px-2.5 py-1 bg-[#0A0C10] border border-white/15 rounded-[4px] font-telemetry text-xs font-semibold uppercase text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                            >
                              <option value="UPCOMING">UPCOMING</option>
                              <option value="LIVE">LIVE</option>
                              <option value="FINISHED">FINISHED</option>
                            </select>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => openEditModal('matches', m)}
                                aria-label="Edit match"
                                className="p-1.5 text-[#94A3B8] hover:text-[#00F0FF] cursor-pointer"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleDelete('matches', m.id, `${m.teamATag} vs ${m.teamBTag}`)
                                }
                                aria-label="Hapus match"
                                className="p-1.5 text-[#94A3B8] hover:text-[#FF2E5B] cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredMatches.length === 0 && (
                        <tr>
                          <td
                            colSpan={5}
                            className="py-10 px-4 text-center font-telemetry text-xs text-[#94A3B8]"
                          >
                            Tidak ada match sesuai filter pencarian.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          {/* 3. ROSTER & SQUADS */}
          {activeTab === 'squads' && (() => {
            const pendingInView = filteredSquads.filter((s) => s.checkInStatus === 'PENDING');
            return (
              <div className="space-y-4">
                <div className="p-4 bg-[#12161F] border border-white/[0.08] rounded-[6px] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="font-telemetry text-[11px] uppercase text-[#94A3B8]">
                      Filter Turnamen:
                    </label>
                    <select
                      value={squadTournamentFilter}
                      onChange={(e) => setSquadTournamentFilter(e.target.value)}
                      className="h-9 px-3 bg-[#0A0C10] border border-white/15 rounded-[4px] font-telemetry text-xs text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                    >
                      <option value="ALL">Semua Turnamen ({db.squads.length} Squad)</option>
                      {db.tournaments.map((t) => {
                        const count = db.squads.filter((sq) => sq.tournamentId === t.id).length;
                        return (
                          <option key={t.id} value={t.id}>
                            {t.game} · {t.name} ({count} Squad)
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {pendingInView.length > 0 && (
                    <button
                      type="button"
                      disabled={bulkCheckingIn}
                      onClick={() => handleBulkCheckInPending(pendingInView)}
                      className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[38px] bg-[#CCFF00] text-[#0A0C10] font-telemetry text-xs font-bold uppercase rounded-[4px] hover:brightness-110 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                    >
                      <Check className="w-3.5 h-3.5" />
                      {bulkCheckingIn
                        ? 'Memproses Check-In...'
                        : `Check-In Semua Pending (${pendingInView.length})`}
                    </button>
                  )}
                </div>

                <div className="bg-[#12161F] border border-white/[0.08] rounded-[6px] overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[780px]">
                    <thead>
                      <tr className="border-b border-white/[0.08] font-telemetry text-[11px] uppercase tracking-[0.08em] text-[#94A3B8]">
                        <th className="py-3.5 px-4">Seed</th>
                        <th className="py-3.5 px-4">Squad &amp; Kapten</th>
                        <th className="py-3.5 px-4">Roster Pemain</th>
                        <th className="py-3.5 px-4">Status Check-In</th>
                        <th className="py-3.5 px-4 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06] text-sm">
                      {filteredSquads.length === 0 && (
                        <tr>
                          <td
                            colSpan={5}
                            className="py-10 px-4 text-center font-telemetry text-xs text-[#94A3B8]"
                          >
                            Tidak ada squad terdaftar sesuai filter turnamen/pencarian.
                          </td>
                        </tr>
                      )}
                      {filteredSquads.map((s) => {
                        const trn = db.tournaments.find((t) => t.id === s.tournamentId);
                        return (
                          <tr key={s.id} className="hover:bg-white/[0.02]">
                            <td className="py-3.5 px-4 font-telemetry text-xs font-bold text-[#00F0FF] tabular-nums">
                              #{s.seed}
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="font-display text-base font-bold uppercase text-[#F8FAFC]">
                                [{s.tag}] {s.name}
                              </div>
                              <div className="font-telemetry text-xs text-[#94A3B8]">
                                CPT: {s.captainIgn} · {s.captainContact || '-'}
                              </div>
                              {trn && (
                                <div className="font-telemetry text-[10px] text-[#00F0FF] mt-0.5">
                                  {trn.game} · {trn.name}
                                </div>
                              )}
                            </td>
                            <td className="py-3.5 px-4 font-telemetry text-xs text-[#E2E2E8] max-w-xs truncate">
                              {s.roster.join(', ')}
                            </td>
                            <td className="py-3.5 px-4">
                              <button
                                type="button"
                                disabled={busyId === s.id}
                                onClick={() => handleToggleCheckIn(s)}
                                title="Klik untuk ubah status check-in"
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] border font-telemetry text-[11px] font-bold uppercase cursor-pointer ${
                                  s.checkInStatus === 'CHECKED IN'
                                    ? 'border-[#00F0FF]/40 bg-[#00F0FF]/10 text-[#00F0FF]'
                                    : s.checkInStatus === 'DISQUALIFIED'
                                      ? 'border-[#FF2E5B]/40 bg-[#FF2E5B]/10 text-[#FF2E5B]'
                                      : 'border-[#FACC15]/40 bg-[#0A0C10] text-[#FACC15]'
                                }`}
                              >
                                {s.checkInStatus === 'CHECKED IN' && <Check className="w-3 h-3" />}
                                {s.checkInStatus === 'CHECKED IN'
                                  ? 'TERVERIFIKASI'
                                  : s.checkInStatus === 'DISQUALIFIED'
                                    ? 'DISKUALIFIKASI'
                                    : 'MENUNGGU CHECK-IN'}
                              </button>
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <div className="inline-flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => openEditModal('squads', s)}
                                  aria-label="Edit squad"
                                  className="p-1.5 text-[#94A3B8] hover:text-[#00F0FF] cursor-pointer"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDelete('squads', s.id, s.name)}
                                  aria-label="Hapus squad"
                                  className="p-1.5 text-[#94A3B8] hover:text-[#FF2E5B] cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </main>
      </div>

      {/* CREATE / EDIT MODAL (TOURNAMENT / MATCH / SQUAD ONLY) */}
      {modalMode && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0A0C10]/85 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-[#1A202C] border border-white/15 rounded-[6px]">
            <div className="flex items-center justify-between px-6 py-4 bg-[#12161F] border-b border-white/[0.08]">
              <h3 className="font-display text-xl font-bold uppercase text-[#F8FAFC]">
                {modalMode === 'create' ? 'Tambah' : 'Edit'} {activeNav.label}
              </h3>
              <button
                type="button"
                onClick={closeModal}
                aria-label="Tutup modal"
                className="p-1 text-[#94A3B8] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              {modalError && (
                <div
                  role="alert"
                  className="p-3 bg-[#FF2E5B]/15 border border-[#FF2E5B] rounded-[4px] font-telemetry text-xs text-[#FFDADB]"
                >
                  {modalError}
                </div>
              )}
              {activeTab === 'tournaments' && (
                <>
                  <div>
                    <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                      Nama Turnamen
                    </label>
                    <input
                      required
                      value={String(formState.name || '')}
                      onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                      className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                        Cabang Game
                      </label>
                      <select
                        value={String(formState.game || 'POINT BLANK')}
                        onChange={(e) =>
                          setFormState({ ...formState, game: e.target.value as GameTitle })
                        }
                        className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC]"
                      >
                        <option value="POINT BLANK">POINT BLANK</option>
                        <option value="FREE FIRE">FREE FIRE</option>
                        <option value="EFOOTBALL">EFOOTBALL</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                        Format Bracket
                      </label>
                      <select
                        value={String(formState.format || 'SINGLE ELIMINATION')}
                        onChange={(e) =>
                          setFormState({
                            ...formState,
                            format: e.target.value as TournamentFormat,
                          })
                        }
                        className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC]"
                      >
                        <option value="SINGLE ELIMINATION">SINGLE ELIMINATION</option>
                        <option value="DOUBLE ELIMINATION">DOUBLE ELIMINATION</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                        Prize Pool
                      </label>
                      <input
                        value={String(formState.prizePool || '')}
                        onChange={(e) => setFormState({ ...formState, prizePool: e.target.value })}
                        className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC]"
                      />
                    </div>
                    <div>
                      <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                        Maksimal Squad
                      </label>
                      <input
                        type="number"
                        min={4}
                        max={64}
                        value={Number(formState.maxTeams || 8)}
                        onChange={(e) =>
                          setFormState({ ...formState, maxTeams: Number(e.target.value) })
                        }
                        className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC]"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                        Jadwal Kick-Off
                      </label>
                      <input
                        value={String(formState.startDate || '')}
                        onChange={(e) => setFormState({ ...formState, startDate: e.target.value })}
                        className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC]"
                      />
                    </div>
                    <div>
                      <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                        Status
                      </label>
                      <select
                        value={String(formState.status || 'OPEN')}
                        onChange={(e) =>
                          setFormState({
                            ...formState,
                            status: e.target.value as TournamentStatus,
                          })
                        }
                        className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC]"
                      >
                        <option value="OPEN">OPEN</option>
                        <option value="ONGOING">ONGOING</option>
                        <option value="COMPLETED">COMPLETED</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                        Penyelenggara (Organizer)
                      </label>
                      <input
                        value={String(formState.organizer || 'ORDAL Esports Hub')}
                        onChange={(e) => setFormState({ ...formState, organizer: e.target.value })}
                        className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC]"
                      />
                    </div>
                    <div>
                      <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                        Biaya Pendaftaran
                      </label>
                      <input
                        value={String(formState.registrationFee || 'GRATIS (FREE)')}
                        onChange={(e) =>
                          setFormState({ ...formState, registrationFee: e.target.value })
                        }
                        className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC]"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                        Mode &amp; Platform
                      </label>
                      <input
                        value={String(formState.mode || '5v5 · Online')}
                        onChange={(e) => setFormState({ ...formState, mode: e.target.value })}
                        className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC]"
                      />
                    </div>
                    <div>
                      <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                        Server / Region
                      </label>
                      <input
                        value={String(formState.region || 'ID / SEA')}
                        onChange={(e) => setFormState({ ...formState, region: e.target.value })}
                        className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC]"
                      />
                    </div>
                    <div>
                      <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                        Jadwal Check-In
                      </label>
                      <input
                        value={String(formState.checkInInfo || '30 Menit Sebelum Kick-Off')}
                        onChange={(e) =>
                          setFormState({ ...formState, checkInInfo: e.target.value })
                        }
                        className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC]"
                      />
                    </div>
                  </div>
                  <div className="p-3 bg-[#0A0C10] border border-white/10 rounded-[4px] space-y-2.5">
                    <div className="font-telemetry text-[11px] font-bold uppercase tracking-[0.06em] text-[#CCFF00]">
                      Distribusi Hadiah (Opsional)
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <input
                        value={String(formState.prizeFirst || '')}
                        onChange={(e) => setFormState({ ...formState, prizeFirst: e.target.value })}
                        placeholder="Juara 1"
                        className="w-full px-2.5 py-1.5 bg-[#12161F] border border-white/12 rounded-[4px] font-telemetry text-xs text-[#F8FAFC]"
                      />
                      <input
                        value={String(formState.prizeSecond || '')}
                        onChange={(e) =>
                          setFormState({ ...formState, prizeSecond: e.target.value })
                        }
                        placeholder="Juara 2"
                        className="w-full px-2.5 py-1.5 bg-[#12161F] border border-white/12 rounded-[4px] font-telemetry text-xs text-[#F8FAFC]"
                      />
                      <input
                        value={String(formState.prizeThird || '')}
                        onChange={(e) => setFormState({ ...formState, prizeThird: e.target.value })}
                        placeholder="Juara 3"
                        className="w-full px-2.5 py-1.5 bg-[#12161F] border border-white/12 rounded-[4px] font-telemetry text-xs text-[#F8FAFC]"
                      />
                      <input
                        value={String(formState.prizeMvp || '')}
                        onChange={(e) => setFormState({ ...formState, prizeMvp: e.target.value })}
                        placeholder="MVP"
                        className="w-full px-2.5 py-1.5 bg-[#12161F] border border-white/12 rounded-[4px] font-telemetry text-xs text-[#F8FAFC]"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                      Deskripsi Singkat
                    </label>
                    <textarea
                      rows={3}
                      value={String(formState.description || '')}
                      onChange={(e) => setFormState({ ...formState, description: e.target.value })}
                      className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] text-sm text-[#F8FAFC]"
                    />
                  </div>
                  <div>
                    <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                      Peraturan Khusus (1 Baris per Poin)
                    </label>
                    <textarea
                      rows={3}
                      value={String(formState.rules || '')}
                      onChange={(e) => setFormState({ ...formState, rules: e.target.value })}
                      className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] text-sm text-[#F8FAFC]"
                    />
                  </div>
                  <div>
                    <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                      Link Live Stream (YouTube / Twitch)
                    </label>
                    <input
                      type="url"
                      value={String(formState.liveStreamUrl || '')}
                      onChange={(e) =>
                        setFormState({ ...formState, liveStreamUrl: e.target.value })
                      }
                      placeholder="https://www.youtube.com/watch?v=..."
                      className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC]"
                    />
                  </div>
                  <div>
                    <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                      Link Siaran Ulang (Replay Stream)
                    </label>
                    <input
                      type="url"
                      value={String(formState.replayStreamUrl || '')}
                      onChange={(e) =>
                        setFormState({ ...formState, replayStreamUrl: e.target.value })
                      }
                      placeholder="https://www.youtube.com/watch?v=..."
                      className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC]"
                    />
                  </div>
                </>
              )}

              {activeTab === 'matches' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                        Turnamen
                      </label>
                      <select
                        value={String(formState.tournamentId || '')}
                        onChange={(e) =>
                          setFormState({ ...formState, tournamentId: e.target.value })
                        }
                        className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC]"
                      >
                        {db.tournaments.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                        Babak
                      </label>
                      <select
                        value={String(formState.round || 'QUARTERFINAL')}
                        onChange={(e) =>
                          setFormState({ ...formState, round: e.target.value as BracketRound })
                        }
                        className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC]"
                      >
                        <option value="QUARTERFINAL">QUARTERFINAL</option>
                        <option value="SEMIFINAL">SEMIFINAL</option>
                        <option value="GRAND FINAL">GRAND FINAL</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                        Tim A
                      </label>
                      <input
                        required
                        value={String(formState.teamA || '')}
                        onChange={(e) => setFormState({ ...formState, teamA: e.target.value })}
                        className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC]"
                      />
                    </div>
                    <div>
                      <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                        Tag A
                      </label>
                      <input
                        required
                        maxLength={5}
                        value={String(formState.teamATag || '')}
                        onChange={(e) =>
                          setFormState({ ...formState, teamATag: e.target.value.toUpperCase() })
                        }
                        className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm uppercase text-[#F8FAFC]"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                        Tim B
                      </label>
                      <input
                        required
                        value={String(formState.teamB || '')}
                        onChange={(e) => setFormState({ ...formState, teamB: e.target.value })}
                        className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC]"
                      />
                    </div>
                    <div>
                      <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                        Tag B
                      </label>
                      <input
                        required
                        maxLength={5}
                        value={String(formState.teamBTag || '')}
                        onChange={(e) =>
                          setFormState({ ...formState, teamBTag: e.target.value.toUpperCase() })
                        }
                        className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm uppercase text-[#F8FAFC]"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                        Skor A
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={Number(formState.scoreA || 0)}
                        onChange={(e) =>
                          setFormState({ ...formState, scoreA: Number(e.target.value) })
                        }
                        className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC]"
                      />
                    </div>
                    <div>
                      <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                        Skor B
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={Number(formState.scoreB || 0)}
                        onChange={(e) =>
                          setFormState({ ...formState, scoreB: Number(e.target.value) })
                        }
                        className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC]"
                      />
                    </div>
                    <div>
                      <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                        Status
                      </label>
                      <select
                        value={String(formState.status || 'UPCOMING')}
                        onChange={(e) =>
                          setFormState({ ...formState, status: e.target.value as MatchStatus })
                        }
                        className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC]"
                      >
                        <option value="UPCOMING">UPCOMING</option>
                        <option value="LIVE">LIVE</option>
                        <option value="FINISHED">FINISHED</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                        Map
                      </label>
                      <input
                        value={String(formState.mapName || '')}
                        onChange={(e) => setFormState({ ...formState, mapName: e.target.value })}
                        className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC]"
                      />
                    </div>
                    <div>
                      <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                        MVP IGN
                      </label>
                      <input
                        value={String(formState.mvpIgn || '')}
                        onChange={(e) => setFormState({ ...formState, mvpIgn: e.target.value })}
                        className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC]"
                      />
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'squads' && (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                        Nama Squad
                      </label>
                      <input
                        required
                        value={String(formState.name || '')}
                        onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                        className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC]"
                      />
                    </div>
                    <div>
                      <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                        Tag
                      </label>
                      <input
                        required
                        maxLength={5}
                        value={String(formState.tag || '')}
                        onChange={(e) =>
                          setFormState({ ...formState, tag: e.target.value.toUpperCase() })
                        }
                        className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm uppercase text-[#F8FAFC]"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                        Turnamen
                      </label>
                      <select
                        value={String(formState.tournamentId || '')}
                        onChange={(e) =>
                          setFormState({ ...formState, tournamentId: e.target.value })
                        }
                        className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC]"
                      >
                        {db.tournaments.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                        Status Check-In
                      </label>
                      <select
                        value={String(formState.checkInStatus || 'PENDING')}
                        onChange={(e) =>
                          setFormState({
                            ...formState,
                            checkInStatus: e.target.value as CheckInStatus,
                          })
                        }
                        className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC]"
                      >
                        <option value="CHECKED IN">CHECKED IN</option>
                        <option value="PENDING">PENDING</option>
                        <option value="DISQUALIFIED">DISQUALIFIED</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                        Seed
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={Number(formState.seed || 1)}
                        onChange={(e) =>
                          setFormState({ ...formState, seed: Number(e.target.value) })
                        }
                        className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC]"
                      />
                    </div>
                    <div>
                      <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                        IGN Kapten
                      </label>
                      <input
                        required
                        value={String(formState.captainIgn || '')}
                        onChange={(e) => setFormState({ ...formState, captainIgn: e.target.value })}
                        className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC]"
                      />
                    </div>
                    <div>
                      <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                        Kontak
                      </label>
                      <input
                        value={String(formState.captainContact || '')}
                        onChange={(e) =>
                          setFormState({ ...formState, captainContact: e.target.value })
                        }
                        className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC]"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                      Daftar IGN Roster (Pisahkan koma)
                    </label>
                    <textarea
                      rows={2}
                      value={String(formState.roster || '')}
                      onChange={(e) => setFormState({ ...formState, roster: e.target.value })}
                      className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC]"
                    />
                  </div>
                </>
              )}

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 border border-white/20 text-[#F8FAFC] font-display text-sm font-semibold uppercase rounded-[4px] hover:border-[#00F0FF] cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-[#00F0FF] text-[#0A0C10] font-display text-sm font-bold uppercase rounded-[4px] hover:shadow-[0_0_16px_rgba(0,240,255,0.45)] disabled:opacity-50 cursor-pointer"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Data'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LIVE PREVIEW OF PUBLIC TOURNAMENT HUB */}
      {previewTournament && (
        <TournamentDetailHub
          tournament={
            db.tournaments.find((t) => t.id === previewTournament.id) || previewTournament
          }
          initialTab="overview"
          matches={db.matches}
          squads={db.squads}
          onClose={() => setPreviewTournament(null)}
          onRegister={() => {
            setPreviewTournament(null);
            openCreateModal('squads');
          }}
          onSelectMatch={() => {
            setPreviewTournament(null);
            setActiveTab('matches');
          }}
          canEditBracket
          onUpdateMatch={handleInlineBracketUpdate}
        />
      )}

      {/* CONFIRM RESET BRACKET */}
      {confirmBracketTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0A0C10]/85 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md bg-[#1A202C] border border-[#FF2E5B]/45 rounded-[6px] overflow-hidden">
            <div className="px-6 py-4 bg-[#12161F] border-b border-white/[0.08]">
              <h3 className="font-display text-lg font-bold uppercase text-[#F8FAFC]">
                Konfirmasi Reset Bagan Turnamen
              </h3>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-[#E2E2E8] leading-relaxed">
                Turnamen <strong className="text-[#00F0FF]">{confirmBracketTarget.trn.name}</strong>{' '}
                sudah memiliki{' '}
                <strong className="text-[#FF2E5B] tabular-nums">
                  {confirmBracketTarget.existingCount} pertandingan
                </strong>
                . Membuat ulang bracket akan mengganti seluruh jadwal dan skor yang sudah ada.
              </p>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmBracketTarget(null)}
                  className="px-4 py-2 border border-white/20 text-[#F8FAFC] font-display text-xs font-semibold uppercase rounded-[4px] cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={busyId === confirmBracketTarget.trn.id}
                  onClick={() => executeGenerateBracket(confirmBracketTarget.trn)}
                  className="px-4 py-2 bg-[#FF2E5B] text-white font-display text-xs font-bold uppercase rounded-[4px] hover:brightness-110 disabled:opacity-50 cursor-pointer"
                >
                  {busyId === confirmBracketTarget.trn.id
                    ? 'Memproses...'
                    : 'Ya, Buat Ulang Bracket'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* 2FA SECURITY SETTINGS MODAL */}
      {twoFactorModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0A0C10]/85 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-2xl bg-[#1A202C] border border-white/15 rounded-[6px] overflow-hidden">
            <div className="px-5 py-4 bg-[#12161F] border-b border-white/[0.08] flex items-center justify-between">
              <div className="font-display text-lg font-bold uppercase text-[#F8FAFC]">
                Pengaturan Keamanan Akun League Ops
              </div>
              <button
                type="button"
                onClick={() => setTwoFactorModalOpen(false)}
                className="text-[#94A3B8] hover:text-white cursor-pointer"
                aria-label="Tutup modal 2FA"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5">
              <TwoFactorManagerCard
                user={user}
                onUserUpdated={(next) => onUserUpdated?.(next)}
                onNotify={onNotify}
              />
            </div>
          </div>
        </div>
      )}
      <ConfirmDeleteModal
        open={Boolean(deleteTarget)}
        categoryLabel={
          deleteTarget?.tab === 'tournaments'
            ? 'Turnamen'
            : deleteTarget?.tab === 'matches'
              ? 'Pertandingan'
              : 'Squad'
        }
        itemName={deleteTarget?.label || ''}
        deleting={deletingTarget}
        onCancel={() => {
          if (!deletingTarget) setDeleteTarget(null);
        }}
        onConfirm={executeDelete}
      />
    </div>
  );
};
