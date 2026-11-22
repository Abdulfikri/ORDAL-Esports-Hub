import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Save, SlidersHorizontal } from 'lucide-react';
import { api } from '../api';
import type { ScrimGame, ScrimSession, ScrimSettings, ScrimStatus } from '../types';
import { formatRupiah, PLATFORM_LOBBY_FEE, SCRIM_GAMES } from './ScrimArena';

interface ScrimManagementPanelProps {
  scrims: ScrimSession[];
  filteredScrims: ScrimSession[];
  scrimSettings?: ScrimSettings;
  gameFilter: 'ALL' | ScrimGame;
  statusFilter: 'ALL' | ScrimStatus;
  onChangeGameFilter: (next: 'ALL' | ScrimGame) => void;
  onChangeStatusFilter: (next: 'ALL' | ScrimStatus) => void;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string) => void;
}

const STATUS_OPTIONS: { id: 'ALL' | ScrimStatus; label: string }[] = [
  { id: 'ALL', label: 'Semua Status' },
  { id: 'OPEN_LOBBY', label: 'Open Lobby' },
  { id: 'WAITING_APPROVAL', label: 'Waiting Approval' },
  { id: 'AWAITING_PAYMENT', label: 'Awaiting Payment' },
  { id: 'PARTIALLY_PAID', label: 'Partially Paid' },
  { id: 'CONFIRMED', label: 'Confirmed' },
  { id: 'CANCELLED', label: 'Cancelled' },
];

export const ScrimManagementPanel: React.FC<ScrimManagementPanelProps> = ({
  scrims,
  filteredScrims,
  scrimSettings,
  gameFilter,
  statusFilter,
  onChangeGameFilter,
  onChangeStatusFilter,
  onRefresh,
  onNotify,
}) => {
  const [defaultFee, setDefaultFee] = useState<string>(
    String(scrimSettings?.defaultLobbyFee ?? PLATFORM_LOBBY_FEE)
  );
  const [perGameFees, setPerGameFees] = useState<Record<string, string>>({});
  const [applyToOpenScrims, setApplyToOpenScrims] = useState(true);
  const [showPerGameOverrides, setShowPerGameOverrides] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDefaultFee(String(scrimSettings?.defaultLobbyFee ?? PLATFORM_LOBBY_FEE));
    const nextMap: Record<string, string> = {};
    for (const g of SCRIM_GAMES) {
      const val = scrimSettings?.lobbyFeeByGame?.[g];
      nextMap[g] = typeof val === 'number' ? String(val) : '';
    }
    setPerGameFees(nextMap);
  }, [scrimSettings]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedDefault = Number(defaultFee);
    if (!Number.isFinite(parsedDefault) || parsedDefault < 0) {
      onNotify('Nominal Default Lobby Fee tidak valid.');
      return;
    }

    const lobbyFeeByGame: Partial<Record<ScrimGame, number>> = {};
    for (const g of SCRIM_GAMES) {
      const raw = (perGameFees[g] || '').trim();
      if (raw !== '') {
        const num = Number(raw);
        if (!Number.isFinite(num) || num < 0) {
          onNotify(`Nominal Lobby Fee untuk ${g} tidak valid.`);
          return;
        }
        lobbyFeeByGame[g] = Math.round(num);
      }
    }

    setSaving(true);
    try {
      const res = await api.updateScrimSettings({
        defaultLobbyFee: Math.round(parsedDefault),
        lobbyFeeByGame,
        applyToOpenScrims,
      });
      await onRefresh();
      onNotify(
        res.updatedScrimsCount > 0
          ? `Lobby Fee diperbarui (${formatRupiah(res.scrimSettings.defaultLobbyFee)}) & diterapkan ke ${res.updatedScrimsCount} sesi scrim aktif.`
          : `Pengaturan Lobby Fee (${formatRupiah(res.scrimSettings.defaultLobbyFee)}) berhasil disimpan.`
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal menyimpan pengaturan Lobby Fee.');
    } finally {
      setSaving(false);
    }
  };

  const countByGame = (g: ScrimGame) => scrims.filter((s) => s.game === g).length;
  const filteredConfirmed = filteredScrims.filter((s) => s.status === 'CONFIRMED');
  const filteredLobbyFeeTotal = filteredConfirmed.reduce(
    (sum, s) => sum + (typeof s.platformFee === 'number' ? s.platformFee : PLATFORM_LOBBY_FEE),
    0
  );
  const filteredGrossVolume = filteredConfirmed.reduce((sum, s) => sum + (s.totalCost || 0), 0);

  const activeOverrideCount = SCRIM_GAMES.filter((g) => (perGameFees[g] || '').trim() !== '').length;

  return (
    <div className="space-y-4">
      {/* Lobby Fee Configuration Card */}
      <form
        onSubmit={handleSaveSettings}
        className="p-5 bg-[#12161F] border border-white/[0.08] rounded-[6px] space-y-4"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 font-telemetry text-[11px] font-semibold uppercase tracking-[0.08em] text-[#CCFF00]">
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Pengaturan Lobby Fee Scrim</span>
            </div>
            <p className="mt-1 font-telemetry text-xs text-[#94A3B8]">
              Atur tarif Lobby Fee ORDAL default maupun tarif khusus per judul game. Biaya split-bill otomatis dibagi dua ke Host &amp; Challenger.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block font-telemetry text-[11px] uppercase text-[#94A3B8] mb-1">
                Default Lobby Fee (Rp)
              </label>
              <input
                type="number"
                min={0}
                max={5000000}
                step={5000}
                value={defaultFee}
                onChange={(e) => setDefaultFee(e.target.value)}
                className="w-44 px-3 py-2 bg-[#0A0C10] border border-white/15 rounded-[4px] font-telemetry text-sm font-bold text-[#CCFF00] tabular-nums focus:outline-none focus:border-[#00F0FF]"
              />
            </div>

            <button
              type="button"
              onClick={() => setShowPerGameOverrides((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3.5 min-h-[38px] border border-white/15 text-[#F8FAFC] hover:border-[#00F0FF] font-telemetry text-xs font-semibold uppercase rounded-[4px] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Tarif per Game {activeOverrideCount > 0 ? `(${activeOverrideCount})` : ''}
              {showPerGameOverrides ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 min-h-[38px] bg-[#CCFF00] text-[#0A0C10] font-display text-xs sm:text-sm font-bold uppercase tracking-[0.05em] rounded-[4px] hover:brightness-110 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Menyimpan...' : 'Simpan Fee'}
            </button>
          </div>
        </div>

        {/* Optional Per-Game Lobby Fee Overrides */}
        {showPerGameOverrides && (
          <div className="pt-4 border-t border-white/[0.08] space-y-3">
            <div className="font-telemetry text-[11px] text-[#94A3B8]">
              Kosongkan input game jika ingin mengikuti Default Lobby Fee ({formatRupiah(Number(defaultFee) || 0)}).
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {SCRIM_GAMES.map((g) => (
                <div
                  key={g}
                  className="p-3 bg-[#0A0C10] border border-white/[0.08] rounded-[4px] flex items-center justify-between gap-3"
                >
                  <label className="font-telemetry text-xs font-semibold text-[#F8FAFC] truncate">
                    {g}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={5000000}
                    step={5000}
                    value={perGameFees[g] ?? ''}
                    onChange={(e) =>
                      setPerGameFees((prev) => ({ ...prev, [g]: e.target.value }))
                    }
                    placeholder={String(Number(defaultFee) || PLATFORM_LOBBY_FEE)}
                    className="w-28 px-2.5 py-1.5 bg-[#12161F] border border-white/12 rounded-[4px] font-telemetry text-xs text-right text-[#00F0FF] tabular-nums focus:outline-none focus:border-[#00F0FF]"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="pt-2 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-3">
          <label className="inline-flex items-center gap-2 font-telemetry text-xs text-[#94A3B8] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={applyToOpenScrims}
              onChange={(e) => setApplyToOpenScrims(e.target.checked)}
              className="accent-[#CCFF00] w-3.5 h-3.5 cursor-pointer"
            />
            Terapkan ke sesi scrim yang belum dibayar (Open Lobby / Waiting / Awaiting Payment)
          </label>
          <span className="font-telemetry text-[11px] text-[#94A3B8] tabular-nums">
            Aktif saat ini: {formatRupiah(scrimSettings?.defaultLobbyFee ?? PLATFORM_LOBBY_FEE)}
          </span>
        </div>
      </form>

      {/* Filter Game & Status Toolbar + Summary Strip */}
      <div className="p-4 bg-[#12161F] border border-white/[0.08] rounded-[6px] space-y-3.5">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          {/* Game Filter Segmented Buttons */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => onChangeGameFilter('ALL')}
              className={`px-3 py-1.5 font-telemetry text-[11px] font-bold uppercase rounded-[3px] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                gameFilter === 'ALL'
                  ? 'bg-[#00F0FF] text-[#0A0C10]'
                  : 'bg-[#0A0C10] border border-white/10 text-[#94A3B8] hover:text-[#F8FAFC]'
              }`}
            >
              Semua Game ({scrims.length})
            </button>
            {SCRIM_GAMES.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => onChangeGameFilter(g)}
                className={`px-3 py-1.5 font-telemetry text-[11px] font-bold uppercase rounded-[3px] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  gameFilter === g
                    ? 'bg-[#00F0FF] text-[#0A0C10]'
                    : 'bg-[#0A0C10] border border-white/10 text-[#94A3B8] hover:text-[#F8FAFC]'
                }`}
              >
                {g} ({countByGame(g)})
              </button>
            ))}
          </div>

          {/* Status Filter Dropdown */}
          <div className="flex items-center gap-2 shrink-0">
            <label className="font-telemetry text-[11px] uppercase text-[#94A3B8]">Status:</label>
            <select
              value={statusFilter}
              onChange={(e) => onChangeStatusFilter(e.target.value as 'ALL' | ScrimStatus)}
              className="px-3 py-1.5 bg-[#0A0C10] border border-white/15 rounded-[4px] font-telemetry text-xs text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Compact Filtered Metrics Strip */}
        <div className="pt-3 border-t border-white/[0.06] flex flex-wrap items-center gap-x-6 gap-y-2 font-telemetry text-xs tabular-nums">
          <span className="text-[#94A3B8]">
            Menampilkan{' '}
            <strong className="text-[#F8FAFC]">{filteredScrims.length}</strong> sesi scrim
          </span>
          <span className="text-[#94A3B8]">
            Confirmed: <strong className="text-[#00F0FF]">{filteredConfirmed.length}</strong>
          </span>
          <span className="text-[#94A3B8]">
            Lobby Fee Terkumpul:{' '}
            <strong className="text-[#CCFF00]">{formatRupiah(filteredLobbyFeeTotal)}</strong>
          </span>
          <span className="text-[#94A3B8]">
            Gross Volume Confirmed:{' '}
            <strong className="text-[#F8FAFC]">{formatRupiah(filteredGrossVolume)}</strong>
          </span>
        </div>
      </div>
    </div>
  );
};
