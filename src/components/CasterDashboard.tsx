import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpDown,
  CalendarOff,
  Check,
  CheckCircle2,
  Coins,
  ExternalLink,
  Filter,
  Link2,
  LogOut,
  Menu,
  Mic,
  Plus,
  Receipt,
  RotateCcw,
  Search,
  Settings,
  Trash2,
  Wallet,
  X,
  Youtube,
} from 'lucide-react';
import { api } from '../api';
import { useEscapeKey } from '../hooks/useEscapeKey';
import type {
  AuthUser,
  CasterWithdrawal,
  OrdalDatabase,
  ScrimGame,
  ScrimSession,
  Shoutcaster,
} from '../types';
import { OrdalMonogram } from './BrandAssets';
import { CasterBadges } from './CasterBadges';
import { MultiDateDayOffPicker } from './MultiDateDayOffPicker';
import { PaymentDetailCenter } from './PaymentDetailCenter';
import { formatRupiah, SCRIM_GAMES } from './ScrimArena';

type CasterTab = 'approvals' | 'earnings' | 'payments' | 'schedule';

interface CasterDashboardProps {
  user: AuthUser;
  db: OrdalDatabase;
  initialCasterId?: string;
  onRefresh: () => Promise<void>;
  onBackToSite: () => void;
  onBackToAdmin?: () => void;
  onLogout: () => void;
  onNotify: (msg: string) => void;
}

export const CasterDashboard: React.FC<CasterDashboardProps> = ({
  user,
  db,
  initialCasterId,
  onRefresh,
  onBackToSite,
  onBackToAdmin,
  onLogout,
  onNotify,
}) => {
  const casters = db.casters || [];
  const isSuperAdminMonitor = user.role === 'SUPER_ADMIN';
  const canViewLobbyFee = user.role === 'SUPER_ADMIN';
  const [selectedCasterId, setSelectedCasterId] = useState<string>(
    initialCasterId || user.casterId || casters[0]?.id || ''
  );
  const [activeTab, setActiveTab] = useState<CasterTab>('approvals');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  React.useEffect(() => {
    if (isSuperAdminMonitor && initialCasterId) {
      setSelectedCasterId(initialCasterId);
    }
  }, [isSuperAdminMonitor, initialCasterId]);

  const activeCasterId = isSuperAdminMonitor ? selectedCasterId : user.casterId;
  const caster: Shoutcaster | undefined =
    casters.find((c) => c.id === activeCasterId) || casters[0];

  // Ratecard & Day Off Form state synced with selected caster
  const [rateCardInput, setRateCardInput] = useState<number>(caster?.rateCard ?? 150000);
  const [bioInput, setBioInput] = useState<string>(caster?.bio ?? '');
  const [specialtyInput, setSpecialtyInput] = useState<ScrimGame[]>(caster?.specialtyGames ?? []);
  const [savingProfile, setSavingProfile] = useState(false);

  // YouTube Live Stream Link inline editor state
  const [editingStreamId, setEditingStreamId] = useState<string | null>(null);
  const [streamUrlDraft, setStreamUrlDraft] = useState<string>('');
  const [savingStream, setSavingStream] = useState(false);

  // Approval tab filter & sort state
  const [approvalStatusFilter, setApprovalStatusFilter] = useState<
    'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'
  >('ALL');
  const [approvalGameFilter, setApprovalGameFilter] = useState<'ALL' | ScrimGame>('ALL');
  const [approvalDateFilter, setApprovalDateFilter] = useState<string>('');
  const [approvalSearch, setApprovalSearch] = useState<string>('');
  const [approvalSortBy, setApprovalSortBy] = useState<
    'PENDING_FIRST' | 'DATE_ASC' | 'DATE_DESC' | 'RATE_DESC'
  >('PENDING_FIRST');

  // Withdraw Fee Scrim form state
  const [withdrawAmount, setWithdrawAmount] = useState<string>('');
  const [withdrawBank, setWithdrawBank] = useState<string>('BCA');
  const [withdrawAccountNumber, setWithdrawAccountNumber] = useState<string>('');
  const [withdrawAccountName, setWithdrawAccountName] = useState<string>(caster?.name ?? '');
  const [withdrawNote, setWithdrawNote] = useState<string>('');
  const [submittingWithdraw, setSubmittingWithdraw] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string>('');
  const [showWithdrawConfirmModal, setShowWithdrawConfirmModal] = useState(false);
  const [withdrawVerifiedCheck, setWithdrawVerifiedCheck] = useState(false);

  useEscapeKey(showWithdrawConfirmModal && !submittingWithdraw, () =>
    setShowWithdrawConfirmModal(false)
  );

  React.useEffect(() => {
    if (caster) {
      setRateCardInput(caster.rateCard);
      setBioInput(caster.bio);
      setSpecialtyInput(caster.specialtyGames);
      setWithdrawAccountName(caster.name);
    }
  }, [caster?.id, caster?.rateCard, caster?.bio, caster?.specialtyGames]);

  const myScrims = useMemo(() => {
    if (!caster) return [];
    return (db.scrims || []).filter((s) => s.casterId === caster.id);
  }, [db.scrims, caster]);

  const confirmedEarnings = useMemo(
    () =>
      myScrims
        .filter((s) => s.status === 'CONFIRMED' && s.casterApprovalStatus === 'APPROVED')
        .reduce((acc, s) => acc + s.casterRate, 0),
    [myScrims]
  );

  const pendingEarnings = useMemo(
    () =>
      myScrims
        .filter(
          (s) =>
            s.status !== 'CONFIRMED' &&
            s.status !== 'CANCELLED' &&
            s.casterApprovalStatus !== 'REJECTED'
        )
        .reduce((acc, s) => acc + s.casterRate, 0),
    [myScrims]
  );

  const approvedScrims = useMemo(
    () =>
      myScrims.filter(
        (s) => s.casterApprovalStatus === 'APPROVED' && s.status !== 'CANCELLED'
      ),
    [myScrims]
  );

  const totalApprovedLobbyFee = useMemo(
    () =>
      canViewLobbyFee
        ? approvedScrims.reduce((acc, s) => acc + (s.platformFee ?? 50000), 0)
        : 0,
    [approvedScrims, canViewLobbyFee]
  );

  const totalApprovedCasterRate = useMemo(
    () => approvedScrims.reduce((acc, s) => acc + s.casterRate, 0),
    [approvedScrims]
  );

  const totalGrossApproved = canViewLobbyFee
    ? totalApprovedCasterRate + totalApprovedLobbyFee
    : totalApprovedCasterRate;

  const pendingApprovalsCount = useMemo(
    () => myScrims.filter((s) => s.casterApprovalStatus === 'PENDING').length,
    [myScrims]
  );

  const approvalStatusCounts = useMemo(
    () => ({
      ALL: myScrims.length,
      PENDING: myScrims.filter((s) => s.casterApprovalStatus === 'PENDING').length,
      APPROVED: myScrims.filter((s) => s.casterApprovalStatus === 'APPROVED').length,
      REJECTED: myScrims.filter((s) => s.casterApprovalStatus === 'REJECTED').length,
    }),
    [myScrims]
  );

  const hasActiveApprovalFilters =
    approvalStatusFilter !== 'ALL' ||
    approvalGameFilter !== 'ALL' ||
    approvalDateFilter.trim() !== '' ||
    approvalSearch.trim() !== '' ||
    approvalSortBy !== 'PENDING_FIRST';

  const resetApprovalFilters = () => {
    setApprovalStatusFilter('ALL');
    setApprovalGameFilter('ALL');
    setApprovalDateFilter('');
    setApprovalSearch('');
    setApprovalSortBy('PENDING_FIRST');
  };

  const filteredApprovalScrims = useMemo(() => {
    const q = approvalSearch.trim().toLowerCase();
    const filtered = myScrims.filter((sc) => {
      if (approvalStatusFilter !== 'ALL' && sc.casterApprovalStatus !== approvalStatusFilter) {
        return false;
      }
      if (approvalGameFilter !== 'ALL' && sc.game !== approvalGameFilter) {
        return false;
      }
      if (approvalDateFilter && sc.date !== approvalDateFilter) {
        return false;
      }
      if (q) {
        const haystack = [
          sc.hostTeamName,
          sc.challengerTeamName || 'OPEN LOBBY',
          sc.game,
          sc.date,
          sc.timeSlot,
          sc.status,
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    const priorityRank = (status: ScrimSession['casterApprovalStatus']) => {
      if (status === 'PENDING') return 0;
      if (status === 'APPROVED') return 1;
      return 2;
    };

    const dateTimeKey = (sc: ScrimSession) => `${sc.date || ''} ${sc.timeSlot || ''}`;

    return [...filtered].sort((a, b) => {
      if (approvalSortBy === 'PENDING_FIRST') {
        const rankDiff =
          priorityRank(a.casterApprovalStatus) - priorityRank(b.casterApprovalStatus);
        if (rankDiff !== 0) return rankDiff;
        return dateTimeKey(a).localeCompare(dateTimeKey(b));
      }
      if (approvalSortBy === 'DATE_ASC') {
        return dateTimeKey(a).localeCompare(dateTimeKey(b));
      }
      if (approvalSortBy === 'DATE_DESC') {
        return dateTimeKey(b).localeCompare(dateTimeKey(a));
      }
      return b.casterRate - a.casterRate;
    });
  }, [
    myScrims,
    approvalStatusFilter,
    approvalGameFilter,
    approvalDateFilter,
    approvalSearch,
    approvalSortBy,
  ]);

  const myWithdrawals = useMemo<CasterWithdrawal[]>(() => {
    if (!caster) return [];
    return (db.withdrawals || []).filter((w) => w.casterId === caster.id);
  }, [db.withdrawals, caster]);

  const myPayments = useMemo(() => {
    if (!caster) return [];
    return (db.payments || [])
      .filter((p) => p.casterId === caster.id && p.category !== 'SCRIM_REFUND')
      .map((p) => {
        if (p.category === 'SCRIM_SPLIT_BILL' && user.role === 'SUPER_ADMIN') {
          const casterShare = p.casterFeeShare ?? p.amount;
          return {
            ...p,
            amount: casterShare,
            platformFeeShare: 0,
            lineItems: [{ label: 'Bagian Honor Shoutcaster (50%)', amount: casterShare }],
          };
        }
        return p;
      });
  }, [db.payments, caster, user.role]);

  const pendingCasterPaymentsCount = useMemo(
    () => myPayments.filter((p) => p.status === 'PENDING_VALIDATION').length,
    [myPayments]
  );

  const usedWithdrawalAmount = useMemo(
    () =>
      myWithdrawals
        .filter((w) => w.status !== 'REJECTED')
        .reduce((acc, w) => acc + w.amount, 0),
    [myWithdrawals]
  );

  const paidWithdrawalAmount = useMemo(
    () =>
      myWithdrawals
        .filter((w) => w.status === 'PAID')
        .reduce((acc, w) => acc + w.amount, 0),
    [myWithdrawals]
  );

  const availableWithdrawBalance = Math.max(0, confirmedEarnings - usedWithdrawalAmount);

  const getDailyBookedCount = (date: string) =>
    myScrims.filter(
      (s) =>
        s.date === date &&
        s.status !== 'CANCELLED' &&
        s.casterApprovalStatus !== 'REJECTED'
    ).length;

  const getApprovedSlotConflict = (scrim: ScrimSession) =>
    myScrims.find(
      (s) =>
        s.id !== scrim.id &&
        s.date === scrim.date &&
        s.timeSlot === scrim.timeSlot &&
        s.casterApprovalStatus === 'APPROVED' &&
        s.status !== 'CANCELLED'
    );

  const handleDecision = async (scrim: ScrimSession, decision: 'APPROVED' | 'REJECTED') => {
    setBusyId(scrim.id);
    try {
      await api.casterDecision(scrim.id, decision);
      await onRefresh();
      onNotify(
        decision === 'APPROVED'
          ? `Match ${scrim.hostTeamName} disetujui untuk dicast pada ${scrim.date}.`
          : `Match ${scrim.hostTeamName} ditolak. Kuota harian Anda kembali tersedia.`
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal memperbarui status approval.');
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveRatecard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caster) return;
    setSavingProfile(true);
    try {
      await api.updateCaster(caster.id, {
        rateCard: Number(rateCardInput) || 0,
        bio: bioInput.trim(),
        specialtyGames: specialtyInput,
      });
      await onRefresh();
      onNotify(`Ratecard ${caster.name} diperbarui ke ${formatRupiah(Number(rateCardInput) || 0)}/match.`);
    } finally {
      setSavingProfile(false);
    }
  };

  const bookedCountByDate = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of myScrims) {
      if (s.status !== 'CANCELLED' && s.casterApprovalStatus !== 'REJECTED' && s.date) {
        map[s.date] = (map[s.date] || 0) + 1;
      }
    }
    return map;
  }, [myScrims]);

  const handleSaveDayOffSchedule = async (
    nextFullDates: string[],
    nextSlotOffs: Record<string, string[]>
  ) => {
    if (!caster) return;
    const normalizedFull = Array.from(new Set(nextFullDates)).sort();
    const fullSet = new Set(normalizedFull);
    const normalizedSlots: Record<string, string[]> = {};
    for (const [dateKey, slots] of Object.entries(nextSlotOffs)) {
      if (fullSet.has(dateKey)) continue;
      const clean = Array.from(new Set(slots)).filter(Boolean);
      if (clean.length > 0) normalizedSlots[dateKey] = clean;
    }
    const partialCount = Object.keys(normalizedSlots).length;
    setSavingProfile(true);
    try {
      await api.updateCaster(caster.id, {
        dayOffDates: normalizedFull,
        dayOffSlots: normalizedSlots,
      });
      await onRefresh();
      onNotify(
        normalizedFull.length === 0 && partialCount === 0
          ? 'Semua jadwal Off dihapus. Semua hari kembali terbuka (maks 2 match/hari).'
          : `Jadwal Off diperbarui (${normalizedFull.length} Full Day Off · ${partialCount} Off Per Jam / 1 Job).`
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal menyimpan jadwal Day Off.');
    } finally {
      setSavingProfile(false);
    }
  };

  const toggleSpecialty = (g: ScrimGame) => {
    setSpecialtyInput((prev) =>
      prev.includes(g) ? prev.filter((item) => item !== g) : [...prev, g]
    );
  };

  const handleSaveStreamLink = async (scrimId: string, urlValue: string) => {
    setSavingStream(true);
    try {
      await api.updateScrimStreamLink(scrimId, urlValue);
      await onRefresh();
      setEditingStreamId(null);
      setStreamUrlDraft('');
      onNotify(
        urlValue.trim()
          ? 'Link Live Stream YouTube berhasil disimpan & tampil di Public Scrim Lobby.'
          : 'Link Live Stream YouTube dihapus.'
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal menyimpan link YouTube.');
    } finally {
      setSavingStream(false);
    }
  };

  const parsedWithdrawAmount = Number(withdrawAmount) || 0;
  const isOverBalance = parsedWithdrawAmount > availableWithdrawBalance;
  const isBelowMinimum = withdrawAmount !== '' && parsedWithdrawAmount < 10000;
  const cleanAccountDigits = withdrawAccountNumber.replace(/\D/g, '');
  const isAccountNumberShort =
    withdrawAccountNumber.trim() !== '' && cleanAccountDigits.length < 6;
  const remainingAfterWithdraw = Math.max(0, availableWithdrawBalance - parsedWithdrawAmount);

  const handleSubmitWithdraw = (e: React.FormEvent) => {
    e.preventDefault();
    if (!caster) return;
    setWithdrawError('');
    const nominal = Math.round(Number(withdrawAmount));
    if (!nominal || nominal < 10000) {
      setWithdrawError('Minimal nominal withdraw adalah Rp 10.000.');
      return;
    }
    if (nominal > availableWithdrawBalance) {
      setWithdrawError(
        `Nominal melebihi saldo tersedia! Anda hanya dapat menarik maksimal ${formatRupiah(availableWithdrawBalance)}.`
      );
      return;
    }
    if (cleanAccountDigits.length < 6) {
      setWithdrawError('Nomor rekening / e-wallet tidak valid (minimal 6 digit angka).');
      return;
    }
    if (!withdrawAccountName.trim()) {
      setWithdrawError('Nama pemilik rekening wajib diisi.');
      return;
    }
    setWithdrawVerifiedCheck(false);
    setShowWithdrawConfirmModal(true);
  };

  const handleConfirmWithdraw = async () => {
    if (!caster) return;
    const nominal = Math.round(Number(withdrawAmount));
    if (nominal > availableWithdrawBalance) {
      setShowWithdrawConfirmModal(false);
      setWithdrawError(
        `Nominal melebihi saldo tersedia (${formatRupiah(availableWithdrawBalance)}).`
      );
      return;
    }
    setSubmittingWithdraw(true);
    try {
      await api.requestCasterWithdrawal(caster.id, {
        amount: nominal,
        bankOrWallet: withdrawBank,
        accountNumber: withdrawAccountNumber.trim(),
        accountName: withdrawAccountName.trim(),
        note: withdrawNote.trim() || undefined,
      });
      await onRefresh();
      setShowWithdrawConfirmModal(false);
      setWithdrawVerifiedCheck(false);
      setWithdrawAmount('');
      setWithdrawAccountNumber('');
      setWithdrawNote('');
      onNotify(`Pengajuan withdraw ${formatRupiah(nominal)} berhasil dikirim ke Super Admin.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal mengajukan withdraw.';
      setShowWithdrawConfirmModal(false);
      setWithdrawError(msg);
      onNotify(msg);
    } finally {
      setSubmittingWithdraw(false);
    }
  };

  const handleUpdateWithdrawalStatus = async (
    wdr: CasterWithdrawal,
    status: 'PAID' | 'REJECTED'
  ) => {
    setBusyId(wdr.id);
    try {
      await api.updateWithdrawalStatus(wdr.id, status);
      await onRefresh();
      onNotify(
        status === 'PAID'
          ? `Withdraw ${formatRupiah(wdr.amount)} untuk ${wdr.casterName} ditandai PAID.`
          : `Withdraw ${formatRupiah(wdr.amount)} ditolak. Saldo dikembalikan ke caster.`
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal memperbarui status withdraw.');
    } finally {
      setBusyId(null);
    }
  };

  if (!caster) return null;

  return (
    <div className="min-h-screen bg-[#0A0C10] text-[#F8FAFC] flex">
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-black/70 lg:hidden"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-50 h-screen w-[264px] shrink-0 bg-[#12161F] border-r border-white/[0.08] flex flex-col justify-between overflow-y-auto transition-transform duration-200 ${
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
                  CASTER PORTAL
                </div>
                <div className="font-telemetry text-[10px] uppercase tracking-[0.1em] text-[#CCFF00] mt-0.5">
                  ORDAL ENTERTAINMENT
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

          {/* Authenticated Shoutcaster Identity / Super Admin Monitor Switcher */}
          <div className="p-4 border-b border-white/[0.08]">
            {isSuperAdminMonitor ? (
              <>
                <label className="block font-telemetry text-[10px] font-bold uppercase tracking-[0.1em] text-[#FF2E5B] mb-1.5">
                  MODE PANTAU SUPER ADMIN
                </label>
                <select
                  value={caster.id}
                  onChange={(e) => setSelectedCasterId(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0A0C10] border border-[#FF2E5B]/45 rounded-[4px] font-telemetry text-xs font-bold text-[#00F0FF] focus:outline-none focus:border-[#00F0FF]"
                >
                  {casters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <>
                <div className="font-telemetry text-[10px] font-semibold uppercase tracking-[0.1em] text-[#CCFF00]">
                  TALENT SHOUTCASTER AKTIF
                </div>
                <div className="mt-1 font-display text-base font-bold uppercase text-[#F8FAFC] truncate">
                  {caster.name}
                </div>
                <div className="font-telemetry text-[11px] text-[#94A3B8] truncate">
                  {user.email}
                </div>
              </>
            )}
            <div className="mt-2.5">
              <CasterBadges
                isVerified={caster.isVerified}
                isTopCaster={caster.isTopCaster}
                size="xs"
                showEmptyLabel
              />
            </div>
            <div className="mt-2 font-telemetry text-[11px] text-[#94A3B8]">
              Kuota Harian: <span className="text-[#F8FAFC] font-bold">Maks 2 Match / Hari</span>
            </div>
          </div>

          {/* Navigation */}
          <nav className="p-3 space-y-1">
            {[
              { id: 'approvals' as CasterTab, label: 'Approval & Live Link', icon: Mic, badge: pendingApprovalsCount },
              { id: 'earnings' as CasterTab, label: 'Pendapatan & Withdraw', icon: Coins, badge: 0 },
              { id: 'payments' as CasterTab, label: 'Invoice & Payment', icon: Receipt, badge: pendingCasterPaymentsCount },
              { id: 'schedule' as CasterTab, label: 'Day Off & Ratecard', icon: Settings, badge: 0 },
            ].map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.id);
                    setSidebarOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-[4px] font-telemetry text-xs font-semibold uppercase tracking-[0.06em] transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-[#00F0FF]/12 text-[#00F0FF] border border-[#00F0FF]/35'
                      : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-white/[0.04] border border-transparent'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </span>
                  {item.badge > 0 && (
                    <span className="font-telemetry text-[10px] font-bold text-[#FF2E5B]">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-white/[0.08] space-y-2">
          {isSuperAdminMonitor && onBackToAdmin && (
            <button
              type="button"
              onClick={onBackToAdmin}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#FF2E5B]/15 border border-[#FF2E5B]/50 text-[#FF2E5B] font-display text-sm font-bold uppercase tracking-[0.05em] rounded-[4px] hover:bg-[#FF2E5B]/25 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              Kembali ke Super Admin
            </button>
          )}
          <button
            type="button"
            onClick={onBackToSite}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#00F0FF] text-[#0A0C10] font-display text-sm font-bold uppercase tracking-[0.05em] rounded-[4px] cursor-pointer"
          >
            <ExternalLink className="w-4 h-4" />
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

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 min-h-16 px-3 sm:px-8 py-2 glass-shield border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Buka menu caster"
              className="lg:hidden min-h-[40px] min-w-[40px] flex items-center justify-center border border-white/15 rounded-[4px] text-[#F8FAFC] cursor-pointer shrink-0"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 font-telemetry text-xs uppercase tracking-[0.08em] min-w-0">
              <span className="text-[#94A3B8] hidden sm:inline">Shoutcaster</span>
              <span className="text-white/25 hidden sm:inline">/</span>
              <span className="text-[#F8FAFC] font-bold truncate">{caster.name}</span>
              <CasterBadges
                isVerified={caster.isVerified}
                isTopCaster={caster.isTopCaster}
                size="xs"
              />
            </div>
          </div>

          <div className="font-telemetry text-[11px] sm:text-xs font-bold uppercase tracking-[0.08em] text-[#CCFF00] whitespace-nowrap">
            RATECARD: {formatRupiah(caster.rateCard)}
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-8 max-w-[1360px] w-full mx-auto space-y-6 sm:space-y-8">
          {/* KPI Strip */}
          <div
            className={`grid grid-cols-1 sm:grid-cols-2 ${
              isSuperAdminMonitor ? 'md:grid-cols-3 lg:grid-cols-5' : 'lg:grid-cols-4'
            } gap-3 sm:gap-4`}
          >
            <div className="p-5 bg-[#12161F] border border-white/[0.08] rounded-[6px]">
              <div className="font-telemetry text-[11px] uppercase tracking-[0.08em] text-[#94A3B8]">
                Saldo Siap Withdraw
              </div>
              <div className="mt-2 font-display text-2xl sm:text-3xl font-bold text-[#CCFF00] tabular-nums">
                {formatRupiah(availableWithdrawBalance)}
              </div>
            </div>
            <div className="p-5 bg-[#12161F] border border-white/[0.08] rounded-[6px]">
              <div className="font-telemetry text-[11px] uppercase tracking-[0.08em] text-[#94A3B8]">
                Estimasi Pending
              </div>
              <div className="mt-2 font-display text-2xl sm:text-3xl font-bold text-[#00F0FF] tabular-nums">
                {formatRupiah(pendingEarnings)}
              </div>
            </div>
            {canViewLobbyFee && (
              <div className="p-5 bg-[#12161F] border border-[#00F0FF]/25 rounded-[6px]">
                <div className="font-telemetry text-[11px] uppercase tracking-[0.08em] text-[#94A3B8]">
                  Lobby Fee Terkumpul
                </div>
                <div className="mt-2 font-display text-2xl sm:text-3xl font-bold text-[#F8FAFC] tabular-nums">
                  {formatRupiah(totalApprovedLobbyFee)}
                </div>
                <div className="mt-1 font-telemetry text-[10px] uppercase tracking-[0.06em] text-[#00F0FF]">
                  {approvedScrims.length} Match Approved
                </div>
              </div>
            )}
            <div className="p-5 bg-[#12161F] border border-white/[0.08] rounded-[6px]">
              <div className="font-telemetry text-[11px] uppercase tracking-[0.08em] text-[#94A3B8]">
                Menunggu Approval
              </div>
              <div className="mt-2 font-display text-2xl sm:text-3xl font-bold text-[#FF2E5B] tabular-nums">
                {pendingApprovalsCount} Match
              </div>
            </div>
            <div className="p-5 bg-[#12161F] border border-white/[0.08] rounded-[6px]">
              <div className="font-telemetry text-[11px] uppercase tracking-[0.08em] text-[#94A3B8]">
                Jadwal Day Off
              </div>
              <div className="mt-2 font-display text-2xl sm:text-3xl font-bold text-[#F8FAFC] tabular-nums">
                {caster.dayOffDates.length} Full
                {Object.keys(caster.dayOffSlots || {}).length > 0 && (
                  <span className="ml-2 text-base text-[#FACC15]">
                    · {Object.keys(caster.dayOffSlots || {}).length} Off Jam
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* TAB 1: APPROVAL MATCH */}
          {activeTab === 'approvals' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 pb-4 border-b border-white/[0.08]">
                <div>
                  <h1 className="font-display text-2xl font-bold uppercase text-[#F8FAFC]">
                    Antrean &amp; Jadwal Casting Match
                  </h1>
                  <p className="text-sm text-[#94A3B8] mt-0.5">
                    Batas maksimal 2 match per hari. Approve atau tolak permintaan casting untuk mengunci jadwal Anda.
                  </p>
                </div>
                <span className="font-telemetry text-xs uppercase tracking-[0.08em] text-[#94A3B8]">
                  Menampilkan <span className="text-[#00F0FF] font-bold">{filteredApprovalScrims.length}</span> dari {myScrims.length} Match
                </span>
              </div>

              {/* Filter & Sort Bar */}
              {myScrims.length > 0 && (
                <div className="p-4 bg-[#12161F] border border-white/[0.08] rounded-[6px] space-y-3.5">
                  {/* Status Filter Tabs */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 font-telemetry text-[11px] font-bold uppercase tracking-[0.08em] text-[#94A3B8] mr-1">
                        <Filter className="w-3.5 h-3.5 text-[#00F0FF]" />
                        Status:
                      </span>
                      {(
                        [
                          { id: 'ALL', label: 'Semua' },
                          { id: 'PENDING', label: 'Pending' },
                          { id: 'APPROVED', label: 'Approved' },
                          { id: 'REJECTED', label: 'Ditolak' },
                        ] as const
                      ).map((tab) => {
                        const isActive = approvalStatusFilter === tab.id;
                        const count = approvalStatusCounts[tab.id];
                        return (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setApprovalStatusFilter(tab.id)}
                            className={`px-3 py-1.5 rounded-[4px] font-telemetry text-xs font-bold uppercase tracking-[0.06em] border transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
                              isActive
                                ? tab.id === 'PENDING'
                                  ? 'bg-[#CCFF00]/15 border-[#CCFF00] text-[#CCFF00]'
                                  : tab.id === 'REJECTED'
                                    ? 'bg-[#FF2E5B]/15 border-[#FF2E5B] text-[#FF2E5B]'
                                    : 'bg-[#00F0FF]/15 border-[#00F0FF] text-[#00F0FF]'
                                : 'bg-[#0A0C10] border-white/10 text-[#94A3B8] hover:text-[#F8FAFC] hover:border-white/25'
                            }`}
                          >
                            <span>{tab.label}</span>
                            <span className="px-1.5 py-0.5 rounded-[3px] bg-white/[0.06] text-[10px]">
                              {count}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {hasActiveApprovalFilters && (
                      <button
                        type="button"
                        onClick={resetApprovalFilters}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] border border-white/15 bg-[#0A0C10] text-[#94A3B8] hover:text-[#F8FAFC] hover:border-[#00F0FF] font-telemetry text-[11px] font-semibold uppercase tracking-[0.06em] transition-colors cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Reset Filter
                      </button>
                    )}
                  </div>

                  {/* Search, Game, Date, Sort Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="relative">
                      <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={approvalSearch}
                        onChange={(e) => setApprovalSearch(e.target.value)}
                        placeholder="Cari nama tim / jam..."
                        className="w-full pl-9 pr-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-xs text-[#F8FAFC] placeholder:text-[#94A3B8]/60 focus:outline-none focus:border-[#00F0FF]"
                      />
                    </div>

                    <select
                      value={approvalGameFilter}
                      onChange={(e) => setApprovalGameFilter(e.target.value as 'ALL' | ScrimGame)}
                      aria-label="Filter Game"
                      className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-xs text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                    >
                      <option value="ALL">Semua Game</option>
                      {SCRIM_GAMES.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>

                    <input
                      type="date"
                      value={approvalDateFilter}
                      onChange={(e) => setApprovalDateFilter(e.target.value)}
                      aria-label="Filter Tanggal Match"
                      className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-xs text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                    />

                    <div className="relative">
                      <ArrowUpDown className="w-3.5 h-3.5 text-[#00F0FF] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <select
                        value={approvalSortBy}
                        onChange={(e) =>
                          setApprovalSortBy(
                            e.target.value as
                              | 'PENDING_FIRST'
                              | 'DATE_ASC'
                              | 'DATE_DESC'
                              | 'RATE_DESC'
                          )
                        }
                        aria-label="Urutkan Match"
                        className="w-full pl-8 pr-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-xs text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                      >
                        <option value="PENDING_FIRST">Urutkan: Pending Dulu</option>
                        <option value="DATE_ASC">Urutkan: Jadwal Terdekat</option>
                        <option value="DATE_DESC">Urutkan: Jadwal Terbaru</option>
                        <option value="RATE_DESC">Urutkan: Fee Caster Tertinggi</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {myScrims.length === 0 ? (
                <div className="p-10 bg-[#12161F] border border-white/[0.08] rounded-[6px] text-center text-sm text-[#94A3B8]">
                  Belum ada jadwal scrim yang menunjuk {caster.name}.
                </div>
              ) : filteredApprovalScrims.length === 0 ? (
                <div className="p-10 bg-[#12161F] border border-white/[0.08] rounded-[6px] text-center space-y-3">
                  <p className="text-sm text-[#94A3B8]">
                    Tidak ada match yang sesuai dengan filter yang dipilih.
                  </p>
                  <button
                    type="button"
                    onClick={resetApprovalFilters}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#00F0FF] text-[#0A0C10] font-display text-xs font-bold uppercase tracking-[0.06em] rounded-[4px] hover:shadow-[0_0_16px_rgba(0,240,255,0.35)] transition-all cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset Filter
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredApprovalScrims.map((sc) => {
                    const countOnDate = getDailyBookedCount(sc.date);
                    const hasPartialOff = (caster.dayOffSlots?.[sc.date]?.length || 0) > 0;
                    const dailyLimit = hasPartialOff ? 1 : caster.maxMatchesPerDay || 2;
                    const slotConflict =
                      sc.casterApprovalStatus === 'PENDING'
                        ? getApprovedSlotConflict(sc)
                        : undefined;
                    const isEditingStream = editingStreamId === sc.id;
                    return (
                      <div
                        key={sc.id}
                        className="p-5 bg-[#12161F] border border-white/[0.08] rounded-[6px] space-y-4"
                      >
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                          <div className="space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2 font-telemetry text-xs uppercase tracking-[0.08em]">
                              <span className="text-[#00F0FF] font-bold">{sc.game}</span>
                              <span className="text-white/25">·</span>
                              <span className="text-[#F8FAFC]">
                                {sc.date} ({sc.timeSlot})
                              </span>
                              <span className="text-white/25">·</span>
                              <span
                                className={
                                  countOnDate >= dailyLimit
                                    ? 'text-[#FF2E5B] font-bold'
                                    : hasPartialOff
                                      ? 'text-[#FACC15] font-semibold'
                                      : 'text-[#CCFF00] font-semibold'
                                }
                              >
                                Kuota Hari Itu: {countOnDate}/{dailyLimit}{' '}
                                {countOnDate >= dailyLimit
                                  ? '(FULL BOOK)'
                                  : hasPartialOff
                                    ? '(1 JOB · 1 OFF)'
                                    : ''}
                              </span>
                            </div>

                            <div className="font-display text-xl font-bold uppercase text-[#F8FAFC]">
                              {sc.hostTeamName}{' '}
                              <span className="text-[#FF2E5B] text-base">VS</span>{' '}
                              {sc.challengerTeamName || 'OPEN LOBBY'}
                            </div>

                            <div className="font-telemetry text-xs text-[#94A3B8]">
                              Hak Pendapatan Caster:{' '}
                              <span className="text-[#CCFF00] font-bold">
                                {formatRupiah(sc.casterRate)}
                              </span>{' '}
                              · Status Pembayaran Tim:{' '}
                              <span className="text-[#F8FAFC]">{sc.status.replace('_', ' ')}</span>
                            </div>

                            {slotConflict && (
                              <div className="mt-1 inline-block px-2.5 py-1 bg-[#FF2E5B]/15 border border-[#FF2E5B] rounded-[4px] font-telemetry text-[11px] font-bold text-[#FFDADB]">
                                BENTROK JADWAL dengan {slotConflict.hostTeamName} ({sc.date} · {sc.timeSlot})
                              </div>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                            {sc.casterApprovalStatus === 'PENDING' ? (
                              <>
                                <button
                                  type="button"
                                  disabled={busyId === sc.id}
                                  onClick={() => handleDecision(sc, 'REJECTED')}
                                  className="px-4 min-h-[42px] border border-[#FF2E5B]/60 text-[#FF2E5B] font-display text-sm font-bold uppercase rounded-[4px] hover:bg-[#FF2E5B]/10 cursor-pointer"
                                >
                                  Tolak
                                </button>
                                <button
                                  type="button"
                                  disabled={busyId === sc.id || Boolean(slotConflict)}
                                  onClick={() => handleDecision(sc, 'APPROVED')}
                                  className="px-5 min-h-[42px] bg-[#00F0FF] text-[#0A0C10] font-display text-sm font-bold uppercase rounded-[4px] hover:shadow-[0_0_16px_rgba(0,240,255,0.4)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                >
                                  {slotConflict ? 'Jadwal Bentrok' : 'Approve Match'}
                                </button>
                              </>
                            ) : sc.casterApprovalStatus === 'APPROVED' ? (
                              <span className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#00F0FF]/12 border border-[#00F0FF]/40 rounded-[4px] font-telemetry text-xs font-bold uppercase text-[#00F0FF]">
                                <CheckCircle2 className="w-4 h-4" />
                                APPROVED BY CASTER
                              </span>
                            ) : (
                              <span className="px-3.5 py-2 bg-[#FF2E5B]/10 border border-[#FF2E5B]/40 rounded-[4px] font-telemetry text-xs font-bold uppercase text-[#FF2E5B]">
                                DITOLAK CASTER
                              </span>
                            )}
                          </div>
                        </div>

                        {/* YouTube Live Stream Link Row */}
                        {sc.casterApprovalStatus !== 'REJECTED' && (
                          <div className="pt-3 border-t border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            {isEditingStream ? (
                              <form
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  handleSaveStreamLink(sc.id, streamUrlDraft);
                                }}
                                className="w-full flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
                              >
                                <div className="relative flex-1">
                                  <Youtube className="w-4 h-4 text-[#FF2E5B] absolute left-3 top-1/2 -translate-y-1/2" />
                                  <input
                                    type="url"
                                    value={streamUrlDraft}
                                    onChange={(e) => setStreamUrlDraft(e.target.value)}
                                    placeholder="https://www.youtube.com/watch?v=... atau https://youtu.be/..."
                                    className="w-full pl-9 pr-3 py-2 bg-[#0A0C10] border border-white/15 rounded-[4px] font-telemetry text-xs text-[#F8FAFC] placeholder:text-[#94A3B8]/60 focus:outline-none focus:border-[#00F0FF]"
                                  />
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="submit"
                                    disabled={savingStream}
                                    className="px-4 py-2 bg-[#FF2E5B] text-white font-telemetry text-xs font-bold uppercase rounded-[4px] hover:brightness-110 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                                  >
                                    {savingStream ? 'Menyimpan...' : 'Simpan Link'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingStreamId(null);
                                      setStreamUrlDraft('');
                                    }}
                                    className="px-3 py-2 border border-white/15 text-[#94A3B8] hover:text-white font-telemetry text-xs uppercase rounded-[4px] cursor-pointer"
                                  >
                                    Batal
                                  </button>
                                </div>
                              </form>
                            ) : (
                              <>
                                <div className="flex items-center gap-2 min-w-0 font-telemetry text-xs">
                                  <Youtube className="w-4 h-4 text-[#FF2E5B] shrink-0" />
                                  {sc.youtubeStreamUrl ? (
                                    <a
                                      href={sc.youtubeStreamUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[#00F0FF] hover:underline truncate flex items-center gap-1.5"
                                    >
                                      <span className="truncate">{sc.youtubeStreamUrl}</span>
                                      <ExternalLink className="w-3 h-3 shrink-0" />
                                    </a>
                                  ) : (
                                    <span className="text-[#94A3B8]">
                                      Belum ada link Live Stream YouTube untuk match ini.
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingStreamId(sc.id);
                                      setStreamUrlDraft(sc.youtubeStreamUrl || '');
                                    }}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0A0C10] border border-white/15 hover:border-[#FF2E5B] text-[#F8FAFC] hover:text-[#FF2E5B] font-telemetry text-[11px] font-bold uppercase rounded-[4px] transition-colors cursor-pointer"
                                  >
                                    <Link2 className="w-3.5 h-3.5" />
                                    {sc.youtubeStreamUrl ? 'Edit Link YouTube' : 'Tambah Link YouTube'}
                                  </button>
                                  {sc.youtubeStreamUrl && (
                                    <button
                                      type="button"
                                      disabled={savingStream}
                                      onClick={() => handleSaveStreamLink(sc.id, '')}
                                      className="p-1.5 text-[#94A3B8] hover:text-[#FF2E5B] cursor-pointer"
                                      aria-label="Hapus link YouTube"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: PENDAPATAN */}
          {activeTab === 'earnings' && (
            <div className="space-y-6">
              <div className="pb-4 border-b border-white/[0.08]">
                <h1 className="font-display text-2xl font-bold uppercase text-[#F8FAFC]">
                  Laporan Pendapatan Shoutcaster
                </h1>
                <p className="text-sm text-[#94A3B8] mt-0.5">
                  {canViewLobbyFee
                    ? 'Rincian hak tarif caster per match serta akumulasi Lobby Fee Rp 50.000 per match yang telah di-approve untuk internal ORDAL Esports Hub.'
                    : 'Rincian hak tarif ratecard Anda untuk setiap match scrim yang telah disetujui.'}
                </p>
              </div>

              {/* Statistik Pendapatan (Lobby Fee disembunyikan untuk role CASTER) */}
              <div className="p-6 bg-[#12161F] border border-white/[0.08] rounded-[6px] space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-white/[0.08]">
                  <div>
                    <div className="font-telemetry text-[11px] font-semibold uppercase tracking-[0.08em] text-[#00F0FF]">
                      {canViewLobbyFee
                        ? 'STATISTIK PENDAPATAN & LOBBY FEE (MATCH APPROVED)'
                        : 'RINGKASAN PENDAPATAN CASTER (MATCH APPROVED)'}
                    </div>
                    <p className="text-xs text-[#94A3B8] mt-0.5">
                      Dihitung otomatis dari {approvedScrims.length} match yang telah di-approve.
                    </p>
                  </div>
                  {canViewLobbyFee && (
                    <div className="font-telemetry text-xs font-bold uppercase text-[#F8FAFC]">
                      Total Nilai Match:{' '}
                      <span className="text-[#CCFF00]">{formatRupiah(totalGrossApproved)}</span>
                    </div>
                  )}
                </div>

                {canViewLobbyFee ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 bg-[#0A0C10] border border-white/[0.08] rounded-[4px]">
                      <div className="font-telemetry text-[10px] uppercase tracking-[0.08em] text-[#94A3B8]">
                        Total Hak Caster (Approved)
                      </div>
                      <div className="mt-1.5 font-display text-2xl font-bold text-[#CCFF00] tabular-nums">
                        {formatRupiah(totalApprovedCasterRate)}
                      </div>
                      <div className="mt-1 font-telemetry text-[11px] text-[#94A3B8]">
                        100% Ratecard dari {approvedScrims.length} match approved
                      </div>
                    </div>

                    <div className="p-4 bg-[#0A0C10] border border-[#00F0FF]/35 rounded-[4px]">
                      <div className="font-telemetry text-[10px] uppercase tracking-[0.08em] text-[#00F0FF]">
                        Total Lobby Fee Terkumpul
                      </div>
                      <div className="mt-1.5 font-display text-2xl font-bold text-[#F8FAFC] tabular-nums">
                        {formatRupiah(totalApprovedLobbyFee)}
                      </div>
                      <div className="mt-1 font-telemetry text-[11px] text-[#94A3B8]">
                        {approvedScrims.length} match × Rp 50.000 (Internal ORDAL)
                      </div>
                    </div>

                    <div className="p-4 bg-[#0A0C10] border border-white/[0.08] rounded-[4px]">
                      <div className="font-telemetry text-[10px] uppercase tracking-[0.08em] text-[#94A3B8]">
                        Proporsi Distribusi Dana
                      </div>
                      <div className="mt-2 h-2.5 w-full bg-[#12161F] rounded-[2px] overflow-hidden flex">
                        <div
                          className="h-full bg-[#CCFF00]"
                          style={{
                            width: `${
                              totalGrossApproved > 0
                                ? Math.round((totalApprovedCasterRate / totalGrossApproved) * 100)
                                : 0
                            }%`,
                          }}
                        />
                        <div
                          className="h-full bg-[#00F0FF]"
                          style={{
                            width: `${
                              totalGrossApproved > 0
                                ? Math.round((totalApprovedLobbyFee / totalGrossApproved) * 100)
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                      <div className="mt-2 flex items-center justify-between font-telemetry text-[10px] uppercase">
                        <span className="text-[#CCFF00]">
                          Caster{' '}
                          {totalGrossApproved > 0
                            ? Math.round((totalApprovedCasterRate / totalGrossApproved) * 100)
                            : 0}
                          %
                        </span>
                        <span className="text-[#00F0FF]">
                          Lobby Fee{' '}
                          {totalGrossApproved > 0
                            ? Math.round((totalApprovedLobbyFee / totalGrossApproved) * 100)
                            : 0}
                          %
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 bg-[#0A0C10] border border-white/[0.08] rounded-[4px]">
                      <div className="font-telemetry text-[10px] uppercase tracking-[0.08em] text-[#94A3B8]">
                        Total Hak Pendapatan (Approved)
                      </div>
                      <div className="mt-1.5 font-display text-2xl font-bold text-[#CCFF00] tabular-nums">
                        {formatRupiah(totalApprovedCasterRate)}
                      </div>
                      <div className="mt-1 font-telemetry text-[11px] text-[#94A3B8]">
                        100% Ratecard dari {approvedScrims.length} match approved
                      </div>
                    </div>

                    <div className="p-4 bg-[#0A0C10] border border-white/[0.08] rounded-[4px]">
                      <div className="font-telemetry text-[10px] uppercase tracking-[0.08em] text-[#94A3B8]">
                        Pendapatan Sudah Lunas
                      </div>
                      <div className="mt-1.5 font-display text-2xl font-bold text-[#00F0FF] tabular-nums">
                        {formatRupiah(confirmedEarnings)}
                      </div>
                      <div className="mt-1 font-telemetry text-[11px] text-[#94A3B8]">
                        Dari match berstatus CONFIRMED
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-[#12161F] border border-white/[0.08] rounded-[6px] overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[640px]">
                  <thead>
                    <tr className="border-b border-white/[0.08] font-telemetry text-[11px] uppercase tracking-[0.08em] text-[#94A3B8]">
                      <th className="py-3.5 px-4">Tanggal &amp; Match</th>
                      <th className="py-3.5 px-4">Approval Caster</th>
                      <th className="py-3.5 px-4">Status Pembayaran</th>
                      {canViewLobbyFee && (
                        <th className="py-3.5 px-4 text-right">Lobby Fee (ORDAL)</th>
                      )}
                      <th className="py-3.5 px-4 text-right">Pendapatan Caster</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06] text-sm font-telemetry">
                    {myScrims.map((sc) => (
                      <tr key={sc.id} className="hover:bg-white/[0.02]">
                        <td className="py-3.5 px-4">
                          <div className="font-display text-base font-bold uppercase text-[#F8FAFC]">
                            {sc.hostTeamName} vs {sc.challengerTeamName || 'OPEN'}
                          </div>
                          <div className="text-xs text-[#94A3B8]">
                            {sc.game} · {sc.date} {sc.timeSlot}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-xs font-bold">
                          <span
                            className={
                              sc.casterApprovalStatus === 'APPROVED'
                                ? 'text-[#00F0FF]'
                                : sc.casterApprovalStatus === 'REJECTED'
                                  ? 'text-[#FF2E5B]'
                                  : 'text-[#FACC15]'
                            }
                          >
                            {sc.casterApprovalStatus}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-xs text-[#E2E2E8]">
                          {sc.status.replace('_', ' ')}
                        </td>
                        {canViewLobbyFee && (
                          <td className="py-3.5 px-4 text-xs text-right">
                            <span
                              className={
                                sc.casterApprovalStatus === 'APPROVED'
                                  ? 'text-[#00F0FF] font-bold'
                                  : 'text-[#94A3B8]'
                              }
                            >
                              {sc.casterApprovalStatus === 'REJECTED'
                                ? 'Rp 0'
                                : formatRupiah(sc.platformFee ?? 50000)}
                            </span>
                          </td>
                        )}
                        <td className="py-3.5 px-4 text-sm font-bold text-[#CCFF00] text-right">
                          {sc.casterApprovalStatus === 'REJECTED'
                            ? 'Rp 0'
                            : formatRupiah(sc.casterRate)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-white/[0.12] bg-[#0A0C10]/70 font-telemetry text-xs uppercase">
                      <td colSpan={3} className="py-3.5 px-4 font-bold text-[#F8FAFC]">
                        Total Akumulasi ({approvedScrims.length} Match Approved)
                      </td>
                      {canViewLobbyFee && (
                        <td className="py-3.5 px-4 text-right font-bold text-[#00F0FF]">
                          {formatRupiah(totalApprovedLobbyFee)}
                        </td>
                      )}
                      <td className="py-3.5 px-4 text-right font-bold text-[#CCFF00]">
                        {formatRupiah(totalApprovedCasterRate)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* WITHDRAW FEE SCRIM MODULE */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <form
                  onSubmit={handleSubmitWithdraw}
                  className="lg:col-span-5 bg-[#12161F] border border-white/[0.08] rounded-[6px] p-6 space-y-4"
                >
                  <div className="pb-3 border-b border-white/[0.08] flex items-center justify-between gap-2">
                    <div>
                      <h2 className="font-display text-xl font-bold uppercase text-[#F8FAFC] flex items-center gap-2">
                        <Wallet className="w-5 h-5 text-[#CCFF00]" />
                        Withdraw Fee Scrim
                      </h2>
                      <p className="text-xs text-[#94A3B8] mt-0.5">
                        Tarik pendapatan dari match berstatus CONFIRMED ke rekening bank atau e-wallet Anda.
                      </p>
                    </div>
                  </div>

                  <div className="p-4 bg-[#0A0C10] border border-[#CCFF00]/30 rounded-[4px] flex items-center justify-between gap-3">
                    <div>
                      <div className="font-telemetry text-[10px] uppercase tracking-[0.08em] text-[#94A3B8]">
                        Saldo Tersedia untuk Withdraw
                      </div>
                      <div className="font-display text-2xl font-bold text-[#CCFF00] tabular-nums">
                        {formatRupiah(availableWithdrawBalance)}
                      </div>
                      <div className="font-telemetry text-[10px] text-[#94A3B8] mt-0.5">
                        Total Lunas: {formatRupiah(confirmedEarnings)} · Sudah Ditarik: {formatRupiah(paidWithdrawalAmount)}
                      </div>
                    </div>
                    {availableWithdrawBalance >= 10000 && (
                      <button
                        type="button"
                        onClick={() => setWithdrawAmount(String(availableWithdrawBalance))}
                        className="px-3 py-1.5 bg-[#CCFF00]/15 border border-[#CCFF00]/45 text-[#CCFF00] font-telemetry text-[10px] font-bold uppercase rounded-[4px] hover:bg-[#CCFF00]/25 cursor-pointer shrink-0"
                      >
                        Tarik Semua
                      </button>
                    )}
                  </div>

                  {/* Notice Validasi Rekening & Nominal */}
                  <div className="p-3.5 bg-[#FACC15]/10 border border-[#FACC15]/40 rounded-[4px] flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-[#FACC15] shrink-0 mt-0.5" />
                    <div className="font-telemetry text-[11px] leading-relaxed text-[#FEF08A]">
                      <span className="font-bold uppercase">Notice Validasi Withdraw:</span> Pastikan{' '}
                      <span className="font-bold text-white">nomor rekening / e-wallet</span>,{' '}
                      <span className="font-bold text-white">nama pemilik</span>, dan{' '}
                      <span className="font-bold text-white">nominal penarikan</span> sudah benar. Penarikan hanya dapat dilakukan sesuai saldo tersedia ({formatRupiah(availableWithdrawBalance)}).
                    </div>
                  </div>

                  <div>
                    <label className="block font-telemetry text-xs uppercase tracking-[0.08em] text-[#94A3B8] mb-1">
                      Nominal Withdraw (IDR) — Maks {formatRupiah(availableWithdrawBalance)}
                    </label>
                    <input
                      type="number"
                      min={10000}
                      max={availableWithdrawBalance || undefined}
                      step={5000}
                      required
                      value={withdrawAmount}
                      onChange={(e) => {
                        setWithdrawAmount(e.target.value);
                        setWithdrawError('');
                      }}
                      placeholder={`Maksimal ${availableWithdrawBalance}`}
                      className={`w-full px-3.5 py-2.5 bg-[#0A0C10] border rounded-[4px] font-telemetry text-sm font-bold focus:outline-none ${
                        isOverBalance || isBelowMinimum
                          ? 'border-[#FF2E5B] text-[#FF2E5B]'
                          : 'border-white/15 text-[#CCFF00] focus:border-[#00F0FF]'
                      }`}
                    />
                    {isOverBalance && (
                      <div className="mt-1.5 font-telemetry text-[11px] font-bold text-[#FF2E5B]">
                        Nominal melebihi saldo yang ada! Maksimal penarikan Anda adalah{' '}
                        {formatRupiah(availableWithdrawBalance)}.
                      </div>
                    )}
                    {isBelowMinimum && !isOverBalance && (
                      <div className="mt-1.5 font-telemetry text-[11px] text-[#FACC15]">
                        Minimal nominal penarikan adalah Rp 10.000.
                      </div>
                    )}
                    {!isOverBalance && !isBelowMinimum && parsedWithdrawAmount >= 10000 && (
                      <div className="mt-1.5 font-telemetry text-[11px] text-[#94A3B8]">
                        Sisa saldo setelah withdraw:{' '}
                        <span className="text-[#00F0FF] font-bold">
                          {formatRupiah(remainingAfterWithdraw)}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-telemetry text-xs uppercase tracking-[0.08em] text-[#94A3B8] mb-1">
                        Bank / E-Wallet
                      </label>
                      <select
                        value={withdrawBank}
                        onChange={(e) => setWithdrawBank(e.target.value)}
                        className="w-full px-3 py-2.5 bg-[#0A0C10] border border-white/15 rounded-[4px] font-telemetry text-sm text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                      >
                        <option value="BCA">Bank BCA</option>
                        <option value="Mandiri">Bank Mandiri</option>
                        <option value="BNI">Bank BNI</option>
                        <option value="BRI">Bank BRI</option>
                        <option value="GoPay">GoPay</option>
                        <option value="OVO">OVO</option>
                        <option value="DANA">DANA</option>
                        <option value="ShopeePay">ShopeePay</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-telemetry text-xs uppercase tracking-[0.08em] text-[#94A3B8] mb-1">
                        No. Rekening / E-Wallet
                      </label>
                      <input
                        type="text"
                        required
                        value={withdrawAccountNumber}
                        onChange={(e) => {
                          setWithdrawAccountNumber(e.target.value);
                          setWithdrawError('');
                        }}
                        placeholder="Contoh: 1234567890"
                        className={`w-full px-3 py-2.5 bg-[#0A0C10] border rounded-[4px] font-telemetry text-sm text-[#F8FAFC] focus:outline-none ${
                          isAccountNumberShort
                            ? 'border-[#FF2E5B]'
                            : 'border-white/15 focus:border-[#00F0FF]'
                        }`}
                      />
                      {isAccountNumberShort && (
                        <div className="mt-1 font-telemetry text-[10px] text-[#FF2E5B]">
                          Minimal 6 digit angka rekening / nomor HP e-wallet.
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block font-telemetry text-xs uppercase tracking-[0.08em] text-[#94A3B8] mb-1">
                      Nama Pemilik Rekening
                    </label>
                    <input
                      type="text"
                      required
                      value={withdrawAccountName}
                      onChange={(e) => setWithdrawAccountName(e.target.value)}
                      placeholder="Sesuai buku tabungan / e-wallet"
                      className="w-full px-3.5 py-2.5 bg-[#0A0C10] border border-white/15 rounded-[4px] font-telemetry text-sm text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                    />
                  </div>

                  <div>
                    <label className="block font-telemetry text-xs uppercase tracking-[0.08em] text-[#94A3B8] mb-1">
                      Catatan (Opsional)
                    </label>
                    <input
                      type="text"
                      value={withdrawNote}
                      onChange={(e) => setWithdrawNote(e.target.value)}
                      placeholder="Misal: Fee scrim minggu ini"
                      className="w-full px-3.5 py-2.5 bg-[#0A0C10] border border-white/15 rounded-[4px] font-telemetry text-sm text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                    />
                  </div>

                  {withdrawError && (
                    <div className="p-2.5 bg-[#FF2E5B]/15 border border-[#FF2E5B] rounded-[4px] font-telemetry text-xs text-[#FFDADB]">
                      {withdrawError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={
                      submittingWithdraw ||
                      availableWithdrawBalance < 10000 ||
                      isOverBalance ||
                      isBelowMinimum ||
                      isAccountNumberShort
                    }
                    className="w-full min-h-[44px] bg-[#CCFF00] text-[#0A0C10] font-display text-sm font-bold uppercase tracking-[0.06em] rounded-[4px] hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {submittingWithdraw
                      ? 'Mengirim Pengajuan...'
                      : availableWithdrawBalance < 10000
                        ? 'Saldo Belum Mencukupi (Min Rp 10.000)'
                        : isOverBalance
                          ? 'Nominal Melebihi Saldo Tersedia'
                          : 'Validasi & Ajukan Withdraw'}
                  </button>
                </form>

                {/* Withdrawal History */}
                <div className="lg:col-span-7 bg-[#12161F] border border-white/[0.08] rounded-[6px] p-6 space-y-4">
                  <div className="pb-3 border-b border-white/[0.08] flex items-center justify-between">
                    <div>
                      <h2 className="font-display text-xl font-bold uppercase text-[#F8FAFC]">
                        Riwayat Withdraw
                      </h2>
                      <p className="text-xs text-[#94A3B8] mt-0.5">
                        Status pencairan fee scrim oleh tim keuangan Super Admin ORDAL.
                      </p>
                    </div>
                    <span className="font-telemetry text-xs font-bold text-[#94A3B8]">
                      {myWithdrawals.length} Transaksi
                    </span>
                  </div>

                  {myWithdrawals.length === 0 ? (
                    <div className="p-8 bg-[#0A0C10] border border-white/[0.06] rounded-[4px] text-center font-telemetry text-xs text-[#94A3B8]">
                      Belum ada riwayat pengajuan withdraw.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {myWithdrawals.map((w) => (
                        <div
                          key={w.id}
                          className="p-4 bg-[#0A0C10] border border-white/[0.08] rounded-[4px] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-display text-lg font-bold text-[#CCFF00] tabular-nums">
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
                            <div className="font-telemetry text-xs text-[#F8FAFC]">
                              {w.bankOrWallet} · {w.accountNumber} ({w.accountName})
                            </div>
                            <div className="font-telemetry text-[11px] text-[#94A3B8]">
                              Diajukan: {w.requestedAt}
                              {w.processedAt ? ` · Diproses: ${w.processedAt}` : ''}
                              {w.note ? ` · "${w.note}"` : ''}
                            </div>
                          </div>

                          {isSuperAdminMonitor && w.status === 'PENDING' && (
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                disabled={busyId === w.id}
                                onClick={() => handleUpdateWithdrawalStatus(w, 'PAID')}
                                className="px-3 py-1.5 bg-[#00F0FF] text-[#0A0C10] font-telemetry text-[11px] font-bold uppercase rounded-[4px] hover:brightness-110 cursor-pointer"
                              >
                                Tandai PAID
                              </button>
                              <button
                                type="button"
                                disabled={busyId === w.id}
                                onClick={() => handleUpdateWithdrawalStatus(w, 'REJECTED')}
                                className="px-3 py-1.5 border border-[#FF2E5B]/60 text-[#FF2E5B] font-telemetry text-[11px] font-bold uppercase rounded-[4px] hover:bg-[#FF2E5B]/10 cursor-pointer"
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
            </div>
          )}

          {/* TAB 2B: INVOICE, SLIP PAYOUT & PAYMENT HISTORY */}
          {activeTab === 'payments' && (
            <PaymentDetailCenter
              role="CASTER"
              payments={myPayments}
              ledger={db.ledger || []}
              currentUser={user}
              onRefresh={onRefresh}
              onNotify={onNotify}
            />
          )}

          {/* TAB 3: DAY OFF & RATECARD */}
          {activeTab === 'schedule' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Ratecard & Profile Form */}
              <form
                onSubmit={handleSaveRatecard}
                className="lg:col-span-7 bg-[#12161F] border border-white/[0.08] rounded-[6px] p-6 space-y-5"
              >
                <div className="pb-3 border-b border-white/[0.08]">
                  <h2 className="font-display text-xl font-bold uppercase text-[#F8FAFC]">
                    Pengaturan Ratecard &amp; Profil
                  </h2>
                  <p className="text-xs text-[#94A3B8] mt-0.5">
                    Perubahan tarif langsung berlaku pada form booking Scrim All Game.
                  </p>
                </div>

                <div>
                  <label className="block font-telemetry text-xs uppercase tracking-[0.08em] text-[#94A3B8] mb-1.5">
                    Tarif Ratecard per Match (Rupiah)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={5000}
                    required
                    value={rateCardInput}
                    onChange={(e) => setRateCardInput(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 bg-[#0A0C10] border border-white/15 rounded-[4px] font-telemetry text-base font-bold text-[#CCFF00] focus:outline-none focus:border-[#00F0FF]"
                  />
                  {canViewLobbyFee ? (
                    <p className="mt-1.5 font-telemetry text-[11px] text-[#94A3B8]">
                      Estimasi total di form booking: {formatRupiah(rateCardInput)} (Caster) + Rp 50.000 (Lobby Fee ORDAL) ={' '}
                      <span className="text-[#F8FAFC] font-bold">
                        {formatRupiah(rateCardInput + 50000)}
                      </span>{' '}
                      ({formatRupiah(Math.round((rateCardInput + 50000) / 2))}/tim)
                    </p>
                  ) : (
                    <p className="mt-1.5 font-telemetry text-[11px] text-[#94A3B8]">
                      Hak pendapatan Anda per match yang di-approve:{' '}
                      <span className="text-[#CCFF00] font-bold">
                        {formatRupiah(rateCardInput)}
                      </span>
                    </p>
                  )}
                </div>

                <div>
                  <label className="block font-telemetry text-xs uppercase tracking-[0.08em] text-[#94A3B8] mb-2">
                    Spesialisasi Game
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {SCRIM_GAMES.map((g) => {
                      const active = specialtyInput.includes(g);
                      return (
                        <button
                          key={g}
                          type="button"
                          onClick={() => toggleSpecialty(g)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] border font-telemetry text-xs font-semibold uppercase cursor-pointer ${
                            active
                              ? 'bg-[#00F0FF]/12 border-[#00F0FF] text-[#00F0FF]'
                              : 'bg-[#0A0C10] border-white/12 text-[#94A3B8]'
                          }`}
                        >
                          {active && <Check className="w-3 h-3" />}
                          {g}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block font-telemetry text-xs uppercase tracking-[0.08em] text-[#94A3B8] mb-1.5">
                    Bio Shoutcaster
                  </label>
                  <textarea
                    rows={3}
                    value={bioInput}
                    onChange={(e) => setBioInput(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#0A0C10] border border-white/12 rounded-[4px] text-sm text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={savingProfile}
                  className="px-6 min-h-[44px] bg-[#00F0FF] text-[#0A0C10] font-display text-sm font-bold uppercase tracking-[0.05em] rounded-[4px] hover:shadow-[0_0_16px_rgba(0,240,255,0.4)] disabled:opacity-50 cursor-pointer"
                >
                  {savingProfile ? 'Menyimpan...' : 'Simpan Ratecard & Profil'}
                </button>
              </form>

              {/* Day Off Manager (Multi-Date Calendar Picker) */}
              <div className="lg:col-span-5 bg-[#12161F] border border-white/[0.08] rounded-[6px] p-6 space-y-5">
                <div className="pb-3 border-b border-white/[0.08]">
                  <h2 className="font-display text-xl font-bold uppercase text-[#F8FAFC]">
                    Atur Jadwal Day Off (Multi-Date)
                  </h2>
                  <p className="text-xs text-[#94A3B8] mt-0.5">
                    Klik beberapa tanggal langsung di kalender atau pilih rentang tanggal sekaligus, lalu simpan. Tanggal Day Off otomatis tertutup untuk booking tim.
                  </p>
                </div>

                <MultiDateDayOffPicker
                  savedDates={caster.dayOffDates}
                  savedSlotOffs={caster.dayOffSlots}
                  bookedCountByDate={bookedCountByDate}
                  saving={savingProfile}
                  onSaveSchedule={handleSaveDayOffSchedule}
                />
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Modal Validasi & Konfirmasi Withdraw */}
      {showWithdrawConfirmModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0A0C10]/85 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md bg-[#12161F] border border-[#FACC15]/45 rounded-[8px] overflow-hidden">
            <div className="px-6 py-4 bg-[#0A0C10] border-b border-white/[0.08] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[#FACC15]">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <h3 className="font-display text-xl font-bold uppercase text-[#F8FAFC]">
                  Validasi Data Withdraw
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowWithdrawConfirmModal(false)}
                className="p-1 text-[#94A3B8] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-3.5 bg-[#FF2E5B]/12 border border-[#FF2E5B]/45 rounded-[4px] font-telemetry text-xs text-[#FFDADB] leading-relaxed">
                Mohon periksa kembali <span className="font-bold text-white">Nomor Rekening / E-Wallet</span> dan{' '}
                <span className="font-bold text-white">Nominal Penarikan</span> di bawah ini. Kesalahan input rekening setelah dana diproses tidak dapat dibatalkan.
              </div>

              <div className="p-4 bg-[#0A0C10] border border-white/[0.08] rounded-[4px] space-y-2.5 font-telemetry text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#94A3B8]">Bank / E-Wallet</span>
                  <span className="font-bold text-[#F8FAFC]">{withdrawBank}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#94A3B8]">No. Rekening / E-Wallet</span>
                  <span className="font-bold text-[#00F0FF] tracking-wider">
                    {withdrawAccountNumber.trim()}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#94A3B8]">Nama Pemilik</span>
                  <span className="font-bold text-[#F8FAFC]">{withdrawAccountName.trim()}</span>
                </div>
                <div className="pt-2 border-t border-white/[0.08] flex items-center justify-between gap-2">
                  <span className="text-[#94A3B8]">Nominal Ditarik</span>
                  <span className="font-display text-xl font-bold text-[#CCFF00] tabular-nums">
                    {formatRupiah(parsedWithdrawAmount)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-[#94A3B8]">Sisa Saldo Setelah Withdraw</span>
                  <span className="font-bold text-[#F8FAFC] tabular-nums">
                    {formatRupiah(remainingAfterWithdraw)}
                  </span>
                </div>
              </div>

              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={withdrawVerifiedCheck}
                  onChange={(e) => setWithdrawVerifiedCheck(e.target.checked)}
                  className="mt-0.5 accent-[#CCFF00] w-4 h-4 cursor-pointer"
                />
                <span className="text-xs text-[#E2E2E8] leading-snug">
                  Saya telah memvalidasi nomor rekening/e-wallet, nama pemilik, dan nominal penarikan sudah benar serta sesuai saldo saya.
                </span>
              </label>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowWithdrawConfirmModal(false)}
                  className="px-4 py-2.5 border border-white/15 text-[#F8FAFC] font-display text-sm font-semibold uppercase rounded-[4px] hover:border-[#00F0FF] cursor-pointer"
                >
                  Periksa Lagi
                </button>
                <button
                  type="button"
                  disabled={!withdrawVerifiedCheck || submittingWithdraw || isOverBalance}
                  onClick={handleConfirmWithdraw}
                  className="px-5 py-2.5 bg-[#CCFF00] text-[#0A0C10] font-display text-sm font-bold uppercase rounded-[4px] hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  {submittingWithdraw ? 'Memproses...' : 'Konfirmasi Withdraw'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
