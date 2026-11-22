import React, { useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  BarChart3,
  Check,
  Crown,
  Database,
  Download,
  ExternalLink,
  FileJson,
  FileSpreadsheet,
  FileText,
  GitBranch,
  History,
  LayoutDashboard,
  LayoutTemplate,
  LogOut,
  Menu,
  Mic,
  Minus,
  Pencil,
  Plus,
  Receipt,
  Search,
  ShieldCheck,
  Sparkles,
  Swords,
  Trash2,
  Trophy,
  UserCog,
  Users,
  Wallet,
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
  NewsArticle,
  NewsCategory,
  OrdalDatabase,
  ScrimGame,
  ScrimMode,
  ScrimSession,
  ScrimStatus,
  Shoutcaster,
  Squad,
  Tournament,
  TournamentFormat,
  TournamentStatus,
} from '../types';
import { AuditLogPanel } from './AuditLogPanel';
import { OrdalMonogram, OrdalWordmark } from './BrandAssets';
import { CasterBadges } from './CasterBadges';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import { computeDauMetrics, DauAnalyticsPanel } from './DauAnalyticsPanel';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { GamePerformanceIncomePanel } from './GamePerformanceIncomePanel';
import { HeroSettingsPanel } from './HeroSettingsPanel';
import { InteractiveDataDashboard } from './InteractiveDataDashboard';
import { LiveBracketCanvas } from './LiveBracketCanvas';
import { MonthlyTournamentRegistrationsChart } from './MonthlyTournamentRegistrationsChart';
import { NewsThumbnailUploader } from './NewsThumbnailUploader';
import { PaymentDetailCenter } from './PaymentDetailCenter';
import { PerformanceMetricsWidget } from './PerformanceMetricsWidget';
import { PlatformActivityChart } from './PlatformActivityChart';
import { formatRupiah, SCRIM_CASTERS, SCRIM_GAMES, TIME_SLOTS } from './ScrimArena';
import { ScrimManagementPanel } from './ScrimManagementPanel';
import { SocSecurityPanel } from './SocSecurityPanel';
import { TournamentDetailHub } from './TournamentDetailHub';

type AdminTab =
  | 'overview'
  | 'analytics'
  | 'hero'
  | 'tournaments'
  | 'scrims'
  | 'casters'
  | 'payments'
  | 'matches'
  | 'squads'
  | 'news'
  | 'league-ops'
  | 'soc'
  | 'audit'
  | 'exports';

type ExportDataset =
  | 'all'
  | 'tournaments'
  | 'scrims'
  | 'casters'
  | 'withdrawals'
  | 'matches'
  | 'squads'
  | 'news'
  | 'users';

interface AdminDashboardProps {
  user: AuthUser;
  db: OrdalDatabase;
  onUserUpdated?: (user: AuthUser) => void;
  onRefresh: () => Promise<void>;
  onBackToSite: () => void;
  onMonitorCaster: (casterId?: string) => void;
  onLogout: () => void;
  onNotify: (msg: string) => void;
}

type AdminNavGroup =
  | 'Operasional Liga'
  | 'Ekosistem Scrim'
  | 'Konten & Analitik'
  | 'Tata Kelola & Keamanan';

const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  'Operasional Liga',
  'Ekosistem Scrim',
  'Konten & Analitik',
  'Tata Kelola & Keamanan',
];

const NAV_ITEMS: {
  id: AdminTab;
  label: string;
  group: AdminNavGroup;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'overview', label: 'Overview', group: 'Operasional Liga', icon: LayoutDashboard },
  { id: 'tournaments', label: 'Tournament Builder', group: 'Operasional Liga', icon: Trophy },
  { id: 'matches', label: 'Live Matches & Bracket', group: 'Operasional Liga', icon: GitBranch },
  { id: 'squads', label: 'Roster & Squads', group: 'Operasional Liga', icon: Users },
  { id: 'scrims', label: 'Scrim All Game', group: 'Ekosistem Scrim', icon: Swords },
  { id: 'casters', label: 'Monitor Caster', group: 'Ekosistem Scrim', icon: Mic },
  { id: 'payments', label: 'Payment & Validasi', group: 'Ekosistem Scrim', icon: Receipt },
  { id: 'analytics', label: 'Data Dashboard', group: 'Konten & Analitik', icon: BarChart3 },
  { id: 'hero', label: 'Hero & Logo', group: 'Konten & Analitik', icon: LayoutTemplate },
  { id: 'news', label: 'News', group: 'Konten & Analitik', icon: FileText },
  { id: 'league-ops', label: 'Akun League Ops', group: 'Tata Kelola & Keamanan', icon: UserCog },
  { id: 'soc', label: 'SOC Security', group: 'Tata Kelola & Keamanan', icon: ShieldCheck },
  { id: 'audit', label: 'Audit Log', group: 'Tata Kelola & Keamanan', icon: History },
  { id: 'exports', label: 'Export Data', group: 'Tata Kelola & Keamanan', icon: Download },
];

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  user,
  db,
  onUserUpdated,
  onRefresh,
  onBackToSite,
  onMonitorCaster,
  onLogout,
  onNotify,
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [scrimGameFilter, setScrimGameFilter] = useState<'ALL' | ScrimGame>('ALL');
  const [scrimStatusFilter, setScrimStatusFilter] = useState<'ALL' | ScrimStatus>('ALL');
  const [squadTournamentFilter, setSquadTournamentFilter] = useState<string>('ALL');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkCheckingIn, setBulkCheckingIn] = useState(false);
  const [confirmBracketTarget, setConfirmBracketTarget] = useState<{
    trn: Tournament;
    existingCount: number;
  } | null>(null);

  // Modal state for Create / Edit across all CRUD resources
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState<Record<string, string | number>>({});
  const [modalError, setModalError] = useState('');
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<{
    tab: AdminTab;
    id: string;
    label: string;
  } | null>(null);
  const [deletingTarget, setDeletingTarget] = useState(false);

  // Scrim Result Modal for Team Leaderboard Scrim
  const [resultTarget, setResultTarget] = useState<ScrimSession | null>(null);
  const [resultHostScore, setResultHostScore] = useState<number>(0);
  const [resultChallScore, setResultChallScore] = useState<number>(0);
  const [resultModalError, setResultModalError] = useState('');
  const [savingResult, setSavingResult] = useState(false);

  // Super Admin Data Export state
  const [adminUsers, setAdminUsers] = useState<AuthUser[]>([]);
  const [exportingKey, setExportingKey] = useState<string | null>(null);
  const [previewTournament, setPreviewTournament] = useState<Tournament | null>(null);
  const [selectedBracketTournamentId, setSelectedBracketTournamentId] = useState<string>('');

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

  // Add New Caster Modal & Badge Management state
  const [createCasterOpen, setCreateCasterOpen] = useState(false);
  const [creatingCaster, setCreatingCaster] = useState(false);
  const [newCasterName, setNewCasterName] = useState('');
  const [newCasterAlias, setNewCasterAlias] = useState('');
  const [newCasterEmail, setNewCasterEmail] = useState('');
  const [newCasterRate, setNewCasterRate] = useState<number>(125000);
  const [newCasterMaxMatches, setNewCasterMaxMatches] = useState<number>(2);
  const [newCasterGames, setNewCasterGames] = useState<ScrimGame[]>(['POINT BLANK', 'FREE FIRE', 'EFOOTBALL']);
  const [newCasterBio, setNewCasterBio] = useState('');
  const [newCasterVerified, setNewCasterVerified] = useState(true);
  const [newCasterTopCaster, setNewCasterTopCaster] = useState(false);
  const [casterBadgeFilter, setCasterBadgeFilter] = useState<
    'ALL' | 'VERIFIED' | 'TOP_CASTER' | 'UNBADGED'
  >('ALL');
  const [badgeSavingKey, setBadgeSavingKey] = useState<string | null>(null);
  const [casterModalError, setCasterModalError] = useState('');

  useEscapeKey(
    Boolean(!deleteTarget && (confirmBracketTarget || createCasterOpen || resultTarget || modalMode)),
    () => {
      if (confirmBracketTarget) {
        if (busyId !== confirmBracketTarget.trn.id) setConfirmBracketTarget(null);
      } else if (createCasterOpen) {
        if (!creatingCaster) {
          setCreateCasterOpen(false);
          setCasterModalError('');
        }
      } else if (resultTarget) {
        if (!savingResult) {
          setResultTarget(null);
          setResultModalError('');
        }
      } else if (modalMode && !saving) {
        closeModal();
      }
    }
  );

  const handleToggleCasterBadge = async (
    caster: Shoutcaster,
    field: 'isVerified' | 'isTopCaster'
  ) => {
    const nextValue = !Boolean(caster[field]);
    const opKey = `${caster.id}:${field}`;
    setBadgeSavingKey(opKey);
    try {
      await api.updateCasterBadges(caster.id, { [field]: nextValue });
      await onRefresh();
      const label = field === 'isVerified' ? 'Verified' : 'Top Caster';
      onNotify(
        `Badge "${label}" untuk ${caster.name} ${nextValue ? 'diaktifkan' : 'dinonaktifkan'}.`
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal memperbarui badge caster.');
    } finally {
      setBadgeSavingKey(null);
    }
  };

  const handleCreateCaster = async (e: React.FormEvent) => {
    e.preventDefault();
    setCasterModalError('');
    if (newCasterGames.length === 0) {
      setCasterModalError('Pilih minimal 1 spesialisasi game untuk caster.');
      return;
    }
    setCreatingCaster(true);
    try {
      const res = await api.createCaster({
        name: newCasterName.trim(),
        alias: newCasterAlias.trim() || undefined,
        email: newCasterEmail.trim(),
        rateCard: Number(newCasterRate) || 0,
        maxMatchesPerDay: Number(newCasterMaxMatches) || 2,
        specialtyGames: newCasterGames,
        bio: newCasterBio.trim() || undefined,
        status: 'ACTIVE',
        isVerified: newCasterVerified,
        isTopCaster: newCasterTopCaster,
      });
      await onRefresh();
      setAdminUsers((prev) => [...prev, res.user]);
      setCreateCasterOpen(false);
      setCasterModalError('');
      setNewCasterName('');
      setNewCasterAlias('');
      setNewCasterEmail('');
      setNewCasterRate(125000);
      setNewCasterMaxMatches(2);
      setNewCasterGames(['POINT BLANK', 'FREE FIRE', 'EFOOTBALL']);
      setNewCasterBio('');
      setNewCasterVerified(true);
      setNewCasterTopCaster(false);
      onNotify(`Caster "${res.caster.name}" berhasil ditambahkan! Akun login: ${res.user.email}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menambahkan caster baru.';
      setCasterModalError(msg);
      onNotify(msg);
    } finally {
      setCreatingCaster(false);
    }
  };

  // League Ops Operator Account Management state (Super Admin only)
  const [leagueOpsName, setLeagueOpsName] = useState('');
  const [leagueOpsEmail, setLeagueOpsEmail] = useState('');
  const [creatingLeagueOps, setCreatingLeagueOps] = useState(false);
  const [leagueOpsError, setLeagueOpsError] = useState('');
  const [leagueOpsSuccess, setLeagueOpsSuccess] = useState('');
  const [confirmDeleteLeagueOpsId, setConfirmDeleteLeagueOpsId] = useState<string | null>(null);
  const [deletingLeagueOpsId, setDeletingLeagueOpsId] = useState<string | null>(null);

  const leagueOpsUsers = useMemo(
    () => adminUsers.filter((u) => u.role === 'LEAGUE_OPS'),
    [adminUsers]
  );

  const handleCreateLeagueOps = async (e: React.FormEvent) => {
    e.preventDefault();
    setLeagueOpsError('');
    setLeagueOpsSuccess('');
    setCreatingLeagueOps(true);
    try {
      const res = await api.createLeagueOpsUser({
        displayName: leagueOpsName.trim(),
        email: leagueOpsEmail.trim(),
      });
      setAdminUsers((prev) => [...prev, res.user]);
      setLeagueOpsName('');
      setLeagueOpsEmail('');
      await onRefresh();
      const msg = `Undangan League Ops "${res.user.displayName}" (${res.user.email}) berhasil dibuat.`;
      setLeagueOpsSuccess(msg);
      onNotify(msg);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal membuat undangan League Ops.';
      setLeagueOpsError(msg);
      onNotify(msg);
    } finally {
      setCreatingLeagueOps(false);
    }
  };

  const handleDeleteLeagueOps = async (target: AuthUser) => {
    setDeletingLeagueOpsId(target.id);
    try {
      await api.deleteLeagueOpsUser(target.id);
      setAdminUsers((prev) => prev.filter((u) => u.id !== target.id));
      setConfirmDeleteLeagueOpsId(null);
      await onRefresh();
      onNotify(`Akses League Ops untuk ${target.displayName} berhasil dihapus.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal menghapus akun League Ops.');
    } finally {
      setDeletingLeagueOpsId(null);
    }
  };

  useEffect(() => {
    let active = true;
    api
      .getAdminUsers()
      .then((res) => {
        if (active) setAdminUsers(res.users || []);
      })
      .catch(() => {
        // ignore if not loaded
      });
    return () => {
      active = false;
    };
  }, []);

  const handleExport = async (dataset: ExportDataset, format: 'json' | 'csv') => {
    const key = `${dataset}:${format}`;
    setExportingKey(key);
    try {
      const filename = await api.downloadAdminExport(dataset, format);
      onNotify(`Berhasil mengunduh ${filename}`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal mengunduh data.');
    } finally {
      setExportingKey(null);
    }
  };

  const activeNav = NAV_ITEMS.find((n) => n.id === activeTab)!;

  const openCreateModal = (tab: AdminTab) => {
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
    } else if (tab === 'scrims') {
      const defaultCaster = (db.casters || [])[0];
      setFormState({
        game: 'POINT BLANK',
        date: '2026-11-25',
        timeSlot: TIME_SLOTS[0],
        mode: 'OPEN_LOBBY',
        status: 'OPEN_LOBBY',
        casterId: defaultCaster?.id || '',
        casterName: defaultCaster?.name || SCRIM_CASTERS[0].name,
        casterRate: defaultCaster?.rateCard ?? SCRIM_CASTERS[0].rate,
        hostTeamName: '',
        hostRosterCore: '',
        challengerTeamName: '',
      });
    } else if (tab === 'news') {
      setFormState({
        title: '',
        category: 'META UPDATE',
        author: 'Redaksi ORDAL',
        readTime: '4 MIN READ',
        excerpt: '',
        content: '',
        accentTone: 'lime',
        thumbnailUrl: '',
      });
    }
  };

  const openEditModal = (
    tab: AdminTab,
    item: Tournament | Match | Squad | NewsArticle | ScrimSession
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
    } else if (tab === 'scrims') {
      const sc = item as ScrimSession;
      setFormState({
        game: sc.game,
        date: sc.date,
        timeSlot: sc.timeSlot,
        mode: sc.mode,
        status: sc.status,
        casterId: sc.casterId || '',
        casterName: sc.casterName,
        casterRate: sc.casterRate,
        hostTeamName: sc.hostTeamName,
        hostRosterCore: sc.hostRosterCore.join(', '),
        challengerTeamName: sc.challengerTeamName,
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
      } else if (activeTab === 'scrims') {
        const liveCaster = (db.casters || []).find(
          (c) => c.id === formState.casterId || c.name === formState.casterName
        );
        const fallbackCaster =
          SCRIM_CASTERS.find((c) => c.name === formState.casterName) || SCRIM_CASTERS[0];
        const payload = {
          game: formState.game as ScrimGame,
          date: String(formState.date || '2026-11-25'),
          timeSlot: String(formState.timeSlot || '20:00 WIB'),
          mode: formState.mode as ScrimMode,
          status: formState.status as ScrimStatus,
          casterId: liveCaster?.id || undefined,
          casterName: liveCaster?.name || fallbackCaster.name,
          casterRate: liveCaster ? liveCaster.rateCard : fallbackCaster.rate,
          hostTeamName: String(formState.hostTeamName || ''),
          hostRosterCore: String(formState.hostRosterCore || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          challengerTeamName: String(formState.challengerTeamName || ''),
        };
        if (modalMode === 'create') {
          await api.createScrim(payload);
          onNotify('Sesi Scrim All Game berhasil dibuat.');
        } else if (editingId) {
          await api.updateScrim(editingId, payload);
          onNotify('Sesi Scrim All Game diperbarui.');
        }
      } else if (activeTab === 'news') {
        if (modalMode === 'create') {
          await api.createNews(formState as unknown as Partial<NewsArticle>);
          onNotify('Berita baru berhasil dipublikasikan.');
        } else if (editingId) {
          await api.updateNews(editingId, formState as unknown as Partial<NewsArticle>);
          onNotify('Artikel berita diperbarui.');
        }
      }
      await onRefresh();
      closeModal();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan data.';
      setModalError(msg);
      onNotify(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (tab: AdminTab, id: string, label: string) => {
    setDeleteTarget({ tab, id, label });
  };

  const executeDelete = async () => {
    if (!deleteTarget) return;
    const { tab, id, label } = deleteTarget;
    setDeletingTarget(true);
    setBusyId(id);
    try {
      if (tab === 'tournaments') await api.deleteTournament(id);
      if (tab === 'scrims') await api.deleteScrim(id);
      if (tab === 'matches') await api.deleteMatch(id);
      if (tab === 'squads') await api.deleteSquad(id);
      if (tab === 'news') await api.deleteNews(id);
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

  const q = searchQuery.trim().toLowerCase();

  const filteredTournaments = useMemo(
    () =>
      db.tournaments.filter(
        (t) => !q || t.name.toLowerCase().includes(q) || t.game.toLowerCase().includes(q)
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

  const filteredNews = useMemo(
    () =>
      db.news.filter(
        (n) => !q || n.title.toLowerCase().includes(q) || n.category.toLowerCase().includes(q)
      ),
    [db.news, q]
  );

  const filteredScrims = useMemo(
    () =>
      (db.scrims || []).filter((s) => {
        if (scrimGameFilter !== 'ALL' && s.game !== scrimGameFilter) return false;
        if (scrimStatusFilter !== 'ALL' && s.status !== scrimStatusFilter) return false;
        if (!q) return true;
        return (
          s.hostTeamName.toLowerCase().includes(q) ||
          s.challengerTeamName.toLowerCase().includes(q) ||
          s.game.toLowerCase().includes(q) ||
          s.casterName.toLowerCase().includes(q)
        );
      }),
    [db.scrims, q, scrimGameFilter, scrimStatusFilter]
  );

  const liveMatchesCount = db.matches.filter((m) => m.status === 'LIVE').length;
  const activeScrimsCount = (db.scrims || []).length;
  const confirmedScrims = (db.scrims || []).filter((s) => s.status === 'CONFIRMED');
  const internalOrdalRevenue = confirmedScrims.reduce(
    (sum, s) => sum + (s.platformFee || 50000),
    0
  );
  const pendingCheckInCount = db.squads.filter((s) => s.checkInStatus === 'PENDING').length;
  const pendingScrimActionCount = (db.scrims || []).filter(
    (s) =>
      s.status === 'WAITING_APPROVAL' ||
      s.status === 'AWAITING_PAYMENT' ||
      s.status === 'PARTIALLY_PAID'
  ).length;
  const pendingWithdrawCount = (db.withdrawals || []).filter((w) => w.status === 'PENDING').length;
  const pendingPaymentsCount = (db.payments || []).filter(
    (p) => p.status === 'PENDING_VALIDATION'
  ).length;
  const dauMetrics = useMemo(() => computeDauMetrics(db, adminUsers), [db, adminUsers]);

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
                  SUPER ADMIN
                </div>
                <div className="font-telemetry text-[10px] uppercase tracking-[0.1em] text-[#FF2E5B] mt-0.5">
                  INTERNAL ORDAL
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden text-[#94A3B8] hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="px-4 py-3 border-b border-white/[0.08] font-telemetry text-[11px] text-[#94A3B8] truncate">
            {user.displayName} · <span className="text-[#00F0FF]">{user.email}</span>
          </div>

          <nav className="p-3 space-y-4">
            {ADMIN_NAV_GROUPS.map((group) => {
              const groupItems = NAV_ITEMS.filter((item) => item.group === group);
              return (
                <div key={group} className="space-y-1">
                  <div className="px-3 pb-1 font-telemetry text-[10px] font-bold uppercase tracking-[0.1em] text-[#94A3B8]/80">
                    {group}
                  </div>
                  {groupItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    const badgeCount =
                      item.id === 'matches'
                        ? liveMatchesCount
                        : item.id === 'squads'
                          ? pendingCheckInCount
                          : item.id === 'scrims'
                            ? pendingScrimActionCount
                            : item.id === 'casters'
                              ? pendingWithdrawCount
                              : item.id === 'payments'
                                ? pendingPaymentsCount
                                : item.id === 'league-ops'
                                  ? leagueOpsUsers.length
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
                        className={`w-full flex items-center justify-between px-3.5 py-2 rounded-[4px] font-telemetry text-xs font-semibold uppercase tracking-[0.06em] transition-colors cursor-pointer ${
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
                                : item.id === 'casters'
                                  ? 'text-[#CCFF00]'
                                  : item.id === 'league-ops'
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
                </div>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-white/[0.08] space-y-2">
          <button
            type="button"
            onClick={onBackToSite}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-white/20 text-[#F8FAFC] font-display text-sm font-semibold uppercase tracking-[0.05em] rounded-[4px] hover:border-[#00F0FF] hover:bg-[#00F0FF]/[0.06] transition-colors cursor-pointer"
          >
            <ExternalLink className="w-4 h-4 text-[#00F0FF]" />
            Lihat Website Publik
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 border border-white/15 text-[#94A3B8] hover:text-[#FF2E5B] hover:border-[#FF2E5B]/50 font-telemetry text-xs font-semibold uppercase rounded-[4px] transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Keluar Akun
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar (Breadcrumb + Primary CTA) */}
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
              <span className="text-[#94A3B8] hidden sm:inline">Admin</span>
              <span className="text-white/25 hidden sm:inline">/</span>
              <span className="text-[#F8FAFC] font-bold truncate">{activeNav.label}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            {activeTab === 'overview' && (
              <button
                type="button"
                disabled={exportingKey !== null}
                onClick={() => handleExport('all', 'json')}
                className="inline-flex items-center gap-1.5 px-3 sm:px-3.5 min-h-[38px] border border-[#00F0FF]/40 bg-[#00F0FF]/10 text-[#00F0FF] font-telemetry text-[11px] sm:text-xs font-bold uppercase tracking-[0.06em] rounded-[4px] hover:bg-[#00F0FF]/20 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                {exportingKey === 'all:json' ? 'Mengunduh...' : 'Unduh Semua'}
              </button>
            )}
            {activeTab !== 'overview' &&
              activeTab !== 'analytics' &&
              activeTab !== 'hero' &&
              activeTab !== 'audit' &&
              activeTab !== 'exports' &&
              activeTab !== 'payments' &&
              activeTab !== 'league-ops' &&
              activeTab !== 'soc' && (
              <button
                type="button"
                disabled={exportingKey !== null}
                onClick={() => handleExport(activeTab as ExportDataset, 'csv')}
                className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 min-h-[38px] border border-white/15 bg-white/[0.04] text-[#F8FAFC] font-telemetry text-[11px] sm:text-xs font-semibold uppercase tracking-[0.05em] rounded-[4px] hover:border-[#00F0FF]/60 hover:text-[#00F0FF] transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-[#CCFF00]" />
                {exportingKey === `${activeTab}:csv` ? '...' : 'CSV'}
              </button>
            )}
            {activeTab === 'casters' && (
              <>
                <button
                  type="button"
                  onClick={() => setCreateCasterOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 sm:px-4 min-h-[38px] bg-[#00F0FF] text-[#0A0C10] font-display text-xs sm:text-sm font-bold uppercase tracking-[0.05em] rounded-[4px] hover:shadow-[0_0_16px_rgba(0,240,255,0.45)] transition-all cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  Tambah Caster
                </button>
                <button
                  type="button"
                  onClick={() => onMonitorCaster()}
                  className="inline-flex items-center gap-1.5 px-3 sm:px-4 min-h-[38px] bg-[#CCFF00] text-[#0A0C10] font-display text-xs sm:text-sm font-bold uppercase tracking-[0.05em] rounded-[4px] hover:brightness-110 transition-all cursor-pointer whitespace-nowrap"
                >
                  <Mic className="w-4 h-4" />
                  <span className="hidden sm:inline">Buka</span> Dashboard Caster
                </button>
              </>
            )}
            {activeTab !== 'overview' &&
              activeTab !== 'analytics' &&
              activeTab !== 'hero' &&
              activeTab !== 'audit' &&
              activeTab !== 'casters' &&
              activeTab !== 'exports' &&
              activeTab !== 'payments' &&
              activeTab !== 'league-ops' &&
              activeTab !== 'soc' && (
              <button
                type="button"
                onClick={() => openCreateModal(activeTab)}
                className="inline-flex items-center gap-1.5 px-3 sm:px-4 min-h-[38px] bg-[#00F0FF] text-[#0A0C10] font-display text-xs sm:text-sm font-bold uppercase tracking-[0.05em] rounded-[4px] hover:shadow-[0_0_16px_rgba(0,240,255,0.45)] transition-all cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                Tambah
              </button>
            )}
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-4 sm:p-8 max-w-[1440px] w-full mx-auto">
          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <div className="space-y-8">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                  <h1 className="font-display text-3xl font-bold uppercase text-[#F8FAFC]">
                    Command Center ORDAL
                  </h1>
                  <p className="text-sm text-[#94A3B8] mt-1">
                    Kelola turnamen, skor live bracket, check-in roster, dan news secara real-time.
                  </p>
                </div>
                <OrdalWordmark height={34} className="hidden sm:inline-flex" />
              </div>

              {/* KPI Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
                {[
                  {
                    label: 'DAU (Hari Ini)',
                    value: dauMetrics.todayDau.toLocaleString('id-ID'),
                    sub: `${dauMetrics.deltaPercent >= 0 ? '+' : ''}${dauMetrics.deltaPercent}% vs kemarin`,
                    color: '#00F0FF',
                  },
                  { label: 'Total Turnamen', value: db.tournaments.length, color: '#F8FAFC' },
                  { label: 'Sesi Scrim', value: activeScrimsCount, color: '#00F0FF' },
                  {
                    label: 'Total Lobby Fee ORDAL',
                    value: formatRupiah(internalOrdalRevenue),
                    subText: `Tarif dasar ${formatRupiah(db.scrimSettings?.defaultLobbyFee ?? 50000)}`,
                    color: '#CCFF00',
                  },
                  { label: 'Match LIVE', value: liveMatchesCount, color: '#FF2E5B' },
                  { label: 'Squad Terdaftar', value: db.squads.length, color: '#F8FAFC' },
                ].map((kpi) => (
                  <div
                    key={kpi.label}
                    className="p-5 bg-[#12161F] border border-white/[0.08] rounded-[6px]"
                  >
                    <div className="font-telemetry text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">
                      {kpi.label}
                    </div>
                    <div
                      className="mt-2 font-display text-2xl sm:text-3xl font-bold tabular-nums"
                      style={{ color: kpi.color }}
                    >
                      {kpi.value}
                    </div>
                    {'sub' in kpi && kpi.sub && (
                      <div
                        className={`mt-1 font-telemetry text-[11px] font-semibold ${
                          dauMetrics.deltaPercent >= 0 ? 'text-[#CCFF00]' : 'text-[#FF2E5B]'
                        }`}
                      >
                        {kpi.sub}
                      </div>
                    )}
                    {'subText' in kpi && kpi.subText && (
                      <div className="mt-1 font-telemetry text-[11px] text-[#94A3B8]">
                        {kpi.subText}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Prioritas Tindakan Operasional Admin */}
              <div className="p-5 bg-[#12161F] border border-white/[0.08] rounded-[6px] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="font-display text-lg font-bold uppercase text-[#F8FAFC]">
                      Antrean Tugas Operasional
                    </h2>
                    <p className="font-telemetry text-[11px] text-[#94A3B8]">
                      Pintasan langsung menuju pekerjaan yang membutuhkan tindakan Admin saat ini.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  {[
                    {
                      title: 'Match Sedang LIVE',
                      count: liveMatchesCount,
                      desc: 'Update skor langsung di chart bracket',
                      tab: 'matches' as AdminTab,
                      accent: '#FF2E5B',
                    },
                    {
                      title: 'Squad Menunggu Check-In',
                      count: pendingCheckInCount,
                      desc: 'Verifikasi kehadiran tim sebelum main',
                      tab: 'squads' as AdminTab,
                      accent: '#FACC15',
                    },
                    {
                      title: 'Scrim Butuh Tindakan',
                      count: pendingScrimActionCount,
                      desc: 'Approval caster & verifikasi patungan',
                      tab: 'scrims' as AdminTab,
                      accent: '#00F0FF',
                    },
                    {
                      title: 'Validasi Pembayaran',
                      count: pendingPaymentsCount,
                      desc: 'Invoice patungan, payout & refund',
                      tab: 'payments' as AdminTab,
                      accent: '#FACC15',
                    },
                    {
                      title: 'Withdraw Caster Pending',
                      count: pendingWithdrawCount,
                      desc: 'Konfirmasi pencairan fee shoutcaster',
                      tab: 'casters' as AdminTab,
                      accent: '#CCFF00',
                    },
                  ].map((task) => (
                    <button
                      key={task.title}
                      type="button"
                      onClick={() => setActiveTab(task.tab)}
                      className="p-3.5 text-left bg-[#0A0C10] border border-white/[0.08] hover:border-[#00F0FF]/50 rounded-[4px] transition-colors cursor-pointer flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="font-telemetry text-[11px] font-bold uppercase text-[#F8FAFC] truncate">
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

              {/* Performance Metrics: Daily Registration Growth & Match Completion Rate */}
              <PerformanceMetricsWidget db={db} />

              {/* Super Admin Only: Game Performance & Overall Income Analytics */}
              {user.role === 'SUPER_ADMIN' && (
                <GamePerformanceIncomePanel user={user} db={db} />
              )}

              {/* Daily Active Users (DAU) Analytics */}
              <DauAnalyticsPanel metrics={dauMetrics} />

              {/* Monthly Tournament Registrations (Recharts Bar + Trend Line) */}
              <MonthlyTournamentRegistrationsChart db={db} />

              {/* Platform Activity Trend (30-Day Recharts Visualization) */}
              <PlatformActivityChart db={db} />

              {/* Quick Live Score Controller + Pending Disputes */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7 bg-[#12161F] border border-white/[0.08] rounded-[6px] p-6">
                  <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
                    <h2 className="font-display text-xl font-bold uppercase text-[#F8FAFC]">
                      Kontrol Cepat Skor Live &amp; Bracket
                    </h2>
                    <button
                      type="button"
                      onClick={() => setActiveTab('matches')}
                      className="font-telemetry text-xs uppercase text-[#00F0FF] hover:underline cursor-pointer"
                    >
                      Semua Match →
                    </button>
                  </div>

                  <div className="mt-4 space-y-3">
                    {db.matches.slice(0, 4).map((m) => (
                      <div
                        key={m.id}
                        className="p-4 bg-[#0A0C10] border border-white/[0.08] rounded-[4px] flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div>
                          <div className="font-telemetry text-[10px] uppercase tracking-[0.08em] text-[#94A3B8]">
                            {m.game} · {m.round} · {m.mapName}
                          </div>
                          <div className="mt-1 font-display text-lg font-bold uppercase text-[#F8FAFC]">
                            {m.teamATag} <span className="text-[#94A3B8] text-sm">vs</span> {m.teamBTag}
                          </div>
                        </div>

                        <div className="flex items-center gap-3 flex-wrap">
                          {/* Team A Stepper */}
                          <div className="flex items-center gap-1 bg-[#12161F] border border-white/10 rounded-[4px] p-1">
                            <button
                              type="button"
                              disabled={busyId === m.id}
                              onClick={() => handleQuickScore(m, 'A', -1)}
                              className="p-1 text-[#94A3B8] hover:text-white cursor-pointer"
                              aria-label="Kurangi skor tim A"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="w-7 text-center font-telemetry text-sm font-bold text-[#00F0FF]">
                              {m.scoreA}
                            </span>
                            <button
                              type="button"
                              disabled={busyId === m.id}
                              onClick={() => handleQuickScore(m, 'A', 1)}
                              className="p-1 text-[#94A3B8] hover:text-white cursor-pointer"
                              aria-label="Tambah skor tim A"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <span className="font-telemetry text-xs text-[#94A3B8]">:</span>

                          {/* Team B Stepper */}
                          <div className="flex items-center gap-1 bg-[#12161F] border border-white/10 rounded-[4px] p-1">
                            <button
                              type="button"
                              disabled={busyId === m.id}
                              onClick={() => handleQuickScore(m, 'B', -1)}
                              className="p-1 text-[#94A3B8] hover:text-white cursor-pointer"
                              aria-label="Kurangi skor tim B"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="w-7 text-center font-telemetry text-sm font-bold text-[#00F0FF]">
                              {m.scoreB}
                            </span>
                            <button
                              type="button"
                              disabled={busyId === m.id}
                              onClick={() => handleQuickScore(m, 'B', 1)}
                              className="p-1 text-[#94A3B8] hover:text-white cursor-pointer"
                              aria-label="Tambah skor tim B"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <select
                            value={m.status}
                            disabled={busyId === m.id}
                            onChange={(e) => handleQuickMatchStatus(m, e.target.value as MatchStatus)}
                            className="px-2.5 py-1.5 bg-[#12161F] border border-white/15 rounded-[4px] font-telemetry text-[11px] font-semibold uppercase text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                          >
                            <option value="UPCOMING">UPCOMING</option>
                            <option value="LIVE">LIVE</option>
                            <option value="FINISHED">FINISHED</option>
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="lg:col-span-5 bg-[#12161F] border border-white/[0.08] rounded-[6px] p-6">
                  <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
                    <h2 className="font-display text-xl font-bold uppercase text-[#F8FAFC]">
                      News Terbaru
                    </h2>
                    <button
                      type="button"
                      onClick={() => setActiveTab('news')}
                      className="font-telemetry text-xs uppercase text-[#00F0FF] hover:underline cursor-pointer"
                    >
                      Kelola →
                    </button>
                  </div>
                  <div className="mt-4 space-y-3">
                    {db.news.slice(0, 3).map((n) => (
                      <div
                        key={n.id}
                        className="p-4 bg-[#0A0C10] border border-white/[0.08] rounded-[4px]"
                      >
                        <div className="flex items-center justify-between font-telemetry text-[11px] uppercase">
                          <span className="text-[#CCFF00] font-bold">{n.category}</span>
                          <span className="text-[#94A3B8]">{n.publishedAt}</span>
                        </div>
                        <p className="mt-1.5 font-display text-sm font-bold uppercase text-[#F8FAFC] line-clamp-1">
                          {n.title}
                        </p>
                        <button
                          type="button"
                          onClick={() => openEditModal('news', n)}
                          className="mt-2 font-telemetry text-[11px] font-semibold uppercase text-[#00F0FF] hover:underline cursor-pointer"
                        >
                          Edit Artikel →
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SEARCH BAR FOR CRUD TABLES */}
          {activeTab !== 'overview' &&
            activeTab !== 'casters' &&
            activeTab !== 'exports' &&
            activeTab !== 'payments' &&
            activeTab !== 'league-ops' &&
            activeTab !== 'soc' && (
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

          {/* 1. TOURNAMENT BUILDER CRUD (SYNCED WITH PUBLIC TOURNAMENT HUB) */}
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
                          <div className="text-[#94A3B8]">
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
                          <div className="text-[#F8FAFC] font-semibold">
                            {Math.max(trn.registeredTeams, trnSquads.length)} / {trn.maxTeams} Tim
                          </div>
                          <div className="text-[#CCFF00] text-[11px]">
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
                              title={
                                trnMatches > 0
                                  ? 'Buat ulang bracket (konfirmasi diperlukan)'
                                  : 'Auto-Generate Bracket dari Squad terdaftar'
                              }
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
                </tbody>
              </table>
            </div>
          )}

          {/* 1B. SCRIM ALL GAME CRUD & SPLIT-BILL MONITOR */}
          {activeTab === 'scrims' && (
            <div className="space-y-4">
              <ScrimManagementPanel
                scrims={db.scrims || []}
                filteredScrims={filteredScrims}
                scrimSettings={db.scrimSettings}
                gameFilter={scrimGameFilter}
                statusFilter={scrimStatusFilter}
                onChangeGameFilter={setScrimGameFilter}
                onChangeStatusFilter={setScrimStatusFilter}
                onRefresh={onRefresh}
                onNotify={onNotify}
              />

              <div className="bg-[#12161F] border border-white/[0.08] rounded-[6px] overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[860px]">
                  <thead>
                    <tr className="border-b border-white/[0.08] font-telemetry text-[11px] uppercase tracking-[0.08em] text-[#94A3B8]">
                      <th className="py-3.5 px-4">Matchup &amp; Game</th>
                      <th className="py-3.5 px-4">Jadwal &amp; Caster</th>
                      <th className="py-3.5 px-4">Split-Bill</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06] text-sm">
                    {filteredScrims.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="py-10 px-4 text-center font-telemetry text-xs text-[#94A3B8]"
                        >
                          Tidak ada sesi scrim yang cocok dengan filter game/status saat ini.
                        </td>
                      </tr>
                    )}
                    {filteredScrims.map((sc) => (
                    <tr key={sc.id} className="hover:bg-white/[0.02]">
                      <td className="py-3.5 px-4">
                        <div className="font-display text-base font-bold uppercase text-[#F8FAFC]">
                          {sc.hostTeamName}{' '}
                          <span className="text-[#FF2E5B] text-xs">VS</span>{' '}
                          {sc.challengerTeamName || 'OPEN SLOT'}
                        </div>
                        <div className="font-telemetry text-[11px] text-[#00F0FF]">
                          {sc.game} · {sc.mode === 'DIRECT_CHALLENGE' ? 'DIRECT' : 'OPEN LOBBY'}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-telemetry text-xs">
                        <div className="text-[#F8FAFC]">
                          {sc.date} · {sc.timeSlot}
                        </div>
                        <div className="text-[#94A3B8] flex items-center gap-1.5 flex-wrap">
                          <span>{sc.casterName}</span>
                          {sc.casterId && (
                            <span
                              className={`text-[10px] font-bold uppercase ${
                                sc.casterApprovalStatus === 'APPROVED'
                                  ? 'text-[#00F0FF]'
                                  : sc.casterApprovalStatus === 'REJECTED'
                                    ? 'text-[#FF2E5B]'
                                    : 'text-[#FACC15]'
                              }`}
                            >
                              [{sc.casterApprovalStatus || 'PENDING'}]
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-telemetry text-xs">
                        <div className="font-bold text-[#CCFF00]">
                          {formatRupiah(sc.splitCostPerTeam)} / tim
                        </div>
                        <div className="text-[11px] text-[#94A3B8]">
                          A: {sc.hostPaid ? 'LUNAS' : 'BELUM'} · B:{' '}
                          {sc.challengerPaid ? 'LUNAS' : 'BELUM'} · Fee ORDAL {formatRupiah(sc.platformFee || 50000)}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-telemetry text-xs font-bold uppercase">
                        <span
                          className={
                            sc.status === 'OPEN_LOBBY'
                              ? 'text-[#CCFF00]'
                              : sc.status === 'WAITING_APPROVAL'
                                ? 'text-[#FF2E5B]'
                                : sc.status === 'AWAITING_PAYMENT'
                                  ? 'text-[#FACC15]'
                                  : sc.status === 'PARTIALLY_PAID'
                                    ? 'text-[#38BDF8]'
                                    : sc.status === 'CONFIRMED'
                                      ? 'text-[#00F0FF]'
                                      : 'text-[#94A3B8]'
                          }
                        >
                          {sc.status === 'OPEN_LOBBY'
                            ? 'Open Lobby'
                            : sc.status === 'WAITING_APPROVAL'
                              ? 'Menunggu Caster'
                              : sc.status === 'AWAITING_PAYMENT'
                                ? 'Menunggu Bayar'
                                : sc.status === 'PARTIALLY_PAID'
                                  ? 'Sebagian Lunas'
                                  : sc.status === 'CONFIRMED'
                                    ? 'Terkonfirmasi'
                                    : 'Dibatalkan'}
                        </span>
                        {sc.resultRecorded && (
                          <div className="mt-0.5 text-[11px] text-[#CCFF00] tabular-nums">
                            SKOR: {sc.hostScore} - {sc.challengerScore}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {sc.challengerTeamName && (
                            <button
                              type="button"
                              onClick={() => {
                                setResultTarget(sc);
                                setResultHostScore(sc.hostScore ?? 0);
                                setResultChallScore(sc.challengerScore ?? 0);
                              }}
                              className="px-2.5 py-1 bg-[#00F0FF]/12 border border-[#00F0FF]/40 text-[#00F0FF] font-telemetry text-[10px] font-bold uppercase rounded-[4px] hover:bg-[#00F0FF]/20 cursor-pointer"
                            >
                              {sc.resultRecorded ? 'Edit Skor' : 'Input Skor'}
                            </button>
                          )}
                          {sc.status === 'WAITING_APPROVAL' && (
                            <button
                              type="button"
                              onClick={async () => {
                                await api.approveScrim(sc.id);
                                await onRefresh();
                                onNotify('Scrim disetujui, menunggu pembayaran split-bill.');
                              }}
                              className="px-2.5 py-1 bg-[#00F0FF]/15 border border-[#00F0FF]/40 text-[#00F0FF] font-telemetry text-[10px] font-bold uppercase rounded-[4px] cursor-pointer"
                            >
                              Approve
                            </button>
                          )}
                          {(sc.status === 'AWAITING_PAYMENT' || sc.status === 'PARTIALLY_PAID') && (
                            <button
                              type="button"
                              onClick={async () => {
                                if (!sc.hostPaid) await api.payScrim(sc.id, 'host');
                                if (!sc.challengerPaid) await api.payScrim(sc.id, 'challenger');
                                await onRefresh();
                                onNotify('Split-bill ditandai lunas & slot terkunci.');
                              }}
                              className="px-2.5 py-1 bg-[#CCFF00]/15 border border-[#CCFF00]/40 text-[#CCFF00] font-telemetry text-[10px] font-bold uppercase rounded-[4px] cursor-pointer"
                            >
                              Lock Lunas
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openEditModal('scrims', sc)}
                            aria-label="Edit scrim"
                            className="p-1.5 text-[#94A3B8] hover:text-[#00F0FF] cursor-pointer"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete('scrims', sc.id, sc.hostTeamName)}
                            aria-label="Hapus scrim"
                            className="p-1.5 text-[#94A3B8] hover:text-[#FF2E5B] cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </div>
          )}

          {/* 1C. MONITOR DASHBOARD CASTER (SUPER ADMIN) */}
          {activeTab === 'casters' && (() => {
            const allCasters = db.casters || [];
            const verifiedCount = allCasters.filter((c) => Boolean(c.isVerified)).length;
            const topCasterCount = allCasters.filter((c) => Boolean(c.isTopCaster)).length;
            const unbadgedCount = allCasters.filter(
              (c) => !c.isVerified && !c.isTopCaster
            ).length;
            const filteredCasters = allCasters.filter((c) => {
              if (casterBadgeFilter === 'VERIFIED') return Boolean(c.isVerified);
              if (casterBadgeFilter === 'TOP_CASTER') return Boolean(c.isTopCaster);
              if (casterBadgeFilter === 'UNBADGED') return !c.isVerified && !c.isTopCaster;
              return true;
            });

            return (
            <div className="space-y-6">
              <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-4 border-b border-white/[0.08]">
                <div>
                  <h1 className="font-display text-2xl font-bold uppercase text-[#F8FAFC]">
                    Monitoring Talent &amp; Badge Shoutcaster
                  </h1>
                  <p className="text-sm text-[#94A3B8] mt-0.5">
                    Kelola badge publik <span className="text-[#00F0FF] font-semibold">Verified</span> &amp;{' '}
                    <span className="text-[#CCFF00] font-semibold">Top Caster</span>, pantau kuota match harian, Day Off, ratecard, dan akumulasi Lobby Fee.
                  </p>
                </div>

                {/* Badge Filter Controls */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {(
                    [
                      { id: 'ALL', label: `Semua (${allCasters.length})` },
                      { id: 'VERIFIED', label: `Verified (${verifiedCount})` },
                      { id: 'TOP_CASTER', label: `Top Caster (${topCasterCount})` },
                      { id: 'UNBADGED', label: `Standar (${unbadgedCount})` },
                    ] as const
                  ).map((f) => {
                    const active = casterBadgeFilter === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setCasterBadgeFilter(f.id)}
                        className={`min-h-[36px] px-3 py-1.5 rounded-[4px] border font-telemetry text-[11px] font-bold uppercase tracking-[0.06em] transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums ${
                          active
                            ? 'bg-[#00F0FF]/15 border-[#00F0FF] text-[#00F0FF]'
                            : 'bg-[#12161F] border-white/12 text-[#94A3B8] hover:text-[#F8FAFC]'
                        }`}
                      >
                        {f.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {filteredCasters.map((c) => {
                  const casterScrims = (db.scrims || []).filter((s) => s.casterId === c.id);
                  const approved = casterScrims.filter(
                    (s) => s.casterApprovalStatus === 'APPROVED' && s.status !== 'CANCELLED'
                  );
                  const pending = casterScrims.filter((s) => s.casterApprovalStatus === 'PENDING');
                  const totalCasterEarnings = approved.reduce((sum, s) => sum + s.casterRate, 0);
                  const totalLobbyFee = approved.reduce(
                    (sum, s) => sum + (s.platformFee ?? 50000),
                    0
                  );
                  const savingVerified = badgeSavingKey === `${c.id}:isVerified`;
                  const savingTop = badgeSavingKey === `${c.id}:isTopCaster`;

                  return (
                    <div
                      key={c.id}
                      className="p-6 bg-[#12161F] border border-white/[0.08] hover:border-[#00F0FF]/45 rounded-[6px] flex flex-col justify-between gap-5 transition-colors"
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between font-telemetry text-[11px] uppercase tracking-[0.08em]">
                          <span className="text-[#CCFF00] font-bold tabular-nums">
                            {formatRupiah(c.rateCard)} / MATCH
                          </span>
                          <span className="text-[#94A3B8] tabular-nums">
                            MAKS {c.maxMatchesPerDay || 2} MATCH/HARI
                          </span>
                        </div>

                        <div>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h2 className="font-display text-xl font-bold uppercase text-[#F8FAFC]">
                              {c.name}
                            </h2>
                            <span className="font-telemetry text-[10px] font-bold uppercase tracking-[0.08em] text-[#94A3B8]">
                              @{c.alias}
                            </span>
                          </div>
                          <div className="mt-2">
                            <CasterBadges
                              isVerified={c.isVerified}
                              isTopCaster={c.isTopCaster}
                              size="sm"
                              showEmptyLabel
                            />
                          </div>
                          <p className="mt-2 text-xs text-[#94A3B8] line-clamp-2">{c.bio}</p>
                        </div>

                        {/* Badge Management Toggles */}
                        <div className="pt-3 border-t border-white/[0.08] space-y-2">
                          <div className="font-telemetry text-[10px] font-bold uppercase tracking-[0.08em] text-[#94A3B8]">
                            Kelola Badge Profil Publik
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              aria-pressed={Boolean(c.isVerified)}
                              disabled={savingVerified || savingTop}
                              onClick={() => handleToggleCasterBadge(c, 'isVerified')}
                              className={`min-h-[40px] px-2.5 py-2 rounded-[4px] border inline-flex items-center justify-center gap-1.5 font-telemetry text-[11px] font-bold uppercase tracking-[0.04em] transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60 ${
                                c.isVerified
                                  ? 'bg-[#00F0FF]/18 border-[#00F0FF] text-[#00F0FF]'
                                  : 'bg-[#0A0C10] border-white/15 text-[#94A3B8] hover:text-[#F8FAFC] hover:border-white/30'
                              }`}
                            >
                              <BadgeCheck className="w-3.5 h-3.5 shrink-0" />
                              <span>{savingVerified ? 'Menyimpan...' : 'Verified'}</span>
                            </button>
                            <button
                              type="button"
                              aria-pressed={Boolean(c.isTopCaster)}
                              disabled={savingVerified || savingTop}
                              onClick={() => handleToggleCasterBadge(c, 'isTopCaster')}
                              className={`min-h-[40px] px-2.5 py-2 rounded-[4px] border inline-flex items-center justify-center gap-1.5 font-telemetry text-[11px] font-bold uppercase tracking-[0.04em] transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60 ${
                                c.isTopCaster
                                  ? 'bg-[#CCFF00]/18 border-[#CCFF00] text-[#CCFF00]'
                                  : 'bg-[#0A0C10] border-white/15 text-[#94A3B8] hover:text-[#F8FAFC] hover:border-white/30'
                              }`}
                            >
                              <Crown className="w-3.5 h-3.5 shrink-0" />
                              <span>{savingTop ? 'Menyimpan...' : 'Top Caster'}</span>
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {c.specialtyGames.map((g) => (
                            <span
                              key={g}
                              className="px-2 py-0.5 bg-[#0A0C10] border border-white/10 rounded-[2px] font-telemetry text-[10px] uppercase text-[#00F0FF]"
                            >
                              {g}
                            </span>
                          ))}
                        </div>

                        <div className="pt-3 border-t border-white/[0.08] grid grid-cols-2 gap-3 font-telemetry text-xs">
                          <div className="p-2.5 bg-[#0A0C10] rounded-[4px]">
                            <div className="text-[10px] text-[#94A3B8] uppercase">Approved</div>
                            <div className="mt-0.5 text-base font-bold text-[#00F0FF] tabular-nums">
                              {approved.length} Match
                            </div>
                          </div>
                          <div className="p-2.5 bg-[#0A0C10] rounded-[4px]">
                            <div className="text-[10px] text-[#94A3B8] uppercase">Pending</div>
                            <div className="mt-0.5 text-base font-bold text-[#FF2E5B] tabular-nums">
                              {pending.length} Match
                            </div>
                          </div>
                          <div className="p-2.5 bg-[#0A0C10] rounded-[4px]">
                            <div className="text-[10px] text-[#94A3B8] uppercase">Hak Caster</div>
                            <div className="mt-0.5 text-sm font-bold text-[#CCFF00] tabular-nums">
                              {formatRupiah(totalCasterEarnings)}
                            </div>
                          </div>
                          <div className="p-2.5 bg-[#0A0C10] rounded-[4px]">
                            <div className="text-[10px] text-[#94A3B8] uppercase">Lobby Fee</div>
                            <div className="mt-0.5 text-sm font-bold text-[#F8FAFC] tabular-nums">
                              {formatRupiah(totalLobbyFee)}
                            </div>
                          </div>
                        </div>

                        <div className="font-telemetry text-[11px] text-[#94A3B8]">
                          Day Off:{' '}
                          <span className="text-[#FF2E5B] font-semibold">
                            {c.dayOffDates.length > 0 ? c.dayOffDates.join(', ') : 'Tidak ada'}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => onMonitorCaster(c.id)}
                        className="w-full py-2.5 px-4 bg-[#00F0FF]/12 border border-[#00F0FF]/45 text-[#00F0FF] hover:bg-[#00F0FF] hover:text-[#0A0C10] font-display text-sm font-bold uppercase tracking-[0.05em] rounded-[4px] transition-colors cursor-pointer"
                      >
                        Pantau Dashboard Caster →
                      </button>
                    </div>
                  );
                })}
              </div>

              {filteredCasters.length === 0 && (
                <div className="p-8 bg-[#12161F] border border-white/[0.08] rounded-[6px] text-center font-telemetry text-xs text-[#94A3B8]">
                  Tidak ada Shoutcaster pada filter badge ini.
                </div>
              )}

              {/* Permintaan Withdraw Fee Caster */}
              <div className="bg-[#12161F] border border-white/[0.08] rounded-[6px] p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-white/[0.08]">
                  <div>
                    <h2 className="font-display text-xl font-bold uppercase text-[#F8FAFC] flex items-center gap-2">
                      <Wallet className="w-5 h-5 text-[#CCFF00]" />
                      Permintaan Withdraw Fee Scrim Caster
                    </h2>
                    <p className="text-xs text-[#94A3B8] mt-0.5">
                      Verifikasi dan tandai PAID setelah transfer pencairan fee scrim ke rekening caster selesai.
                    </p>
                  </div>
                  <span className="font-telemetry text-xs font-bold text-[#94A3B8]">
                    {(db.withdrawals || []).length} Transaksi
                  </span>
                </div>

                {(db.withdrawals || []).length === 0 ? (
                  <div className="p-6 bg-[#0A0C10] border border-white/[0.06] rounded-[4px] text-center font-telemetry text-xs text-[#94A3B8]">
                    Belum ada pengajuan withdraw dari Shoutcaster.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {(db.withdrawals || []).map((w) => (
                      <div
                        key={w.id}
                        className="p-4 bg-[#0A0C10] border border-white/[0.08] rounded-[4px] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-display text-base font-bold uppercase text-[#F8FAFC]">
                              {w.casterName}
                            </span>
                            <span className="font-display text-base font-bold text-[#CCFF00] tabular-nums">
                              {formatRupiah(w.amount)}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-[2px] font-telemetry text-[10px] font-bold uppercase ${
                                w.status === 'PAID'
                                  ? 'bg-[#00F0FF]/15 text-[#00F0FF]'
                                  : w.status === 'REJECTED'
                                    ? 'bg-[#FF2E5B]/15 text-[#FF2E5B]'
                                    : 'bg-[#FACC15]/15 text-[#FACC15]'
                              }`}
                            >
                              {w.status}
                            </span>
                          </div>
                          <div className="font-telemetry text-xs text-[#94A3B8]">
                            {w.bankOrWallet} · {w.accountNumber} ({w.accountName}) · Diajukan {w.requestedAt}
                          </div>
                        </div>

                        {w.status === 'PENDING' && (
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              disabled={busyId === w.id}
                              onClick={async () => {
                                setBusyId(w.id);
                                try {
                                  await api.updateWithdrawalStatus(w.id, 'PAID');
                                  await onRefresh();
                                  onNotify(`Withdraw ${w.casterName} (${formatRupiah(w.amount)}) ditandai PAID.`);
                                } finally {
                                  setBusyId(null);
                                }
                              }}
                              className="px-3.5 py-1.5 bg-[#00F0FF] text-[#0A0C10] font-telemetry text-xs font-bold uppercase rounded-[4px] hover:brightness-110 cursor-pointer"
                            >
                              Tandai PAID
                            </button>
                            <button
                              type="button"
                              disabled={busyId === w.id}
                              onClick={async () => {
                                setBusyId(w.id);
                                try {
                                  await api.updateWithdrawalStatus(w.id, 'REJECTED');
                                  await onRefresh();
                                  onNotify(`Withdraw ${w.casterName} ditolak.`);
                                } finally {
                                  setBusyId(null);
                                }
                              }}
                              className="px-3 py-1.5 border border-[#FF2E5B]/60 text-[#FF2E5B] font-telemetry text-xs font-bold uppercase rounded-[4px] hover:bg-[#FF2E5B]/10 cursor-pointer"
                            >
                              Tolak
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            );
          })()}

          {/* 2. LIVE MATCHES & BRACKET CRUD */}
          {activeTab === 'matches' && (() => {
            const activeBracketTrnId =
              selectedBracketTournamentId ||
              db.tournaments.find((t) => t.status === 'ONGOING')?.id ||
              db.tournaments[0]?.id ||
              '';
            const bracketMatches = db.matches.filter((m) => m.tournamentId === activeBracketTrnId);
            return (
            <div className="space-y-6">
              {/* Interactive Visual Bracket Chart (Inline Edit) */}
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
                          {m.teamA} ({m.teamATag}) <span className="text-[#94A3B8] text-xs">VS</span> {m.teamB} ({m.teamBTag})
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
                        <div className="inline-flex items-center gap-2 font-telemetry">
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
                          onChange={(e) => handleQuickMatchStatus(m, e.target.value as MatchStatus)}
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
                            onClick={() => handleDelete('matches', m.id, `${m.teamATag} vs ${m.teamBTag}`)}
                            aria-label="Hapus match"
                            className="p-1.5 text-[#94A3B8] hover:text-[#FF2E5B] cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </div>
            );
          })()}

          {/* 3. ROSTER & SQUADS CRUD */}
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

          {/* 4. NEWS CRUD */}
          {activeTab === 'news' && (
            <div className="bg-[#12161F] border border-white/[0.08] rounded-[6px] overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[720px]">
                <thead>
                  <tr className="border-b border-white/[0.08] font-telemetry text-[11px] uppercase tracking-[0.08em] text-[#94A3B8]">
                    <th className="py-3.5 px-4">Judul Artikel</th>
                    <th className="py-3.5 px-4">Kategori</th>
                    <th className="py-3.5 px-4">Penulis &amp; Tanggal</th>
                    <th className="py-3.5 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06] text-sm">
                  {filteredNews.map((n) => (
                    <tr key={n.id} className="hover:bg-white/[0.02]">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          {n.thumbnailUrl ? (
                            <img
                              src={n.thumbnailUrl}
                              alt={n.title}
                              className="w-10 h-[50px] object-cover rounded-[4px] border border-white/15 shrink-0 bg-[#0A0C10]"
                            />
                          ) : (
                            <div className="w-10 h-[50px] rounded-[4px] border border-dashed border-white/15 bg-[#0A0C10] flex items-center justify-center font-telemetry text-[9px] text-[#64748B] shrink-0">
                              4:5
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-display text-base font-bold uppercase text-[#F8FAFC]">
                              {n.title}
                            </div>
                            <div className="text-xs text-[#94A3B8] line-clamp-1">{n.excerpt}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-telemetry text-xs font-bold text-[#CCFF00]">
                        {n.category}
                      </td>
                      <td className="py-3.5 px-4 font-telemetry text-xs text-[#94A3B8]">
                        {n.author} · {n.publishedAt}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEditModal('news', n)}
                            aria-label="Edit artikel"
                            className="p-1.5 text-[#94A3B8] hover:text-[#00F0FF] cursor-pointer"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete('news', n.id, n.title)}
                            aria-label="Hapus artikel"
                            className="p-1.5 text-[#94A3B8] hover:text-[#FF2E5B] cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 7. EXPORT & BACKUP DATA (SUPER ADMIN ONLY) */}
          {activeTab === 'exports' && (
            <div className="space-y-6">
              <div className="p-6 bg-[#12161F] border border-[#00F0FF]/30 rounded-[8px] flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div>
                  <div className="inline-flex items-center gap-2 font-telemetry text-[11px] font-bold uppercase tracking-[0.12em] text-[#00F0FF]">
                    <ShieldCheck className="w-4 h-4" />
                    AKSES KHUSUS SUPER ADMIN
                  </div>
                  <h1 className="mt-2 font-display text-2xl sm:text-3xl font-bold uppercase text-[#F8FAFC]">
                    Pusat Unduh &amp; Backup Data ORDAL
                  </h1>
                  <p className="mt-1.5 text-sm text-[#94A3B8] max-w-2xl">
                    Unduh seluruh database platform (Turnamen, Scrim All Game, Split-Bill, Shoutcaster, Live Matches, Roster Squad, News, dan Akun Pengguna) dalam format JSON lengkap atau CSV siap buka di Microsoft Excel / Google Sheets.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 shrink-0">
                  <button
                    type="button"
                    disabled={exportingKey !== null}
                    onClick={() => handleExport('all', 'json')}
                    className="inline-flex items-center gap-2 px-5 py-3 bg-[#00F0FF] text-[#0A0C10] font-display text-sm font-bold uppercase tracking-[0.06em] rounded-[4px] hover:shadow-[0_0_20px_rgba(0,240,255,0.45)] transition-all cursor-pointer disabled:opacity-50"
                  >
                    <FileJson className="w-4 h-4" />
                    {exportingKey === 'all:json' ? 'Menyiapkan...' : 'Unduh Semua Data (JSON)'}
                  </button>
                  <button
                    type="button"
                    disabled={exportingKey !== null}
                    onClick={() => handleExport('all', 'csv')}
                    className="inline-flex items-center gap-2 px-5 py-3 bg-[#CCFF00] text-[#0A0C10] font-display text-sm font-bold uppercase tracking-[0.06em] rounded-[4px] hover:brightness-110 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    {exportingKey === 'all:csv' ? 'Menyiapkan...' : 'Unduh Semua Data (CSV)'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {(
                  [
                    {
                      key: 'tournaments' as ExportDataset,
                      title: 'Data Turnamen',
                      desc: 'Daftar turnamen, format bracket, prize pool, kuota tim, dan status.',
                      count: db.tournaments.length,
                      unit: 'Turnamen',
                      icon: Trophy,
                      accent: '#00F0FF',
                    },
                    {
                      key: 'scrims' as ExportDataset,
                      title: 'Data Scrim & Split-Bill',
                      desc: 'Jadwal scrim, roster host & penantang, approval caster, split-bill, lobby fee Rp50rb, dan skor.',
                      count: (db.scrims || []).length,
                      unit: 'Sesi Scrim',
                      icon: Swords,
                      accent: '#CCFF00',
                    },
                    {
                      key: 'casters' as ExportDataset,
                      title: 'Data Shoutcaster',
                      desc: 'Profil talent caster, game spesialisasi, ratecard, kuota harian, dan jadwal Day Off.',
                      count: (db.casters || []).length,
                      unit: 'Caster',
                      icon: Mic,
                      accent: '#00F0FF',
                    },
                    {
                      key: 'withdrawals' as ExportDataset,
                      title: 'Withdraw Fee Caster',
                      desc: 'Riwayat pengajuan withdraw fee scrim, rekening tujuan, nominal, dan status pencairan.',
                      count: (db.withdrawals || []).length,
                      unit: 'Transaksi',
                      icon: Wallet,
                      accent: '#CCFF00',
                    },
                    {
                      key: 'matches' as ExportDataset,
                      title: 'Live Matches & Bracket',
                      desc: 'Seluruh node pertandingan bracket, skor, map, pemenang, dan MVP IGN.',
                      count: db.matches.length,
                      unit: 'Match',
                      icon: GitBranch,
                      accent: '#FF2E5B',
                    },
                    {
                      key: 'squads' as ExportDataset,
                      title: 'Roster & Squad Turnamen',
                      desc: 'Data squad terdaftar, tag, kapten, kontak, daftar roster, seed, dan status check-in.',
                      count: db.squads.length,
                      unit: 'Squad',
                      icon: Users,
                      accent: '#00F0FF',
                    },
                    {
                      key: 'news' as ExportDataset,
                      title: 'Artikel News',
                      desc: 'Seluruh berita, kategori, penulis, ringkasan, dan konten publikasi.',
                      count: db.news.length,
                      unit: 'Artikel',
                      icon: FileText,
                      accent: '#CCFF00',
                    },
                    {
                      key: 'users' as ExportDataset,
                      title: 'Akun Pengguna & Profil Tim',
                      desc: 'Daftar akun Team, Caster, dan Super Admin beserta profil & roster tim (tanpa password hash).',
                      count: adminUsers.length,
                      unit: 'Akun',
                      icon: Database,
                      accent: '#FF2E5B',
                    },
                  ]
                ).map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.key}
                      className="p-5 bg-[#12161F] border border-white/[0.08] rounded-[6px] flex flex-col justify-between gap-4 hover:border-white/20 transition-colors"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-[4px] bg-[#0A0C10] border border-white/10 flex items-center justify-center">
                              <Icon className="w-4 h-4" style={{ color: item.accent }} />
                            </div>
                            <div>
                              <h3 className="font-display text-lg font-bold uppercase text-[#F8FAFC] leading-tight">
                                {item.title}
                              </h3>
                              <div className="font-telemetry text-[11px] font-semibold uppercase text-[#94A3B8]">
                                {item.count} {item.unit}
                              </div>
                            </div>
                          </div>
                        </div>
                        <p className="mt-3 text-xs text-[#94A3B8] leading-relaxed">{item.desc}</p>
                      </div>

                      <div className="pt-3 border-t border-white/[0.06] grid grid-cols-2 gap-2.5">
                        <button
                          type="button"
                          disabled={exportingKey !== null}
                          onClick={() => handleExport(item.key, 'csv')}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-[#0A0C10] border border-white/15 hover:border-[#CCFF00]/60 text-[#F8FAFC] hover:text-[#CCFF00] font-telemetry text-[11px] font-bold uppercase rounded-[4px] transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5" />
                          {exportingKey === `${item.key}:csv` ? '...' : 'CSV (Excel)'}
                        </button>
                        <button
                          type="button"
                          disabled={exportingKey !== null}
                          onClick={() => handleExport(item.key, 'json')}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-[#0A0C10] border border-white/15 hover:border-[#00F0FF]/60 text-[#F8FAFC] hover:text-[#00F0FF] font-telemetry text-[11px] font-bold uppercase rounded-[4px] transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <FileJson className="w-3.5 h-3.5" />
                          {exportingKey === `${item.key}:json` ? '...' : 'JSON'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* HERO SETTINGS TAB */}
          {activeTab === 'hero' && (
            <HeroSettingsPanel db={db} onRefresh={onRefresh} onNotify={onNotify} />
          )}

          {/* TAB 8B: PAYMENT, INVOICE & VALIDASI */}
          {activeTab === 'payments' && (
            <PaymentDetailCenter
              role="SUPER_ADMIN"
              payments={db.payments || []}
              ledger={db.ledger || []}
              currentUser={user}
              onRefresh={onRefresh}
              onNotify={onNotify}
            />
          )}

          {/* TAB 8C: AKUN LEAGUE OPS (SUPER ADMIN ONLY) */}
          {activeTab === 'league-ops' && user.role === 'SUPER_ADMIN' && (
            <div className="space-y-6">
              <div className="bg-[#12161F] border border-white/[0.08] rounded-[6px] p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <div className="font-telemetry text-[11px] font-bold uppercase tracking-[0.12em] text-[#00F0FF]">
                    Least-Privilege Tournament Operator
                  </div>
                  <h2 className="mt-1 font-display text-2xl font-bold uppercase text-[#F8FAFC]">
                    Manajemen Akun League Ops
                  </h2>
                  <p className="mt-1 text-sm text-[#94A3B8] max-w-2xl">
                    Operator League Ops hanya memiliki akses ke Tournament Builder, Live Matches &amp;
                    Auto-Bracket, serta Check-In Roster Squad. Akses pembayaran, scrim, caster,
                    pengaturan website, SOC, dan audit log ditutup sepenuhnya.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 shrink-0">
                  <div className="px-4 py-3 bg-[#0A0C10] border border-white/[0.08] rounded-[4px]">
                    <div className="font-telemetry text-[10px] uppercase tracking-[0.1em] text-[#94A3B8]">
                      Akun Aktif
                    </div>
                    <div className="mt-0.5 font-display text-2xl font-bold text-[#00F0FF] tabular-nums">
                      {leagueOpsUsers.length}
                    </div>
                  </div>
                  <div className="px-4 py-3 bg-[#0A0C10] border border-white/[0.08] rounded-[4px]">
                    <div className="font-telemetry text-[10px] uppercase tracking-[0.1em] text-[#94A3B8]">
                      Ruang Lingkup
                    </div>
                    <div className="mt-0.5 font-display text-sm font-bold uppercase text-[#CCFF00]">
                      Turnamen Saja
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
                {/* Create League Ops Operator Form */}
                <form
                  onSubmit={handleCreateLeagueOps}
                  className="xl:col-span-4 bg-[#12161F] border border-white/[0.08] rounded-[6px] p-5 space-y-4"
                >
                  <div>
                    <h3 className="font-display text-lg font-bold uppercase text-[#F8FAFC]">
                      Tambah Operator Baru
                    </h3>
                    <p className="text-xs text-[#94A3B8] mt-1">
                      Kredensial baru langsung aktif dan setiap aksinya tercatat otomatis di Audit Log.
                    </p>
                  </div>

                  <div>
                    <label className="block font-telemetry text-[11px] uppercase tracking-[0.08em] text-[#94A3B8] mb-1.5">
                      Nama Operator
                    </label>
                    <input
                      type="text"
                      required
                      minLength={2}
                      value={leagueOpsName}
                      onChange={(e) => {
                        setLeagueOpsName(e.target.value);
                        if (leagueOpsError) setLeagueOpsError('');
                      }}
                      placeholder="Contoh: Rafi League Ops"
                      className="w-full px-3.5 py-2.5 bg-[#0A0C10] border border-white/15 rounded-[4px] text-sm text-[#F8FAFC] placeholder:text-[#94A3B8]/50 focus:outline-none focus:border-[#00F0FF]"
                    />
                  </div>

                  <div>
                    <label className="block font-telemetry text-[11px] uppercase tracking-[0.08em] text-[#94A3B8] mb-1.5">
                      Email Login
                    </label>
                    <input
                      type="email"
                      required
                      value={leagueOpsEmail}
                      onChange={(e) => {
                        setLeagueOpsEmail(e.target.value);
                        if (leagueOpsError) setLeagueOpsError('');
                      }}
                      placeholder="ops.turnamen@ordal.gg"
                      className="w-full px-3.5 py-2.5 bg-[#0A0C10] border border-white/15 rounded-[4px] font-telemetry text-sm text-[#F8FAFC] placeholder:text-[#94A3B8]/50 focus:outline-none focus:border-[#00F0FF]"
                    />
                  </div>

                  <div className="p-3 bg-[#0A0C10] border border-white/[0.08] rounded-[4px] text-xs text-[#94A3B8]">
                    Operator akan otomatis mendapatkan role <strong className="text-[#00F0FF]">LEAGUE_OPS</strong> saat masuk menggunakan Google Account dengan email di atas.
                  </div>

                  {leagueOpsError && (
                    <div
                      role="alert"
                      className="px-3.5 py-2.5 bg-[#FF2E5B]/12 border border-[#FF2E5B]/45 rounded-[4px] text-xs text-[#FDA4AF]"
                    >
                      {leagueOpsError}
                    </div>
                  )}

                  {leagueOpsSuccess && (
                    <div
                      role="status"
                      className="px-3.5 py-2.5 bg-[#22C55E]/12 border border-[#22C55E]/40 rounded-[4px] text-xs text-[#86EFAC]"
                    >
                      {leagueOpsSuccess}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={creatingLeagueOps}
                    className="w-full inline-flex items-center justify-center gap-2 min-h-[42px] px-4 bg-[#00F0FF] text-[#0A0C10] font-display text-sm font-bold uppercase tracking-[0.06em] rounded-[4px] hover:shadow-[0_0_16px_rgba(0,240,255,0.4)] transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4" />
                    {creatingLeagueOps ? 'Menyimpan Akses...' : 'Undang Operator League Ops'}
                  </button>
                </form>

                {/* Active League Ops Accounts Table */}
                <div className="xl:col-span-8 bg-[#12161F] border border-white/[0.08] rounded-[6px] overflow-hidden">
                  <div className="px-5 py-4 border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-display text-lg font-bold uppercase text-[#F8FAFC]">
                        Daftar Operator League Ops
                      </h3>
                      <p className="text-xs text-[#94A3B8]">
                        Operator masuk secara aman melalui Google OAuth menggunakan email terundang.
                      </p>
                    </div>
                  </div>

                  {leagueOpsUsers.length === 0 ? (
                    <div className="p-10 text-center space-y-2">
                      <UserCog className="w-8 h-8 text-[#94A3B8]/50 mx-auto" />
                      <p className="font-display text-base font-bold uppercase text-[#F8FAFC]">
                        Belum Ada Akun League Ops
                      </p>
                      <p className="text-xs text-[#94A3B8] max-w-md mx-auto">
                        Tambahkan operator melalui formulir di samping agar panitia turnamen dapat
                        mengelola jadwal, skor bracket, dan check-in tanpa akses ke data keuangan.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse min-w-[600px]">
                        <thead>
                          <tr className="border-b border-white/[0.08] font-telemetry text-[11px] uppercase tracking-[0.08em] text-[#94A3B8]">
                            <th className="py-3 px-4">Operator</th>
                            <th className="py-3 px-4">Email</th>
                            <th className="py-3 px-4">Dibuat</th>
                            <th className="py-3 px-4 text-right">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.06] text-sm">
                          {leagueOpsUsers.map((op) => {
                            const isConfirmingDelete = confirmDeleteLeagueOpsId === op.id;
                            const isPendingInvite = op.id.startsWith('inv-');
                            return (
                              <tr key={op.id} className="hover:bg-white/[0.02]">
                                <td className="py-3.5 px-4">
                                  <div className="font-display text-sm font-bold uppercase text-[#F8FAFC]">
                                    {op.displayName}
                                  </div>
                                  <div className="font-telemetry text-[11px] uppercase flex items-center gap-2">
                                    <span className="text-[#00F0FF]">LEAGUE_OPS</span>
                                    <span className="text-white/25">·</span>
                                    <span className={isPendingInvite ? 'text-[#FACC15]' : 'text-[#CCFF00]'}>
                                      {isPendingInvite ? 'MENUNGGU GOOGLE LOGIN' : 'GOOGLE VERIFIED'}
                                    </span>
                                  </div>
                                </td>
                                <td className="py-3.5 px-4 font-telemetry text-xs text-[#CBD5E1]">
                                  {op.email}
                                </td>
                                <td className="py-3.5 px-4 font-telemetry text-xs text-[#94A3B8] tabular-nums">
                                  {op.createdAt
                                    ? new Date(op.createdAt).toLocaleDateString('id-ID', {
                                        day: '2-digit',
                                        month: 'short',
                                        year: 'numeric',
                                      })
                                    : '-'}
                                </td>
                                <td className="py-3.5 px-4">
                                  <div className="flex items-center justify-end gap-2">
                                    {isConfirmingDelete ? (
                                      <div className="inline-flex items-center gap-1.5">
                                        <button
                                          type="button"
                                          disabled={deletingLeagueOpsId === op.id}
                                          onClick={() => handleDeleteLeagueOps(op)}
                                          className="min-h-[34px] px-3 bg-[#FF2E5B] text-white font-telemetry text-[11px] font-bold uppercase rounded-[4px] cursor-pointer whitespace-nowrap disabled:opacity-50"
                                        >
                                          {deletingLeagueOpsId === op.id ? '...' : 'Konfirmasi'}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setConfirmDeleteLeagueOpsId(null)}
                                          className="min-h-[34px] px-2.5 border border-white/15 text-[#94A3B8] hover:text-white font-telemetry text-[11px] uppercase rounded-[4px] cursor-pointer"
                                        >
                                          Batal
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDeleteLeagueOpsId(op.id)}
                                        className="inline-flex items-center gap-1.5 min-h-[34px] px-3 border border-[#FF2E5B]/35 text-[#FF2E5B] hover:bg-[#FF2E5B]/15 font-telemetry text-[11px] font-semibold uppercase rounded-[4px] transition-colors cursor-pointer whitespace-nowrap"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        Hapus
                                      </button>
                                    )}
                                  </div>
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
          )}

          {/* AUDIT LOG TAB */}
          {/* TAB 9: SOC SECURITY OPERATIONS CENTER */}
          {activeTab === 'soc' && user.role === 'SUPER_ADMIN' && (
            <SocSecurityPanel
              currentUser={user}
              onUserUpdated={(next) => onUserUpdated?.(next)}
              onNotify={onNotify}
            />
          )}

          {/* TAB 10: AUDIT LOG */}
          {activeTab === 'audit' && <AuditLogPanel db={db} onNotify={onNotify} />}

          {/* TAB 11: INTERACTIVE DATA DASHBOARD */}
          {activeTab === 'analytics' && (
            <InteractiveDataDashboard db={db} mode="admin" user={user} />
          )}

        </main>
      </div>

      {/* UNIVERSAL CREATE / EDIT CRUD MODAL */}
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
              {/* TOURNAMENT FIELDS */}
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
                        onChange={(e) => setFormState({ ...formState, game: e.target.value as GameTitle })}
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
                          setFormState({ ...formState, format: e.target.value as TournamentFormat })
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
                        onChange={(e) => setFormState({ ...formState, maxTeams: Number(e.target.value) })}
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
                          setFormState({ ...formState, status: e.target.value as TournamentStatus })
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
                        placeholder="ORDAL Esports Hub"
                        className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC]"
                      />
                    </div>
                    <div>
                      <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                        Biaya Pendaftaran
                      </label>
                      <input
                        value={String(formState.registrationFee || 'GRATIS (FREE)')}
                        onChange={(e) => setFormState({ ...formState, registrationFee: e.target.value })}
                        placeholder="GRATIS (FREE) / Rp 50.000"
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
                        placeholder="5v5 · Online"
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
                        placeholder="ID / SEA"
                        className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC]"
                      />
                    </div>
                    <div>
                      <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                        Jadwal Check-In
                      </label>
                      <input
                        value={String(formState.checkInInfo || '30 Menit Sebelum Kick-Off')}
                        onChange={(e) => setFormState({ ...formState, checkInInfo: e.target.value })}
                        placeholder="30 Menit Sebelum Kick-Off"
                        className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC]"
                      />
                    </div>
                  </div>

                  {/* Distribusi Hadiah Custom (Sync ke Tab Overview Turnamen) */}
                  <div className="p-3 bg-[#0A0C10] border border-white/10 rounded-[4px] space-y-2.5">
                    <div className="font-telemetry text-[11px] font-bold uppercase tracking-[0.06em] text-[#CCFF00]">
                      Distribusi Hadiah (Opsional — Kosongkan untuk Hitung Otomatis 50/30/15/5%)
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <input
                        value={String(formState.prizeFirst || '')}
                        onChange={(e) => setFormState({ ...formState, prizeFirst: e.target.value })}
                        placeholder="Juara 1 (contoh: Rp 10.000.000)"
                        className="w-full px-2.5 py-1.5 bg-[#12161F] border border-white/12 rounded-[4px] font-telemetry text-xs text-[#F8FAFC]"
                      />
                      <input
                        value={String(formState.prizeSecond || '')}
                        onChange={(e) => setFormState({ ...formState, prizeSecond: e.target.value })}
                        placeholder="Juara 2 (contoh: Rp 6.000.000)"
                        className="w-full px-2.5 py-1.5 bg-[#12161F] border border-white/12 rounded-[4px] font-telemetry text-xs text-[#F8FAFC]"
                      />
                      <input
                        value={String(formState.prizeThird || '')}
                        onChange={(e) => setFormState({ ...formState, prizeThird: e.target.value })}
                        placeholder="Juara 3 (contoh: Rp 3.000.000)"
                        className="w-full px-2.5 py-1.5 bg-[#12161F] border border-white/12 rounded-[4px] font-telemetry text-xs text-[#F8FAFC]"
                      />
                      <input
                        value={String(formState.prizeMvp || '')}
                        onChange={(e) => setFormState({ ...formState, prizeMvp: e.target.value })}
                        placeholder="MVP (contoh: Rp 1.000.000)"
                        className="w-full px-2.5 py-1.5 bg-[#12161F] border border-white/12 rounded-[4px] font-telemetry text-xs text-[#F8FAFC]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                      Deskripsi Singkat (Tampil di Tab Overview)
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
                      Peraturan Khusus Turnamen (Tampil di Tab Peraturan · 1 Baris per Poin)
                    </label>
                    <textarea
                      rows={3}
                      value={String(formState.rules || '')}
                      onChange={(e) => setFormState({ ...formState, rules: e.target.value })}
                      placeholder={"Contoh:\nWajib menggunakan server Singapore\nDilarang menggunakan skin agent tertentu"}
                      className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] text-sm text-[#F8FAFC]"
                    />
                  </div>
                  <div>
                    <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                      Link Live Stream Turnamen (YouTube / Twitch · Tampil Saat ONGOING)
                    </label>
                    <input
                      type="url"
                      value={String(formState.liveStreamUrl || '')}
                      onChange={(e) =>
                        setFormState({ ...formState, liveStreamUrl: e.target.value })
                      }
                      placeholder="https://www.youtube.com/watch?v=... atau https://www.twitch.tv/..."
                      className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                    />
                  </div>
                  <div>
                    <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                      Link Siaran Ulang Live Stream (YouTube / Twitch · Tampil di Highlight)
                    </label>
                    <input
                      type="url"
                      value={String(formState.replayStreamUrl || '')}
                      onChange={(e) =>
                        setFormState({ ...formState, replayStreamUrl: e.target.value })
                      }
                      placeholder="https://www.youtube.com/watch?v=... atau https://youtu.be/..."
                      className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                    />
                  </div>
                </>
              )}

              {/* SCRIM FIELDS */}
              {activeTab === 'scrims' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                        Judul Game
                      </label>
                      <select
                        value={String(formState.game || 'POINT BLANK')}
                        onChange={(e) => setFormState({ ...formState, game: e.target.value })}
                        className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC]"
                      >
                        {SCRIM_GAMES.map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                        Mode Scrim
                      </label>
                      <select
                        value={String(formState.mode || 'OPEN_LOBBY')}
                        onChange={(e) => setFormState({ ...formState, mode: e.target.value })}
                        className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC]"
                      >
                        <option value="OPEN_LOBBY">OPEN LOBBY</option>
                        <option value="DIRECT_CHALLENGE">DIRECT CHALLENGE</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                        Tim Host (Tim A)
                      </label>
                      <input
                        required
                        value={String(formState.hostTeamName || '')}
                        onChange={(e) => setFormState({ ...formState, hostTeamName: e.target.value })}
                        className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC]"
                      />
                    </div>
                    <div>
                      <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                        Tim Penantang (Tim B)
                      </label>
                      <input
                        value={String(formState.challengerTeamName || '')}
                        onChange={(e) =>
                          setFormState({ ...formState, challengerTeamName: e.target.value })
                        }
                        placeholder="Kosongkan jika Open Lobby"
                        className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC]"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                        Tanggal
                      </label>
                      <input
                        type="date"
                        value={String(formState.date || '2026-11-25')}
                        onChange={(e) => setFormState({ ...formState, date: e.target.value })}
                        className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC]"
                      />
                    </div>
                    <div>
                      <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                        Slot Jam
                      </label>
                      <select
                        value={String(formState.timeSlot || TIME_SLOTS[0])}
                        onChange={(e) => setFormState({ ...formState, timeSlot: e.target.value })}
                        className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC]"
                      >
                        {TIME_SLOTS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                        Caster ORDAL (Max 2 Match/Hari)
                      </label>
                      <select
                        value={String(formState.casterId || '')}
                        onChange={(e) => {
                          const cid = e.target.value;
                          const found = (db.casters || []).find((c) => c.id === cid);
                          setFormState({
                            ...formState,
                            casterId: cid,
                            casterName: found ? found.name : 'Tanpa Caster (Self-Hosted)',
                            casterRate: found ? found.rateCard : 0,
                          });
                        }}
                        className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC]"
                      >
                        {(db.casters || []).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({formatRupiah(c.rateCard)})
                          </option>
                        ))}
                        <option value="">Tanpa Caster (Self-Hosted — Rp 0)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                        Status Sesi
                      </label>
                      <select
                        value={String(formState.status || 'OPEN_LOBBY')}
                        onChange={(e) => setFormState({ ...formState, status: e.target.value })}
                        className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC]"
                      >
                        <option value="OPEN_LOBBY">OPEN LOBBY</option>
                        <option value="WAITING_APPROVAL">WAITING APPROVAL</option>
                        <option value="AWAITING_PAYMENT">AWAITING PAYMENT</option>
                        <option value="PARTIALLY_PAID">PARTIALLY PAID</option>
                        <option value="CONFIRMED">CONFIRMED</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                      Roster Inti Host (Pisahkan koma)
                    </label>
                    <input
                      value={String(formState.hostRosterCore || '')}
                      onChange={(e) => setFormState({ ...formState, hostRosterCore: e.target.value })}
                      className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC]"
                    />
                  </div>
                </>
              )}

              {/* MATCH FIELDS */}
              {activeTab === 'matches' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                        Turnamen
                      </label>
                      <select
                        value={String(formState.tournamentId || '')}
                        onChange={(e) => setFormState({ ...formState, tournamentId: e.target.value })}
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
                        onChange={(e) => setFormState({ ...formState, round: e.target.value as BracketRound })}
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
                        onChange={(e) => setFormState({ ...formState, teamATag: e.target.value.toUpperCase() })}
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
                        onChange={(e) => setFormState({ ...formState, teamBTag: e.target.value.toUpperCase() })}
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
                        onChange={(e) => setFormState({ ...formState, scoreA: Number(e.target.value) })}
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
                        onChange={(e) => setFormState({ ...formState, scoreB: Number(e.target.value) })}
                        className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC]"
                      />
                    </div>
                    <div>
                      <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                        Status
                      </label>
                      <select
                        value={String(formState.status || 'UPCOMING')}
                        onChange={(e) => setFormState({ ...formState, status: e.target.value as MatchStatus })}
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

              {/* SQUAD FIELDS */}
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
                        onChange={(e) => setFormState({ ...formState, tag: e.target.value.toUpperCase() })}
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
                        onChange={(e) => setFormState({ ...formState, tournamentId: e.target.value })}
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
                          setFormState({ ...formState, checkInStatus: e.target.value as CheckInStatus })
                        }
                        className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC]"
                      >
                        <option value="CHECKED IN">CHECKED IN</option>
                        <option value="PENDING">PENDING</option>
                        <option value="DISQUALIFIED">DISQUALIFIED</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
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
                        onChange={(e) => setFormState({ ...formState, captainContact: e.target.value })}
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

              {/* NEWS FIELDS */}
              {activeTab === 'news' && (
                <>
                  <div>
                    <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                      Judul Artikel
                    </label>
                    <input
                      required
                      value={String(formState.title || '')}
                      onChange={(e) => setFormState({ ...formState, title: e.target.value })}
                      className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                        Kategori
                      </label>
                      <select
                        value={String(formState.category || 'META UPDATE')}
                        onChange={(e) => setFormState({ ...formState, category: e.target.value as NewsCategory })}
                        className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC]"
                      >
                        <option value="META UPDATE">META UPDATE</option>
                        <option value="ROSTER LEAKS">ROSTER LEAKS</option>
                        <option value="TOURNAMENT RECAP">TOURNAMENT RECAP</option>
                        <option value="PATCH NOTES">PATCH NOTES</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                        Penulis
                      </label>
                      <input
                        value={String(formState.author || '')}
                        onChange={(e) => setFormState({ ...formState, author: e.target.value })}
                        className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC]"
                      />
                    </div>
                  </div>
                  <NewsThumbnailUploader
                    value={String(formState.thumbnailUrl || '')}
                    onChange={(url) => setFormState((prev) => ({ ...prev, thumbnailUrl: url }))}
                  />
                  <div>
                    <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                      Ringkasan (Excerpt)
                    </label>
                    <textarea
                      rows={2}
                      required
                      value={String(formState.excerpt || '')}
                      onChange={(e) => setFormState({ ...formState, excerpt: e.target.value })}
                      className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] text-sm text-[#F8FAFC]"
                    />
                  </div>
                  <div>
                    <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                      Konten Lengkap
                    </label>
                    <textarea
                      rows={4}
                      required
                      value={String(formState.content || '')}
                      onChange={(e) => setFormState({ ...formState, content: e.target.value })}
                      className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] text-sm text-[#F8FAFC]"
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

      {/* SCRIM RESULT MODAL (UPDATES TEAM LEADERBOARD SCRIM) */}
      {resultTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0A0C10]/85 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md bg-[#1A202C] border border-white/15 rounded-[6px] overflow-hidden">
            <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between">
              <h3 className="font-display text-xl font-bold uppercase text-[#F8FAFC]">
                Input Hasil Scrim (Leaderboard)
              </h3>
              <button
                type="button"
                onClick={() => setResultTarget(null)}
                aria-label="Tutup modal skor"
                className="p-1 text-[#94A3B8] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setResultModalError('');
                setSavingResult(true);
                try {
                  await api.recordScrimResult(resultTarget.id, {
                    hostScore: resultHostScore,
                    challengerScore: resultChallScore,
                  });
                  await onRefresh();
                  onNotify(
                    `Hasil ${resultTarget.hostTeamName} (${resultHostScore}) vs ${resultTarget.challengerTeamName} (${resultChallScore}) dicatat ke Leaderboard.`
                  );
                  setResultTarget(null);
                } catch (err) {
                  const msg = err instanceof Error ? err.message : 'Gagal menyimpan hasil scrim.';
                  setResultModalError(msg);
                  onNotify(msg);
                } finally {
                  setSavingResult(false);
                }
              }}
              className="p-6 space-y-5"
            >
              {resultModalError && (
                <div
                  role="alert"
                  className="p-3 bg-[#FF2E5B]/15 border border-[#FF2E5B] rounded-[4px] font-telemetry text-xs text-[#FFDADB]"
                >
                  {resultModalError}
                </div>
              )}
              <div className="font-telemetry text-xs uppercase text-[#00F0FF]">
                {resultTarget.game} · {resultTarget.date} {resultTarget.timeSlot}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1.5 truncate">
                    Skor {resultTarget.hostTeamName}
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={resultHostScore}
                    onChange={(e) => setResultHostScore(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 bg-[#0A0C10] border border-white/15 rounded-[4px] font-telemetry text-lg font-bold text-[#CCFF00] text-center focus:outline-none focus:border-[#00F0FF]"
                  />
                </div>
                <div>
                  <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1.5 truncate">
                    Skor {resultTarget.challengerTeamName}
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={resultChallScore}
                    onChange={(e) => setResultChallScore(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 bg-[#0A0C10] border border-white/15 rounded-[4px] font-telemetry text-lg font-bold text-[#00F0FF] text-center focus:outline-none focus:border-[#00F0FF]"
                  />
                </div>
              </div>
              <div className="pt-3 flex items-center justify-end gap-3 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setResultTarget(null)}
                  className="px-4 py-2 border border-white/20 text-[#F8FAFC] font-display text-sm font-semibold uppercase rounded-[4px] cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingResult}
                  className="px-5 py-2 bg-[#CCFF00] text-[#0A0C10] font-display text-sm font-bold uppercase rounded-[4px] disabled:opacity-50 cursor-pointer"
                >
                  {savingResult ? 'Menyimpan...' : 'Simpan ke Leaderboard'}
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
            setActiveTab('squads');
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
      {/* ADD NEW CASTER MODAL */}
      {createCasterOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setCreateCasterOpen(false)}
        >
          <div
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-[#12161F] border border-white/15 rounded-[6px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-white/[0.08] flex items-center justify-between">
              <div>
                <h2 className="font-display text-xl font-bold uppercase text-[#F8FAFC]">
                  Tambah Shoutcaster Baru
                </h2>
                <p className="text-xs text-[#94A3B8] mt-0.5">
                  Otomatis membuat profil caster sekaligus akun login Dashboard Caster.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCreateCasterOpen(false)}
                className="p-1.5 text-[#94A3B8] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCaster} className="p-5 space-y-4">
              {casterModalError && (
                <div
                  role="alert"
                  className="p-3 bg-[#FF2E5B]/15 border border-[#FF2E5B] rounded-[4px] font-telemetry text-xs text-[#FFDADB]"
                >
                  {casterModalError}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                    Nama Lengkap Caster
                  </label>
                  <input
                    type="text"
                    required
                    value={newCasterName}
                    onChange={(e) => setNewCasterName(e.target.value)}
                    placeholder="Contoh: Bima Pratama"
                    className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                  />
                </div>
                <div>
                  <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                    Alias / Stage Name
                  </label>
                  <input
                    type="text"
                    value={newCasterAlias}
                    onChange={(e) => setNewCasterAlias(e.target.value.toUpperCase())}
                    placeholder="Contoh: BIMA"
                    className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm uppercase text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                  Email Google Login Caster
                </label>
                <input
                  type="email"
                  required
                  value={newCasterEmail}
                  onChange={(e) => setNewCasterEmail(e.target.value)}
                  placeholder="caster@gmail.com"
                  className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                />
                <p className="mt-1 text-[11px] text-[#94A3B8]">
                  Caster akan login via Google Sign-In menggunakan email ini.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                    Ratecard per Match (Rp)
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    step={5000}
                    value={newCasterRate}
                    onChange={(e) => setNewCasterRate(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                  />
                </div>
                <div>
                  <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                    Maks Match / Hari
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={10}
                    value={newCasterMaxMatches}
                    onChange={(e) => setNewCasterMaxMatches(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                  />
                </div>
              </div>

              <div>
                <span className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1.5">
                  Spesialisasi Cabang Game
                </span>
                <div className="flex flex-wrap gap-2">
                  {SCRIM_GAMES.map((g) => {
                    const checked = newCasterGames.includes(g);
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() =>
                          setNewCasterGames((prev) =>
                            prev.includes(g) ? prev.filter((item) => item !== g) : [...prev, g]
                          )
                        }
                        className={`px-3 py-1.5 rounded-[4px] border font-telemetry text-xs font-semibold uppercase transition-colors cursor-pointer ${
                          checked
                            ? 'bg-[#00F0FF]/15 border-[#00F0FF] text-[#00F0FF]'
                            : 'bg-[#0A0C10] border-white/12 text-[#94A3B8] hover:text-[#F8FAFC]'
                        }`}
                      >
                        {checked ? '✓ ' : '+ '}
                        {g}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <span className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1.5">
                  Badge Awal Talent (Opsional)
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    aria-pressed={newCasterVerified}
                    onClick={() => setNewCasterVerified((v) => !v)}
                    className={`min-h-[40px] px-3 py-2 rounded-[4px] border inline-flex items-center justify-center gap-1.5 font-telemetry text-xs font-bold uppercase transition-colors whitespace-nowrap cursor-pointer ${
                      newCasterVerified
                        ? 'bg-[#00F0FF]/18 border-[#00F0FF] text-[#00F0FF]'
                        : 'bg-[#0A0C10] border-white/12 text-[#94A3B8] hover:text-[#F8FAFC]'
                    }`}
                  >
                    <BadgeCheck className="w-4 h-4 shrink-0" />
                    <span>Verified</span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={newCasterTopCaster}
                    onClick={() => setNewCasterTopCaster((v) => !v)}
                    className={`min-h-[40px] px-3 py-2 rounded-[4px] border inline-flex items-center justify-center gap-1.5 font-telemetry text-xs font-bold uppercase transition-colors whitespace-nowrap cursor-pointer ${
                      newCasterTopCaster
                        ? 'bg-[#CCFF00]/18 border-[#CCFF00] text-[#CCFF00]'
                        : 'bg-[#0A0C10] border-white/12 text-[#94A3B8] hover:text-[#F8FAFC]'
                    }`}
                  >
                    <Crown className="w-4 h-4 shrink-0" />
                    <span>Top Caster</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1">
                  Bio Singkat (Opsional)
                </label>
                <textarea
                  rows={2}
                  value={newCasterBio}
                  onChange={(e) => setNewCasterBio(e.target.value)}
                  placeholder="Contoh: Play-by-play shoutcaster spesialis Point Blank & Free Fire."
                  className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] text-sm text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCreateCasterOpen(false)}
                  className="px-4 py-2 border border-white/20 text-[#F8FAFC] font-display text-sm font-semibold uppercase rounded-[4px] cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={creatingCaster}
                  className="px-5 py-2 bg-[#00F0FF] text-[#0A0C10] font-display text-sm font-bold uppercase rounded-[4px] disabled:opacity-50 cursor-pointer"
                >
                  {creatingCaster ? 'Menyimpan...' : 'Simpan & Buat Akun Caster'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* KONFIRMASI RESET / REGENERATE BRACKET */}
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
                  {busyId === confirmBracketTarget.trn.id ? 'Memproses...' : 'Ya, Buat Ulang Bracket'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <ConfirmDeleteModal
        open={Boolean(deleteTarget)}
        categoryLabel={
          deleteTarget?.tab === 'tournaments'
            ? 'Turnamen'
            : deleteTarget?.tab === 'scrims'
              ? 'Sesi Scrim'
              : deleteTarget?.tab === 'matches'
                ? 'Pertandingan'
                : deleteTarget?.tab === 'squads'
                  ? 'Squad'
                  : 'Berita'
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
