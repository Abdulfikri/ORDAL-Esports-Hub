import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  Lock,
  Mic,
  QrCode,
  RotateCcw,
  ShieldCheck,
  Swords,
  Upload,
  Users,
  X,
  Youtube,
  Zap,
} from 'lucide-react';
import QRCode from 'qrcode';
import { api } from '../api';
import { useEscapeKey } from '../hooks/useEscapeKey';
import type {
  AuthUser,
  GatewayChannel,
  PaymentMethod,
  PaymentRecord,
  ScrimGame,
  ScrimMode,
  ScrimSession,
  ScrimSettings,
  Shoutcaster,
  TeamProfile,
} from '../types';
import { CasterBadges } from './CasterBadges';
import { CasterScheduleModal } from './CasterScheduleModal';
import { generateInvoicePdf } from '../utils/invoicePdf';
import {
  formatPaymentMethodLabel,
  GATEWAY_CHANNEL_OPTIONS,
  PAYMENT_METHOD_OPTIONS,
} from './PaymentDetailCenter';
import { ScrimLeaderboard } from './ScrimLeaderboard';

export const PLATFORM_LOBBY_FEE = 50000;

export const SCRIM_GAMES: ScrimGame[] = [
  'POINT BLANK',
  'FREE FIRE',
  'EFOOTBALL',
];

export const SCRIM_CASTERS = [
  { name: 'Yosafat Putra Asa', rate: 150000, label: 'Yosafat Putra Asa (+Rp150.000)' },
  { name: 'Aldin "Rymot" Endaryan', rate: 125000, label: 'Aldin "Rymot" Endaryan (+Rp125.000)' },
  { name: 'Raka "Vortex" Pratama', rate: 100000, label: 'Raka "Vortex" Pratama (+Rp100.000)' },
  { name: 'Tanpa Caster (Self-Hosted)', rate: 0, label: 'Tanpa Caster (+Rp0)' },
];

export const TIME_SLOTS = [
  '20:00 WIB',
  '22:00 WIB',
];

export function formatRupiah(amount: number): string {
  return `Rp ${amount.toLocaleString('id-ID')}`;
}

function TeamAvatar({ name, logo }: { name: string; logo?: string }) {
  if (logo) {
    return (
      <img
        src={logo}
        alt={name}
        referrerPolicy="no-referrer"
        className="w-11 h-11 rounded-full object-cover border border-white/15 bg-[#0A0C10] shrink-0"
      />
    );
  }
  const initials = (name || '?')
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 3)
    .toUpperCase();
  return (
    <div className="w-11 h-11 rounded-full bg-[#0A0C10] border border-white/15 flex items-center justify-center font-telemetry text-xs font-bold text-[#00F0FF] shrink-0">
      {initials || '?'}
    </div>
  );
}

interface ScrimArenaProps {
  scrims: ScrimSession[];
  casters: Shoutcaster[];
  payments?: PaymentRecord[];
  scrimSettings?: ScrimSettings;
  currentUser?: AuthUser | null;
  teamProfile?: TeamProfile;
  externalBookingRequest?: { casterId: string; date: string; nonce: number } | null;
  embedded?: boolean;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string) => void;
}

export const ScrimArena: React.FC<ScrimArenaProps> = ({
  scrims,
  casters,
  payments = [],
  scrimSettings,
  currentUser,
  teamProfile,
  externalBookingRequest,
  embedded = false,
  onRefresh,
  onNotify,
}) => {
  const [gameFilter, setGameFilter] = useState<'ALL' | ScrimGame>('ALL');
  const [statusQuickFilter, setStatusQuickFilter] = useState<
    'ALL' | 'OPEN_LOBBY' | 'PAYMENT' | 'CONFIRMED'
  >('ALL');
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [casterScheduleOpen, setCasterScheduleOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [bookingError, setBookingError] = useState('');

  // Reschedule modal state (CASTER only)
  const [rescheduleTarget, setRescheduleTarget] = useState<ScrimSession | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTimeSlot, setRescheduleTimeSlot] = useState(TIME_SLOTS[0]);
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [submittingReschedule, setSubmittingReschedule] = useState(false);

  // Refund modal state (TEAM only, when scrim is rejected/cancelled)
  const [refundTarget, setRefundTarget] = useState<ScrimSession | null>(null);
  const [refundBank, setRefundBank] = useState('BCA');
  const [refundAccountNumber, setRefundAccountNumber] = useState('');
  const [refundAccountName, setRefundAccountName] = useState(teamProfile?.teamName || '');
  const [refundReason, setRefundReason] = useState('');
  const [submittingRefund, setSubmittingRefund] = useState(false);

  // Split-bill Invoice Checkout Modal state (TEAM)
  const [checkoutTarget, setCheckoutTarget] = useState<{
    scrim: ScrimSession;
    side: 'host' | 'challenger';
    payment: PaymentRecord;
  } | null>(null);
  const [payCheckoutTab, setPayCheckoutTab] = useState<'GATEWAY' | 'MANUAL'>('GATEWAY');
  const [payGatewayChannel, setPayGatewayChannel] = useState<GatewayChannel>('QRIS_DINAMIS');
  const [payCreatingGateway, setPayCreatingGateway] = useState(false);
  const [paySimulatingSandbox, setPaySimulatingSandbox] = useState(false);
  const [payQrDataUrl, setPayQrDataUrl] = useState('');
  const [payCopiedVa, setPayCopiedVa] = useState(false);
  const [payMethod, setPayMethod] = useState<PaymentMethod>('QRIS');
  const [payReference, setPayReference] = useState('');
  const [payProofNote, setPayProofNote] = useState('');
  const [payProofImage, setPayProofImage] = useState('');
  const [payError, setPayError] = useState('');
  const [submittingPay, setSubmittingPay] = useState(false);

  // Module 1: Booking Form state (auto-filled when logged in as TEAM)
  const [hostTeamName, setHostTeamName] = useState(teamProfile?.teamName || '');
  const [hostTeamLogo, setHostTeamLogo] = useState(teamProfile?.teamLogo || '');
  const [hostRosterCore, setHostRosterCore] = useState(
    teamProfile?.rosterCore?.join(', ') || ''
  );
  const [hostRosterSub, setHostRosterSub] = useState(
    teamProfile?.rosterSub?.join(', ') || ''
  );
  const [game, setGame] = useState<ScrimGame>(teamProfile?.primaryGame || 'POINT BLANK');
  const [date, setDate] = useState('2026-11-20');
  const [timeSlot, setTimeSlot] = useState(TIME_SLOTS[0]);
  const [selectedCasterId, setSelectedCasterId] = useState<string>(casters[0]?.id || 'none');
  const [mode, setMode] = useState<ScrimMode>('OPEN_LOBBY');
  const [directTeamName, setDirectTeamName] = useState('');
  const [directTeamLogo, setDirectTeamLogo] = useState('');
  const [directRosterCore, setDirectRosterCore] = useState('');
  const [submittingBooking, setSubmittingBooking] = useState(false);

  // Module 2: Challenger Modal ("AJUKAN SCRIM")
  const [challengeTarget, setChallengeTarget] = useState<ScrimSession | null>(null);
  const [chTeamName, setChTeamName] = useState('');
  const [chTeamLogo, setChTeamLogo] = useState('');
  const [chRosterCore, setChRosterCore] = useState('');
  const [chRosterSub, setChRosterSub] = useState('');
  const [chNote, setChNote] = useState('');
  const [submittingChallenge, setSubmittingChallenge] = useState(false);

  // Roster Inspector Modal
  const [inspectScrim, setInspectScrim] = useState<ScrimSession | null>(null);

  useEscapeKey(
    Boolean(checkoutTarget || refundTarget || rescheduleTarget || inspectScrim || challengeTarget),
    () => {
      if (checkoutTarget) {
        if (!submittingPay && !payCreatingGateway && !paySimulatingSandbox) setCheckoutTarget(null);
      } else if (refundTarget) {
        if (!submittingRefund) setRefundTarget(null);
      } else if (rescheduleTarget) {
        if (!submittingReschedule) setRescheduleTarget(null);
      } else if (inspectScrim) {
        setInspectScrim(null);
      } else if (challengeTarget && !submittingChallenge) {
        setChallengeTarget(null);
      }
    }
  );

  // Sync booking, filter & challenge forms with logged-in TeamProfile
  useEffect(() => {
    if (teamProfile) {
      setHostTeamName(teamProfile.teamName);
      setHostTeamLogo(teamProfile.teamLogo);
      setHostRosterCore(teamProfile.rosterCore.join(', '));
      setHostRosterSub(teamProfile.rosterSub.join(', '));
      setGame(teamProfile.primaryGame);
      setGameFilter(teamProfile.primaryGame);
    } else {
      setGameFilter('ALL');
    }
  }, [currentUser?.id, teamProfile]);

  useEffect(() => {
    if (challengeTarget && teamProfile) {
      setChTeamName(teamProfile.teamName);
      setChTeamLogo(teamProfile.teamLogo);
      setChRosterCore(teamProfile.rosterCore.join(', '));
      setChRosterSub(teamProfile.rosterSub.join(', '));
    }
  }, [challengeTarget, teamProfile]);

  useEffect(() => {
    if (!externalBookingRequest) return;
    setSelectedCasterId(externalBookingRequest.casterId);
    setDate(externalBookingRequest.date);
    setShowBookingForm(true);
    setBookingError('');
  }, [externalBookingRequest]);

  // Tick every second for 15-minute split-bill payment countdown
  useEffect(() => {
    const timer = window.setInterval(() => setNowTs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    const payload = checkoutTarget?.payment?.qrPayload;
    if (!payload) {
      setPayQrDataUrl('');
      return;
    }
    QRCode.toDataURL(payload, {
      width: 240,
      margin: 2,
      color: { dark: '#0A0C10', light: '#FFFFFF' },
    })
      .then((url) => {
        if (active) setPayQrDataUrl(url);
      })
      .catch(() => {
        if (active) setPayQrDataUrl('');
      });
    return () => {
      active = false;
    };
  }, [checkoutTarget?.payment?.qrPayload]);

  const getCasterAvailability = (
    caster: Shoutcaster,
    targetDate: string,
    targetSlot?: string
  ) => {
    const isDayOff = caster.dayOffDates.includes(targetDate);
    const offSlotsOnDate = caster.dayOffSlots?.[targetDate] || [];
    const hasPartialDayOff = !isDayOff && offSlotsOnDate.length > 0;
    const isSlotDayOff = Boolean(
      !isDayOff && targetSlot && offSlotsOnDate.includes(targetSlot)
    );
    const activeDayScrims = scrims.filter(
      (s) =>
        s.casterId === caster.id &&
        s.date === targetDate &&
        s.status !== 'CANCELLED' &&
        s.casterApprovalStatus !== 'REJECTED'
    );
    const bookedCount = activeDayScrims.length;
    const bookedSlots = activeDayScrims.map((s) => s.timeSlot);
    const conflictMatch = targetSlot
      ? activeDayScrims.find((s) => s.timeSlot === targetSlot)
      : undefined;
    const isSlotConflict = Boolean(conflictMatch);
    const baseLimit = caster.maxMatchesPerDay || 2;
    const limit = hasPartialDayOff ? Math.max(1, baseLimit - 1) : baseLimit;
    const isFullBook = bookedCount >= limit;
    return {
      isDayOff,
      isSlotDayOff,
      hasPartialDayOff,
      offSlotsOnDate,
      isFullBook,
      isSlotConflict,
      conflictMatch,
      bookedSlots,
      bookedCount,
      limit,
    };
  };

  const selectedCaster = casters.find((c) => c.id === selectedCasterId) || null;
  const isCasterGameUnsupported = Boolean(
    selectedCaster && !selectedCaster.specialtyGames.includes(game)
  );
  const selectedCasterAvailability = selectedCaster
    ? getCasterAvailability(selectedCaster, date, timeSlot)
    : null;
  const isSelectedCasterUnavailable = Boolean(
    isCasterGameUnsupported ||
      selectedCasterAvailability?.isDayOff ||
      selectedCasterAvailability?.isSlotDayOff ||
      selectedCasterAvailability?.isFullBook ||
      selectedCasterAvailability?.isSlotConflict
  );

  const selectedCasterRate = selectedCaster ? selectedCaster.rateCard : 0;
  const perGameOverride = scrimSettings?.lobbyFeeByGame?.[game];
  const platformFee =
    typeof perGameOverride === 'number'
      ? perGameOverride
      : typeof scrimSettings?.defaultLobbyFee === 'number'
        ? scrimSettings.defaultLobbyFee
        : PLATFORM_LOBBY_FEE;
  const previewTotal = selectedCasterRate + platformFee;
  const previewSplit = Math.round(previewTotal / 2);

  const filteredScrims = useMemo(() => {
    return scrims.filter((s) => {
      if (gameFilter !== 'ALL' && s.game !== gameFilter) return false;
      if (statusQuickFilter === 'OPEN_LOBBY' && s.status !== 'OPEN_LOBBY') return false;
      if (
        statusQuickFilter === 'PAYMENT' &&
        s.status !== 'AWAITING_PAYMENT' &&
        s.status !== 'PARTIALLY_PAID' &&
        s.status !== 'WAITING_APPROVAL'
      ) {
        return false;
      }
      if (statusQuickFilter === 'CONFIRMED' && s.status !== 'CONFIRMED') return false;
      return true;
    });
  }, [scrims, gameFilter, statusQuickFilter]);

  const readImageFile = (file: File | undefined, cb: (dataUrl: string) => void) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') cb(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hostTeamName.trim()) return;
    if (mode === 'DIRECT_CHALLENGE' && !directTeamName.trim()) return;
    if (
      currentUser?.role === 'TEAM' &&
      teamProfile?.primaryGame &&
      teamProfile.primaryGame !== game
    ) {
      setBookingError(
        `Akun tim Anda terdaftar di cabang ${teamProfile.primaryGame}. Anda hanya dapat membuat jadwal scrim ${teamProfile.primaryGame}.`
      );
      return;
    }
    if (isSelectedCasterUnavailable) {
      setBookingError(
        isCasterGameUnsupported
          ? `${selectedCaster?.name} tidak memiliki spesialisasi di cabang ${game}. Pilih caster lain.`
          : selectedCasterAvailability?.isDayOff
            ? `${selectedCaster?.name} sedang FULL DAY OFF pada tanggal ${date}. Pilih tanggal atau caster lain.`
            : selectedCasterAvailability?.isSlotDayOff
              ? `${selectedCaster?.name} sedang DAY OFF pada ${date} jam ${timeSlot}. Pilih slot jam atau caster lain.`
              : selectedCasterAvailability?.isSlotConflict
                ? `BENTROK JADWAL: ${selectedCaster?.name} sudah memiliki match pada ${date} jam ${timeSlot}. Pilih slot jam atau caster lain.`
                : `${selectedCaster?.name} sudah FULL BOOK (${selectedCasterAvailability?.bookedCount}/${selectedCasterAvailability?.limit} match) pada tanggal ${date}. Pilih tanggal atau caster lain.`
      );
      return;
    }

    setBookingError('');
    setSubmittingBooking(true);
    try {
      await api.createScrim({
        game,
        date,
        timeSlot,
        mode,
        casterId: selectedCaster ? selectedCaster.id : 'none',
        casterName: selectedCaster ? selectedCaster.name : 'Tanpa Caster (Self-Hosted)',
        casterRate: selectedCasterRate,
        hostTeamName: hostTeamName.trim(),
        hostTeamLogo,
        hostRosterCore: hostRosterCore
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        hostRosterSub: hostRosterSub
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        challengerTeamName: mode === 'DIRECT_CHALLENGE' ? directTeamName.trim() : '',
        challengerTeamLogo: mode === 'DIRECT_CHALLENGE' ? directTeamLogo : '',
        challengerRosterCore:
          mode === 'DIRECT_CHALLENGE'
            ? directRosterCore
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            : [],
      });
      await onRefresh();
      setHostTeamName('');
      setHostTeamLogo('');
      setHostRosterCore('');
      setHostRosterSub('');
      setDirectTeamName('');
      setDirectTeamLogo('');
      setDirectRosterCore('');
      setShowBookingForm(false);
      onNotify(
        mode === 'OPEN_LOBBY'
          ? 'Slot Open Scrim berhasil dipublikasikan ke Public Scrim Lobby.'
          : 'Undangan Direct Challenge dikirim. Menunggu konfirmasi roster Tim B.'
      );
    } catch (err) {
      setBookingError(err instanceof Error ? err.message : 'Gagal membuat booking scrim.');
    } finally {
      setSubmittingBooking(false);
    }
  };

  const handleChallengeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challengeTarget || !chTeamName.trim()) return;
    setSubmittingChallenge(true);
    try {
      await api.challengeScrim(challengeTarget.id, {
        challengerTeamName: chTeamName.trim(),
        challengerTeamLogo: chTeamLogo,
        challengerRosterCore: chRosterCore
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        challengerRosterSub: chRosterSub
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        note: chNote.trim() || undefined,
      });
      await onRefresh();
      onNotify(
        `Pengajuan scrim dari ${chTeamName.toUpperCase()} terkirim! Menunggu pilihan Team Leader ${challengeTarget.hostTeamName}.`
      );
      setChallengeTarget(null);
      setChTeamName('');
      setChTeamLogo('');
      setChRosterCore('');
      setChRosterSub('');
      setChNote('');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal mengirim pengajuan scrim.');
    } finally {
      setSubmittingChallenge(false);
    }
  };

  const isCasterRole = currentUser?.role === 'CASTER';
  const isTeamRole = currentUser?.role === 'TEAM';

  const isHostTeam = (scrim: ScrimSession): boolean => {
    if (!isTeamRole || !currentUser) return false;
    if (scrim.hostUserId && scrim.hostUserId === currentUser.id) return true;
    if (
      scrim.hostUserEmail &&
      scrim.hostUserEmail.toLowerCase() === currentUser.email.toLowerCase()
    ) {
      return true;
    }
    const myTeamName = (teamProfile?.teamName || currentUser.displayName || '').trim().toLowerCase();
    return Boolean(myTeamName) && scrim.hostTeamName.trim().toLowerCase() === myTeamName;
  };

  const isChallengerTeam = (scrim: ScrimSession): boolean => {
    if (!isTeamRole || !currentUser) return false;
    if (scrim.challengerUserId && scrim.challengerUserId === currentUser.id) return true;
    if (
      scrim.challengerUserEmail &&
      scrim.challengerUserEmail.toLowerCase() === currentUser.email.toLowerCase()
    ) {
      return true;
    }
    const myTeamName = (teamProfile?.teamName || currentUser.displayName || '').trim().toLowerCase();
    return Boolean(myTeamName) && scrim.challengerTeamName.trim().toLowerCase() === myTeamName;
  };

  const handleSelectChallenger = async (
    scrim: ScrimSession,
    applicationId: string,
    applicantTeamName: string,
    action: 'SELECT' | 'REJECT'
  ) => {
    setBusyId(scrim.id);
    try {
      await api.selectScrimChallenger(scrim.id, applicationId, action);
      await onRefresh();
      onNotify(
        action === 'SELECT'
          ? `${applicantTeamName} dipilih sebagai lawan! ${
              scrim.casterId && scrim.casterId !== 'none'
                ? 'Menunggu approval Caster.'
                : 'Tagihan Split-Bill dibuka.'
            }`
          : `Pengajuan dari ${applicantTeamName} ditolak.`
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal memproses pilihan lawan.');
    } finally {
      setBusyId(null);
    }
  };

  const canCasterManageScrim = (scrim: ScrimSession): boolean => {
    if (!isCasterRole) return false;
    if (!scrim.casterId || scrim.casterId === 'none') return true;
    return currentUser?.casterId === scrim.casterId;
  };

  const handleApprove = async (scrim: ScrimSession) => {
    setBusyId(scrim.id);
    try {
      await api.approveScrim(scrim.id);
      await onRefresh();
      onNotify(`Scrim disetujui oleh Caster! Tagihan Split-Bill dibuka (batas 15 menit).`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal menyetujui scrim.');
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (scrim: ScrimSession) => {
    setBusyId(scrim.id);
    try {
      await api.rejectScrim(scrim.id);
      await onRefresh();
      onNotify('Scrim ditolak oleh Caster. Tim dapat mengajukan refund dana.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal menolak scrim.');
    } finally {
      setBusyId(null);
    }
  };

  const openRescheduleModal = (scrim: ScrimSession) => {
    setRescheduleTarget(scrim);
    setRescheduleDate(scrim.date);
    setRescheduleTimeSlot(
      TIME_SLOTS.includes(scrim.timeSlot) ? scrim.timeSlot : TIME_SLOTS[0]
    );
    setRescheduleReason('');
  };

  const handleRescheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rescheduleTarget) return;
    setSubmittingReschedule(true);
    try {
      await api.proposeScrimReschedule(rescheduleTarget.id, {
        proposedDate: rescheduleDate,
        proposedTimeSlot: rescheduleTimeSlot,
        reason: rescheduleReason.trim() || undefined,
      });
      await onRefresh();
      onNotify(
        `Usulan reschedule (${rescheduleDate} · ${rescheduleTimeSlot}) berhasil dikirim ke Tim.`
      );
      setRescheduleTarget(null);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal mengajukan reschedule.');
    } finally {
      setSubmittingReschedule(false);
    }
  };

  const handleRescheduleResponse = async (
    scrim: ScrimSession,
    decision: 'ACCEPTED' | 'DECLINED'
  ) => {
    setBusyId(scrim.id);
    try {
      await api.respondScrimReschedule(scrim.id, decision);
      await onRefresh();
      onNotify(
        decision === 'ACCEPTED'
          ? 'Jadwal reschedule disetujui! Jadwal scrim telah diperbarui.'
          : 'Usulan reschedule dari Caster ditolak.'
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal merespons reschedule.');
    } finally {
      setBusyId(null);
    }
  };

  const openRefundModal = (scrim: ScrimSession) => {
    setRefundTarget(scrim);
    setRefundBank('BCA');
    setRefundAccountNumber('');
    setRefundAccountName(teamProfile?.teamName || currentUser?.displayName || '');
    setRefundReason('Scrim ditolak oleh Caster');
  };

  const handleRefundSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundTarget) return;
    setSubmittingRefund(true);
    try {
      await api.requestScrimRefund(refundTarget.id, {
        bankOrWallet: refundBank,
        accountNumber: refundAccountNumber.trim(),
        accountName: refundAccountName.trim(),
        reason: refundReason.trim() || undefined,
      });
      await onRefresh();
      onNotify(
        `Pengajuan refund ${formatRupiah(refundTarget.splitCostPerTeam)} berhasil dikirim untuk diproses.`
      );
      setRefundTarget(null);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal mengajukan refund dana.');
    } finally {
      setSubmittingRefund(false);
    }
  };

  const handlePay = async (scrim: ScrimSession, side: 'host' | 'challenger') => {
    const linkedPayment = payments.find(
      (p) => p.scrimId === scrim.id && p.category === 'SCRIM_SPLIT_BILL' && p.scrimSide === side
    );

    if (currentUser?.role === 'TEAM' && linkedPayment) {
      setPayCheckoutTab('GATEWAY');
      setPayGatewayChannel(linkedPayment.gatewayChannel || 'QRIS_DINAMIS');
      setPayCopiedVa(false);
      setPayMethod(linkedPayment.paymentMethod || 'QRIS');
      setPayReference(linkedPayment.referenceCode || '');
      setPayProofNote(linkedPayment.proofNote || '');
      setPayProofImage(linkedPayment.proofImageUrl || '');
      setPayError('');
      setCheckoutTarget({ scrim, side, payment: linkedPayment });
      return;
    }

    setBusyId(scrim.id);
    try {
      const updated = await api.payScrim(scrim.id, side);
      await onRefresh();
      onNotify(
        updated.status === 'CONFIRMED'
          ? `Pembayaran kedua tim lunas! Jadwal & caster ${updated.casterName} terkunci.`
          : `Pembayaran ${side === 'host' ? updated.hostTeamName : updated.challengerTeamName} terverifikasi (Partially Paid).`
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal memproses pembayaran.');
    } finally {
      setBusyId(null);
    }
  };

  const handleScrimGenerateGateway = async () => {
    if (!checkoutTarget) return;
    setPayError('');
    setPayCreatingGateway(true);
    try {
      const res = await api.createGatewayCheckout(checkoutTarget.payment.id, payGatewayChannel);
      setCheckoutTarget((prev) => (prev ? { ...prev, payment: res.payment } : null));
      await onRefresh();
      onNotify(
        `Kode ${payGatewayChannel === 'QRIS_DINAMIS' ? 'QRIS Dinamis' : payGatewayChannel.replace('_', ' ')} siap dibayar.`
      );
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Gagal menerbitkan kode Payment Gateway.');
    } finally {
      setPayCreatingGateway(false);
    }
  };

  const handleScrimSimulateSandbox = async () => {
    if (!checkoutTarget) return;
    setPayError('');
    setPaySimulatingSandbox(true);
    try {
      await api.simulateSandboxPayment(checkoutTarget.payment.id);
      await onRefresh();
      onNotify(
        `Settlement otomatis ${checkoutTarget.payment.invoiceNumber} lunas! Status scrim diperbarui.`
      );
      setCheckoutTarget(null);
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Gagal menyimulasikan settlement gateway.');
    } finally {
      setPaySimulatingSandbox(false);
    }
  };

  const handleScrimCopyVa = async (vaNum: string) => {
    try {
      await navigator.clipboard.writeText(vaNum);
      setPayCopiedVa(true);
      window.setTimeout(() => setPayCopiedVa(false), 2000);
    } catch {
      onNotify(`Nomor Virtual Account: ${vaNum}`);
    }
  };

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkoutTarget) return;
    const ref = payReference.trim();
    if (ref.length < 4) {
      setPayError('Masukkan kode referensi / nomor transaksi minimal 4 karakter.');
      return;
    }
    setPayError('');
    setSubmittingPay(true);
    try {
      await api.submitPayment(checkoutTarget.payment.id, {
        paymentMethod: payMethod,
        referenceCode: ref,
        proofNote: payProofNote.trim() || undefined,
        proofImageUrl: payProofImage || undefined,
      });
      await onRefresh();
      onNotify(
        `Konfirmasi bayar ${checkoutTarget.payment.invoiceNumber} terkirim! Menunggu validasi Super Admin.`
      );
      setCheckoutTarget(null);
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Gagal mengirim bukti pembayaran.');
    } finally {
      setSubmittingPay(false);
    }
  };

  const handleRelease = async (scrim: ScrimSession) => {
    setBusyId(scrim.id);
    try {
      await api.releaseScrim(scrim.id);
      await onRefresh();
      onNotify('Batas waktu 15 menit berakhir. Slot dikembalikan ke Public Scrim Lobby.');
    } finally {
      setBusyId(null);
    }
  };

  const getRemainingTimer = (deadline?: string): { text: string; expired: boolean } | null => {
    if (!deadline) return null;
    const diffMs = new Date(deadline).getTime() - nowTs;
    if (diffMs <= 0) return { text: '00:00', expired: true };
    const totalSec = Math.floor(diffMs / 1000);
    const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const ss = String(totalSec % 60).padStart(2, '0');
    return { text: `${mm}:${ss}`, expired: false };
  };

  return (
    <section
      id={embedded ? undefined : 'scrim'}
      className={embedded ? '' : 'scroll-mt-20 border-t border-white/[0.08] bg-[#0A0C10]'}
    >
      <div className={embedded ? 'space-y-0' : 'max-w-[1440px] mx-auto px-4 sm:px-8 py-16'}>
        {/* Section Header */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5 pb-6 border-b border-white/[0.08]">
          <div>
            <p className="font-telemetry text-xs font-semibold uppercase tracking-[0.1em] text-[#00F0FF]">
              SCRIM BER-SHOUTCASTER · POINT BLANK · FREE FIRE · EFOOTBALL
            </p>
            <h2 className="mt-1 font-display text-3xl sm:text-4xl font-bold uppercase tracking-[0.01em] text-[#F8FAFC]">
              Arena Scrim &amp; Patungan Biaya
            </h2>
            <p className="mt-2 text-sm text-[#94A3B8] max-w-2xl">
              Jadwalkan latihan tanding melawan tim lain bersama Shoutcaster resmi ORDAL. Total biaya lobby dan caster dibagi rata (50:50) antara kedua tim.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setCasterScheduleOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-4 min-h-[44px] border border-white/20 text-[#F8FAFC] font-display text-sm font-semibold uppercase tracking-[0.05em] rounded-[4px] hover:border-[#CCFF00] hover:text-[#CCFF00] transition-colors cursor-pointer whitespace-nowrap"
            >
              <Calendar className="w-4 h-4 text-[#CCFF00]" />
              Cek Jadwal Caster
            </button>
            <button
              type="button"
              onClick={() => setShowBookingForm((v) => !v)}
              className="inline-flex items-center justify-center gap-2 px-5 min-h-[44px] bg-[#00F0FF] text-[#0A0C10] font-display text-sm font-bold uppercase tracking-[0.05em] rounded-[4px] hover:shadow-[0_0_20px_rgba(0,240,255,0.45)] transition-all cursor-pointer whitespace-nowrap"
            >
              <Swords className="w-4 h-4" />
              {showBookingForm ? 'Tutup Form Scrim' : 'Buat Jadwal Scrim'}
            </button>
          </div>
        </div>

        {currentUser?.role === 'TEAM' && teamProfile?.primaryGame && (
          <div className="mt-4 px-4 py-2.5 bg-[#00F0FF]/8 border border-[#00F0FF]/25 rounded-[4px] flex flex-wrap items-center justify-between gap-2 font-telemetry text-xs text-[#E2E2E8]">
            <span>
              Divisi Tim Aktif: <strong className="text-[#00F0FF]">{teamProfile.primaryGame}</strong>{' '}
              · Pembuatan jadwal dan pengajuan tantangan scrim terkunci khusus cabang{' '}
              <strong>{teamProfile.primaryGame}</strong>.
            </span>
            {gameFilter !== teamProfile.primaryGame && (
              <button
                type="button"
                onClick={() => setGameFilter(teamProfile.primaryGame)}
                className="text-[#CCFF00] font-bold uppercase hover:underline cursor-pointer"
              >
                Fokus ke {teamProfile.primaryGame} →
              </button>
            )}
          </div>
        )}

        {/* MODULE 1: SCRIM BOOKING FORM (.scrim-booking-card) */}
        {showBookingForm && (
          <form
            onSubmit={handleBookingSubmit}
            className="scrim-booking-card mt-8 bg-[#12161F] border border-white/[0.08] rounded-lg p-6 sm:p-8 space-y-6"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-white/[0.08]">
              <div>
                <h3 className="font-display text-2xl font-bold uppercase text-[#F8FAFC]">
                  Buat Jadwal Scrim Baru
                </h3>
                <p className="text-xs text-[#94A3B8] mt-0.5">
                  Tentukan apakah tim Anda masih mencari lawan atau sudah punya lawan tanding. Biaya patungan per tim dihitung otomatis.
                </p>
              </div>
              <span className="font-telemetry text-xs font-bold uppercase tracking-[0.08em] text-[#CCFF00]">
                PATUNGAN: {formatRupiah(previewSplit)} / TIM
              </span>
            </div>

            {/* Status Lawan Radio Toggle */}
            <div>
              <span className="block font-telemetry text-xs font-semibold uppercase tracking-[0.08em] text-[#94A3B8] mb-2">
                Pilih Mode Pertandingan
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setMode('OPEN_LOBBY')}
                  className={`p-4 text-left rounded-[4px] border transition-colors cursor-pointer min-h-[44px] ${
                    mode === 'OPEN_LOBBY'
                      ? 'bg-[#00F0FF]/10 border-[#00F0FF] text-[#F8FAFC]'
                      : 'bg-[#0A0C10] border-white/12 text-[#94A3B8] hover:border-white/25'
                  }`}
                >
                  <div className="font-telemetry text-xs font-bold uppercase tracking-[0.08em] text-[#CCFF00]">
                    Opsi 1 · Cari Lawan (Open Lobby)
                  </div>
                  <div className="mt-1 text-xs text-[#E2E2E8]">
                    Tampilkan jadwal di daftar Scrim agar tim lain bisa mendaftar, lalu Anda pilih lawan yang paling cocok.
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setMode('DIRECT_CHALLENGE')}
                  className={`p-4 text-left rounded-[4px] border transition-colors cursor-pointer min-h-[44px] ${
                    mode === 'DIRECT_CHALLENGE'
                      ? 'bg-[#00F0FF]/10 border-[#00F0FF] text-[#F8FAFC]'
                      : 'bg-[#0A0C10] border-white/12 text-[#94A3B8] hover:border-white/25'
                  }`}
                >
                  <div className="font-telemetry text-xs font-bold uppercase tracking-[0.08em] text-[#00F0FF]">
                    Opsi 2 · Sudah Punya Lawan (Tantang Langsung)
                  </div>
                  <div className="mt-1 text-xs text-[#E2E2E8]">
                    Masukkan nama tim lawan yang sudah sepakat bertanding untuk langsung mengunci jadwal dan patungan biaya.
                  </div>
                </button>
              </div>
            </div>

            {/* Grid 12 Columns: Host Team + Session Settings */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Host Team Info */}
              <div className="lg:col-span-6 space-y-4">
                <div className="font-telemetry text-xs font-bold uppercase tracking-[0.08em] text-[#00F0FF]">
                  Informasi Tim Host (Tim A)
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block font-telemetry text-[11px] uppercase tracking-[0.08em] text-[#94A3B8] mb-1.5">
                      Nama Tim
                    </label>
                    <input
                      type="text"
                      required
                      value={hostTeamName}
                      onChange={(e) => setHostTeamName(e.target.value)}
                      placeholder="Contoh: ORDAL VANGUARD"
                      className="w-full px-3.5 py-2.5 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC] placeholder:text-[#94A3B8]/50 focus:outline-none focus:border-[#00F0FF]"
                    />
                  </div>
                  <div>
                    <label className="block font-telemetry text-[11px] uppercase tracking-[0.08em] text-[#94A3B8] mb-1.5">
                      Logo Tim
                    </label>
                    <label className="w-full min-h-[42px] px-3 py-2 bg-[#0A0C10] border border-white/15 hover:border-[#00F0FF] rounded-[4px] flex items-center justify-center gap-1.5 font-telemetry text-xs text-[#F8FAFC] cursor-pointer">
                      <Upload className="w-3.5 h-3.5 text-[#00F0FF]" />
                      <span className="truncate">{hostTeamLogo ? 'Logo Siap' : 'Upload'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => readImageFile(e.target.files?.[0], setHostTeamLogo)}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block font-telemetry text-[11px] uppercase tracking-[0.08em] text-[#94A3B8] mb-1.5">
                    Roster Inti (IGN &amp; ID, pisahkan koma)
                  </label>
                  <input
                    type="text"
                    required
                    value={hostRosterCore}
                    onChange={(e) => setHostRosterCore(e.target.value)}
                    placeholder="ORD_Kuroi#01, ORD_Fikri#29, ORD_Zane#88, ORD_Ryu#12, ORD_Mika#04"
                    className="w-full px-3.5 py-2.5 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC] placeholder:text-[#94A3B8]/50 focus:outline-none focus:border-[#00F0FF]"
                  />
                </div>

                <div>
                  <label className="block font-telemetry text-[11px] uppercase tracking-[0.08em] text-[#94A3B8] mb-1.5">
                    Roster Cadangan (Opsional)
                  </label>
                  <input
                    type="text"
                    value={hostRosterSub}
                    onChange={(e) => setHostRosterSub(e.target.value)}
                    placeholder="ORD_Seno#99"
                    className="w-full px-3.5 py-2.5 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC] placeholder:text-[#94A3B8]/50 focus:outline-none focus:border-[#00F0FF]"
                  />
                </div>
              </div>

              {/* Session & Caster Settings */}
              <div className="lg:col-span-6 space-y-4">
                <div className="font-telemetry text-xs font-bold uppercase tracking-[0.08em] text-[#00F0FF]">
                  Pengaturan Sesi &amp; Caster ORDAL
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-telemetry text-[11px] uppercase tracking-[0.08em] text-[#94A3B8] mb-1.5">
                      Judul Game
                    </label>
                    <select
                      value={game}
                      disabled={Boolean(currentUser?.role === 'TEAM' && teamProfile?.primaryGame)}
                      onChange={(e) => setGame(e.target.value as ScrimGame)}
                      className="w-full px-3 py-2.5 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF] disabled:opacity-75 disabled:cursor-not-allowed"
                    >
                      {SCRIM_GAMES.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                    {currentUser?.role === 'TEAM' && teamProfile?.primaryGame && (
                      <p className="mt-1 font-telemetry text-[10px] text-[#00F0FF]">
                        Terkunci sesuai cabang tim Anda ({teamProfile.primaryGame}).
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block font-telemetry text-[11px] uppercase tracking-[0.08em] text-[#94A3B8] mb-1.5">
                      Tanggal Scrim
                    </label>
                    <input
                      type="date"
                      required
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full px-3 py-2.5 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                    />
                  </div>
                  <div>
                    <label className="block font-telemetry text-[11px] uppercase tracking-[0.08em] text-[#94A3B8] mb-1.5">
                      Slot Jam
                    </label>
                    <select
                      value={timeSlot}
                      onChange={(e) => {
                        setTimeSlot(e.target.value);
                        setBookingError('');
                      }}
                      className="w-full px-3 py-2.5 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                    >
                      {TIME_SLOTS.map((slot) => {
                        const isOccupied = Boolean(
                          selectedCasterAvailability?.bookedSlots.includes(slot)
                        );
                        return (
                          <option key={slot} value={slot} disabled={isOccupied}>
                            {slot} {isOccupied ? '[BENTROK]' : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block font-telemetry text-[11px] uppercase tracking-[0.08em] text-[#94A3B8] mb-1.5">
                    Pilihan Caster In-House ORDAL (Maks 2 Match / Hari · Anti Bentrok)
                  </label>
                  <select
                    value={selectedCasterId}
                    onChange={(e) => {
                      setSelectedCasterId(e.target.value);
                      setBookingError('');
                    }}
                    className="w-full px-3.5 py-2.5 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                  >
                    {casters.map((c) => {
                      const avail = getCasterAvailability(c, date, timeSlot);
                      const unsupportedGame = !c.specialtyGames.includes(game);
                      const statusTag = unsupportedGame
                        ? `[Spesialisasi lain]`
                        : avail.isDayOff
                          ? '[FULL DAY OFF]'
                          : avail.isSlotDayOff
                            ? `[OFF JAM ${timeSlot}]`
                            : avail.isFullBook
                              ? `[FULL BOOK ${avail.bookedCount}/${avail.limit}]`
                              : avail.isSlotConflict
                                ? `[BENTROK ${timeSlot}]`
                                : avail.hasPartialDayOff
                                  ? `[Tersedia ${avail.bookedCount}/${avail.limit} · 1 Job/1 Off]`
                                  : `[Tersedia ${avail.bookedCount}/${avail.limit}]`;
                      const badgePrefix = [
                        c.isTopCaster ? '★ Top Caster' : '',
                        c.isVerified ? '✓ Verified' : '',
                      ]
                        .filter(Boolean)
                        .join(' · ');
                      return (
                        <option
                          key={c.id}
                          value={c.id}
                          disabled={
                            unsupportedGame ||
                            avail.isDayOff ||
                            avail.isSlotDayOff ||
                            avail.isFullBook ||
                            avail.isSlotConflict
                          }
                        >
                          {badgePrefix ? `[${badgePrefix}] ` : ''}
                          {c.name} (+{formatRupiah(c.rateCard)}) {statusTag}
                        </option>
                      );
                    })}
                    <option value="none">Tanpa Caster / Self-Hosted (+Rp 0)</option>
                  </select>

                  {isSelectedCasterUnavailable && selectedCaster && (
                    <div className="mt-2 p-2.5 bg-[#FF2E5B]/15 border border-[#FF2E5B] rounded-[4px] font-telemetry text-xs text-[#FFDADB]">
                      {isCasterGameUnsupported
                        ? `${selectedCaster.name} tidak memiliki spesialisasi di cabang ${game}. Silakan pilih caster lain.`
                        : selectedCasterAvailability?.isDayOff
                          ? `${selectedCaster.name} sedang FULL DAY OFF pada ${date}. Silakan pilih caster atau tanggal lain.`
                          : selectedCasterAvailability?.isSlotDayOff
                            ? `${selectedCaster.name} sedang OFF pada ${date} jam ${timeSlot}. Silakan pilih jam lain atau caster lain.`
                            : selectedCasterAvailability?.isSlotConflict
                              ? `BENTROK JADWAL: ${selectedCaster.name} sudah terjadwal pada ${date} jam ${timeSlot} (${selectedCasterAvailability.conflictMatch?.hostTeamName}). Pilih slot jam atau caster lain.`
                              : `${selectedCaster.name} sudah FULL BOOK (${selectedCasterAvailability?.bookedCount}/${selectedCasterAvailability?.limit} match) pada ${date}. Silakan pilih caster atau tanggal lain.`}
                    </div>
                  )}

                  {bookingError && !isSelectedCasterUnavailable && (
                    <div className="mt-2 p-2.5 bg-[#FF2E5B]/15 border border-[#FF2E5B] rounded-[4px] font-telemetry text-xs text-[#FFDADB]">
                      {bookingError}
                    </div>
                  )}
                </div>

                {/* Live Split-Bill Summary */}
                <div className="p-4 bg-[#0A0C10] border border-white/[0.08] rounded-[4px] font-telemetry text-xs space-y-1.5">
                  <div className="flex justify-between text-[#94A3B8]">
                    <span>
                      Tarif Caster ({selectedCaster ? selectedCaster.name : 'Tanpa Caster'})
                    </span>
                    <span className="text-[#F8FAFC]">{formatRupiah(selectedCasterRate)}</span>
                  </div>
                  <div className="flex justify-between text-[#94A3B8]">
                    <span>Lobby Fee</span>
                    <span className="text-[#F8FAFC]">{formatRupiah(platformFee)}</span>
                  </div>
                  <div className="pt-2 mt-1 border-t border-white/[0.08] flex justify-between font-bold">
                    <span className="text-[#F8FAFC]">TOTAL ({formatRupiah(previewTotal)}) ÷ 2 TIM</span>
                    <span className="text-[#CCFF00]">{formatRupiah(previewSplit)} / TIM</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Direct Challenge Extra Fields (Tim B) */}
            {mode === 'DIRECT_CHALLENGE' && (
              <div className="pt-5 border-t border-white/[0.08] space-y-4">
                <div className="font-telemetry text-xs font-bold uppercase tracking-[0.08em] text-[#FF2E5B]">
                  Detail Tim Lawan (Tim B — Direct Challenge)
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block font-telemetry text-[11px] uppercase tracking-[0.08em] text-[#94A3B8] mb-1.5">
                      Nama Tim B
                    </label>
                    <input
                      type="text"
                      required
                      value={directTeamName}
                      onChange={(e) => setDirectTeamName(e.target.value)}
                      placeholder="Contoh: FALCON STRIKE"
                      className="w-full px-3.5 py-2.5 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                    />
                  </div>
                  <div>
                    <label className="block font-telemetry text-[11px] uppercase tracking-[0.08em] text-[#94A3B8] mb-1.5">
                      Logo Tim B
                    </label>
                    <label className="w-full min-h-[42px] px-3 py-2 bg-[#0A0C10] border border-white/15 hover:border-[#00F0FF] rounded-[4px] flex items-center justify-center gap-1.5 font-telemetry text-xs text-[#F8FAFC] cursor-pointer">
                      <Upload className="w-3.5 h-3.5 text-[#00F0FF]" />
                      <span>{directTeamLogo ? 'Logo Tim B Siap' : 'Upload Logo Tim B'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => readImageFile(e.target.files?.[0], setDirectTeamLogo)}
                        className="hidden"
                      />
                    </label>
                  </div>
                  <div>
                    <label className="block font-telemetry text-[11px] uppercase tracking-[0.08em] text-[#94A3B8] mb-1.5">
                      Roster Tim B (Opsional)
                    </label>
                    <input
                      type="text"
                      value={directRosterCore}
                      onChange={(e) => setDirectRosterCore(e.target.value)}
                      placeholder="Bisa dikonfirmasi Tim B nanti"
                      className="w-full px-3.5 py-2.5 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowBookingForm(false)}
                className="px-5 min-h-[44px] border border-white/20 text-[#F8FAFC] font-display text-sm font-semibold uppercase rounded-[4px] hover:border-[#00F0FF] cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={submittingBooking}
                className="px-6 min-h-[44px] bg-[#00F0FF] text-[#0A0C10] font-display text-sm font-bold uppercase tracking-[0.05em] rounded-[4px] hover:shadow-[0_0_20px_rgba(0,240,255,0.45)] disabled:opacity-50 cursor-pointer"
              >
                {submittingBooking
                  ? 'Memproses...'
                  : mode === 'OPEN_LOBBY'
                    ? 'Publikasikan ke Open Lobby'
                    : 'Kirim Undangan Direct Challenge'}
              </button>
            </div>
          </form>
        )}

        {/* Filter Bar for Public Scrim Lobby */}
        <div className="mt-8 flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-full sm:w-auto overflow-x-auto no-scrollbar">
              <div className="inline-flex items-center gap-1 p-1 bg-[#12161F] border border-white/[0.08] rounded-[4px] min-w-max">
                {(['ALL', ...SCRIM_GAMES] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGameFilter(g)}
                    className={`min-h-[38px] px-3 py-1.5 font-telemetry text-xs font-semibold uppercase tracking-[0.06em] rounded-[2px] transition-colors cursor-pointer whitespace-nowrap ${
                      gameFilter === g
                        ? 'bg-[#00F0FF] text-[#0A0C10]'
                        : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                    }`}
                  >
                    {g === 'ALL' ? 'Semua Game' : g}
                  </button>
                ))}
              </div>
            </div>

            <div className="w-full sm:w-auto overflow-x-auto no-scrollbar">
              <div className="inline-flex items-center gap-1 p-1 bg-[#12161F] border border-white/[0.08] rounded-[4px] min-w-max">
                {(
                  [
                    { id: 'ALL', label: 'Semua Status' },
                    { id: 'OPEN_LOBBY', label: 'Butuh Lawan' },
                    { id: 'PAYMENT', label: 'Proses Bayar' },
                    { id: 'CONFIRMED', label: 'Terkonfirmasi' },
                  ] as const
                ).map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setStatusQuickFilter(st.id)}
                    className={`min-h-[38px] px-3 py-1.5 font-telemetry text-xs font-semibold uppercase tracking-[0.06em] rounded-[2px] transition-colors cursor-pointer whitespace-nowrap ${
                      statusQuickFilter === st.id
                        ? 'bg-[#CCFF00] text-[#0A0C10]'
                        : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <span className="font-telemetry text-xs uppercase tracking-[0.08em] text-[#94A3B8] shrink-0 tabular-nums">
            {filteredScrims.length} SESI SCRIM DITAMPILKAN
          </span>
        </div>

        {/* MODULE 2: PUBLIC SCRIM LOBBY (.scrim-lobby-grid) */}
        {filteredScrims.length === 0 ? (
          <div className="mt-6 p-10 bg-[#12161F] border border-white/[0.08] rounded-lg text-center">
            <p className="font-display text-xl uppercase text-[#F8FAFC]">
              Tidak Ada Sesi Scrim Sesuai Filter
            </p>
            <p className="mt-1 text-sm text-[#94A3B8]">
              Coba ubah filter status/game atau klik "Buat Jadwal Scrim" untuk membuka lobby baru.
            </p>
          </div>
        ) : (
          <div className="scrim-lobby-grid mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredScrims.map((scrim) => {
              const timer = getRemainingTimer(scrim.paymentDeadlineAt);
              return (
                <article
                  key={scrim.id}
                  className="bg-[#12161F] border border-white/[0.08] hover:border-[#00F0FF]/40 rounded-lg p-6 flex flex-col justify-between transition-colors"
                >
                  <div>
                    {/* Top Status & Game Row */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-white/[0.06] font-telemetry text-[11px] font-bold uppercase tracking-[0.08em]">
                      <div className="flex items-center gap-2">
                        <span className="text-[#00F0FF]">{scrim.game}</span>
                        <span className="text-white/25">·</span>
                        <span className="text-[#94A3B8]">
                          {scrim.mode === 'DIRECT_CHALLENGE' ? 'TANTANG LANGSUNG' : 'OPEN LOBBY'}
                        </span>
                      </div>

                      {/* Clear Indonesian Status Signal */}
                      {scrim.status === 'OPEN_LOBBY' && (
                        <span className="inline-flex items-center gap-1.5 text-[#CCFF00]">
                          <span className="w-2 h-2 rounded-full bg-[#CCFF00] animate-pulse" />
                          BUTUH LAWAN (OPEN LOBBY)
                        </span>
                      )}
                      {scrim.status === 'WAITING_APPROVAL' && (
                        <span className="inline-flex items-center gap-1.5 text-[#FF2E5B]">
                          <span className="w-2 h-2 rounded-full bg-[#FF2E5B] live-dot-pulse" />
                          MENUNGGU KONFIRMASI CASTER
                        </span>
                      )}
                      {scrim.status === 'AWAITING_PAYMENT' && (
                        <span className="text-[#FACC15]">MENUNGGU PEMBAYARAN</span>
                      )}
                      {scrim.status === 'PARTIALLY_PAID' && (
                        <span className="text-[#38BDF8]">SEBAGIAN TERBAYAR (1/2 TIM)</span>
                      )}
                      {scrim.status === 'CONFIRMED' && (
                        <span className="inline-flex items-center gap-1 text-[#00F0FF]">
                          <Lock className="w-3.5 h-3.5" />
                          TERKONFIRMASI &amp; TERKUNCI
                        </span>
                      )}
                    </div>

                    {/* Head-to-Head Matchup Display */}
                    <div className="mt-5 grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-3 p-3.5 sm:p-4 bg-[#0A0C10] border border-white/[0.06] rounded-[6px]">
                      {/* Host Team (Left) */}
                      <div className="flex items-center gap-3 min-w-0">
                        <TeamAvatar name={scrim.hostTeamName} logo={scrim.hostTeamLogo} />
                        <div className="min-w-0">
                          <div className="font-telemetry text-[10px] uppercase tracking-[0.08em] text-[#94A3B8]">
                            HOST (TIM A)
                          </div>
                          <div className="font-display text-base sm:text-lg font-bold uppercase text-[#F8FAFC] truncate">
                            {scrim.hostTeamName}
                          </div>
                        </div>
                      </div>

                      <div className="px-2 font-display text-base sm:text-xl font-bold text-[#FF2E5B] text-center">
                        VS
                      </div>

                      {/* Challenger Team / Open Slot (Right) */}
                      <div className="flex items-center sm:justify-end gap-3 min-w-0 sm:text-right">
                        {scrim.challengerTeamName ? (
                          <>
                            <div className="min-w-0 order-2 sm:order-1">
                              <div className="font-telemetry text-[10px] uppercase tracking-[0.08em] text-[#94A3B8]">
                                PENANTANG (TIM B)
                              </div>
                              <div className="font-display text-base sm:text-lg font-bold uppercase text-[#F8FAFC] truncate">
                                {scrim.challengerTeamName}
                              </div>
                            </div>
                            <div className="order-1 sm:order-2 shrink-0">
                              <TeamAvatar
                                name={scrim.challengerTeamName}
                                logo={scrim.challengerTeamLogo}
                              />
                            </div>
                          </>
                        ) : (
                          <div className="flex items-center gap-2.5">
                            <div className="order-2 sm:order-1">
                              <div className="font-telemetry text-[10px] uppercase tracking-[0.08em] text-[#CCFF00]">
                                OPEN SLOT
                              </div>
                              <div className="font-display text-base font-semibold uppercase text-[#94A3B8]">
                                MENUNGGU LAWAN
                              </div>
                            </div>
                            <div className="order-1 sm:order-2 w-11 h-11 rounded-full border border-dashed border-[#CCFF00]/50 flex items-center justify-center font-telemetry text-sm text-[#CCFF00] shrink-0">
                              ?
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Session Schedule, Caster & Split-Bill Metadata */}
                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 font-telemetry text-xs">
                      <div className="flex items-center gap-2 text-[#E2E2E8]">
                        <Calendar className="w-3.5 h-3.5 text-[#00F0FF] shrink-0" />
                        <span className="truncate">
                          {scrim.date} · {scrim.timeSlot}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[#E2E2E8] min-w-0">
                        <Mic className="w-3.5 h-3.5 text-[#FF2E5B] shrink-0" />
                        <span className="truncate">
                          {scrim.casterName}
                          {scrim.casterApprovalStatus === 'PENDING' && ' (Pending)'}
                          {scrim.casterApprovalStatus === 'APPROVED' && ' ✓'}
                        </span>
                        {(() => {
                          const matchedCaster = casters.find((c) => c.id === scrim.casterId);
                          if (!matchedCaster) return null;
                          return (
                            <CasterBadges
                              isVerified={matchedCaster.isVerified}
                              isTopCaster={matchedCaster.isTopCaster}
                              size="xs"
                            />
                          );
                        })()}
                      </div>
                      <div className="flex items-center sm:justify-end gap-1.5 text-[#CCFF00] font-bold">
                        <CreditCard className="w-3.5 h-3.5 shrink-0" />
                        <span>{formatRupiah(scrim.splitCostPerTeam)} / TIM</span>
                      </div>
                    </div>

                    {scrim.youtubeStreamUrl && (
                      <a
                        href={scrim.youtubeStreamUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3.5 px-3.5 py-2.5 bg-[#FF2E5B]/12 border border-[#FF2E5B]/45 hover:bg-[#FF2E5B]/20 rounded-[4px] flex items-center justify-between gap-2 transition-colors"
                      >
                        <span className="inline-flex items-center gap-2 font-telemetry text-xs font-bold uppercase tracking-[0.06em] text-[#F8FAFC]">
                          <Youtube className="w-4 h-4 text-[#FF2E5B] shrink-0" />
                          TONTON LIVE STREAM YOUTUBE
                        </span>
                        <span className="inline-flex items-center gap-1 font-telemetry text-[11px] font-bold uppercase text-[#FF2E5B]">
                          BUKA
                          <ExternalLink className="w-3.5 h-3.5" />
                        </span>
                      </a>
                    )}

                    {scrim.rescheduleProposal && (
                      <div className="mt-3.5 p-3.5 bg-amber-400/[0.08] border border-amber-400/35 rounded-[4px] space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2 font-telemetry text-[11px] uppercase">
                          <span className="inline-flex items-center gap-1.5 font-bold text-amber-300">
                            <CalendarClock className="w-3.5 h-3.5" />
                            USULAN RESCHEDULE CASTER
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-[2px] text-[10px] font-bold ${
                              scrim.rescheduleProposal.status === 'ACCEPTED'
                                ? 'bg-[#CCFF00]/15 text-[#CCFF00]'
                                : scrim.rescheduleProposal.status === 'DECLINED'
                                  ? 'bg-[#FF2E5B]/15 text-[#FF2E5B]'
                                  : 'bg-amber-400/20 text-amber-200'
                            }`}
                          >
                            {scrim.rescheduleProposal.status}
                          </span>
                        </div>
                        <div className="font-telemetry text-xs text-[#F8FAFC]">
                          Jadwal Baru:{' '}
                          <strong className="text-[#00F0FF]">
                            {scrim.rescheduleProposal.proposedDate} ·{' '}
                            {scrim.rescheduleProposal.proposedTimeSlot}
                          </strong>
                          {scrim.rescheduleProposal.reason && (
                            <span className="block text-[11px] text-[#94A3B8] mt-0.5">
                              Catatan: {scrim.rescheduleProposal.reason}
                            </span>
                          )}
                        </div>
                        {scrim.rescheduleProposal.status === 'PENDING' && isTeamRole && (
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <button
                              type="button"
                              disabled={busyId === scrim.id}
                              onClick={() => handleRescheduleResponse(scrim, 'ACCEPTED')}
                              className="px-3 py-1.5 bg-[#CCFF00] text-[#0A0C10] font-telemetry text-[11px] font-bold uppercase rounded-[3px] cursor-pointer"
                            >
                              Setujui Jadwal Baru
                            </button>
                            <button
                              type="button"
                              disabled={busyId === scrim.id}
                              onClick={() => handleRescheduleResponse(scrim, 'DECLINED')}
                              className="px-3 py-1.5 border border-[#FF2E5B]/50 text-[#FF2E5B] font-telemetry text-[11px] font-bold uppercase rounded-[3px] cursor-pointer"
                            >
                              Tolak Reschedule
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* MODULE 3: SPLIT-BILL PAYMENT TRACKER (Active when Awaiting / Partially Paid / Confirmed) */}
                    {(scrim.status === 'AWAITING_PAYMENT' ||
                      scrim.status === 'PARTIALLY_PAID' ||
                      scrim.status === 'CONFIRMED') && (
                      <div className="mt-4 p-4 bg-[#0A0C10] border border-white/[0.08] rounded-[6px] space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 font-telemetry text-[11px] uppercase tracking-[0.08em]">
                          <span className="text-[#94A3B8]">
                            {isCasterRole
                              ? `RATECARD CASTER (${formatRupiah(scrim.casterRate)})`
                              : `SPLIT-BILL (${formatRupiah(scrim.totalCost)} TOTAL · LOBBY FEE Rp50.000)`}
                          </span>
                          {timer && scrim.status !== 'CONFIRMED' && (
                            <span
                              className={`inline-flex items-center gap-1 font-bold ${
                                timer.expired ? 'text-[#FF2E5B]' : 'text-[#FACC15]'
                              }`}
                            >
                              <Clock className="w-3.5 h-3.5" />
                              {timer.expired ? 'WAKTU HABIS' : `EXPIRY ${timer.text}`}
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {(() => {
                            const hostPay = payments.find(
                              (p) =>
                                p.scrimId === scrim.id &&
                                p.category === 'SCRIM_SPLIT_BILL' &&
                                p.scrimSide === 'host'
                            );
                            const chPay = payments.find(
                              (p) =>
                                p.scrimId === scrim.id &&
                                p.category === 'SCRIM_SPLIT_BILL' &&
                                p.scrimSide === 'challenger'
                            );
                            const canPayHost =
                              currentUser?.role === 'SUPER_ADMIN' || isHostTeam(scrim);
                            const canPayChallenger =
                              currentUser?.role === 'SUPER_ADMIN' || isChallengerTeam(scrim);

                            return (
                              <>
                                <div className="flex items-center justify-between p-2.5 bg-[#12161F] border border-white/[0.06] rounded-[4px]">
                                  <div className="min-w-0 pr-2">
                                    <div className="font-telemetry text-[10px] text-[#94A3B8] truncate">
                                      {scrim.hostTeamName}
                                    </div>
                                    <div className="font-telemetry text-xs font-bold text-[#F8FAFC]">
                                      {formatRupiah(scrim.splitCostPerTeam)}
                                    </div>
                                  </div>
                                  {scrim.hostPaid ? (
                                    <span className="inline-flex items-center gap-1 font-telemetry text-[11px] font-bold text-[#00F0FF] shrink-0">
                                      <CheckCircle2 className="w-3.5 h-3.5" /> LUNAS
                                    </span>
                                  ) : hostPay?.status === 'EXPIRED' ? (
                                    <span className="font-telemetry text-[10px] font-bold uppercase text-[#94A3B8] shrink-0">
                                      Kedaluwarsa (Expired)
                                    </span>
                                  ) : hostPay?.status === 'PENDING_VALIDATION' ? (
                                    currentUser?.role === 'SUPER_ADMIN' ? (
                                      <button
                                        type="button"
                                        disabled={busyId === scrim.id}
                                        onClick={() => handlePay(scrim, 'host')}
                                        className="px-3 py-1.5 bg-[#CCFF00] text-[#0A0C10] font-display text-xs font-bold uppercase rounded-[4px] hover:brightness-110 cursor-pointer shrink-0"
                                      >
                                        Validasi Tim A
                                      </button>
                                    ) : (
                                      <span className="font-telemetry text-[10px] font-bold uppercase text-[#FACC15] shrink-0">
                                        Menunggu Validasi
                                      </span>
                                    )
                                  ) : canPayHost ? (
                                    <button
                                      type="button"
                                      disabled={busyId === scrim.id}
                                      onClick={() => handlePay(scrim, 'host')}
                                      className="px-3 py-1.5 bg-[#00F0FF] text-[#0A0C10] font-display text-xs font-bold uppercase rounded-[4px] hover:shadow-[0_0_12px_rgba(0,240,255,0.4)] cursor-pointer shrink-0"
                                    >
                                      {hostPay?.status === 'REJECTED' ? 'Upload Ulang' : 'Bayar Tim A'}
                                    </button>
                                  ) : (
                                    <span className="font-telemetry text-[10px] uppercase text-[#94A3B8] shrink-0">
                                      Belum Lunas
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center justify-between p-2.5 bg-[#12161F] border border-white/[0.06] rounded-[4px]">
                                  <div className="min-w-0 pr-2">
                                    <div className="font-telemetry text-[10px] text-[#94A3B8] truncate">
                                      {scrim.challengerTeamName}
                                    </div>
                                    <div className="font-telemetry text-xs font-bold text-[#F8FAFC]">
                                      {formatRupiah(scrim.splitCostPerTeam)}
                                    </div>
                                  </div>
                                  {scrim.challengerPaid ? (
                                    <span className="inline-flex items-center gap-1 font-telemetry text-[11px] font-bold text-[#00F0FF] shrink-0">
                                      <CheckCircle2 className="w-3.5 h-3.5" /> LUNAS
                                    </span>
                                  ) : chPay?.status === 'EXPIRED' ? (
                                    <span className="font-telemetry text-[10px] font-bold uppercase text-[#94A3B8] shrink-0">
                                      Kedaluwarsa (Expired)
                                    </span>
                                  ) : chPay?.status === 'PENDING_VALIDATION' ? (
                                    currentUser?.role === 'SUPER_ADMIN' ? (
                                      <button
                                        type="button"
                                        disabled={busyId === scrim.id}
                                        onClick={() => handlePay(scrim, 'challenger')}
                                        className="px-3 py-1.5 bg-[#CCFF00] text-[#0A0C10] font-display text-xs font-bold uppercase rounded-[4px] hover:brightness-110 cursor-pointer shrink-0"
                                      >
                                        Validasi Tim B
                                      </button>
                                    ) : (
                                      <span className="font-telemetry text-[10px] font-bold uppercase text-[#FACC15] shrink-0">
                                        Menunggu Validasi
                                      </span>
                                    )
                                  ) : canPayChallenger ? (
                                    <button
                                      type="button"
                                      disabled={busyId === scrim.id}
                                      onClick={() => handlePay(scrim, 'challenger')}
                                      className="px-3 py-1.5 bg-[#00F0FF] text-[#0A0C10] font-display text-xs font-bold uppercase rounded-[4px] hover:shadow-[0_0_12px_rgba(0,240,255,0.4)] cursor-pointer shrink-0"
                                    >
                                      {chPay?.status === 'REJECTED' ? 'Upload Ulang' : 'Bayar Tim B'}
                                    </button>
                                  ) : (
                                    <span className="font-telemetry text-[10px] uppercase text-[#94A3B8] shrink-0">
                                      Belum Lunas
                                    </span>
                                  )}
                                </div>
                              </>
                            );
                          })()}
                        </div>

                        {timer?.expired && scrim.status !== 'CONFIRMED' && (
                          <button
                            type="button"
                            onClick={() => handleRelease(scrim)}
                            className="w-full py-2 bg-[#FF2E5B]/15 border border-[#FF2E5B] text-[#FF2E5B] font-telemetry text-xs font-bold uppercase rounded-[4px] cursor-pointer"
                          >
                            Auto-Release Slot ke Public Lobby
                          </button>
                        )}
                      </div>
                    )}
                    {/* OPEN LOBBY CHALLENGER APPLICATIONS (HOST TEAM LEADER PICKS OPPONENT) */}
                    {scrim.status === 'OPEN_LOBBY' &&
                      (() => {
                        const pendingApps = (scrim.challengerApplications || []).filter(
                          (a) => a.status === 'PENDING'
                        );
                        const hostOwns = isHostTeam(scrim);
                        if (!hostOwns && pendingApps.length === 0) return null;
                        return (
                          <div className="mt-4 p-3.5 bg-[#0A0C10] border border-[#00F0FF]/30 rounded-[4px] space-y-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-telemetry text-[11px] font-bold uppercase tracking-[0.06em] text-[#00F0FF]">
                                {hostOwns
                                  ? `PILIH LAWAN OPEN LOBBY (${pendingApps.length} PENANTANG)`
                                  : `TIM PENANTANG TERDAFTAR (${pendingApps.length})`}
                              </span>
                              {hostOwns && (
                                <span className="font-telemetry text-[10px] uppercase text-[#CCFF00]">
                                  Team Leader Host
                                </span>
                              )}
                            </div>

                            {pendingApps.length === 0 ? (
                              <p className="font-telemetry text-xs text-[#94A3B8]">
                                Belum ada akun tim lain yang mengajukan scrim pada lobby ini.
                              </p>
                            ) : (
                              <div className="space-y-2">
                                {pendingApps.map((appItem) => {
                                  const isMyApp =
                                    currentUser &&
                                    (appItem.applicantUserId === currentUser.id ||
                                      appItem.applicantEmail.toLowerCase() ===
                                        currentUser.email.toLowerCase());
                                  return (
                                    <div
                                      key={appItem.id}
                                      className="p-2.5 bg-[#12161F] border border-white/10 rounded-[4px] flex flex-wrap items-center justify-between gap-3"
                                    >
                                      <div className="flex items-center gap-2.5 min-w-0">
                                        <TeamAvatar
                                          name={appItem.teamName}
                                          logo={appItem.teamLogo}
                                        />
                                        <div className="min-w-0">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-display text-sm font-bold uppercase text-[#F8FAFC] truncate">
                                              {appItem.teamName}
                                            </span>
                                            {isMyApp && (
                                              <span className="px-1.5 py-0.5 bg-[#00F0FF]/15 border border-[#00F0FF]/40 rounded-[3px] font-telemetry text-[10px] font-bold uppercase text-[#00F0FF]">
                                                Tim Anda
                                              </span>
                                            )}
                                          </div>
                                          <p className="font-telemetry text-[11px] text-[#94A3B8] truncate">
                                            Roster ({appItem.rosterCore.length}):{' '}
                                            {appItem.rosterCore.slice(0, 5).join(', ') || '-'}
                                          </p>
                                          {appItem.note && (
                                            <p className="font-telemetry text-[11px] text-[#CCFF00]/90 mt-0.5">
                                              Catatan: {appItem.note}
                                            </p>
                                          )}
                                        </div>
                                      </div>

                                      {hostOwns && (
                                        <div className="flex items-center gap-2 shrink-0">
                                          <button
                                            type="button"
                                            disabled={busyId === scrim.id}
                                            onClick={() =>
                                              handleSelectChallenger(
                                                scrim,
                                                appItem.id,
                                                appItem.teamName,
                                                'REJECT'
                                              )
                                            }
                                            className="px-2.5 py-1.5 border border-[#FF2E5B]/55 text-[#FF2E5B] font-telemetry text-[11px] font-bold uppercase rounded-[4px] hover:bg-[#FF2E5B]/10 disabled:opacity-50 cursor-pointer"
                                          >
                                            Tolak
                                          </button>
                                          <button
                                            type="button"
                                            disabled={busyId === scrim.id}
                                            onClick={() =>
                                              handleSelectChallenger(
                                                scrim,
                                                appItem.id,
                                                appItem.teamName,
                                                'SELECT'
                                              )
                                            }
                                            className="px-3 py-1.5 bg-[#CCFF00] text-[#0A0C10] font-display text-xs font-bold uppercase rounded-[4px] hover:brightness-110 disabled:opacity-50 cursor-pointer"
                                          >
                                            Pilih Lawan
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                  </div>

                  {/* Interactive Action Footer */}
                  <div className="mt-5 pt-4 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setInspectScrim(scrim)}
                      className="inline-flex items-center gap-1.5 font-telemetry text-xs font-semibold uppercase tracking-[0.06em] text-[#94A3B8] hover:text-[#00F0FF] cursor-pointer"
                    >
                      <Users className="w-3.5 h-3.5" />
                      Lihat Roster
                    </button>

                    <div className="flex flex-wrap items-center gap-2">
                      {scrim.status === 'OPEN_LOBBY' &&
                        (() => {
                          const hostOwns = isHostTeam(scrim);
                          const myPendingApp = (scrim.challengerApplications || []).find(
                            (a) =>
                              currentUser &&
                              (a.applicantUserId === currentUser.id ||
                                a.applicantEmail.toLowerCase() ===
                                  currentUser.email.toLowerCase()) &&
                              a.status === 'PENDING'
                          );

                          if (hostOwns) {
                            return (
                              <span className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#CCFF00]/10 border border-[#CCFF00]/35 rounded-[4px] font-telemetry text-[11px] font-bold uppercase text-[#CCFF00]">
                                <ShieldCheck className="w-3.5 h-3.5" />
                                Lobby Tim Anda · Pilih Lawan di Atas
                              </span>
                            );
                          }
                          if (!isTeamRole) {
                            return (
                              <span className="inline-flex items-center gap-1.5 px-3 py-2 bg-white/[0.04] border border-white/12 rounded-[4px] font-telemetry text-[11px] font-semibold uppercase text-[#94A3B8]">
                                <Lock className="w-3.5 h-3.5 text-[#00F0FF]" />
                                Khusus Akun Tim Lain untuk Ajukan Scrim
                              </span>
                            );
                          }
                          if (myPendingApp) {
                            return (
                              <span className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#00F0FF]/12 border border-[#00F0FF]/40 rounded-[4px] font-telemetry text-[11px] font-bold uppercase text-[#00F0FF]">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Tantangan Terkirim · Menunggu Pilihan Host
                              </span>
                            );
                          }
                          if (
                            teamProfile?.primaryGame &&
                            teamProfile.primaryGame !== scrim.game
                          ) {
                            return (
                              <button
                                type="button"
                                onClick={() =>
                                  onNotify(
                                    `Tim Anda terdaftar di cabang ${teamProfile.primaryGame}. Hanya tim ${scrim.game} yang dapat mengajukan scrim di lobby ini.`
                                  )
                                }
                                className="inline-flex items-center gap-1.5 px-3 py-2 bg-white/[0.04] border border-white/15 rounded-[4px] font-telemetry text-[11px] font-semibold uppercase text-[#94A3B8] hover:border-[#FF2E5B]/50 hover:text-[#F8FAFC] cursor-pointer"
                              >
                                <Lock className="w-3.5 h-3.5 text-[#FF2E5B]" />
                                Khusus Tim {scrim.game}
                              </button>
                            );
                          }
                          return (
                            <button
                              type="button"
                              onClick={() => setChallengeTarget(scrim)}
                              className="px-5 min-h-[44px] bg-[#00F0FF] text-[#0A0C10] font-display text-sm font-bold uppercase tracking-[0.05em] rounded-[4px] hover:shadow-[0_0_18px_rgba(0,240,255,0.45)] transition-all cursor-pointer"
                            >
                              AJUKAN SCRIM
                            </button>
                          );
                        })()}

                      {scrim.status === 'WAITING_APPROVAL' &&
                        (canCasterManageScrim(scrim) ? (
                          <>
                            <button
                              type="button"
                              disabled={busyId === scrim.id}
                              onClick={() => handleReject(scrim)}
                              className="px-3.5 min-h-[42px] border border-[#FF2E5B]/60 text-[#FF2E5B] font-display text-xs sm:text-sm font-bold uppercase tracking-[0.05em] rounded-[4px] hover:bg-[#FF2E5B]/10 cursor-pointer"
                            >
                              TOLAK
                            </button>
                            <button
                              type="button"
                              disabled={busyId === scrim.id}
                              onClick={() => openRescheduleModal(scrim)}
                              className="inline-flex items-center gap-1.5 px-3.5 min-h-[42px] border border-amber-400/60 text-amber-300 font-display text-xs sm:text-sm font-bold uppercase tracking-[0.05em] rounded-[4px] hover:bg-amber-400/10 cursor-pointer"
                            >
                              <CalendarClock className="w-3.5 h-3.5" />
                              RESCHEDULE
                            </button>
                            <button
                              type="button"
                              disabled={busyId === scrim.id}
                              onClick={() => handleApprove(scrim)}
                              className="px-4 min-h-[42px] bg-[#00F0FF] text-[#0A0C10] font-display text-xs sm:text-sm font-bold uppercase tracking-[0.05em] rounded-[4px] hover:shadow-[0_0_18px_rgba(0,240,255,0.45)] cursor-pointer"
                            >
                              APPROVE CASTER
                            </button>
                          </>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-2 bg-white/[0.04] border border-white/12 rounded-[4px] font-telemetry text-[11px] font-semibold uppercase text-[#94A3B8]">
                            <Lock className="w-3.5 h-3.5 text-[#CCFF00]" />
                            Approval Khusus Role Caster
                          </span>
                        ))}

                      {(scrim.status === 'AWAITING_PAYMENT' ||
                        scrim.status === 'PARTIALLY_PAID' ||
                        scrim.status === 'CONFIRMED') &&
                        canCasterManageScrim(scrim) && (
                          <button
                            type="button"
                            disabled={busyId === scrim.id}
                            onClick={() => openRescheduleModal(scrim)}
                            className="inline-flex items-center gap-1.5 px-3.5 min-h-[40px] border border-amber-400/60 text-amber-300 font-display text-xs font-bold uppercase tracking-[0.05em] rounded-[4px] hover:bg-amber-400/10 cursor-pointer"
                          >
                            <CalendarClock className="w-3.5 h-3.5" />
                            Ajukan Reschedule
                          </button>
                        )}

                      {(scrim.status === 'CANCELLED' ||
                        scrim.casterApprovalStatus === 'REJECTED') &&
                        (() => {
                          const myRefund = (scrim.refundRequests || []).find(
                            (r) =>
                              currentUser?.email &&
                              r.requestedByEmail.toLowerCase() === currentUser.email.toLowerCase()
                          );
                          if (myRefund) {
                            return (
                              <span className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#CCFF00]/12 border border-[#CCFF00]/40 rounded-[4px] font-telemetry text-[11px] font-bold uppercase text-[#CCFF00]">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Refund Diajukan ({formatRupiah(myRefund.amount)} · {myRefund.bankOrWallet})
                              </span>
                            );
                          }
                          if (isTeamRole && (isHostTeam(scrim) || isChallengerTeam(scrim))) {
                            return (
                              <button
                                type="button"
                                onClick={() => openRefundModal(scrim)}
                                className="inline-flex items-center gap-1.5 px-4 min-h-[42px] bg-[#FF2E5B] text-white font-display text-xs sm:text-sm font-bold uppercase tracking-[0.05em] rounded-[4px] hover:brightness-110 cursor-pointer"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                Ajukan Refund Dana
                              </button>
                            );
                          }
                          return (
                            <span className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#FF2E5B]/10 border border-[#FF2E5B]/35 rounded-[4px] font-telemetry text-[11px] font-bold uppercase text-[#FF2E5B]">
                              Ditolak Caster · Refund Tersedia untuk Akun Tim
                            </span>
                          );
                        })()}

                      {(scrim.status === 'AWAITING_PAYMENT' ||
                        scrim.status === 'PARTIALLY_PAID') && (
                        <button
                          type="button"
                          disabled={busyId === scrim.id}
                          onClick={() => handleRelease(scrim)}
                          className="px-3.5 min-h-[40px] border border-white/15 text-[#94A3B8] hover:text-[#FF2E5B] hover:border-[#FF2E5B]/50 font-telemetry text-[11px] font-semibold uppercase rounded-[4px] cursor-pointer"
                        >
                          Release Slot
                        </button>
                      )}
                      {scrim.resultRecorded && (
                        <span className="px-3 py-1.5 bg-[#CCFF00]/12 border border-[#CCFF00]/40 rounded-[4px] font-telemetry text-xs font-bold uppercase text-[#CCFF00] tabular-nums">
                          FINAL: {scrim.hostScore} - {scrim.challengerScore}
                        </span>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* MODULE 4: TEAM LEADERBOARD SCRIM */}
        <ScrimLeaderboard scrims={scrims} />
      </div>

      {/* CHALLENGER MODAL ("AJUKAN SCRIM") */}
      {challengeTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0A0C10]/85 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg bg-[#1A202C] border border-white/15 rounded-[8px] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 bg-[#12161F] border-b border-white/[0.08]">
              <div>
                <h3 className="font-display text-xl font-bold uppercase text-[#F8FAFC]">
                  Ajukan Scrim vs {challengeTarget.hostTeamName}
                </h3>
                <p className="font-telemetry text-xs text-[#00F0FF] mt-0.5">
                  {challengeTarget.game} · {challengeTarget.date} {challengeTarget.timeSlot} · Split{' '}
                  {formatRupiah(challengeTarget.splitCostPerTeam)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setChallengeTarget(null)}
                className="p-1.5 text-[#94A3B8] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleChallengeSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1.5">
                    Nama Tim Penantang
                  </label>
                  <input
                    required
                    value={chTeamName}
                    onChange={(e) => setChTeamName(e.target.value)}
                    placeholder="Contoh: SPECTRE ELITE"
                    className="w-full px-3.5 py-2.5 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                  />
                </div>
                <div>
                  <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1.5">
                    Logo Tim
                  </label>
                  <label className="w-full min-h-[42px] px-3 py-2 bg-[#0A0C10] border border-white/15 hover:border-[#00F0FF] rounded-[4px] flex items-center justify-center gap-1.5 font-telemetry text-xs text-[#F8FAFC] cursor-pointer">
                    <Upload className="w-3.5 h-3.5 text-[#00F0FF]" />
                    <span>{chTeamLogo ? 'Siap' : 'Upload'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => readImageFile(e.target.files?.[0], setChTeamLogo)}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              <div>
                <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1.5">
                  Roster Inti (IGN &amp; ID, pisahkan koma)
                </label>
                <textarea
                  rows={2}
                  required
                  value={chRosterCore}
                  onChange={(e) => setChRosterCore(e.target.value)}
                  placeholder="SPCT_Kael#01, SPCT_Raka#02, SPCT_Nox#03, SPCT_Vyn#04, SPCT_Zed#05"
                  className="w-full px-3.5 py-2.5 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                />
              </div>

              <div>
                <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1.5">
                  Roster Cadangan (Opsional)
                </label>
                <input
                  value={chRosterSub}
                  onChange={(e) => setChRosterSub(e.target.value)}
                  placeholder="SPCT_Rio#09"
                  className="w-full px-3.5 py-2.5 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                />
              </div>

              <div>
                <label className="block font-telemetry text-xs uppercase text-[#94A3B8] mb-1.5">
                  Catatan untuk Team Leader Host (Opsional)
                </label>
                <input
                  value={chNote}
                  maxLength={200}
                  onChange={(e) => setChNote(e.target.value)}
                  placeholder="Contoh: Siap BO3 full roster, average rank Immortal"
                  className="w-full px-3.5 py-2.5 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setChallengeTarget(null)}
                  className="px-4 min-h-[44px] border border-white/20 text-[#F8FAFC] font-display text-sm font-semibold uppercase rounded-[4px] cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submittingChallenge}
                  className="px-6 min-h-[44px] bg-[#00F0FF] text-[#0A0C10] font-display text-sm font-bold uppercase rounded-[4px] hover:shadow-[0_0_16px_rgba(0,240,255,0.45)] disabled:opacity-50 cursor-pointer"
                >
                  {submittingChallenge ? 'Mengirim...' : 'Kirim Tantangan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ROSTER INSPECTOR MODAL */}
      {inspectScrim && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0A0C10]/85 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-xl bg-[#1A202C] border border-white/15 rounded-[8px] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 bg-[#12161F] border-b border-white/[0.08]">
              <h3 className="font-display text-xl font-bold uppercase text-[#F8FAFC]">
                Roster Matchup · {inspectScrim.game}
              </h3>
              <button
                type="button"
                onClick={() => setInspectScrim(null)}
                className="p-1 text-[#94A3B8] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="p-4 bg-[#0A0C10] border border-white/[0.08] rounded-[6px]">
                <div className="font-telemetry text-[10px] uppercase text-[#00F0FF]">HOST TIM A</div>
                <div className="font-display text-lg font-bold uppercase text-[#F8FAFC] mt-0.5">
                  {inspectScrim.hostTeamName}
                </div>
                <div className="mt-3 font-telemetry text-[11px] uppercase text-[#94A3B8]">
                  Roster Inti
                </div>
                <ul className="mt-1 space-y-1 font-telemetry text-xs text-[#F8FAFC]">
                  {inspectScrim.hostRosterCore.length > 0 ? (
                    inspectScrim.hostRosterCore.map((p) => <li key={p}>· {p}</li>)
                  ) : (
                    <li className="text-[#94A3B8]">Belum diisi</li>
                  )}
                </ul>
                {inspectScrim.hostRosterSub.length > 0 && (
                  <>
                    <div className="mt-3 font-telemetry text-[11px] uppercase text-[#94A3B8]">
                      Cadangan
                    </div>
                    <ul className="mt-1 space-y-1 font-telemetry text-xs text-[#94A3B8]">
                      {inspectScrim.hostRosterSub.map((p) => (
                        <li key={p}>· {p}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>

              <div className="p-4 bg-[#0A0C10] border border-white/[0.08] rounded-[6px]">
                <div className="font-telemetry text-[10px] uppercase text-[#FF2E5B]">
                  PENANTANG TIM B
                </div>
                <div className="font-display text-lg font-bold uppercase text-[#F8FAFC] mt-0.5">
                  {inspectScrim.challengerTeamName || 'OPEN SLOT'}
                </div>
                <div className="mt-3 font-telemetry text-[11px] uppercase text-[#94A3B8]">
                  Roster Inti
                </div>
                <ul className="mt-1 space-y-1 font-telemetry text-xs text-[#F8FAFC]">
                  {inspectScrim.challengerRosterCore.length > 0 ? (
                    inspectScrim.challengerRosterCore.map((p) => <li key={p}>· {p}</li>)
                  ) : (
                    <li className="text-[#94A3B8]">Menunggu konfirmasi tim lawan</li>
                  )}
                </ul>
                {inspectScrim.challengerRosterSub.length > 0 && (
                  <>
                    <div className="mt-3 font-telemetry text-[11px] uppercase text-[#94A3B8]">
                      Cadangan
                    </div>
                    <ul className="mt-1 space-y-1 font-telemetry text-xs text-[#94A3B8]">
                      {inspectScrim.challengerRosterSub.map((p) => (
                        <li key={p}>· {p}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* CASTER RESCHEDULE MODAL */}
      {rescheduleTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0A0C10]/85 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md bg-[#12161F] border border-white/15 rounded-[6px] overflow-hidden">
            <div className="px-5 py-4 bg-[#0A0C10] border-b border-white/[0.08] flex items-center justify-between">
              <div>
                <div className="font-telemetry text-[10px] font-bold uppercase tracking-[0.1em] text-amber-300">
                  CASTER RESCHEDULE PROPOSAL
                </div>
                <h3 className="font-display text-lg font-bold uppercase text-[#F8FAFC]">
                  Ajukan Jadwal Ulang Scrim
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setRescheduleTarget(null)}
                className="p-1 text-[#94A3B8] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleRescheduleSubmit} className="p-5 space-y-4">
              <div className="p-3 bg-[#0A0C10] border border-white/[0.08] rounded-[4px] font-telemetry text-xs">
                <div className="text-[#F8FAFC] font-bold">
                  {rescheduleTarget.hostTeamName} VS {rescheduleTarget.challengerTeamName || 'OPEN'}
                </div>
                <div className="text-[#94A3B8] mt-0.5">
                  Jadwal Saat Ini: {rescheduleTarget.date} · {rescheduleTarget.timeSlot}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-telemetry text-[11px] uppercase text-[#94A3B8] mb-1">
                    Tanggal Baru
                  </label>
                  <input
                    type="date"
                    required
                    value={rescheduleDate}
                    onChange={(e) => setRescheduleDate(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0A0C10] border border-white/15 rounded-[4px] font-telemetry text-sm text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                  />
                </div>
                <div>
                  <label className="block font-telemetry text-[11px] uppercase text-[#94A3B8] mb-1">
                    Slot Jam Baru
                  </label>
                  <select
                    value={rescheduleTimeSlot}
                    onChange={(e) => setRescheduleTimeSlot(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0A0C10] border border-white/15 rounded-[4px] font-telemetry text-sm text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                  >
                    {TIME_SLOTS.map((slot) => (
                      <option key={slot} value={slot}>
                        {slot}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-telemetry text-[11px] uppercase text-[#94A3B8] mb-1">
                  Alasan / Catatan Reschedule (Opsional)
                </label>
                <textarea
                  rows={2}
                  maxLength={240}
                  value={rescheduleReason}
                  onChange={(e) => setRescheduleReason(e.target.value)}
                  placeholder="Contoh: Bentrok dengan jadwal siaran turnamen lain..."
                  className="w-full px-3 py-2 bg-[#0A0C10] border border-white/15 rounded-[4px] text-xs text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRescheduleTarget(null)}
                  className="px-4 py-2 border border-white/15 text-[#94A3B8] hover:text-white font-telemetry text-xs uppercase rounded-[4px] cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submittingReschedule}
                  className="px-5 py-2 bg-amber-400 text-[#0A0C10] font-display text-sm font-bold uppercase rounded-[4px] hover:brightness-110 disabled:opacity-50 cursor-pointer"
                >
                  {submittingReschedule ? 'Mengirim...' : 'Kirim Usulan Reschedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TEAM REFUND MODAL (WHEN SCRIM IS REJECTED) */}
      {refundTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0A0C10]/85 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md bg-[#12161F] border border-white/15 rounded-[6px] overflow-hidden">
            <div className="px-5 py-4 bg-[#0A0C10] border-b border-white/[0.08] flex items-center justify-between">
              <div>
                <div className="font-telemetry text-[10px] font-bold uppercase tracking-[0.1em] text-[#FF2E5B]">
                  TEAM REFUND REQUEST
                </div>
                <h3 className="font-display text-lg font-bold uppercase text-[#F8FAFC]">
                  Ajukan Refund Dana Scrim
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setRefundTarget(null)}
                className="p-1 text-[#94A3B8] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleRefundSubmit} className="p-5 space-y-4">
              <div className="p-3 bg-[#0A0C10] border border-[#FF2E5B]/35 rounded-[4px] font-telemetry text-xs space-y-1">
                <div className="text-[#F8FAFC] font-bold">
                  {refundTarget.hostTeamName} VS {refundTarget.challengerTeamName || 'OPEN'}
                </div>
                <div className="text-[#CCFF00] font-bold">
                  Nominal Refund: {formatRupiah(refundTarget.splitCostPerTeam)}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-telemetry text-[11px] uppercase text-[#94A3B8] mb-1">
                    Bank / E-Wallet
                  </label>
                  <select
                    value={refundBank}
                    onChange={(e) => setRefundBank(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0A0C10] border border-white/15 rounded-[4px] font-telemetry text-sm text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                  >
                    {['BCA', 'BRI', 'BNI', 'Mandiri', 'GoPay', 'OVO', 'DANA', 'ShopeePay'].map(
                      (b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      )
                    )}
                  </select>
                </div>
                <div>
                  <label className="block font-telemetry text-[11px] uppercase text-[#94A3B8] mb-1">
                    No. Rekening / E-Wallet
                  </label>
                  <input
                    type="text"
                    required
                    minLength={6}
                    value={refundAccountNumber}
                    onChange={(e) => setRefundAccountNumber(e.target.value)}
                    placeholder="Contoh: 081234567890"
                    className="w-full px-3 py-2 bg-[#0A0C10] border border-white/15 rounded-[4px] font-telemetry text-sm text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                  />
                </div>
              </div>
              <div>
                <label className="block font-telemetry text-[11px] uppercase text-[#94A3B8] mb-1">
                  Nama Pemilik Rekening
                </label>
                <input
                  type="text"
                  required
                  value={refundAccountName}
                  onChange={(e) => setRefundAccountName(e.target.value)}
                  placeholder="Nama sesuai rekening"
                  className="w-full px-3 py-2 bg-[#0A0C10] border border-white/15 rounded-[4px] text-sm text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                />
              </div>
              <div>
                <label className="block font-telemetry text-[11px] uppercase text-[#94A3B8] mb-1">
                  Catatan Refund (Opsional)
                </label>
                <input
                  type="text"
                  maxLength={240}
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0A0C10] border border-white/15 rounded-[4px] text-xs text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRefundTarget(null)}
                  className="px-4 py-2 border border-white/15 text-[#94A3B8] hover:text-white font-telemetry text-xs uppercase rounded-[4px] cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submittingRefund}
                  className="px-5 py-2 bg-[#FF2E5B] text-white font-display text-sm font-bold uppercase rounded-[4px] hover:brightness-110 disabled:opacity-50 cursor-pointer"
                >
                  {submittingRefund ? 'Memproses...' : 'Kirim Pengajuan Refund'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TEAM SPLIT-BILL INVOICE CHECKOUT MODAL */}
      {checkoutTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0A0C10]/85 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto bg-[#12161F] border border-white/15 rounded-[6px]">
            <div className="sticky top-0 z-10 px-5 py-4 bg-[#0A0C10] border-b border-white/[0.08] flex items-center justify-between">
              <div>
                <div className="font-telemetry text-[10px] font-bold uppercase tracking-[0.1em] text-[#00F0FF]">
                  INVOICE {checkoutTarget.payment.invoiceNumber}
                </div>
                <h3 className="font-display text-lg font-bold uppercase text-[#F8FAFC]">
                  Pembayaran Split-Bill Scrim
                </h3>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    generateInvoicePdf(checkoutTarget.payment);
                    onNotify(`Invoice ${checkoutTarget.payment.invoiceNumber}.pdf berhasil diunduh.`);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-[#CCFF00] text-[#0A0C10] hover:brightness-110 font-telemetry text-[10px] font-bold uppercase rounded-[4px] cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  PDF
                </button>
                <button
                  type="button"
                  onClick={() => setCheckoutTarget(null)}
                  className="p-1 text-[#94A3B8] hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-5 space-y-4">
              <div className="p-3.5 bg-[#0A0C10] border border-white/[0.08] rounded-[4px] space-y-1.5 font-telemetry text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[#94A3B8]">Pembayar</span>
                  <span className="font-bold text-[#F8FAFC]">{checkoutTarget.payment.payerName}</span>
                </div>
                {checkoutTarget.payment.gatewayFee ? (
                  <div className="flex items-center justify-between text-[11px] text-[#94A3B8]">
                    <span>Biaya Payment Gateway / MDR</span>
                    <span>+{formatRupiah(checkoutTarget.payment.gatewayFee)}</span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between">
                  <span className="text-[#94A3B8]">Total Tagihan</span>
                  <span className="font-display text-lg font-bold text-[#CCFF00] tabular-nums">
                    {formatRupiah(checkoutTarget.payment.amount)}
                  </span>
                </div>
              </div>

              {checkoutTarget.payment.status === 'REJECTED' && checkoutTarget.payment.validationNote && (
                <div className="p-2.5 bg-[#FF2E5B]/12 border border-[#FF2E5B]/50 rounded-[4px] font-telemetry text-xs text-[#FFDADB]">
                  Catatan Penolakan Admin: {checkoutTarget.payment.validationNote}
                </div>
              )}

              {/* 2-Mode Checkout Tabs */}
              <div className="grid grid-cols-2 bg-[#0A0C10] border border-white/10 rounded-[4px] p-1 gap-1">
                <button
                  type="button"
                  onClick={() => setPayCheckoutTab('GATEWAY')}
                  className={`inline-flex items-center justify-center gap-1.5 py-2 rounded-[3px] font-telemetry text-[11px] font-bold uppercase cursor-pointer ${
                    payCheckoutTab === 'GATEWAY'
                      ? 'bg-[#00F0FF] text-[#0A0C10]'
                      : 'text-[#94A3B8] hover:text-white'
                  }`}
                >
                  <QrCode className="w-3.5 h-3.5" />
                  QRIS Dinamis / VA
                </button>
                <button
                  type="button"
                  onClick={() => setPayCheckoutTab('MANUAL')}
                  className={`inline-flex items-center justify-center gap-1.5 py-2 rounded-[3px] font-telemetry text-[11px] font-bold uppercase cursor-pointer ${
                    payCheckoutTab === 'MANUAL'
                      ? 'bg-[#CCFF00] text-[#0A0C10]'
                      : 'text-[#94A3B8] hover:text-white'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  Transfer Manual + Bukti
                </button>
              </div>

              {payCheckoutTab === 'GATEWAY' ? (
                <div className="space-y-3.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {GATEWAY_CHANNEL_OPTIONS.map((ch) => (
                      <button
                        key={ch.value}
                        type="button"
                        onClick={() => setPayGatewayChannel(ch.value)}
                        className={`p-2.5 text-left rounded-[4px] border transition-colors cursor-pointer ${
                          payGatewayChannel === ch.value
                            ? 'border-[#00F0FF] bg-[#00F0FF]/12 text-[#F8FAFC]'
                            : 'border-white/10 bg-[#0A0C10] text-[#94A3B8] hover:border-white/25'
                        }`}
                      >
                        <div className="font-telemetry text-xs font-bold">{ch.label}</div>
                        <div className="font-telemetry text-[10px] text-[#CCFF00]">{ch.feeNote}</div>
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    disabled={payCreatingGateway}
                    onClick={handleScrimGenerateGateway}
                    className="w-full min-h-[40px] bg-[#00F0FF] text-[#0A0C10] font-display text-xs sm:text-sm font-bold uppercase rounded-[4px] hover:brightness-110 disabled:opacity-50 cursor-pointer"
                  >
                    {payCreatingGateway
                      ? 'Menerbitkan Kode Gateway...'
                      : checkoutTarget.payment.gatewayOrderId
                        ? 'Perbarui Channel / Regenerate QRIS & VA'
                        : 'Generate QRIS Dinamis / Nomor VA'}
                  </button>

                  {checkoutTarget.payment.gatewayOrderId && (
                    <div className="p-3.5 bg-[#0A0C10] border border-[#00F0FF]/35 rounded-[4px] space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 font-telemetry text-[11px]">
                        <span className="text-[#94A3B8]">
                          Order: <strong className="text-[#00F0FF]">{checkoutTarget.payment.gatewayOrderId}</strong>
                        </span>
                        <span className="text-[#CCFF00] font-bold tabular-nums">
                          {formatRupiah(checkoutTarget.payment.amount)}
                        </span>
                      </div>

                      {checkoutTarget.payment.qrPayload && payQrDataUrl && (
                        <div className="flex flex-col sm:flex-row items-center gap-3.5">
                          <img
                            src={payQrDataUrl}
                            alt={`QRIS ${checkoutTarget.payment.invoiceNumber}`}
                            className="w-36 h-36 rounded-[4px] bg-white p-1.5 shrink-0"
                          />
                          <div className="text-xs text-[#CBD5E1] space-y-1">
                            <div className="font-telemetry text-[11px] font-bold uppercase text-[#00F0FF]">
                              QRIS Dinamis BI-SNAP
                            </div>
                            <p>
                              Nominal terkunci otomatis sebesar{' '}
                              <strong className="text-[#CCFF00]">
                                {formatRupiah(checkoutTarget.payment.amount)}
                              </strong>
                              .
                            </p>
                          </div>
                        </div>
                      )}

                      {checkoutTarget.payment.vaNumber && (
                        <div className="p-3 bg-[#12161F] border border-white/10 rounded-[4px] flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="font-telemetry text-[10px] uppercase text-[#94A3B8]">
                              {formatPaymentMethodLabel(checkoutTarget.payment.paymentMethod)}
                            </div>
                            <div className="font-telemetry text-base font-bold tracking-[0.06em] text-[#F8FAFC] tabular-nums">
                              {checkoutTarget.payment.vaNumber}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleScrimCopyVa(checkoutTarget.payment.vaNumber || '')}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-[#00F0FF]/50 text-[#00F0FF] font-telemetry text-[11px] font-bold uppercase rounded-[4px] cursor-pointer"
                          >
                            {payCopiedVa ? (
                              <>
                                <Check className="w-3.5 h-3.5" /> Tersalin
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" /> Salin VA
                              </>
                            )}
                          </button>
                        </div>
                      )}

                      <button
                        type="button"
                        disabled={paySimulatingSandbox}
                        onClick={handleScrimSimulateSandbox}
                        className="w-full min-h-[42px] inline-flex items-center justify-center gap-1.5 bg-[#CCFF00] text-[#0A0C10] font-display text-xs sm:text-sm font-bold uppercase rounded-[4px] hover:brightness-110 disabled:opacity-50 cursor-pointer"
                      >
                        <Zap className="w-4 h-4" />
                        {paySimulatingSandbox
                          ? 'Memproses Settlement...'
                          : 'Simulasikan Bayar Lunas (Sandbox Webhook)'}
                      </button>
                    </div>
                  )}

                  {payError && (
                    <div className="p-2.5 bg-[#FF2E5B]/15 border border-[#FF2E5B] rounded-[4px] font-telemetry text-xs text-[#FFDADB]">
                      {payError}
                    </div>
                  )}
                </div>
              ) : (
                <form onSubmit={handleCheckoutSubmit} className="space-y-4">
                  <div className="p-2.5 bg-[#00F0FF]/[0.06] border border-[#00F0FF]/25 rounded-[4px] font-telemetry text-[11px] text-[#00F0FF]">
                    Escrow ORDAL: QRIS / BCA 8810-2026-88 / Mandiri 131-0020-2688 / E-Wallet 0812-8800-2026
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-telemetry text-[11px] uppercase text-[#94A3B8] mb-1">
                        Metode Pembayaran
                      </label>
                      <select
                        value={payMethod}
                        onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                        className="w-full px-3 py-2 bg-[#0A0C10] border border-white/15 rounded-[4px] font-telemetry text-xs text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                      >
                        {PAYMENT_METHOD_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block font-telemetry text-[11px] uppercase text-[#94A3B8] mb-1">
                        Kode Referensi / No. Transaksi *
                      </label>
                      <input
                        type="text"
                        required
                        minLength={4}
                        value={payReference}
                        onChange={(e) => setPayReference(e.target.value)}
                        placeholder="Contoh: QRIS-8821-ORDAL"
                        className="w-full px-3 py-2 bg-[#0A0C10] border border-white/15 rounded-[4px] font-telemetry text-xs text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-telemetry text-[11px] uppercase text-[#94A3B8] mb-1">
                        Catatan (Opsional)
                      </label>
                      <input
                        type="text"
                        maxLength={240}
                        value={payProofNote}
                        onChange={(e) => setPayProofNote(e.target.value)}
                        placeholder="Misal: Transfer a.n. Kapten"
                        className="w-full px-3 py-2 bg-[#0A0C10] border border-white/15 rounded-[4px] text-xs text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                      />
                    </div>
                    <div>
                      <label className="block font-telemetry text-[11px] uppercase text-[#94A3B8] mb-1">
                        Bukti Transfer (Opsional)
                      </label>
                      <label className="w-full min-h-[36px] px-3 py-2 bg-[#0A0C10] border border-white/15 hover:border-[#00F0FF] rounded-[4px] flex items-center justify-center gap-1.5 font-telemetry text-xs text-[#F8FAFC] cursor-pointer">
                        <Upload className="w-3.5 h-3.5 text-[#00F0FF]" />
                        <span className="truncate">{payProofImage ? 'Ganti Foto' : 'Upload PNG/JPG'}</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={(e) => readImageFile(e.target.files?.[0], setPayProofImage)}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>

                  {payError && (
                    <div className="p-2.5 bg-[#FF2E5B]/15 border border-[#FF2E5B] rounded-[4px] font-telemetry text-xs text-[#FFDADB]">
                      {payError}
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setCheckoutTarget(null)}
                      className="px-4 py-2 border border-white/15 text-[#94A3B8] hover:text-white font-telemetry text-xs uppercase rounded-[4px] cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      disabled={submittingPay}
                      className="px-5 py-2 bg-[#00F0FF] text-[#0A0C10] font-display text-sm font-bold uppercase rounded-[4px] hover:brightness-110 disabled:opacity-50 cursor-pointer"
                    >
                      {submittingPay ? 'Mengirim...' : 'Kirim Konfirmasi Bayar'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* JADWAL CASTER CALENDAR MODAL */}
      <CasterScheduleModal
        open={casterScheduleOpen}
        onClose={() => setCasterScheduleOpen(false)}
        casters={casters}
        scrims={scrims}
        onBookWithCaster={(casterId, pickedDate) => {
          setSelectedCasterId(casterId);
          setDate(pickedDate);
          setCasterScheduleOpen(false);
          setShowBookingForm(true);
          onNotify(`Tanggal ${pickedDate} & caster terpilih siap di Form Booking Scrim.`);
        }}
      />
    </section>
  );
};
