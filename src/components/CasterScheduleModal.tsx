import React, { useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  Calendar,
  CalendarOff,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Crown,
  ExternalLink,
  Mic,
  Swords,
  X,
  Youtube,
} from 'lucide-react';
import type { ScrimSession, Shoutcaster } from '../types';
import { CasterBadges } from './CasterBadges';
import { formatRupiah } from './ScrimArena';

interface CasterScheduleModalProps {
  open: boolean;
  onClose: () => void;
  casters: Shoutcaster[];
  scrims: ScrimSession[];
  initialCasterId?: string | null;
  onBookWithCaster?: (casterId: string, date: string) => void;
}

const MONTH_NAMES_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

const WEEKDAY_LABELS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

function toIsoDate(year: number, monthIndex: number, day: number): string {
  const m = String(monthIndex + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

function parseIsoDate(iso: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]) - 1,
    day: Number(match[3]),
  };
}

function formatLongIndonesianDate(iso: string): string {
  const parsed = parseIsoDate(iso);
  if (!parsed) return iso;
  const d = new Date(parsed.year, parsed.month, parsed.day);
  return d.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export const CasterScheduleModal: React.FC<CasterScheduleModalProps> = ({
  open,
  onClose,
  casters,
  scrims,
  initialCasterId,
  onBookWithCaster,
}) => {
  const activeCasters = useMemo(
    () => casters.filter((c) => c.status !== 'INACTIVE'),
    [casters]
  );

  // Pick initial anchor date from first active scrim or today
  const initialDate = useMemo(() => {
    const upcoming = scrims
      .filter((s) => s.status !== 'CANCELLED' && s.casterApprovalStatus !== 'REJECTED' && s.date)
      .map((s) => s.date)
      .sort();
    if (upcoming.length > 0) return upcoming[0];
    const now = new Date();
    return toIsoDate(now.getFullYear(), now.getMonth(), now.getDate());
  }, [scrims]);

  const initialParsed = parseIsoDate(initialDate) || {
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
    day: new Date().getDate(),
  };

  const [viewYear, setViewYear] = useState<number>(initialParsed.year);
  const [viewMonth, setViewMonth] = useState<number>(initialParsed.month);
  const [selectedDate, setSelectedDate] = useState<string>(initialDate);
  const [selectedCasterId, setSelectedCasterId] = useState<string>(initialCasterId || 'ALL');

  useEffect(() => {
    if (!open) return;
    setSelectedCasterId(initialCasterId || 'ALL');
  }, [open, initialCasterId]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const visibleCasters = useMemo(() => {
    if (selectedCasterId === 'ALL') return activeCasters;
    return activeCasters.filter((c) => c.id === selectedCasterId);
  }, [activeCasters, selectedCasterId]);

  const activeScrims = useMemo(
    () =>
      scrims.filter(
        (s) =>
          s.status !== 'CANCELLED' &&
          s.casterApprovalStatus !== 'REJECTED' &&
          s.casterId &&
          s.casterId !== 'none'
      ),
    [scrims]
  );

  // Map date -> scrims (filtered by selectedCasterId if set)
  const scrimsByDate = useMemo(() => {
    const map = new Map<string, ScrimSession[]>();
    for (const s of activeScrims) {
      if (selectedCasterId !== 'ALL' && s.casterId !== selectedCasterId) continue;
      const list = map.get(s.date) || [];
      list.push(s);
      map.set(s.date, list);
    }
    return map;
  }, [activeScrims, selectedCasterId]);

  // Build calendar cells (Monday-first grid)
  const calendarCells = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    // JS getDay(): 0=Sun..6=Sat -> convert to Monday=0..Sunday=6
    const startOffset = (firstDay.getDay() + 6) % 7;

    const cells: { iso: string | null; day: number | null }[] = [];
    for (let i = 0; i < startOffset; i++) {
      cells.push({ iso: null, day: null });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      cells.push({ iso: toIsoDate(viewYear, viewMonth, day), day });
    }
    while (cells.length % 7 !== 0) {
      cells.push({ iso: null, day: null });
    }
    return cells;
  }, [viewYear, viewMonth]);

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleJumpToInitial = () => {
    setViewYear(initialParsed.year);
    setViewMonth(initialParsed.month);
    setSelectedDate(initialDate);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-[#0A0C10]/85 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="caster-schedule-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl max-h-[92vh] bg-[#12161F] border border-white/15 rounded-[6px] flex flex-col overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.75)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-4 sm:px-6 py-4 bg-[#0A0C10] border-b border-white/[0.08] flex items-start justify-between gap-3 shrink-0">
          <div>
            <div className="inline-flex items-center gap-1.5 font-telemetry text-[11px] font-bold uppercase tracking-[0.1em] text-[#CCFF00]">
              <Calendar className="w-3.5 h-3.5" />
              ORDAL ENTERTAINMENT · LIVE AVAILABILITY
            </div>
            <h3
              id="caster-schedule-modal-title"
              className="mt-0.5 font-display text-xl sm:text-2xl font-bold uppercase text-[#F8FAFC]"
            >
              Jadwal &amp; Ketersediaan Caster
            </h3>
            <p className="text-xs text-[#94A3B8] mt-0.5">
              Cek slot casting harian (maks 2 match/hari per caster) dan jadwal Day Off sebelum booking scrim.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal jadwal caster"
            className="min-h-[38px] min-w-[38px] flex items-center justify-center border border-white/15 rounded-[4px] text-[#94A3B8] hover:text-white hover:border-white/35 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Caster Filter Strip */}
        <div className="px-4 sm:px-6 py-3 bg-[#12161F] border-b border-white/[0.08] flex items-center gap-2 overflow-x-auto shrink-0">
          <button
            type="button"
            onClick={() => setSelectedCasterId('ALL')}
            className={`px-3 py-1.5 rounded-[4px] border font-telemetry text-xs font-bold uppercase whitespace-nowrap transition-colors cursor-pointer ${
              selectedCasterId === 'ALL'
                ? 'bg-[#00F0FF]/15 border-[#00F0FF] text-[#00F0FF]'
                : 'bg-[#0A0C10] border-white/12 text-[#94A3B8] hover:text-[#F8FAFC]'
            }`}
          >
            Semua Caster ({activeCasters.length})
          </button>
          {activeCasters.map((c) => {
            const active = selectedCasterId === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedCasterId(c.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] border font-telemetry text-xs font-semibold uppercase whitespace-nowrap transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#CCFF00]/15 border-[#CCFF00] text-[#CCFF00]'
                    : 'bg-[#0A0C10] border-white/12 text-[#94A3B8] hover:text-[#F8FAFC]'
                }`}
              >
                <Mic className="w-3.5 h-3.5" />
                <span>{c.name}</span>
                {c.isVerified && (
                  <BadgeCheck className="w-3.5 h-3.5 text-[#00F0FF] shrink-0" aria-label="Verified" />
                )}
                {c.isTopCaster && (
                  <Crown className="w-3.5 h-3.5 text-[#CCFF00] shrink-0" aria-label="Top Caster" />
                )}
              </button>
            );
          })}
        </div>

        {/* Scrollable Body: Calendar Grid + Selected Date Details */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Calendar Column */}
            <div className="lg:col-span-7 bg-[#0A0C10] border border-white/[0.08] rounded-[6px] p-4">
              {/* Month Controls */}
              <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-white/[0.08]">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePrevMonth}
                    aria-label="Bulan sebelumnya"
                    className="min-h-[34px] min-w-[34px] flex items-center justify-center border border-white/12 rounded-[4px] text-[#94A3B8] hover:text-white hover:border-[#00F0FF] cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="font-display text-lg sm:text-xl font-bold uppercase text-[#F8FAFC] min-w-[150px] text-center">
                    {MONTH_NAMES_ID[viewMonth]} {viewYear}
                  </span>
                  <button
                    type="button"
                    onClick={handleNextMonth}
                    aria-label="Bulan berikutnya"
                    className="min-h-[34px] min-w-[34px] flex items-center justify-center border border-white/12 rounded-[4px] text-[#94A3B8] hover:text-white hover:border-[#00F0FF] cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleJumpToInitial}
                  className="px-2.5 py-1.5 border border-white/12 rounded-[4px] font-telemetry text-[11px] font-semibold uppercase text-[#00F0FF] hover:bg-[#00F0FF]/10 cursor-pointer"
                >
                  Jadwal Terdekat
                </button>
              </div>

              {/* Weekday Headers */}
              <div className="grid grid-cols-7 gap-1.5 mb-1.5">
                {WEEKDAY_LABELS.map((day) => (
                  <div
                    key={day}
                    className="text-center font-telemetry text-[10px] font-bold uppercase tracking-[0.08em] text-[#94A3B8] py-1"
                  >
                    {day}
                  </div>
                ))}
              </div>

              {/* Day Cells */}
              <div className="grid grid-cols-7 gap-1.5">
                {calendarCells.map((cell, idx) => {
                  if (!cell.iso || !cell.day) {
                    return <div key={`empty-${idx}`} className="min-h-[60px] sm:min-h-[68px]" />;
                  }

                  const iso = cell.iso;
                  const isSelected = selectedDate === iso;
                  const dayScrims = scrimsByDate.get(iso) || [];
                  const dayOffCasters = visibleCasters.filter((c) => c.dayOffDates.includes(iso));
                  const singleCaster = selectedCasterId !== 'ALL' ? visibleCasters[0] : null;
                  const isSingleDayOff = Boolean(singleCaster && dayOffCasters.length > 0);
                  const isSingleFull = Boolean(
                    singleCaster &&
                      !isSingleDayOff &&
                      dayScrims.length >= (singleCaster.maxMatchesPerDay || 2)
                  );
                  const allCastersOff =
                    selectedCasterId === 'ALL' &&
                    visibleCasters.length > 0 &&
                    dayOffCasters.length === visibleCasters.length;

                  return (
                    <button
                      key={iso}
                      type="button"
                      onClick={() => setSelectedDate(iso)}
                      className={`min-h-[60px] sm:min-h-[68px] p-1.5 rounded-[4px] border text-left flex flex-col justify-between transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#00F0FF]/15 border-[#00F0FF] ring-1 ring-[#00F0FF]/60'
                          : isSingleDayOff || allCastersOff
                            ? 'bg-[#FF2E5B]/[0.06] border-[#FF2E5B]/25 hover:border-[#FF2E5B]/60'
                            : isSingleFull
                              ? 'bg-amber-400/[0.07] border-amber-400/30 hover:border-amber-400/70'
                              : dayScrims.length > 0
                                ? 'bg-[#12161F] border-[#00F0FF]/25 hover:border-[#00F0FF]/60'
                                : 'bg-[#12161F]/60 border-white/[0.06] hover:border-white/25'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 w-full">
                        <span
                          className={`font-telemetry text-xs font-bold tabular-nums ${
                            isSelected ? 'text-[#00F0FF]' : 'text-[#F8FAFC]'
                          }`}
                        >
                          {cell.day}
                        </span>
                        {dayOffCasters.length > 0 && (
                          <span
                            title="Day Off"
                            className="w-1.5 h-1.5 rounded-full bg-[#FF2E5B] shrink-0"
                          />
                        )}
                      </div>

                      <div className="space-y-0.5 w-full">
                        {isSingleDayOff ? (
                          <span className="block px-1 py-0.5 rounded-[2px] bg-[#FF2E5B]/20 text-[#FF2E5B] font-telemetry text-[9px] font-bold uppercase truncate">
                            OFF
                          </span>
                        ) : isSingleFull ? (
                          <span className="block px-1 py-0.5 rounded-[2px] bg-amber-400/20 text-amber-300 font-telemetry text-[9px] font-bold uppercase truncate">
                            FULL
                          </span>
                        ) : dayScrims.length > 0 ? (
                          <span className="block px-1 py-0.5 rounded-[2px] bg-[#00F0FF]/15 text-[#00F0FF] font-telemetry text-[9px] font-bold uppercase truncate">
                            {dayScrims.length} Match
                          </span>
                        ) : (
                          <span className="block font-telemetry text-[9px] text-[#94A3B8]/50 uppercase">
                            Open
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="mt-4 pt-3 border-t border-white/[0.08] flex flex-wrap items-center gap-x-4 gap-y-1.5 font-telemetry text-[10px] uppercase text-[#94A3B8]">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-[2px] bg-[#12161F] border border-white/20" />
                  Tersedia (Open)
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-[2px] bg-[#00F0FF]/25 border border-[#00F0FF]" />
                  Ada Jadwal Match
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-[2px] bg-amber-400/25 border border-amber-400" />
                  Full Book (2/2)
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-[2px] bg-[#FF2E5B]/25 border border-[#FF2E5B]" />
                  Day Off
                </span>
              </div>
            </div>

            {/* Selected Date Detail Column */}
            <div className="lg:col-span-5 space-y-4">
              <div className="p-4 bg-[#0A0C10] border border-white/[0.08] rounded-[6px]">
                <div className="font-telemetry text-[10px] font-bold uppercase tracking-[0.1em] text-[#00F0FF]">
                  DETAIL TANGGAL TERPILIH
                </div>
                <div className="mt-1 font-display text-xl font-bold uppercase text-[#F8FAFC]">
                  {formatLongIndonesianDate(selectedDate)}
                </div>
                <div className="mt-0.5 font-telemetry text-[11px] text-[#94A3B8]">
                  {visibleCasters.length} Caster ditampilkan · {(scrimsByDate.get(selectedDate) || []).length} Match terjadwal
                </div>
              </div>

              <div className="space-y-3">
                {visibleCasters.map((caster) => {
                  const isDayOff = caster.dayOffDates.includes(selectedDate);
                  const offSlots = caster.dayOffSlots?.[selectedDate] || [];
                  const hasPartialOff = !isDayOff && offSlots.length > 0;
                  const casterDayScrims = activeScrims.filter(
                    (s) => s.casterId === caster.id && s.date === selectedDate
                  );
                  const baseQuota = caster.maxMatchesPerDay || 2;
                  const maxQuota = hasPartialOff ? Math.max(1, baseQuota - 1) : baseQuota;
                  const isFull = casterDayScrims.length >= maxQuota;
                  const canBook = !isDayOff && !isFull;

                  return (
                    <div
                      key={caster.id}
                      className="p-4 bg-[#0A0C10] border border-white/[0.08] rounded-[6px] space-y-3"
                    >
                      {hasPartialOff && (
                        <div className="px-2.5 py-1.5 bg-[#FACC15]/10 border border-[#FACC15]/35 rounded-[4px] font-telemetry text-[10px] font-bold text-[#FACC15]">
                          1 JOB · 1 OFF — Jam OFF: {offSlots.join(', ')}
                        </div>
                      )}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 space-y-1.5">
                          <div className="font-display text-base font-bold uppercase text-[#F8FAFC] truncate">
                            {caster.name}
                          </div>
                          <CasterBadges
                            isVerified={caster.isVerified}
                            isTopCaster={caster.isTopCaster}
                            size="xs"
                          />
                          {caster.bio && (
                            <p className="text-[11px] text-[#94A3B8] line-clamp-2">{caster.bio}</p>
                          )}
                          <div className="font-telemetry text-[11px] text-[#94A3B8]">
                            Ratecard:{' '}
                            <span className="text-[#CCFF00] font-bold tabular-nums">
                              {formatRupiah(caster.rateCard)}
                            </span>
                            {' · '}
                            {caster.specialtyGames.slice(0, 3).join(', ')}
                          </div>
                        </div>

                        {isDayOff ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-[#FF2E5B]/15 border border-[#FF2E5B]/45 rounded-[3px] font-telemetry text-[10px] font-bold uppercase text-[#FF2E5B] shrink-0">
                            <CalendarOff className="w-3 h-3" />
                            DAY OFF
                          </span>
                        ) : isFull ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-400/15 border border-amber-400/45 rounded-[3px] font-telemetry text-[10px] font-bold uppercase text-amber-300 shrink-0">
                            FULL ({casterDayScrims.length}/{maxQuota})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-[#CCFF00]/12 border border-[#CCFF00]/40 rounded-[3px] font-telemetry text-[10px] font-bold uppercase text-[#CCFF00] shrink-0">
                            <CheckCircle2 className="w-3 h-3" />
                            OPEN ({casterDayScrims.length}/{maxQuota})
                          </span>
                        )}
                      </div>

                      {/* Scheduled Matches on Selected Date */}
                      {casterDayScrims.length > 0 ? (
                        <div className="space-y-2">
                          {casterDayScrims.map((sc) => (
                            <div
                              key={sc.id}
                              className="p-2.5 bg-[#12161F] border border-white/[0.06] rounded-[4px] space-y-1"
                            >
                              <div className="flex items-center justify-between gap-2 font-telemetry text-[10px] uppercase">
                                <span className="inline-flex items-center gap-1 text-[#00F0FF] font-bold">
                                  <Clock className="w-3 h-3" />
                                  {sc.timeSlot}
                                </span>
                                <span className="text-[#94A3B8]">{sc.game}</span>
                              </div>
                              <div className="font-display text-sm font-bold uppercase text-[#F8FAFC]">
                                {sc.hostTeamName}{' '}
                                <span className="text-[#FF2E5B] text-xs">VS</span>{' '}
                                {sc.challengerTeamName || 'OPEN LOBBY'}
                              </div>
                              <div className="flex items-center justify-between gap-2 font-telemetry text-[10px]">
                                <span
                                  className={
                                    sc.casterApprovalStatus === 'APPROVED'
                                      ? 'text-[#CCFF00]'
                                      : 'text-[#FACC15]'
                                  }
                                >
                                  {sc.casterApprovalStatus === 'APPROVED'
                                    ? 'Approved by Caster'
                                    : 'Menunggu Approval'}
                                </span>
                                {sc.youtubeStreamUrl && (
                                  <a
                                    href={sc.youtubeStreamUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-[#FF2E5B] hover:underline font-bold"
                                  >
                                    <Youtube className="w-3 h-3" />
                                    Live
                                    <ExternalLink className="w-2.5 h-2.5" />
                                  </a>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : !isDayOff ? (
                        <div className="text-xs text-[#94A3B8] bg-[#12161F]/60 border border-white/[0.05] rounded-[4px] px-3 py-2">
                          Belum ada match terjadwal pada tanggal ini. Semua slot jam masih terbuka.
                        </div>
                      ) : null}

                      {/* Quick Book CTA */}
                      {canBook && onBookWithCaster && (
                        <button
                          type="button"
                          onClick={() => onBookWithCaster(caster.id, selectedDate)}
                          className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-[#00F0FF]/12 border border-[#00F0FF]/45 hover:bg-[#00F0FF] text-[#00F0FF] hover:text-[#0A0C10] font-telemetry text-[11px] font-bold uppercase tracking-[0.05em] rounded-[4px] transition-colors cursor-pointer"
                        >
                          <Swords className="w-3.5 h-3.5" />
                          Booking Scrim dengan {caster.alias || caster.name}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
