import React, { useEffect, useMemo, useState } from 'react';
import {
  FileJson,
  FileSpreadsheet,
  GitBranch,
  Image as ImageIcon,
  LayoutTemplate,
  Lock,
  Mic,
  Receipt,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trophy,
  UserCog,
  Users,
} from 'lucide-react';
import { api } from '../api';
import type {
  AuditAction,
  AuditIntegrityReport,
  AuditLogEntry,
  AuditResource,
  OrdalDatabase,
} from '../types';

interface AuditLogPanelProps {
  db: OrdalDatabase;
  onNotify: (msg: string) => void;
}

const RESOURCE_META: Record<
  AuditResource,
  { label: string; colorClass: string; icon: React.ComponentType<{ className?: string }> }
> = {
  TOURNAMENT: {
    label: 'Turnamen',
    colorClass: 'bg-[#00F0FF]/12 text-[#00F0FF] border-[#00F0FF]/35',
    icon: Trophy,
  },
  MATCH: {
    label: 'Match & Bracket',
    colorClass: 'bg-[#FF2E5B]/12 text-[#FF2E5B] border-[#FF2E5B]/35',
    icon: GitBranch,
  },
  SQUAD: {
    label: 'Squad',
    colorClass: 'bg-[#CCFF00]/12 text-[#CCFF00] border-[#CCFF00]/35',
    icon: Users,
  },
  HERO: {
    label: 'Hero',
    colorClass: 'bg-purple-400/12 text-purple-300 border-purple-400/35',
    icon: LayoutTemplate,
  },
  BRAND: {
    label: 'Logo & Brand',
    colorClass: 'bg-[#CCFF00]/12 text-[#CCFF00] border-[#CCFF00]/35',
    icon: ImageIcon,
  },
  PAYMENT: {
    label: 'Payment',
    colorClass: 'bg-amber-400/12 text-amber-300 border-amber-400/35',
    icon: Receipt,
  },
  CASTER: {
    label: 'Caster',
    colorClass: 'bg-[#00F0FF]/12 text-[#00F0FF] border-[#00F0FF]/35',
    icon: Mic,
  },
  USER: {
    label: 'Operator / User',
    colorClass: 'bg-[#00F0FF]/12 text-[#00F0FF] border-[#00F0FF]/35',
    icon: UserCog,
  },
};

const ACTION_META: Record<AuditAction, { label: string; colorClass: string }> = {
  CREATE: {
    label: 'CREATE',
    colorClass: 'bg-[#00F0FF]/12 text-[#00F0FF] border-[#00F0FF]/30',
  },
  UPDATE: {
    label: 'UPDATE',
    colorClass: 'bg-[#CCFF00]/12 text-[#CCFF00] border-[#CCFF00]/30',
  },
  DELETE: {
    label: 'DELETE',
    colorClass: 'bg-[#FF2E5B]/12 text-[#FF2E5B] border-[#FF2E5B]/35',
  },
  GENERATE_BRACKET: {
    label: 'BRACKET',
    colorClass: 'bg-amber-400/12 text-amber-300 border-amber-400/35',
  },
};

function formatAuditTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export const AuditLogPanel: React.FC<AuditLogPanelProps> = ({ db, onNotify }) => {
  const [resourceFilter, setResourceFilter] = useState<'ALL' | AuditResource>('ALL');
  const [actionFilter, setActionFilter] = useState<'ALL' | AuditAction>('ALL');
  const [query, setQuery] = useState('');
  const [exporting, setExporting] = useState<'csv' | 'json' | null>(null);
  const [integrity, setIntegrity] = useState<AuditIntegrityReport | null>(null);

  const logs: AuditLogEntry[] = useMemo(() => db.auditLogs || [], [db.auditLogs]);

  useEffect(() => {
    let active = true;
    api
      .getAuditLogs()
      .then((res) => {
        if (active && res.integrity) {
          setIntegrity(res.integrity);
        }
      })
      .catch(() => {
        // ignore if unreachable
      });
    return () => {
      active = false;
    };
  }, [logs.length]);

  const counts = useMemo(() => {
    let tournament = 0;
    let squad = 0;
    let hero = 0;
    for (const l of logs) {
      if (l.resource === 'TOURNAMENT') tournament += 1;
      else if (l.resource === 'SQUAD') squad += 1;
      else if (l.resource === 'HERO') hero += 1;
    }
    return { total: logs.length, tournament, squad, hero };
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return logs.filter((entry) => {
      if (resourceFilter !== 'ALL' && entry.resource !== resourceFilter) return false;
      if (actionFilter !== 'ALL' && entry.action !== actionFilter) return false;
      if (!q) return true;
      return (
        entry.targetLabel.toLowerCase().includes(q) ||
        entry.summary.toLowerCase().includes(q) ||
        entry.actorEmail.toLowerCase().includes(q) ||
        entry.actorName.toLowerCase().includes(q) ||
        entry.targetId.toLowerCase().includes(q) ||
        (entry.changedFields || []).some((f) => f.toLowerCase().includes(q))
      );
    });
  }, [logs, resourceFilter, actionFilter, query]);

  const handleExport = async (format: 'csv' | 'json') => {
    setExporting(format);
    try {
      const filename = await api.downloadAdminExport('audit_logs', format);
      onNotify(`Audit log berhasil diunduh: ${filename}`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal mengekspor audit log.');
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 font-telemetry text-[11px] font-bold uppercase tracking-[0.1em] text-[#00F0FF]">
            <ShieldCheck className="w-3.5 h-3.5" />
            Security &amp; Accountability Trail
          </div>
          <h1 className="mt-1 font-display text-3xl font-bold uppercase text-[#F8FAFC]">
            Audit Log Super Admin
          </h1>
          <p className="text-sm text-[#94A3B8] mt-1">
            Rekaman permanen setiap perubahan data Turnamen, Squad, dan Hero oleh Super Admin.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={exporting !== null}
            onClick={() => handleExport('csv')}
            className="inline-flex items-center gap-1.5 px-3.5 min-h-[40px] bg-[#12161F] border border-white/15 hover:border-[#CCFF00]/60 text-[#F8FAFC] hover:text-[#CCFF00] font-telemetry text-xs font-bold uppercase rounded-[4px] transition-colors cursor-pointer disabled:opacity-50"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-[#CCFF00]" />
            {exporting === 'csv' ? 'Mengunduh...' : 'Export CSV'}
          </button>
          <button
            type="button"
            disabled={exporting !== null}
            onClick={() => handleExport('json')}
            className="inline-flex items-center gap-1.5 px-3.5 min-h-[40px] bg-[#12161F] border border-white/15 hover:border-[#00F0FF]/60 text-[#F8FAFC] hover:text-[#00F0FF] font-telemetry text-xs font-bold uppercase rounded-[4px] transition-colors cursor-pointer disabled:opacity-50"
          >
            <FileJson className="w-3.5 h-3.5 text-[#00F0FF]" />
            {exporting === 'json' ? 'Mengunduh...' : 'Export JSON'}
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[
          { label: 'Total Aktivitas Tercatat', value: counts.total, color: '#F8FAFC' },
          { label: 'Perubahan Turnamen', value: counts.tournament, color: '#00F0FF' },
          { label: 'Perubahan Squad', value: counts.squad, color: '#CCFF00' },
          { label: 'Perubahan Hero', value: counts.hero, color: '#C084FC' },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="p-4 sm:p-5 bg-[#12161F] border border-white/[0.08] rounded-[6px]"
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
          </div>
        ))}
      </div>

      {/* Append-Only + Hash Chain Integrity Notice */}
      <div
        className={`p-3.5 border rounded-[6px] flex flex-wrap items-center justify-between gap-3 text-xs ${
          integrity && !integrity.valid
            ? 'bg-[#FF2E5B]/10 border-[#FF2E5B]/45 text-[#FDA4AF]'
            : 'bg-[#00F0FF]/[0.06] border-[#00F0FF]/25 text-[#94A3B8]'
        }`}
      >
        <div className="flex items-center gap-2.5">
          {integrity && !integrity.valid ? (
            <ShieldAlert className="w-4 h-4 text-[#FF2E5B] shrink-0" />
          ) : (
            <Lock className="w-4 h-4 text-[#00F0FF] shrink-0" />
          )}
          <span>
            Log audit bersifat <strong className="text-[#F8FAFC]">append-only</strong> dengan rantai hash{' '}
            <strong className="text-[#00F0FF]">SHA-256</strong> berurutan untuk deteksi manipulasi data.
          </span>
        </div>
        {integrity && (
          <span
            className={`px-2.5 py-1 rounded-[4px] border font-telemetry text-[10px] font-bold uppercase ${
              integrity.valid
                ? 'bg-[#CCFF00]/15 border-[#CCFF00]/40 text-[#CCFF00]'
                : 'bg-[#FF2E5B]/20 border-[#FF2E5B] text-[#FF2E5B]'
            }`}
          >
            {integrity.valid
              ? `HASH CHAIN VALID · ${integrity.hashedLogs}/${integrity.totalLogs} LOG`
              : `CHAIN BROKEN AT ${integrity.brokenAtId}`}
          </span>
        )}
      </div>

      {/* Filter Bar */}
      <div className="p-4 bg-[#12161F] border border-white/[0.08] rounded-[6px] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {(['ALL', 'TOURNAMENT', 'MATCH', 'SQUAD', 'USER', 'HERO'] as const).map((res) => (
            <button
              key={res}
              type="button"
              onClick={() => setResourceFilter(res)}
              className={`px-3 py-1.5 font-telemetry text-xs font-bold uppercase rounded-[4px] border transition-colors cursor-pointer ${
                resourceFilter === res
                  ? 'bg-[#00F0FF]/15 text-[#00F0FF] border-[#00F0FF]/50'
                  : 'bg-[#0A0C10] text-[#94A3B8] border-white/10 hover:text-[#F8FAFC]'
              }`}
            >
              {res === 'ALL' ? 'Semua Resource' : RESOURCE_META[res].label}
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value as 'ALL' | AuditAction)}
            aria-label="Filter aksi"
            className="px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-xs text-[#F8FAFC] focus:border-[#00F0FF] focus:outline-none"
          >
            <option value="ALL">Semua Aksi</option>
            <option value="CREATE">CREATE</option>
            <option value="UPDATE">UPDATE</option>
            <option value="DELETE">DELETE</option>
            <option value="GENERATE_BRACKET">GENERATE BRACKET</option>
          </select>

          <div className="relative min-w-[220px]">
            <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari target, admin, field..."
              className="w-full pl-9 pr-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] text-xs text-[#F8FAFC] placeholder:text-[#94A3B8]/60 focus:border-[#00F0FF] focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Audit Log List */}
      <div className="bg-[#12161F] border border-white/[0.08] rounded-[6px] overflow-hidden">
        {filteredLogs.length === 0 ? (
          <div className="p-10 text-center">
            <ShieldCheck className="w-9 h-9 text-[#94A3B8]/50 mx-auto" />
            <p className="mt-3 font-display text-lg font-bold uppercase text-[#F8FAFC]">
              {logs.length === 0
                ? 'Belum Ada Aktivitas Audit Tercatat'
                : 'Tidak Ada Log yang Cocok dengan Filter'}
            </p>
            <p className="mt-1 text-xs text-[#94A3B8] max-w-md mx-auto">
              {logs.length === 0
                ? 'Setiap pembuatan, pembaruan, atau penghapusan Turnamen, Squad, maupun Hero Settings oleh Super Admin akan otomatis terekam di sini.'
                : 'Coba ubah kata kunci pencarian atau reset filter resource/aksi.'}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/[0.08] bg-[#0A0C10]/60 font-telemetry text-[11px] uppercase tracking-[0.08em] text-[#94A3B8]">
                    <th className="py-3 px-4">Waktu</th>
                    <th className="py-3 px-4">Super Admin</th>
                    <th className="py-3 px-4">Resource &amp; Aksi</th>
                    <th className="py-3 px-4">Target</th>
                    <th className="py-3 px-4">Detail Perubahan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06] text-xs">
                  {filteredLogs.map((entry) => {
                    const resMeta = RESOURCE_META[entry.resource];
                    const actMeta = ACTION_META[entry.action];
                    const ResIcon = resMeta.icon;
                    return (
                      <tr key={entry.id} className="hover:bg-white/[0.02] align-top">
                        <td className="py-3.5 px-4 font-telemetry text-[11px] text-[#94A3B8] whitespace-nowrap">
                          {formatAuditTime(entry.timestamp)}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-[#F8FAFC]">{entry.actorName}</div>
                          <div className="font-telemetry text-[11px] text-[#94A3B8]">
                            {entry.actorEmail}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 border rounded-[3px] font-telemetry text-[10px] font-bold uppercase ${resMeta.colorClass}`}
                            >
                              <ResIcon className="w-3 h-3" />
                              {resMeta.label}
                            </span>
                            <span
                              className={`inline-flex items-center px-2 py-0.5 border rounded-[3px] font-telemetry text-[10px] font-bold uppercase ${actMeta.colorClass}`}
                            >
                              {actMeta.label}
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-[#F8FAFC]">{entry.targetLabel}</div>
                          <div className="font-telemetry text-[10px] text-[#94A3B8]">
                            {entry.targetId}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 max-w-md">
                          <p className="text-[#CBD5E1] leading-relaxed">{entry.summary}</p>
                          {entry.changedFields && entry.changedFields.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {entry.changedFields.map((field) => (
                                <span
                                  key={field}
                                  className="px-1.5 py-0.5 bg-[#0A0C10] border border-white/10 rounded-[3px] font-telemetry text-[10px] text-[#00F0FF]"
                                >
                                  {field}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-white/[0.08]">
              {filteredLogs.map((entry) => {
                const resMeta = RESOURCE_META[entry.resource];
                const actMeta = ACTION_META[entry.action];
                const ResIcon = resMeta.icon;
                return (
                  <div key={entry.id} className="p-4 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 border rounded-[3px] font-telemetry text-[10px] font-bold uppercase ${resMeta.colorClass}`}
                        >
                          <ResIcon className="w-3 h-3" />
                          {resMeta.label}
                        </span>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 border rounded-[3px] font-telemetry text-[10px] font-bold uppercase ${actMeta.colorClass}`}
                        >
                          {actMeta.label}
                        </span>
                      </div>
                      <span className="font-telemetry text-[10px] text-[#94A3B8]">
                        {formatAuditTime(entry.timestamp)}
                      </span>
                    </div>

                    <div>
                      <div className="font-semibold text-sm text-[#F8FAFC]">
                        {entry.targetLabel}
                      </div>
                      <p className="mt-1 text-xs text-[#CBD5E1] leading-relaxed">{entry.summary}</p>
                    </div>

                    {entry.changedFields && entry.changedFields.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {entry.changedFields.map((field) => (
                          <span
                            key={field}
                            className="px-1.5 py-0.5 bg-[#0A0C10] border border-white/10 rounded-[3px] font-telemetry text-[10px] text-[#00F0FF]"
                          >
                            {field}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between gap-2 font-telemetry text-[10px] text-[#94A3B8]">
                      <span>{entry.actorEmail}</span>
                      <span>{entry.targetId}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
