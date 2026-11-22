import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Ban,
  CheckCircle2,
  Eye,
  Lock,
  Power,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Users,
  Zap,
} from 'lucide-react';
import { api } from '../api';
import type {
  AuthUser,
  SocEventStatus,
  SocOverviewResponse,
  SocPolicy,
  SocSeverity,
} from '../types';
import { TwoFactorManagerCard } from './TwoFactorManagerCard';

interface SocSecurityPanelProps {
  currentUser: AuthUser;
  onUserUpdated: (user: AuthUser) => void;
  onNotify: (msg: string) => void;
}

const SEVERITY_STYLE: Record<SocSeverity, string> = {
  CRITICAL: 'bg-[#FF2E5B]/20 border-[#FF2E5B] text-[#FF2E5B]',
  HIGH: 'bg-[#F97316]/20 border-[#F97316] text-[#F97316]',
  MEDIUM: 'bg-[#FACC15]/15 border-[#FACC15]/70 text-[#FACC15]',
  LOW: 'bg-[#00F0FF]/12 border-[#00F0FF]/50 text-[#00F0FF]',
};

const STATUS_STYLE: Record<SocEventStatus, string> = {
  OPEN: 'bg-[#FF2E5B]/15 text-[#FF2E5B] border-[#FF2E5B]/40',
  ACKNOWLEDGED: 'bg-[#FACC15]/15 text-[#FACC15] border-[#FACC15]/40',
  RESOLVED: 'bg-[#CCFF00]/15 text-[#CCFF00] border-[#CCFF00]/40',
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

export const SocSecurityPanel: React.FC<SocSecurityPanelProps> = ({
  currentUser,
  onUserUpdated,
  onNotify,
}) => {
  const [data, setData] = useState<SocOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  // Incident filters
  const [severityFilter, setSeverityFilter] = useState<'ALL' | SocSeverity>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | SocEventStatus>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Manual IP block form
  const [blockIpInput, setBlockIpInput] = useState('');
  const [blockReasonInput, setBlockReasonInput] = useState('');
  const [blockDurationInput, setBlockDurationInput] = useState<string>('60');

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getSocOverview();
      setData(res);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal memuat data SOC Security.');
    } finally {
      setLoading(false);
    }
  }, [onNotify]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const filteredEvents = useMemo(() => {
    if (!data) return [];
    const q = searchQuery.trim().toLowerCase();
    return data.events.filter((ev) => {
      if (severityFilter !== 'ALL' && ev.severity !== severityFilter) return false;
      if (statusFilter !== 'ALL' && ev.status !== statusFilter) return false;
      if (q) {
        const hay = [
          ev.ip,
          ev.path,
          ev.category,
          ev.summary,
          ev.details || '',
          ev.actorEmail || '',
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, severityFilter, statusFilter, searchQuery]);

  const handleTogglePolicy = async (patch: Partial<SocPolicy>) => {
    setBusyAction('policy');
    try {
      await api.updateSocPolicy(patch);
      await fetchOverview();
      onNotify('Kebijakan proteksi SOC berhasil diperbarui.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal memperbarui kebijakan SOC.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleEventStatus = async (eventId: string, nextStatus: SocEventStatus) => {
    setBusyAction(eventId);
    try {
      await api.updateSocEventStatus(eventId, nextStatus);
      await fetchOverview();
      onNotify(`Status insiden diperbarui ke ${nextStatus}.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal memperbarui status insiden.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleManualBlockIp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!blockIpInput.trim()) return;
    setBusyAction('block-ip');
    try {
      const durationMinutes =
        blockDurationInput === 'permanent' ? null : Number(blockDurationInput) || 60;
      await api.blockSocIp({
        ip: blockIpInput.trim(),
        reason: blockReasonInput.trim() || 'Diblokir manual oleh Super Admin SOC',
        durationMinutes,
      });
      setBlockIpInput('');
      setBlockReasonInput('');
      await fetchOverview();
      onNotify(`IP ${blockIpInput.trim()} berhasil ditambahkan ke daftar blokir SOC.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal memblokir IP.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleQuickBlockIp = async (ip: string, reason: string) => {
    setBusyAction(`block-${ip}`);
    try {
      await api.blockSocIp({ ip, reason, durationMinutes: 60 });
      await fetchOverview();
      onNotify(`IP ${ip} diblokir selama 60 menit.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal memblokir IP.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleUnblockIp = async (ip: string) => {
    setBusyAction(`unblock-${ip}`);
    try {
      await api.unblockSocIp(ip);
      await fetchOverview();
      onNotify(`IP ${ip} dibuka kembali dari daftar blokir.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal membuka blokir IP.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleRevokeOtherSessions = async () => {
    setBusyAction('revoke-sessions');
    try {
      const res = await api.revokeAllOtherSocSessions();
      await fetchOverview();
      onNotify(`Kill Switch aktif: ${res.revokedCount} sesi pengguna lain berhasil dicabut.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal mencabut sesi aktif.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleRunSelfTest = async () => {
    setBusyAction('self-test');
    try {
      const res = await api.runSocSelfTest();
      await fetchOverview();
      onNotify(res.message);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal menjalankan SOC Self-Test.');
    } finally {
      setBusyAction(null);
    }
  };

  if (loading && !data) {
    return (
      <div className="p-10 bg-[#12161F] border border-white/[0.08] rounded-[6px] text-center font-telemetry text-xs text-[#94A3B8]">
        Memuat telemetri SOC Security Operations Center...
      </div>
    );
  }

  if (!data) return null;

  const threatColor =
    data.threatLevel === 'CRITICAL'
      ? 'bg-[#FF2E5B]/15 border-[#FF2E5B] text-[#FF2E5B]'
      : data.threatLevel === 'ELEVATED'
        ? 'bg-[#FACC15]/15 border-[#FACC15] text-[#FACC15]'
        : 'bg-[#CCFF00]/15 border-[#CCFF00] text-[#CCFF00]';

  return (
    <div className="space-y-6">
      {/* Top SOC Command Header */}
      <div className="p-5 bg-[#12161F] border border-white/[0.08] rounded-[6px] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] bg-[#00F0FF]/12 border border-[#00F0FF]/40 font-telemetry text-[11px] font-bold uppercase tracking-[0.08em] text-[#00F0FF]">
              <Shield className="w-3.5 h-3.5" />
              SOC SECURITY PATCH ACTIVE
            </span>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] border font-telemetry text-[11px] font-bold uppercase tracking-[0.08em] ${threatColor}`}
            >
              <Activity className="w-3.5 h-3.5" />
              THREAT LEVEL: {data.threatLevel}
            </span>
            <span className="px-2.5 py-1 rounded-[4px] bg-white/[0.05] border border-white/10 font-telemetry text-[11px] font-bold text-[#F8FAFC]">
              POSTURE SCORE: <span className="text-[#CCFF00]">{data.securityScore}/100</span>
            </span>
          </div>
          <h1 className="font-display text-2xl font-bold uppercase text-[#F8FAFC]">
            Security Operations Center (SOC)
          </h1>
          <p className="text-xs text-[#94A3B8]">
            Deteksi WAF (XSS, SQLi, Traversal, Prototype Pollution), Brute-Force Auto-Ban, IP Blocklist, dan Kill Switch Sesi secara real-time.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={handleRunSelfTest}
            className="inline-flex items-center gap-1.5 px-3.5 min-h-[40px] bg-[#00F0FF]/12 border border-[#00F0FF]/50 text-[#00F0FF] hover:bg-[#00F0FF]/20 font-telemetry text-xs font-bold uppercase rounded-[4px] transition-colors cursor-pointer"
          >
            <Zap className="w-3.5 h-3.5" />
            Uji Sensor SOC
          </button>
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={handleRevokeOtherSessions}
            className="inline-flex items-center gap-1.5 px-3.5 min-h-[40px] bg-[#FF2E5B]/15 border border-[#FF2E5B]/60 text-[#FF2E5B] hover:bg-[#FF2E5B]/25 font-telemetry text-xs font-bold uppercase rounded-[4px] transition-colors cursor-pointer"
          >
            <Power className="w-3.5 h-3.5" />
            Cabut Semua Sesi Lain
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={fetchOverview}
            className="inline-flex items-center gap-1.5 px-3 min-h-[40px] bg-[#0A0C10] border border-white/15 text-[#94A3B8] hover:text-white font-telemetry text-xs uppercase rounded-[4px] cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-[#12161F] border border-white/[0.08] rounded-[6px]">
          <div className="font-telemetry text-[11px] uppercase tracking-[0.08em] text-[#94A3B8] flex items-center justify-between">
            <span>Open Alerts</span>
            <ShieldAlert className="w-4 h-4 text-[#FF2E5B]" />
          </div>
          <div className="mt-2 font-display text-3xl font-bold text-[#FF2E5B] tabular-nums">
            {data.summary.openAlerts}
          </div>
          <div className="mt-1 font-telemetry text-[10px] text-[#94A3B8]">
            {data.summary.criticalOpen} Critical · {data.summary.highOpen} High
          </div>
        </div>

        <div className="p-4 bg-[#12161F] border border-white/[0.08] rounded-[6px]">
          <div className="font-telemetry text-[11px] uppercase tracking-[0.08em] text-[#94A3B8] flex items-center justify-between">
            <span>WAF Blocks</span>
            <ShieldCheck className="w-4 h-4 text-[#00F0FF]" />
          </div>
          <div className="mt-2 font-display text-3xl font-bold text-[#00F0FF] tabular-nums">
            {data.summary.wafBlocksTotal}
          </div>
          <div className="mt-1 font-telemetry text-[10px] text-[#94A3B8]">
            {data.summary.eventsLast24h} event dalam 24 jam
          </div>
        </div>

        <div className="p-4 bg-[#12161F] border border-white/[0.08] rounded-[6px]">
          <div className="font-telemetry text-[11px] uppercase tracking-[0.08em] text-[#94A3B8] flex items-center justify-between">
            <span>Blocked IPs</span>
            <Ban className="w-4 h-4 text-[#FACC15]" />
          </div>
          <div className="mt-2 font-display text-3xl font-bold text-[#FACC15] tabular-nums">
            {data.summary.blockedIpsCount}
          </div>
          <div className="mt-1 font-telemetry text-[10px] text-[#94A3B8]">
            Manual &amp; Auto-Ban aktif
          </div>
        </div>

        <div className="p-4 bg-[#12161F] border border-white/[0.08] rounded-[6px]">
          <div className="font-telemetry text-[11px] uppercase tracking-[0.08em] text-[#94A3B8] flex items-center justify-between">
            <span>Active Sessions</span>
            <Users className="w-4 h-4 text-[#CCFF00]" />
          </div>
          <div className="mt-2 font-display text-3xl font-bold text-[#CCFF00] tabular-nums">
            {data.summary.activeSessionsCount}
          </div>
          <div className="mt-1 font-telemetry text-[10px] text-[#94A3B8]">
            Token login aktif saat ini
          </div>
        </div>
      </div>

      {/* SOC Policy & Protection Switches */}
      <div className="p-5 bg-[#12161F] border border-white/[0.08] rounded-[6px] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/[0.08]">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-[#00F0FF]" />
            <h2 className="font-display text-lg font-bold uppercase text-[#F8FAFC]">
              Kebijakan Proteksi SOC (Live Patch Controls)
            </h2>
          </div>
          <span className="font-telemetry text-[11px] text-[#94A3B8]">
            Perubahan langsung aktif di middleware server
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {(
            [
              {
                key: 'wafEnabled' as const,
                label: 'WAF Payload Filter',
                desc: 'Blokir XSS, SQLi, NoSQLi, Traversal & Proto Pollution',
              },
              {
                key: 'autoBlockEnabled' as const,
                label: 'Auto-Ban Brute Force',
                desc: `Blokir IP otomatis setelah ${data.policy.bruteForceThreshold}x gagal login`,
              },
              {
                key: 'alertOnRbacViolation' as const,
                label: 'RBAC Escalation Alert',
                desc: 'Catat insiden setiap percobaan akses role ilegal (403)',
              },
              {
                key: 'strictApiHeaders' as const,
                label: 'Strict API Headers',
                desc: 'CORP same-origin, nosniff & policy hardening',
              },
            ] as const
          ).map((item) => {
            const enabled = data.policy[item.key];
            return (
              <button
                key={item.key}
                type="button"
                disabled={busyAction === 'policy'}
                onClick={() => handleTogglePolicy({ [item.key]: !enabled })}
                className={`p-3.5 rounded-[5px] border text-left transition-all cursor-pointer ${
                  enabled
                    ? 'bg-[#00F0FF]/[0.08] border-[#00F0FF]/50'
                    : 'bg-[#0A0C10] border-white/10 opacity-75'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-telemetry text-xs font-bold uppercase text-[#F8FAFC]">
                    {item.label}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-[3px] font-telemetry text-[10px] font-bold uppercase ${
                      enabled
                        ? 'bg-[#CCFF00]/20 text-[#CCFF00]'
                        : 'bg-[#FF2E5B]/20 text-[#FF2E5B]'
                    }`}
                  >
                    {enabled ? 'ON' : 'OFF'}
                  </span>
                </div>
                <p className="mt-1.5 font-telemetry text-[11px] text-[#94A3B8] leading-snug">
                  {item.desc}
                </p>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-4 pt-1 font-telemetry text-xs text-[#94A3B8]">
          <label className="inline-flex items-center gap-2">
            <span>Threshold Brute-Force:</span>
            <select
              value={data.policy.bruteForceThreshold}
              disabled={busyAction === 'policy'}
              onChange={(e) =>
                handleTogglePolicy({ bruteForceThreshold: Number(e.target.value) })
              }
              className="px-2.5 py-1 bg-[#0A0C10] border border-white/15 rounded-[4px] text-[#F8FAFC]"
            >
              {[3, 5, 7, 10].map((v) => (
                <option key={v} value={v}>
                  {v}x gagal / 10 mnt
                </option>
              ))}
            </select>
          </label>

          <label className="inline-flex items-center gap-2">
            <span>Durasi Auto-Ban:</span>
            <select
              value={data.policy.autoBlockDurationMinutes}
              disabled={busyAction === 'policy'}
              onChange={(e) =>
                handleTogglePolicy({ autoBlockDurationMinutes: Number(e.target.value) })
              }
              className="px-2.5 py-1 bg-[#0A0C10] border border-white/15 rounded-[4px] text-[#F8FAFC]"
            >
              {[15, 30, 60, 180, 1440].map((m) => (
                <option key={m} value={m}>
                  {m === 1440 ? '24 Jam' : `${m} Menit`}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* Super Admin 2FA Authenticator Card */}
      <TwoFactorManagerCard
        user={currentUser}
        onUserUpdated={(next) => {
          onUserUpdated(next);
          void fetchOverview();
        }}
        onNotify={onNotify}
      />

      {/* Production Security Readiness Checklist */}
      {data.productionChecklist && data.productionChecklist.length > 0 && (
        <div className="p-5 bg-[#12161F] border border-white/[0.08] rounded-[6px] space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/[0.08]">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#CCFF00]" />
              <h2 className="font-display text-lg font-bold uppercase text-[#F8FAFC]">
                Checklist Penguatan Produksi
              </h2>
            </div>
            <span className="font-telemetry text-[11px] text-[#94A3B8]">
              {data.productionChecklist.filter((c) => c.status === 'READY').length}/
              {data.productionChecklist.length} kontrol siap produksi
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.productionChecklist.map((chk) => {
              const badgeCls =
                chk.status === 'READY'
                  ? 'bg-[#CCFF00]/15 text-[#CCFF00] border-[#CCFF00]/40'
                  : chk.status === 'ACTION_REQUIRED'
                    ? 'bg-[#FF2E5B]/15 text-[#FF2E5B] border-[#FF2E5B]/45'
                    : 'bg-[#00F0FF]/12 text-[#00F0FF] border-[#00F0FF]/35';
              const badgeLabel =
                chk.status === 'READY'
                  ? 'SIAP'
                  : chk.status === 'ACTION_REQUIRED'
                    ? 'PERLU KONFIGURASI'
                    : 'OPSIONAL';
              return (
                <div
                  key={chk.id}
                  className="p-3.5 bg-[#0A0C10] border border-white/[0.08] rounded-[5px] space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-telemetry text-xs font-bold text-[#F8FAFC]">
                      {chk.label}
                    </span>
                    <span
                      className={`px-2 py-0.5 border rounded-[3px] font-telemetry text-[9px] font-bold uppercase shrink-0 ${badgeCls}`}
                    >
                      {badgeLabel}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#94A3B8] leading-snug">{chk.detail}</p>
                  {chk.envVar && (
                    <div className="font-telemetry text-[10px] text-[#64748B] truncate">
                      Env: {chk.envVar}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Live SIEM Incident Feed */}
      <div className="p-5 bg-[#12161F] border border-white/[0.08] rounded-[6px] space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-white/[0.08]">
          <div>
            <h2 className="font-display text-lg font-bold uppercase text-[#F8FAFC]">
              Log Insiden &amp; Deteksi Ancaman (SIEM Feed)
            </h2>
            <p className="text-xs text-[#94A3B8]">
              Menampilkan {filteredEvents.length} dari {data.events.length} event keamanan tercatat.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#94A3B8] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari IP / endpoint / pesan..."
                className="pl-8 pr-3 py-1.5 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-xs text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
              />
            </div>

            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as 'ALL' | SocSeverity)}
              className="px-2.5 py-1.5 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-xs text-[#F8FAFC]"
            >
              <option value="ALL">Semua Severity</option>
              <option value="CRITICAL">CRITICAL</option>
              <option value="HIGH">HIGH</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="LOW">LOW</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'ALL' | SocEventStatus)}
              className="px-2.5 py-1.5 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-xs text-[#F8FAFC]"
            >
              <option value="ALL">Semua Status</option>
              <option value="OPEN">OPEN</option>
              <option value="ACKNOWLEDGED">ACKNOWLEDGED</option>
              <option value="RESOLVED">RESOLVED</option>
            </select>
          </div>
        </div>

        <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
          {filteredEvents.length === 0 ? (
            <div className="p-8 bg-[#0A0C10] border border-white/[0.06] rounded-[4px] text-center font-telemetry text-xs text-[#94A3B8]">
              Tidak ada insiden keamanan yang cocok dengan filter.
            </div>
          ) : (
            filteredEvents.map((ev) => {
              const canBlockThisIp =
                ev.ip &&
                ev.ip !== 'system' &&
                ev.ip !== 'unknown' &&
                ev.ip !== '127.0.0.1' &&
                ev.ip !== '::1';
              return (
                <div
                  key={ev.id}
                  className="p-3.5 bg-[#0A0C10] border border-white/[0.08] rounded-[5px] flex flex-col lg:flex-row lg:items-center justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 font-telemetry text-[10px] font-bold uppercase">
                      <span className={`px-2 py-0.5 rounded-[3px] border ${SEVERITY_STYLE[ev.severity]}`}>
                        {ev.severity}
                      </span>
                      <span className="px-2 py-0.5 rounded-[3px] bg-white/[0.06] text-[#CBD5E1]">
                        {ev.category}
                      </span>
                      <span className={`px-2 py-0.5 rounded-[3px] border ${STATUS_STYLE[ev.status]}`}>
                        {ev.status}
                      </span>
                      <span className="text-[#94A3B8]">{formatTime(ev.timestamp)}</span>
                    </div>

                    <div className="text-sm font-semibold text-[#F8FAFC]">{ev.summary}</div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-telemetry text-[11px] text-[#94A3B8]">
                      <span>
                        IP: <span className="text-[#00F0FF]">{ev.ip}</span>
                      </span>
                      <span>
                        Endpoint: <span className="text-[#F8FAFC]">{ev.method} {ev.path}</span>
                      </span>
                      {ev.actorEmail && (
                        <span>
                          Actor: <span className="text-[#CCFF00]">{ev.actorEmail}</span>
                        </span>
                      )}
                    </div>

                    {ev.details && (
                      <div className="font-telemetry text-[11px] text-[#64748B] truncate">
                        {ev.details}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    {ev.status === 'OPEN' && (
                      <button
                        type="button"
                        disabled={busyAction === ev.id}
                        onClick={() => handleEventStatus(ev.id, 'ACKNOWLEDGED')}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-[#FACC15]/15 border border-[#FACC15]/40 text-[#FACC15] font-telemetry text-[10px] font-bold uppercase rounded-[4px] hover:bg-[#FACC15]/25 cursor-pointer"
                      >
                        <Eye className="w-3 h-3" />
                        Ack
                      </button>
                    )}
                    {ev.status !== 'RESOLVED' && (
                      <button
                        type="button"
                        disabled={busyAction === ev.id}
                        onClick={() => handleEventStatus(ev.id, 'RESOLVED')}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-[#CCFF00]/15 border border-[#CCFF00]/40 text-[#CCFF00] font-telemetry text-[10px] font-bold uppercase rounded-[4px] hover:bg-[#CCFF00]/25 cursor-pointer"
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        Resolve
                      </button>
                    )}
                    {canBlockThisIp && (
                      <button
                        type="button"
                        disabled={busyAction === `block-${ev.ip}`}
                        onClick={() =>
                          handleQuickBlockIp(ev.ip, `Blokir dari insiden ${ev.category}: ${ev.summary}`)
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-[#FF2E5B]/15 border border-[#FF2E5B]/45 text-[#FF2E5B] font-telemetry text-[10px] font-bold uppercase rounded-[4px] hover:bg-[#FF2E5B]/25 cursor-pointer"
                      >
                        <Ban className="w-3 h-3" />
                        Blokir IP
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Bottom Grid: IP Blocklist Manager + Active Sessions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* IP Blocklist */}
        <div className="lg:col-span-6 p-5 bg-[#12161F] border border-white/[0.08] rounded-[6px] space-y-4">
          <div className="pb-3 border-b border-white/[0.08] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[#FF2E5B]" />
              <h2 className="font-display text-lg font-bold uppercase text-[#F8FAFC]">
                IP Blocklist Firewall
              </h2>
            </div>
            <span className="font-telemetry text-xs text-[#94A3B8]">
              {data.blockedIps.length} IP diblokir
            </span>
          </div>

          <form onSubmit={handleManualBlockIp} className="grid grid-cols-1 sm:grid-cols-12 gap-2">
            <input
              type="text"
              required
              value={blockIpInput}
              onChange={(e) => setBlockIpInput(e.target.value)}
              placeholder="IP target (mis. 203.0.113.42)"
              className="sm:col-span-4 px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-xs text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
            />
            <input
              type="text"
              value={blockReasonInput}
              onChange={(e) => setBlockReasonInput(e.target.value)}
              placeholder="Alasan blokir"
              className="sm:col-span-4 px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-xs text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
            />
            <select
              value={blockDurationInput}
              onChange={(e) => setBlockDurationInput(e.target.value)}
              className="sm:col-span-2 px-2 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-xs text-[#F8FAFC]"
            >
              <option value="30">30m</option>
              <option value="60">1 Jam</option>
              <option value="1440">24 Jam</option>
              <option value="permanent">Permanen</option>
            </select>
            <button
              type="submit"
              disabled={busyAction === 'block-ip'}
              className="sm:col-span-2 py-2 px-3 bg-[#FF2E5B] text-white font-display text-xs font-bold uppercase rounded-[4px] hover:brightness-110 cursor-pointer"
            >
              Blokir
            </button>
          </form>

          {data.blockedIps.length === 0 ? (
            <div className="p-6 bg-[#0A0C10] border border-white/[0.06] rounded-[4px] text-center font-telemetry text-xs text-[#94A3B8]">
              Belum ada IP yang diblokir saat ini.
            </div>
          ) : (
            <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
              {data.blockedIps.map((b) => (
                <div
                  key={b.ip}
                  className="p-3 bg-[#0A0C10] border border-[#FF2E5B]/35 rounded-[4px] flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 font-telemetry text-xs space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[#FF2E5B]">{b.ip}</span>
                      <span className="px-1.5 py-0.5 rounded-[3px] bg-white/[0.06] text-[10px] text-[#CBD5E1]">
                        {b.autoBlocked ? 'AUTO-BAN' : 'MANUAL'}
                      </span>
                      <span className="text-[10px] text-[#94A3B8]">{b.hits} hits diblokir</span>
                    </div>
                    <div className="text-[11px] text-[#CBD5E1] truncate">{b.reason}</div>
                    <div className="text-[10px] text-[#64748B]">
                      Oleh {b.blockedBy} ·{' '}
                      {b.expiresAt ? `Berakhir: ${formatTime(b.expiresAt)}` : 'Permanen'}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busyAction === `unblock-${b.ip}`}
                    onClick={() => handleUnblockIp(b.ip)}
                    className="p-2 text-[#94A3B8] hover:text-[#CCFF00] cursor-pointer shrink-0"
                    title={`Unblock ${b.ip}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Active Sessions */}
        <div className="lg:col-span-6 p-5 bg-[#12161F] border border-white/[0.08] rounded-[6px] space-y-4">
          <div className="pb-3 border-b border-white/[0.08] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-[#00F0FF]" />
              <h2 className="font-display text-lg font-bold uppercase text-[#F8FAFC]">
                Monitor Sesi Aktif
              </h2>
            </div>
            <span className="font-telemetry text-xs text-[#94A3B8]">
              {data.activeSessions.length} sesi online
            </span>
          </div>

          <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
            {data.activeSessions.length === 0 ? (
              <div className="p-6 bg-[#0A0C10] border border-white/[0.06] rounded-[4px] text-center font-telemetry text-xs text-[#94A3B8]">
                Tidak ada sesi aktif.
              </div>
            ) : (
              data.activeSessions.map((sess) => (
                <div
                  key={sess.tokenPrefix + sess.userId}
                  className="p-3 bg-[#0A0C10] border border-white/[0.08] rounded-[4px] flex items-center justify-between gap-3 font-telemetry text-xs"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[#F8FAFC] truncate">{sess.displayName}</span>
                      <span className="px-1.5 py-0.5 rounded-[3px] bg-[#00F0FF]/12 text-[#00F0FF] text-[10px] font-bold">
                        {sess.role}
                      </span>
                      {sess.isCurrent && (
                        <span className="px-1.5 py-0.5 rounded-[3px] bg-[#CCFF00]/15 text-[#CCFF00] text-[10px] font-bold">
                          SESI ANDA
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-[#94A3B8] truncate">{sess.email}</div>
                    <div className="text-[10px] text-[#64748B]">
                      Token: {sess.tokenPrefix} · Exp: {formatTime(sess.expiresAt)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
