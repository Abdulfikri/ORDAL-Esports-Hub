import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Eye,
  FileText,
  History,
  QrCode,
  Receipt,
  Search,
  ShieldCheck,
  Upload,
  Zap,
  X,
  XCircle,
} from 'lucide-react';
import QRCode from 'qrcode';
import { api } from '../api';
import type {
  AuthUser,
  GatewayChannel,
  PaymentCategory,
  PaymentMethod,
  PaymentRecord,
  PaymentValidationStatus,
  SettlementLedgerBucket,
  SettlementLedgerEntry,
  UserRole,
} from '../types';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { generateInvoicePdf } from '../utils/invoicePdf';
import { formatRupiah } from './ScrimArena';

export const GATEWAY_CHANNEL_OPTIONS: Array<{
  value: GatewayChannel;
  label: string;
  feeNote: string;
}> = [
  { value: 'QRIS_DINAMIS', label: 'QRIS Dinamis (BI-SNAP)', feeNote: 'MDR 0,7% · min Rp 500' },
  { value: 'VA_BCA', label: 'BCA Virtual Account', feeNote: 'Admin +Rp 4.000' },
  { value: 'VA_MANDIRI', label: 'Mandiri Virtual Account', feeNote: 'Admin +Rp 4.000' },
  { value: 'VA_BNI', label: 'BNI Virtual Account', feeNote: 'Admin +Rp 4.000' },
  { value: 'VA_BRI', label: 'BRI Virtual Account (BRIVA)', feeNote: 'Admin +Rp 4.000' },
];

export const PAYMENT_METHOD_OPTIONS: Array<{ value: PaymentMethod; label: string }> = [
  { value: 'QRIS', label: 'QRIS (Instant ORDAL Escrow)' },
  { value: 'TRANSFER_BCA', label: 'Transfer Bank BCA' },
  { value: 'TRANSFER_MANDIRI', label: 'Transfer Bank Mandiri' },
  { value: 'TRANSFER_BNI', label: 'Transfer Bank BNI' },
  { value: 'TRANSFER_BRI', label: 'Transfer Bank BRI' },
  { value: 'GOPAY', label: 'E-Wallet GoPay' },
  { value: 'OVO', label: 'E-Wallet OVO' },
  { value: 'DANA', label: 'E-Wallet DANA' },
  { value: 'SHOPEEPAY', label: 'E-Wallet ShopeePay' },
];

export function formatPaymentMethodLabel(method?: PaymentMethod): string {
  if (!method) return 'Belum Dipilih';
  const vaLabels: Record<string, string> = {
    VA_BCA: 'BCA Virtual Account',
    VA_MANDIRI: 'Mandiri Virtual Account',
    VA_BNI: 'BNI Virtual Account',
    VA_BRI: 'BRI Virtual Account',
  };
  if (vaLabels[method]) return vaLabels[method];
  const found = PAYMENT_METHOD_OPTIONS.find((m) => m.value === method);
  if (found) return found.label;
  if (method === 'INTERNAL_ADMIN') return 'Verifikasi Internal Admin';
  return method;
}

export function maskAccountNumber(accountNumber?: string): string {
  if (!accountNumber) return '-';
  const clean = accountNumber.trim();
  if (clean.length <= 4) return clean;
  return `••••${clean.slice(-4)}`;
}

export function formatPaymentCategoryLabel(category: PaymentCategory): string {
  if (category === 'SCRIM_SPLIT_BILL') return 'Split-Bill Scrim';
  if (category === 'CASTER_PAYOUT') return 'Payout Shoutcaster';
  return 'Refund Dana Scrim';
}

export function getPaymentStatusMeta(status: PaymentValidationStatus) {
  if (status === 'VERIFIED') {
    return {
      label: 'TERVALIDASI LUNAS',
      textClass: 'text-[#00F0FF]',
      borderClass: 'border-[#00F0FF]/40 bg-[#00F0FF]/10',
    };
  }
  if (status === 'PENDING_VALIDATION') {
    return {
      label: 'MENUNGGU VALIDASI',
      textClass: 'text-[#FACC15]',
      borderClass: 'border-[#FACC15]/40 bg-[#FACC15]/10',
    };
  }
  if (status === 'REJECTED') {
    return {
      label: 'DITOLAK / REVISI',
      textClass: 'text-[#FF2E5B]',
      borderClass: 'border-[#FF2E5B]/40 bg-[#FF2E5B]/10',
    };
  }
  if (status === 'EXPIRED') {
    return {
      label: 'KEDALUWARSA',
      textClass: 'text-[#94A3B8]',
      borderClass: 'border-white/20 bg-white/[0.06]',
    };
  }
  return {
    label: 'BELUM DIBAYAR',
    textClass: 'text-[#CCFF00]',
    borderClass: 'border-[#CCFF00]/40 bg-[#CCFF00]/10',
  };
}

export function formatTimestampId(iso?: string): string {
  if (!iso) return '-';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return (
    dt.toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }) + ' WIB'
  );
}

const LEDGER_BUCKET_META: Record<
  SettlementLedgerBucket,
  { label: string; color: string }
> = {
  ESCROW_TEAM: { label: 'Escrow Tim (Net)', color: '#00F0FF' },
  CASTER_PAYABLE: { label: 'Hutang Honor Caster (Net)', color: '#CCFF00' },
  PLATFORM_REVENUE: { label: 'Pendapatan Platform', color: '#38BDF8' },
  PG_FEE_EXPENSE: { label: 'Beban MDR / Biaya PG', color: '#FACC15' },
  REFUND_PAYABLE: { label: 'Kewajiban Refund (Net)', color: '#FF2E5B' },
};

interface PaymentDetailCenterProps {
  role: UserRole;
  payments: PaymentRecord[];
  ledger?: SettlementLedgerEntry[];
  currentUser: AuthUser;
  initialSelectedPaymentId?: string | null;
  onClearInitialSelected?: () => void;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string) => void;
}

export const PaymentDetailCenter: React.FC<PaymentDetailCenterProps> = ({
  role,
  payments,
  ledger = [],
  currentUser,
  initialSelectedPaymentId,
  onClearInitialSelected,
  onRefresh,
  onNotify,
}) => {
  const [subView, setSubView] = useState<'invoices' | 'history' | 'ledger'>('invoices');
  const [statusFilter, setStatusFilter] = useState<'ALL' | PaymentValidationStatus>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | PaymentCategory>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(
    initialSelectedPaymentId || null
  );

  // Automated Indonesian Gateway Checkout state
  const [checkoutTab, setCheckoutTab] = useState<'GATEWAY' | 'MANUAL'>('GATEWAY');
  const [selectedChannel, setSelectedChannel] = useState<GatewayChannel>('QRIS_DINAMIS');
  const [creatingGateway, setCreatingGateway] = useState(false);
  const [simulatingSandbox, setSimulatingSandbox] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copiedVa, setCopiedVa] = useState(false);

  // Team manual submission state
  const [submitMethod, setSubmitMethod] = useState<PaymentMethod>('QRIS');
  const [submitReference, setSubmitReference] = useState('');
  const [submitProofNote, setSubmitProofNote] = useState('');
  const [submitProofImage, setSubmitProofImage] = useState('');
  const [submittingProof, setSubmittingProof] = useState(false);

  // Super Admin validation state
  const [adminRefInput, setAdminRefInput] = useState('');
  const [adminNoteInput, setAdminNoteInput] = useState('');
  const [adminProofImage, setAdminProofImage] = useState('');
  const [validatingDecision, setValidatingDecision] = useState<'APPROVE' | 'REJECT' | null>(null);
  const [modalError, setModalError] = useState('');

  useEffect(() => {
    if (initialSelectedPaymentId) {
      setSelectedPaymentId(initialSelectedPaymentId);
    }
  }, [initialSelectedPaymentId]);

  const selectedPayment = useMemo(
    () => payments.find((p) => p.id === selectedPaymentId) || null,
    [payments, selectedPaymentId]
  );

  useEscapeKey(
    Boolean(selectedPayment) && !creatingGateway && !simulatingSandbox && !submittingProof && !validatingDecision,
    () => setSelectedPaymentId(null)
  );

  useEffect(() => {
    if (!selectedPayment) return;
    setModalError('');
    setCheckoutTab('GATEWAY');
    setSelectedChannel(selectedPayment.gatewayChannel || 'QRIS_DINAMIS');
    setCopiedVa(false);
    setSubmitMethod(selectedPayment.paymentMethod || 'QRIS');
    setSubmitReference(selectedPayment.referenceCode || '');
    setSubmitProofNote(selectedPayment.proofNote || '');
    setSubmitProofImage(selectedPayment.proofImageUrl || '');
    setAdminRefInput(selectedPayment.referenceCode || '');
    setAdminNoteInput(selectedPayment.validationNote || '');
    setAdminProofImage('');
  }, [selectedPayment?.id]);

  useEffect(() => {
    let active = true;
    if (!selectedPayment?.qrPayload) {
      setQrDataUrl('');
      return;
    }
    QRCode.toDataURL(selectedPayment.qrPayload, {
      width: 240,
      margin: 2,
      color: { dark: '#0A0C10', light: '#FFFFFF' },
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setQrDataUrl('');
      });
    return () => {
      active = false;
    };
  }, [selectedPayment?.qrPayload]);

  const closeDetailModal = () => {
    setSelectedPaymentId(null);
    setModalError('');
    onClearInitialSelected?.();
  };

  const handleImageUpload = (file: File | undefined, onDone: (dataUrl: string) => void) => {
    if (!file) return;
    if (file.size > 1.8 * 1024 * 1024) {
      setModalError('Ukuran gambar bukti maksimal 1.8 MB (PNG/JPG/WEBP).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setModalError('');
        onDone(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const filteredPayments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...payments]
      .filter((p) => {
        if (statusFilter !== 'ALL' && p.status !== statusFilter) return false;
        if (categoryFilter !== 'ALL' && p.category !== categoryFilter) return false;
        if (!q) return true;
        const haystack = [
          p.invoiceNumber,
          p.title,
          p.payerName,
          p.receiverName,
          p.referenceCode || '',
          p.game || '',
          p.bankOrWallet || '',
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      })
      .sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime());
  }, [payments, statusFilter, categoryFilter, searchQuery]);

  const flattenedHistory = useMemo(() => {
    const events: Array<{
      id: string;
      timestamp: string;
      action: string;
      actorName: string;
      actorRole: string;
      note: string;
      payment: PaymentRecord;
    }> = [];
    for (const p of filteredPayments) {
      for (const evt of p.history || []) {
        events.push({
          ...evt,
          note: evt.note || '',
          payment: p,
        });
      }
    }
    return events.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [filteredPayments]);

  const kpiStats = useMemo(() => {
    const unpaidCount = payments.filter((p) => p.status === 'UNPAID' || p.status === 'REJECTED').length;
    const pendingCount = payments.filter((p) => p.status === 'PENDING_VALIDATION').length;
    const verifiedTotal = payments
      .filter((p) => p.status === 'VERIFIED')
      .reduce((sum, p) => sum + p.amount, 0);

    if (role === 'CASTER') {
      const honorVerified = payments
        .filter((p) => p.category === 'SCRIM_SPLIT_BILL' && p.status === 'VERIFIED')
        .reduce((sum, p) => sum + p.amount, 0);
      const payoutVerified = payments
        .filter((p) => p.category === 'CASTER_PAYOUT' && p.status === 'VERIFIED')
        .reduce((sum, p) => sum + p.amount, 0);
      return [
        { label: 'Honor Scrim Tervalidasi', value: formatRupiah(honorVerified), color: '#CCFF00' },
        { label: 'Payout Withdraw Lunas', value: formatRupiah(payoutVerified), color: '#00F0FF' },
        { label: 'Menunggu Validasi', value: `${pendingCount} Slip`, color: '#FACC15' },
        { label: 'Total Invoice & Slip', value: `${payments.length} Dokumen`, color: '#F8FAFC' },
      ];
    }

    if (role === 'TEAM') {
      return [
        { label: 'Tagihan Perlu Dibayar', value: `${unpaidCount} Invoice`, color: '#FF2E5B' },
        { label: 'Menunggu Validasi Admin', value: `${pendingCount} Invoice`, color: '#FACC15' },
        { label: 'Total Lunas Tervalidasi', value: formatRupiah(verifiedTotal), color: '#00F0FF' },
        { label: 'Riwayat Transaksi', value: `${payments.length} Invoice`, color: '#F8FAFC' },
      ];
    }

    return [
      { label: 'Perlu Validasi Admin', value: `${pendingCount} Transaksi`, color: '#FACC15' },
      { label: 'Menunggu Pembayaran Tim', value: `${unpaidCount} Invoice`, color: '#FF2E5B' },
      { label: 'Volume Tervalidasi Lunas', value: formatRupiah(verifiedTotal), color: '#00F0FF' },
      { label: 'Total Arsip Invoice', value: `${payments.length} Dokumen`, color: '#F8FAFC' },
    ];
  }, [payments, role]);

  const ledgerSummary = useMemo(() => {
    const netByBucket: Record<SettlementLedgerBucket, number> = {
      ESCROW_TEAM: 0,
      CASTER_PAYABLE: 0,
      PLATFORM_REVENUE: 0,
      PG_FEE_EXPENSE: 0,
      REFUND_PAYABLE: 0,
    };
    for (const entry of ledger) {
      const signed = entry.direction === 'CREDIT' ? entry.amount : -entry.amount;
      netByBucket[entry.accountBucket] = (netByBucket[entry.accountBucket] || 0) + signed;
    }
    return netByBucket;
  }, [ledger]);

  const handleGenerateGateway = async () => {
    if (!selectedPayment) return;
    setModalError('');
    setCreatingGateway(true);
    try {
      await api.createGatewayCheckout(selectedPayment.id, selectedChannel);
      await onRefresh();
      onNotify(
        `Checkout ${selectedChannel === 'QRIS_DINAMIS' ? 'QRIS Dinamis' : selectedChannel.replace('_', ' ')} siap dibayar.`
      );
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Gagal membuat tagihan Payment Gateway.');
    } finally {
      setCreatingGateway(false);
    }
  };

  const handleSimulateSandbox = async () => {
    if (!selectedPayment) return;
    setModalError('');
    setSimulatingSandbox(true);
    try {
      await api.simulateSandboxPayment(selectedPayment.id);
      await onRefresh();
      onNotify(`Settlement otomatis ${selectedPayment.invoiceNumber} berhasil terverifikasi!`);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Gagal menyimulasikan settlement gateway.');
    } finally {
      setSimulatingSandbox(false);
    }
  };

  const handleCopyVa = async (vaNum: string) => {
    try {
      await navigator.clipboard.writeText(vaNum);
      setCopiedVa(true);
      window.setTimeout(() => setCopiedVa(false), 2000);
    } catch {
      onNotify(`Nomor Virtual Account: ${vaNum}`);
    }
  };

  const handleSubmitProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPayment) return;
    const ref = submitReference.trim();
    if (ref.length < 4) {
      setModalError('Masukkan kode referensi / nomor transaksi minimal 4 karakter.');
      return;
    }
    setModalError('');
    setSubmittingProof(true);
    try {
      await api.submitPayment(selectedPayment.id, {
        paymentMethod: submitMethod,
        referenceCode: ref,
        proofNote: submitProofNote.trim() || undefined,
        proofImageUrl: submitProofImage || undefined,
      });
      await onRefresh();
      onNotify(
        `Bukti bayar ${selectedPayment.invoiceNumber} dikirim! Menunggu validasi Super Admin.`
      );
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Gagal mengirim bukti pembayaran.');
    } finally {
      setSubmittingProof(false);
    }
  };

  const handleAdminValidate = async (decision: 'APPROVE' | 'REJECT') => {
    if (!selectedPayment) return;
    if (decision === 'REJECT' && adminNoteInput.trim().length < 4) {
      setModalError('Isi catatan alasan penolakan minimal 4 karakter agar pengguna tahu revisinya.');
      return;
    }
    setModalError('');
    setValidatingDecision(decision);
    try {
      await api.validatePayment(selectedPayment.id, {
        decision,
        referenceCode: adminRefInput.trim() || undefined,
        validationNote: adminNoteInput.trim() || undefined,
        proofImageUrl: adminProofImage || undefined,
      });
      await onRefresh();
      onNotify(
        decision === 'APPROVE'
          ? `Invoice ${selectedPayment.invoiceNumber} berhasil divalidasi LUNAS.`
          : `Invoice ${selectedPayment.invoiceNumber} ditolak. Catatan revisi dikirim ke pengguna.`
      );
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Gagal memvalidasi pembayaran.');
    } finally {
      setValidatingDecision(null);
    }
  };

  const canShowCategoryFilter = role !== 'TEAM' || payments.some((p) => p.category === 'SCRIM_REFUND');

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pb-4 border-b border-white/[0.08]">
        <div>
          <p className="font-telemetry text-[11px] font-bold uppercase tracking-[0.1em] text-[#00F0FF]">
            {role === 'SUPER_ADMIN'
              ? 'PAYMENT GATEWAY, VALIDASI & AUDIT KEUANGAN'
              : role === 'CASTER'
                ? 'SLIP HONOR SCRIM, PAYOUT & HISTORY'
                : 'TAGIHAN INVOICE, KONFIRMASI BAYAR & HISTORY'}
          </p>
          <h1 className="mt-1 font-display text-2xl sm:text-3xl font-bold uppercase text-[#F8FAFC]">
            Detail Pembayaran, Invoice &amp; Validasi
          </h1>
          <p className="text-xs sm:text-sm text-[#94A3B8] mt-1">
            {role === 'SUPER_ADMIN'
              ? 'Periksa bukti transfer tim, validasi payout shoutcaster & refund, serta pantau log histori keuangan secara real-time.'
              : role === 'CASTER'
                ? 'Lihat rincian invoice honor match Anda, status validasi pencairan withdraw, dan histori pembayaran lengkap.'
                : 'Akses rincian invoice patungan scrim, kirim bukti transfer untuk validasi Admin, dan pantau status refund tim.'}
          </p>
        </div>

        {/* Sub-view Tabs */}
        <div className="inline-flex flex-wrap bg-[#12161F] border border-white/[0.08] rounded-[4px] p-1 shrink-0">
          <button
            type="button"
            onClick={() => setSubView('invoices')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[3px] font-telemetry text-xs font-bold uppercase tracking-[0.06em] transition-colors cursor-pointer ${
              subView === 'invoices'
                ? 'bg-[#00F0FF] text-[#0A0C10]'
                : 'text-[#94A3B8] hover:text-[#F8FAFC]'
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            Daftar Invoice ({filteredPayments.length})
          </button>
          <button
            type="button"
            onClick={() => setSubView('history')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[3px] font-telemetry text-xs font-bold uppercase tracking-[0.06em] transition-colors cursor-pointer ${
              subView === 'history'
                ? 'bg-[#CCFF00] text-[#0A0C10]'
                : 'text-[#94A3B8] hover:text-[#F8FAFC]'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            History Payment ({flattenedHistory.length})
          </button>
          <button
            type="button"
            onClick={() => setSubView('ledger')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[3px] font-telemetry text-xs font-bold uppercase tracking-[0.06em] transition-colors cursor-pointer ${
              subView === 'ledger'
                ? 'bg-[#38BDF8] text-[#0A0C10]'
                : 'text-[#94A3B8] hover:text-[#F8FAFC]'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Settlement Ledger ({ledger.length})
          </button>
        </div>
      </div>

      {/* Role KPI Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {kpiStats.map((stat) => (
          <div
            key={stat.label}
            className="p-4 sm:p-5 bg-[#12161F] border border-white/[0.08] rounded-[6px]"
          >
            <div className="font-telemetry text-[11px] uppercase tracking-[0.08em] text-[#94A3B8]">
              {stat.label}
            </div>
            <div
              className="mt-2 font-display text-2xl sm:text-3xl font-bold tabular-nums"
              style={{ color: stat.color }}
            >
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Filter & Search Bar */}
      <div className="p-4 bg-[#12161F] border border-white/[0.08] rounded-[6px] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari no. invoice, nama tim/caster, atau kode referensi..."
            className="w-full pl-9 pr-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-xs text-[#F8FAFC] placeholder:text-[#94A3B8]/60 focus:outline-none focus:border-[#00F0FF]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'ALL' | PaymentValidationStatus)}
            aria-label="Filter Status Pembayaran"
            className="px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-xs text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
          >
            <option value="ALL">Semua Status Validasi</option>
            <option value="UNPAID">Belum Dibayar</option>
            <option value="PENDING_VALIDATION">Menunggu Validasi</option>
            <option value="VERIFIED">Tervalidasi Lunas</option>
            <option value="REJECTED">Ditolak / Revisi</option>
            <option value="EXPIRED">Kedaluwarsa (Expired)</option>
          </select>

          {canShowCategoryFilter && (
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as 'ALL' | PaymentCategory)}
              aria-label="Filter Kategori Pembayaran"
              className="px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-xs text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
            >
              <option value="ALL">Semua Kategori</option>
              <option value="SCRIM_SPLIT_BILL">Split-Bill Scrim</option>
              {role !== 'TEAM' && <option value="CASTER_PAYOUT">Payout Shoutcaster</option>}
              {role !== 'CASTER' && <option value="SCRIM_REFUND">Refund Dana Scrim</option>}
            </select>
          )}
        </div>
      </div>

      {/* VIEW 1: INVOICES & VALIDATION TABLE */}
      {subView === 'invoices' && (
        <>
          {filteredPayments.length === 0 ? (
            <div className="p-10 bg-[#12161F] border border-white/[0.08] rounded-[6px] text-center space-y-2">
              <FileText className="w-8 h-8 text-[#94A3B8] mx-auto opacity-60" />
              <p className="font-telemetry text-xs uppercase tracking-[0.08em] text-[#94A3B8]">
                Belum ada dokumen invoice atau transaksi pembayaran yang sesuai filter.
              </p>
            </div>
          ) : (
            <div className="bg-[#12161F] border border-white/[0.08] rounded-[6px] overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[920px]">
                <thead>
                  <tr className="border-b border-white/[0.08] font-telemetry text-[11px] uppercase tracking-[0.08em] text-[#94A3B8]">
                    <th className="py-3.5 px-4">No. Invoice &amp; Tanggal</th>
                    <th className="py-3.5 px-4">Transaksi &amp; Pihak Terkait</th>
                    <th className="py-3.5 px-4">Nominal</th>
                    <th className="py-3.5 px-4">Metode &amp; Ref</th>
                    <th className="py-3.5 px-4">Status Validasi</th>
                    <th className="py-3.5 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {filteredPayments.map((p) => {
                    const statusMeta = getPaymentStatusMeta(p.status);
                    const needsTeamPay =
                      role === 'TEAM' &&
                      p.category === 'SCRIM_SPLIT_BILL' &&
                      (p.status === 'UNPAID' || p.status === 'REJECTED');
                    const needsAdminValidate =
                      role === 'SUPER_ADMIN' && p.status !== 'VERIFIED' && p.status !== 'EXPIRED';

                    return (
                      <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-3.5 px-4 align-top">
                          <div className="font-telemetry text-xs font-bold text-[#00F0FF] tabular-nums">
                            {p.invoiceNumber}
                          </div>
                          <div className="mt-0.5 font-telemetry text-[10px] uppercase text-[#94A3B8]">
                            {formatPaymentCategoryLabel(p.category)}
                          </div>
                          <div className="mt-1 font-telemetry text-[10px] text-[#94A3B8]">
                            {formatTimestampId(p.issuedAt)}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 align-top max-w-[300px]">
                          <div className="font-display text-sm font-bold uppercase text-[#F8FAFC] leading-snug">
                            {p.title}
                          </div>
                          <div className="mt-1 font-telemetry text-[11px] text-[#94A3B8]">
                            {p.payerName} <span className="text-white/30">→</span>{' '}
                            <span className="text-[#E2E2E8]">{p.receiverName}</span>
                          </div>
                          {p.validationNote && (
                            <div className="mt-1 font-telemetry text-[10px] text-[#FACC15]">
                              Catatan: {p.validationNote}
                            </div>
                          )}
                        </td>

                        <td className="py-3.5 px-4 align-top">
                          <div className="font-display text-lg font-bold text-[#CCFF00] tabular-nums whitespace-nowrap">
                            {formatRupiah(p.amount)}
                          </div>
                          {p.game && (
                            <div className="font-telemetry text-[10px] uppercase text-[#94A3B8]">
                              {p.game}
                            </div>
                          )}
                        </td>

                        <td className="py-3.5 px-4 align-top">
                          <div className="font-telemetry text-xs text-[#F8FAFC]">
                            {p.paymentMethod ? formatPaymentMethodLabel(p.paymentMethod) : p.bankOrWallet || '-'}
                          </div>
                          <div className="mt-0.5 font-telemetry text-[11px] text-[#94A3B8] tabular-nums">
                            {p.referenceCode
                              ? `Ref: ${p.referenceCode}`
                              : p.vaNumber
                                ? `VA: ${p.vaNumber}`
                                : p.accountNumber
                                  ? `Rek: ${maskAccountNumber(p.accountNumber)}`
                                  : 'Menunggu referensi'}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 align-top">
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-[3px] border font-telemetry text-[10px] font-bold uppercase tracking-[0.06em] whitespace-nowrap ${statusMeta.borderClass} ${statusMeta.textClass}`}
                          >
                            {statusMeta.label}
                          </span>
                          {p.validatedAt && (
                            <div className="mt-1 font-telemetry text-[10px] text-[#94A3B8]">
                              {formatTimestampId(p.validatedAt)}
                            </div>
                          )}
                        </td>

                        <td className="py-3.5 px-4 align-top text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-2">
                            {needsTeamPay ? (
                              <button
                                type="button"
                                onClick={() => setSelectedPaymentId(p.id)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#00F0FF] text-[#0A0C10] font-display text-xs font-bold uppercase rounded-[4px] hover:shadow-[0_0_12px_rgba(0,240,255,0.4)] cursor-pointer"
                              >
                                <Upload className="w-3.5 h-3.5" />
                                Bayar &amp; Upload
                              </button>
                            ) : needsAdminValidate ? (
                              <button
                                type="button"
                                onClick={() => setSelectedPaymentId(p.id)}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 font-display text-xs font-bold uppercase rounded-[4px] cursor-pointer ${
                                  p.status === 'PENDING_VALIDATION'
                                    ? 'bg-[#CCFF00] text-[#0A0C10] hover:brightness-110'
                                    : 'bg-[#00F0FF]/15 border border-[#00F0FF]/50 text-[#00F0FF] hover:bg-[#00F0FF]/25'
                                }`}
                              >
                                <ShieldCheck className="w-3.5 h-3.5" />
                                Validasi
                              </button>
                            ) : null}

                            <button
                              type="button"
                              onClick={() => setSelectedPaymentId(p.id)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0A0C10] border border-white/15 hover:border-[#00F0FF] text-[#F8FAFC] hover:text-[#00F0FF] font-telemetry text-[11px] font-bold uppercase rounded-[4px] cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Invoice
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                generateInvoicePdf(p, { hideEscrowChannels: role === 'CASTER' });
                                onNotify(`Invoice ${p.invoiceNumber}.pdf berhasil diunduh.`);
                              }}
                              title="Unduh Invoice PDF"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-[#0A0C10] border border-white/15 hover:border-[#CCFF00] text-[#CCFF00] font-telemetry text-[11px] font-bold uppercase rounded-[4px] cursor-pointer"
                            >
                              <Download className="w-3.5 h-3.5" />
                              PDF
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
        </>
      )}

      {/* VIEW 2: UNIFIED PAYMENT HISTORY LEDGER */}
      {subView === 'history' && (
        <div className="bg-[#12161F] border border-white/[0.08] rounded-[6px] p-5 space-y-3">
          <div className="pb-3 border-b border-white/[0.08] flex items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-bold uppercase text-[#F8FAFC]">
                Audit Trail &amp; History Pembayaran
              </h2>
              <p className="font-telemetry text-[11px] text-[#94A3B8]">
                Kronologi penerbitan invoice, pengiriman bukti transfer, hingga validasi oleh Admin.
              </p>
            </div>
            <span className="font-telemetry text-xs font-bold text-[#CCFF00] tabular-nums">
              {flattenedHistory.length} Aktivitas
            </span>
          </div>

          {flattenedHistory.length === 0 ? (
            <div className="p-8 text-center font-telemetry text-xs text-[#94A3B8]">
              Belum ada histori aktivitas pembayaran yang tercatat.
            </div>
          ) : (
            <div className="space-y-2.5">
              {flattenedHistory.map((evt) => {
                const statusMeta = getPaymentStatusMeta(evt.payment.status);
                const isVerifiedEvt = evt.action === 'PAYMENT_VALIDATED';
                const isRejectedEvt = evt.action === 'PAYMENT_REJECTED';
                return (
                  <div
                    key={evt.id}
                    className="p-3.5 bg-[#0A0C10] border border-white/[0.08] rounded-[4px] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 font-telemetry text-[11px]">
                        <span className="text-[#00F0FF] font-bold">{evt.payment.invoiceNumber}</span>
                        <span className="text-white/25">·</span>
                        <span
                          className={`font-bold uppercase ${
                            isVerifiedEvt
                              ? 'text-[#00F0FF]'
                              : isRejectedEvt
                                ? 'text-[#FF2E5B]'
                                : 'text-[#CCFF00]'
                          }`}
                        >
                          {evt.action.replace(/_/g, ' ')}
                        </span>
                        <span className="text-white/25">·</span>
                        <span className="text-[#94A3B8]">{formatTimestampId(evt.timestamp)}</span>
                      </div>
                      <p className="text-xs text-[#F8FAFC] leading-relaxed">{evt.note}</p>
                      <div className="font-telemetry text-[10px] uppercase text-[#94A3B8]">
                        Aktor: <span className="text-[#E2E2E8]">{evt.actorName}</span> ({evt.actorRole}) ·{' '}
                        <span className="text-[#CCFF00] font-bold tabular-nums">
                          {formatRupiah(evt.payment.amount)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`px-2 py-1 rounded-[3px] border font-telemetry text-[10px] font-bold uppercase ${statusMeta.borderClass} ${statusMeta.textClass}`}
                      >
                        {statusMeta.label}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedPaymentId(evt.payment.id)}
                        className="px-3 py-1.5 border border-white/15 hover:border-[#00F0FF] text-[#F8FAFC] hover:text-[#00F0FF] font-telemetry text-[10px] font-bold uppercase rounded-[4px] cursor-pointer"
                      >
                        Detail
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* VIEW 3: DOUBLE-ENTRY SETTLEMENT LEDGER */}
      {subView === 'ledger' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {(role === 'SUPER_ADMIN'
              ? ([
                  'ESCROW_TEAM',
                  'CASTER_PAYABLE',
                  'PLATFORM_REVENUE',
                  'PG_FEE_EXPENSE',
                  'REFUND_PAYABLE',
                ] as SettlementLedgerBucket[])
              : role === 'CASTER'
                ? (['CASTER_PAYABLE'] as SettlementLedgerBucket[])
                : (['ESCROW_TEAM', 'REFUND_PAYABLE'] as SettlementLedgerBucket[])
            ).map((bucket) => {
              const meta = LEDGER_BUCKET_META[bucket];
              const val =
                bucket === 'PG_FEE_EXPENSE'
                  ? Math.abs(ledgerSummary[bucket])
                  : ledgerSummary[bucket];
              return (
                <div
                  key={bucket}
                  className="p-4 bg-[#12161F] border border-white/[0.08] rounded-[6px]"
                >
                  <div className="font-telemetry text-[10px] uppercase tracking-[0.08em] text-[#94A3B8]">
                    {meta.label}
                  </div>
                  <div
                    className="mt-1.5 font-display text-xl font-bold tabular-nums"
                    style={{ color: meta.color }}
                  >
                    {formatRupiah(val)}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-[#12161F] border border-white/[0.08] rounded-[6px] overflow-x-auto">
            <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-lg font-bold uppercase text-[#F8FAFC]">
                  Mutasi Split Settlement Ledger (Double-Entry)
                </h2>
                <p className="font-telemetry text-[11px] text-[#94A3B8]">
                  Pencatatan otomatis alokasi Escrow Tim, Honor Shoutcaster, Pendapatan Platform, Beban MDR/PG, dan Refund.
                </p>
              </div>
              <span className="font-telemetry text-xs font-bold text-[#00F0FF] tabular-nums">
                {ledger.length} Entri
              </span>
            </div>

            {ledger.length === 0 ? (
              <div className="p-8 text-center font-telemetry text-xs text-[#94A3B8]">
                Belum ada mutasi settlement ledger yang tercatat.
              </div>
            ) : (
              <table className="w-full text-left border-collapse min-w-[820px]">
                <thead>
                  <tr className="border-b border-white/[0.08] font-telemetry text-[11px] uppercase tracking-[0.08em] text-[#94A3B8]">
                    <th className="py-3 px-4">Waktu</th>
                    <th className="py-3 px-4">Invoice</th>
                    <th className="py-3 px-4">Akun Ledger</th>
                    <th className="py-3 px-4">Tipe</th>
                    <th className="py-3 px-4">Nominal</th>
                    <th className="py-3 px-4">Keterangan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {ledger.map((item) => {
                    const bMeta = LEDGER_BUCKET_META[item.accountBucket];
                    return (
                      <tr key={item.id} className="hover:bg-white/[0.02]">
                        <td className="py-3 px-4 font-telemetry text-[11px] text-[#94A3B8] whitespace-nowrap">
                          {formatTimestampId(item.timestamp)}
                        </td>
                        <td className="py-3 px-4 font-telemetry text-xs font-bold text-[#00F0FF] whitespace-nowrap">
                          {item.invoiceNumber}
                        </td>
                        <td className="py-3 px-4 font-telemetry text-[11px] text-[#F8FAFC] whitespace-nowrap">
                          {bMeta?.label || item.accountBucket}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded-[3px] border font-telemetry text-[10px] font-bold uppercase ${
                              item.direction === 'CREDIT'
                                ? 'border-[#00F0FF]/40 bg-[#00F0FF]/10 text-[#00F0FF]'
                                : 'border-[#FF2E5B]/40 bg-[#FF2E5B]/10 text-[#FF2E5B]'
                            }`}
                          >
                            {item.direction}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-display text-base font-bold tabular-nums whitespace-nowrap text-[#CCFF00]">
                          {item.direction === 'DEBIT' ? '-' : '+'}
                          {formatRupiah(item.amount)}
                        </td>
                        <td className="py-3 px-4 text-xs text-[#CBD5E1]">{item.description}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* INVOICE & PAYMENT VALIDATION DETAIL MODAL */}
      {selectedPayment && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0A0C10]/85 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto bg-[#12161F] border border-white/15 rounded-[6px]">
            {/* Modal Header */}
            <div className="sticky top-0 z-10 px-6 py-4 bg-[#0A0C10] border-b border-white/[0.08] flex items-center justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2 font-telemetry text-[11px] uppercase tracking-[0.08em]">
                  <span className="text-[#00F0FF] font-bold">{selectedPayment.invoiceNumber}</span>
                  <span className="text-white/25">·</span>
                  <span className="text-[#94A3B8]">
                    {formatPaymentCategoryLabel(selectedPayment.category)}
                  </span>
                </div>
                <h2 className="mt-0.5 font-display text-xl font-bold uppercase text-[#F8FAFC]">
                  {selectedPayment.title}
                </h2>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    generateInvoicePdf(selectedPayment, {
                      hideEscrowChannels: role === 'CASTER',
                    });
                    onNotify(`Invoice ${selectedPayment.invoiceNumber}.pdf berhasil diunduh.`);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#CCFF00] text-[#0A0C10] hover:brightness-110 font-telemetry text-[11px] font-bold uppercase rounded-[4px] cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Unduh PDF
                </button>
                <button
                  type="button"
                  onClick={closeDetailModal}
                  aria-label="Tutup modal invoice"
                  className="p-1.5 text-[#94A3B8] hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-5">
              {/* Status & Timestamps */}
              {(() => {
                const statusMeta = getPaymentStatusMeta(selectedPayment.status);
                return (
                  <div className="p-4 bg-[#0A0C10] border border-white/[0.08] rounded-[4px] flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="font-telemetry text-[10px] uppercase tracking-[0.08em] text-[#94A3B8]">
                        Status Validasi Pembayaran
                      </div>
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-[3px] border font-telemetry text-xs font-bold uppercase ${statusMeta.borderClass} ${statusMeta.textClass}`}
                      >
                        {selectedPayment.status === 'VERIFIED' ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : selectedPayment.status === 'REJECTED' ? (
                          <XCircle className="w-3.5 h-3.5" />
                        ) : (
                          <Clock className="w-3.5 h-3.5" />
                        )}
                        {statusMeta.label}
                      </span>
                    </div>

                    <div className="text-left sm:text-right font-telemetry text-[11px] text-[#94A3B8] space-y-0.5">
                      <div>Terbit: {formatTimestampId(selectedPayment.issuedAt)}</div>
                      {selectedPayment.dueAt && (
                        <div className="text-[#FACC15]">
                          Batas Bayar: {formatTimestampId(selectedPayment.dueAt)}
                        </div>
                      )}
                      {selectedPayment.validatedAt && (
                        <div className="text-[#00F0FF]">
                          Validasi: {formatTimestampId(selectedPayment.validatedAt)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Billing Parties */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 bg-[#0A0C10] border border-white/[0.08] rounded-[4px] space-y-1">
                  <div className="font-telemetry text-[10px] uppercase tracking-[0.08em] text-[#94A3B8]">
                    Pihak Pembayar (Payer)
                  </div>
                  <div className="font-display text-base font-bold uppercase text-[#F8FAFC]">
                    {selectedPayment.payerName}
                  </div>
                  {selectedPayment.payerEmail && (
                    <div className="font-telemetry text-[11px] text-[#94A3B8]">
                      {selectedPayment.payerEmail}
                    </div>
                  )}
                </div>

                <div className="p-3.5 bg-[#0A0C10] border border-white/[0.08] rounded-[4px] space-y-1">
                  <div className="font-telemetry text-[10px] uppercase tracking-[0.08em] text-[#94A3B8]">
                    Pihak Penerima (Receiver)
                  </div>
                  <div className="font-display text-base font-bold uppercase text-[#00F0FF]">
                    {selectedPayment.receiverName}
                  </div>
                  {selectedPayment.bankOrWallet && (
                    <div className="font-telemetry text-[11px] text-[#CCFF00]">
                      {selectedPayment.bankOrWallet} · {selectedPayment.accountNumber} (
                      {selectedPayment.accountName})
                    </div>
                  )}
                </div>
              </div>

              {/* Itemized Line Items */}
              <div className="bg-[#0A0C10] border border-white/[0.08] rounded-[4px] overflow-hidden">
                <div className="px-4 py-2.5 border-b border-white/[0.08] font-telemetry text-[11px] font-bold uppercase tracking-[0.08em] text-[#94A3B8]">
                  Rincian Tagihan / Invoice
                </div>
                <div className="divide-y divide-white/[0.06]">
                  {selectedPayment.lineItems.map((item, idx) => (
                    <div
                      key={`line-${idx}`}
                      className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs"
                    >
                      <span className="text-[#E2E2E8]">{item.label}</span>
                      <span className="font-telemetry font-bold text-[#F8FAFC] tabular-nums shrink-0">
                        {formatRupiah(item.amount)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="px-4 py-3 bg-[#12161F] border-t border-white/[0.08] flex items-center justify-between gap-3">
                  <span className="font-telemetry text-xs font-bold uppercase tracking-[0.08em] text-[#94A3B8]">
                    Total Invoice
                  </span>
                  <span className="font-display text-2xl font-bold text-[#CCFF00] tabular-nums">
                    {formatRupiah(selectedPayment.amount)}
                  </span>
                </div>
              </div>

              {/* ORDAL Escrow Payment Channels for Unpaid Scrim Split-Bill */}
              {selectedPayment.category === 'SCRIM_SPLIT_BILL' &&
                selectedPayment.status !== 'VERIFIED' &&
                selectedPayment.status !== 'EXPIRED' &&
                role !== 'CASTER' && (
                  <div className="p-4 bg-[#00F0FF]/[0.05] border border-[#00F0FF]/25 rounded-[4px] space-y-2">
                    <div className="font-telemetry text-[11px] font-bold uppercase tracking-[0.08em] text-[#00F0FF]">
                      Rekening Escrow Resmi ORDAL Esports Hub
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-telemetry text-xs text-[#E2E2E8]">
                      <div>QRIS: ORDAL ESPORTS HUB (All E-Wallet/Mobile Banking)</div>
                      <div>BCA: 8810-2026-88 a.n. PT ORDAL ESPORTS</div>
                      <div>Mandiri: 131-0020-2688 a.n. PT ORDAL ESPORTS</div>
                      <div>GoPay/OVO/DANA: 0812-8800-2026 (ORDAL Finance)</div>
                    </div>
                  </div>
                )}

              {/* Existing Proof Preview & Notes */}
              {(selectedPayment.referenceCode ||
                selectedPayment.proofNote ||
                selectedPayment.proofImageUrl ||
                selectedPayment.validationNote) && (
                <div className="p-4 bg-[#0A0C10] border border-white/[0.08] rounded-[4px] space-y-3">
                  <div className="font-telemetry text-[11px] font-bold uppercase tracking-[0.08em] text-[#94A3B8]">
                    Data Bukti &amp; Catatan Validasi
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-telemetry text-xs">
                    <div>
                      <span className="text-[#94A3B8]">Metode: </span>
                      <span className="text-[#F8FAFC] font-semibold">
                        {formatPaymentMethodLabel(selectedPayment.paymentMethod)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#94A3B8]">Referensi: </span>
                      <span className="text-[#00F0FF] font-bold">
                        {selectedPayment.referenceCode || '-'}
                      </span>
                    </div>
                  </div>
                  {selectedPayment.proofNote && (
                    <div className="text-xs text-[#CBD5E1]">
                      <span className="font-telemetry text-[#94A3B8] uppercase">Catatan Pengirim: </span>
                      {selectedPayment.proofNote}
                    </div>
                  )}
                  {selectedPayment.validationNote && (
                    <div
                      className={`p-2.5 rounded-[4px] border text-xs ${
                        selectedPayment.status === 'REJECTED'
                          ? 'bg-[#FF2E5B]/10 border-[#FF2E5B]/40 text-[#FFDADB]'
                          : 'bg-[#00F0FF]/10 border-[#00F0FF]/40 text-[#E2E2E8]'
                      }`}
                    >
                      <span className="font-telemetry font-bold uppercase">Catatan Validator: </span>
                      {selectedPayment.validationNote}
                    </div>
                  )}
                  {selectedPayment.proofImageUrl && (
                    <div className="space-y-1.5">
                      <div className="font-telemetry text-[10px] uppercase text-[#94A3B8]">
                        Lampiran Bukti Transfer
                      </div>
                      <img
                        src={selectedPayment.proofImageUrl}
                        alt={`Bukti ${selectedPayment.invoiceNumber}`}
                        className="max-h-60 rounded-[4px] border border-white/15 object-contain bg-[#12161F]"
                      />
                    </div>
                  )}
                </div>
              )}

              {modalError && (
                <div className="p-3 bg-[#FF2E5B]/15 border border-[#FF2E5B] rounded-[4px] flex items-start gap-2 font-telemetry text-xs text-[#FFDADB]">
                  <AlertTriangle className="w-4 h-4 text-[#FF2E5B] shrink-0 mt-0.5" />
                  <span>{modalError}</span>
                </div>
              )}

              {/* TEAM PAYMENT CHECKOUT (GATEWAY QRIS DINAMIS / VA OR MANUAL UPLOAD) */}
              {role === 'TEAM' &&
                selectedPayment.category === 'SCRIM_SPLIT_BILL' &&
                (selectedPayment.status === 'UNPAID' || selectedPayment.status === 'REJECTED') && (
                  <div className="p-4 bg-[#0A0C10] border border-[#00F0FF]/35 rounded-[4px] space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-telemetry text-xs font-bold uppercase tracking-[0.08em] text-[#00F0FF]">
                        {selectedPayment.status === 'REJECTED'
                          ? 'Pembayaran Ulang / Revisi'
                          : `Pembayaran Split-Bill (${currentUser.teamProfile?.teamName || currentUser.displayName})`}
                      </div>

                      <div className="inline-flex bg-[#12161F] border border-white/10 rounded-[4px] p-0.5">
                        <button
                          type="button"
                          onClick={() => setCheckoutTab('GATEWAY')}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-[3px] font-telemetry text-[10px] font-bold uppercase cursor-pointer ${
                            checkoutTab === 'GATEWAY'
                              ? 'bg-[#00F0FF] text-[#0A0C10]'
                              : 'text-[#94A3B8] hover:text-white'
                          }`}
                        >
                          <QrCode className="w-3 h-3" />
                          Instan (QRIS / VA)
                        </button>
                        <button
                          type="button"
                          onClick={() => setCheckoutTab('MANUAL')}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-[3px] font-telemetry text-[10px] font-bold uppercase cursor-pointer ${
                            checkoutTab === 'MANUAL'
                              ? 'bg-[#CCFF00] text-[#0A0C10]'
                              : 'text-[#94A3B8] hover:text-white'
                          }`}
                        >
                          <Upload className="w-3 h-3" />
                          Manual + Bukti
                        </button>
                      </div>
                    </div>

                    {checkoutTab === 'GATEWAY' ? (
                      <div className="space-y-3.5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {GATEWAY_CHANNEL_OPTIONS.map((ch) => (
                            <button
                              key={ch.value}
                              type="button"
                              onClick={() => setSelectedChannel(ch.value)}
                              className={`p-2.5 text-left rounded-[4px] border transition-colors cursor-pointer ${
                                selectedChannel === ch.value
                                  ? 'border-[#00F0FF] bg-[#00F0FF]/12 text-[#F8FAFC]'
                                  : 'border-white/10 bg-[#12161F] text-[#94A3B8] hover:border-white/25'
                              }`}
                            >
                              <div className="font-telemetry text-xs font-bold">{ch.label}</div>
                              <div className="font-telemetry text-[10px] text-[#CCFF00]">
                                {ch.feeNote}
                              </div>
                            </button>
                          ))}
                        </div>

                        <button
                          type="button"
                          disabled={creatingGateway}
                          onClick={handleGenerateGateway}
                          className="w-full min-h-[40px] bg-[#00F0FF] text-[#0A0C10] font-display text-xs sm:text-sm font-bold uppercase tracking-[0.05em] rounded-[4px] hover:brightness-110 disabled:opacity-50 cursor-pointer"
                        >
                          {creatingGateway
                            ? 'Menerbitkan Kode Pembayaran...'
                            : selectedPayment.gatewayOrderId
                              ? 'Perbarui Channel / Regenerate QRIS & VA'
                              : 'Generate QRIS Dinamis / Nomor VA'}
                        </button>

                        {selectedPayment.gatewayOrderId && (
                          <div className="p-3.5 bg-[#12161F] border border-[#00F0FF]/30 rounded-[4px] space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2 font-telemetry text-[11px]">
                              <span className="text-[#94A3B8]">
                                Order ID:{' '}
                                <strong className="text-[#00F0FF]">
                                  {selectedPayment.gatewayOrderId}
                                </strong>
                              </span>
                              <span className="text-[#CCFF00] font-bold tabular-nums">
                                Total: {formatRupiah(selectedPayment.amount)}
                              </span>
                            </div>

                            {selectedPayment.qrPayload && qrDataUrl && (
                              <div className="flex flex-col sm:flex-row items-center gap-4">
                                <img
                                  src={qrDataUrl}
                                  alt={`QRIS ${selectedPayment.invoiceNumber}`}
                                  className="w-40 h-40 rounded-[4px] bg-white p-1.5 shrink-0"
                                />
                                <div className="space-y-1.5 text-xs text-[#CBD5E1]">
                                  <div className="font-telemetry text-xs font-bold uppercase text-[#00F0FF]">
                                    QRIS Dinamis BI-SNAP Siap Scan
                                  </div>
                                  <p>
                                    Scan menggunakan BCA Mobile, Mandiri Livin&apos;, GoPay, OVO, DANA, atau ShopeePay. Nominal otomatis terkunci sebesar{' '}
                                    <strong className="text-[#CCFF00]">
                                      {formatRupiah(selectedPayment.amount)}
                                    </strong>
                                    .
                                  </p>
                                </div>
                              </div>
                            )}

                            {selectedPayment.vaNumber && (
                              <div className="p-3 bg-[#0A0C10] border border-white/10 rounded-[4px] flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <div className="font-telemetry text-[10px] uppercase text-[#94A3B8]">
                                    Nomor Virtual Account (
                                    {formatPaymentMethodLabel(selectedPayment.paymentMethod)})
                                  </div>
                                  <div className="font-telemetry text-lg font-bold tracking-[0.06em] text-[#F8FAFC] tabular-nums">
                                    {selectedPayment.vaNumber}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleCopyVa(selectedPayment.vaNumber || '')}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-[#00F0FF]/50 text-[#00F0FF] font-telemetry text-xs font-bold uppercase rounded-[4px] hover:bg-[#00F0FF]/10 cursor-pointer"
                                >
                                  {copiedVa ? (
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
                              disabled={simulatingSandbox}
                              onClick={handleSimulateSandbox}
                              className="w-full min-h-[42px] inline-flex items-center justify-center gap-2 bg-[#CCFF00] text-[#0A0C10] font-display text-xs sm:text-sm font-bold uppercase tracking-[0.05em] rounded-[4px] hover:brightness-110 disabled:opacity-50 cursor-pointer"
                            >
                              <Zap className="w-4 h-4" />
                              {simulatingSandbox
                                ? 'Memproses Webhook Settlement...'
                                : 'Simulasikan Bayar Lunas (Sandbox Webhook)'}
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <form onSubmit={handleSubmitProof} className="space-y-3.5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block font-telemetry text-[11px] uppercase text-[#94A3B8] mb-1">
                              Metode Pembayaran
                            </label>
                            <select
                              value={submitMethod}
                              onChange={(e) => setSubmitMethod(e.target.value as PaymentMethod)}
                              className="w-full px-3 py-2 bg-[#12161F] border border-white/15 rounded-[4px] font-telemetry text-xs text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
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
                              value={submitReference}
                              onChange={(e) => setSubmitReference(e.target.value)}
                              placeholder="Contoh: QRIS-20261120-8821"
                              className="w-full px-3 py-2 bg-[#12161F] border border-white/15 rounded-[4px] font-telemetry text-xs text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block font-telemetry text-[11px] uppercase text-[#94A3B8] mb-1">
                              Catatan Pengirim (Opsional)
                            </label>
                            <input
                              type="text"
                              maxLength={240}
                              value={submitProofNote}
                              onChange={(e) => setSubmitProofNote(e.target.value)}
                              placeholder="Misal: Transfer dari rekening kapten"
                              className="w-full px-3 py-2 bg-[#12161F] border border-white/15 rounded-[4px] text-xs text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                            />
                          </div>
                          <div>
                            <label className="block font-telemetry text-[11px] uppercase text-[#94A3B8] mb-1">
                              Upload Bukti Transfer (Opsional)
                            </label>
                            <label className="w-full min-h-[36px] px-3 py-2 bg-[#12161F] border border-white/15 hover:border-[#00F0FF] rounded-[4px] flex items-center justify-center gap-1.5 font-telemetry text-xs text-[#F8FAFC] cursor-pointer">
                              <Upload className="w-3.5 h-3.5 text-[#00F0FF]" />
                              <span className="truncate">
                                {submitProofImage ? 'Ganti Foto Bukti' : 'Pilih PNG / JPG'}
                              </span>
                              <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                onChange={(e) =>
                                  handleImageUpload(e.target.files?.[0], setSubmitProofImage)
                                }
                                className="hidden"
                              />
                            </label>
                          </div>
                        </div>

                        {submitProofImage && (
                          <div className="flex items-center gap-3">
                            <img
                              src={submitProofImage}
                              alt="Preview Bukti Transfer"
                              className="w-16 h-16 object-cover rounded-[4px] border border-white/15"
                            />
                            <button
                              type="button"
                              onClick={() => setSubmitProofImage('')}
                              className="font-telemetry text-[11px] text-[#FF2E5B] hover:underline cursor-pointer"
                            >
                              Hapus Lampiran
                            </button>
                          </div>
                        )}

                        <button
                          type="submit"
                          disabled={submittingProof}
                          className="w-full min-h-[42px] bg-[#00F0FF] text-[#0A0C10] font-display text-sm font-bold uppercase tracking-[0.05em] rounded-[4px] hover:shadow-[0_0_16px_rgba(0,240,255,0.4)] disabled:opacity-50 cursor-pointer"
                        >
                          {submittingProof
                            ? 'Mengirim Bukti Pembayaran...'
                            : 'Kirim Konfirmasi Pembayaran untuk Validasi'}
                        </button>
                      </form>
                    )}
                  </div>
                )}

              {/* SUPER ADMIN VALIDATION PANEL */}
              {role === 'SUPER_ADMIN' &&
                selectedPayment.status !== 'VERIFIED' &&
                selectedPayment.status !== 'EXPIRED' && (
                <div className="p-4 bg-[#0A0C10] border border-[#CCFF00]/40 rounded-[4px] space-y-3.5">
                  <div className="font-telemetry text-xs font-bold uppercase tracking-[0.08em] text-[#CCFF00]">
                    Panel Validasi Super Admin
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-telemetry text-[11px] uppercase text-[#94A3B8] mb-1">
                        Nomor Referensi / Mutasi Bank
                      </label>
                      <input
                        type="text"
                        value={adminRefInput}
                        onChange={(e) => setAdminRefInput(e.target.value)}
                        placeholder="Misal: BCA-MUTASI-20261120"
                        className="w-full px-3 py-2 bg-[#12161F] border border-white/15 rounded-[4px] font-telemetry text-xs text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                      />
                    </div>
                    <div>
                      <label className="block font-telemetry text-[11px] uppercase text-[#94A3B8] mb-1">
                        Lampiran Bukti Admin (Opsional)
                      </label>
                      <label className="w-full min-h-[36px] px-3 py-2 bg-[#12161F] border border-white/15 hover:border-[#00F0FF] rounded-[4px] flex items-center justify-center gap-1.5 font-telemetry text-xs text-[#F8FAFC] cursor-pointer">
                        <Upload className="w-3.5 h-3.5 text-[#CCFF00]" />
                        <span className="truncate">
                          {adminProofImage ? 'Bukti Siap' : 'Upload Bukti Transfer'}
                        </span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={(e) => handleImageUpload(e.target.files?.[0], setAdminProofImage)}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block font-telemetry text-[11px] uppercase text-[#94A3B8] mb-1">
                      Catatan Validasi (Wajib diisi jika menolak pembayaran)
                    </label>
                    <input
                      type="text"
                      maxLength={240}
                      value={adminNoteInput}
                      onChange={(e) => setAdminNoteInput(e.target.value)}
                      placeholder="Contoh: Dana masuk sesuai nominal / Bukti blur mohon unggah ulang"
                      className="w-full px-3 py-2 bg-[#12161F] border border-white/15 rounded-[4px] text-xs text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2.5">
                    <button
                      type="button"
                      disabled={validatingDecision !== null}
                      onClick={() => handleAdminValidate('REJECT')}
                      className="px-4 min-h-[40px] border border-[#FF2E5B]/60 text-[#FF2E5B] hover:bg-[#FF2E5B]/10 font-display text-xs font-bold uppercase rounded-[4px] disabled:opacity-50 cursor-pointer"
                    >
                      {validatingDecision === 'REJECT' ? 'Menolak...' : 'Tolak Pembayaran'}
                    </button>
                    <button
                      type="button"
                      disabled={validatingDecision !== null}
                      onClick={() => handleAdminValidate('APPROVE')}
                      className="px-5 min-h-[40px] bg-[#CCFF00] text-[#0A0C10] hover:brightness-110 font-display text-xs font-bold uppercase rounded-[4px] disabled:opacity-50 cursor-pointer"
                    >
                      {validatingDecision === 'APPROVE'
                        ? 'Memvalidasi...'
                        : 'Validasi Lunas (Approve)'}
                    </button>
                  </div>
                </div>
              )}

              {/* PER-INVOICE PAYMENT HISTORY TIMELINE */}
              <div className="p-4 bg-[#0A0C10] border border-white/[0.08] rounded-[4px] space-y-3">
                <div className="font-telemetry text-[11px] font-bold uppercase tracking-[0.08em] text-[#94A3B8]">
                  History Payment Timeline ({(selectedPayment.history || []).length} Log)
                </div>
                <div className="space-y-2.5">
                  {(selectedPayment.history || []).map((evt) => (
                    <div
                      key={evt.id}
                      className="pb-2.5 last:pb-0 border-b last:border-b-0 border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-1.5"
                    >
                      <div>
                        <div className="flex items-center gap-2 font-telemetry text-[11px]">
                          <span
                            className={`font-bold uppercase ${
                              evt.action === 'PAYMENT_VALIDATED'
                                ? 'text-[#00F0FF]'
                                : evt.action === 'PAYMENT_REJECTED'
                                  ? 'text-[#FF2E5B]'
                                  : 'text-[#CCFF00]'
                            }`}
                          >
                            {evt.action.replace(/_/g, ' ')}
                          </span>
                          <span className="text-white/25">·</span>
                          <span className="text-[#E2E2E8]">{evt.actorName}</span>
                          <span className="text-[#94A3B8]">({evt.actorRole})</span>
                        </div>
                        <p className="mt-0.5 text-xs text-[#CBD5E1]">{evt.note}</p>
                      </div>
                      <span className="font-telemetry text-[10px] text-[#94A3B8] shrink-0">
                        {formatTimestampId(evt.timestamp)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
