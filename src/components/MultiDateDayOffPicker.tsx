import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  CalendarOff,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { TIME_SLOTS } from './ScrimArena';

type DayOffMode = 'FULL' | 'SLOT';

interface MultiDateDayOffPickerProps {
  savedDates: string[];
  savedSlotOffs?: Record<string, string[]>;
  bookedCountByDate: Record<string, number>;
  saving: boolean;
  onSaveSchedule: (
    nextFullDates: string[],
    nextSlotOffs: Record<string, string[]>
  ) => Promise<void>;
}

const WEEKDAY_LABELS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const MONTH_NAMES = [
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

function formatDateKey(year: number, monthIndex: number, day: number): string {
  const m = String(monthIndex + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

function getTodayKey(): string {
  const now = new Date();
  return formatDateKey(now.getFullYear(), now.getMonth(), now.getDate());
}

function expandDateRange(startKey: string, endKey: string): string[] {
  if (!startKey || !endKey) return [];
  const start = new Date(`${startKey}T00:00:00`);
  const end = new Date(`${endKey}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  const [from, to] = start <= end ? [start, end] : [end, start];
  const result: string[] = [];
  const cursor = new Date(from);
  let guard = 0;
  while (cursor <= to && guard < 62) {
    result.push(formatDateKey(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()));
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  return result;
}

function normalizeSlotMap(
  raw: Record<string, string[]> | undefined,
  fullDates: string[]
): Record<string, string[]> {
  if (!raw) return {};
  const fullSet = new Set(fullDates);
  const out: Record<string, string[]> = {};
  for (const [dateKey, slots] of Object.entries(raw)) {
    if (fullSet.has(dateKey)) continue;
    const clean = Array.from(new Set(slots)).sort(
      (a, b) => TIME_SLOTS.indexOf(a) - TIME_SLOTS.indexOf(b)
    );
    if (clean.length > 0) {
      out[dateKey] = clean;
    }
  }
  return out;
}

function serializeSchedule(
  fullDates: string[],
  slotOffs: Record<string, string[]>
): string {
  const cleanFull = Array.from(new Set(fullDates)).sort();
  const cleanSlots = normalizeSlotMap(slotOffs, cleanFull);
  const slotEntries = Object.keys(cleanSlots)
    .sort()
    .map((k) => `${k}:${cleanSlots[k].join('|')}`);
  return `${cleanFull.join(',')}##${slotEntries.join(';')}`;
}

export const MultiDateDayOffPicker: React.FC<MultiDateDayOffPickerProps> = ({
  savedDates,
  savedSlotOffs,
  bookedCountByDate,
  saving,
  onSaveSchedule,
}) => {
  const todayKey = useMemo(() => getTodayKey(), []);
  const initialDate = useMemo(() => {
    const firstSaved = savedDates[0] || Object.keys(savedSlotOffs || {}).sort()[0];
    if (firstSaved && /^\d{4}-\d{2}-\d{2}$/.test(firstSaved)) {
      const [y, m] = firstSaved.split('-').map(Number);
      return { year: y, month: m - 1 };
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  }, [savedDates, savedSlotOffs]);

  const [viewYear, setViewYear] = useState<number>(initialDate.year);
  const [viewMonth, setViewMonth] = useState<number>(initialDate.month);
  const [mode, setMode] = useState<DayOffMode>('FULL');
  const [selectedHours, setSelectedHours] = useState<string[]>([TIME_SLOTS[0]]);

  const [draftFullDates, setDraftFullDates] = useState<string[]>(() =>
    Array.from(new Set(savedDates)).sort()
  );
  const [draftSlotOffs, setDraftSlotOffs] = useState<Record<string, string[]>>(() =>
    normalizeSlotMap(savedSlotOffs, savedDates)
  );
  const [rangeStart, setRangeStart] = useState<string>('');
  const [rangeEnd, setRangeEnd] = useState<string>('');

  const savedSignature = useMemo(
    () => serializeSchedule(savedDates, savedSlotOffs || {}),
    [savedDates, savedSlotOffs]
  );

  useEffect(() => {
    const nextFull = Array.from(new Set(savedDates)).sort();
    setDraftFullDates(nextFull);
    setDraftSlotOffs(normalizeSlotMap(savedSlotOffs, nextFull));
  }, [savedSignature]);

  const draftSignature = useMemo(
    () => serializeSchedule(draftFullDates, draftSlotOffs),
    [draftFullDates, draftSlotOffs]
  );
  const isDirty = draftSignature !== savedSignature;

  const fullSet = useMemo(() => new Set(draftFullDates), [draftFullDates]);
  const partialDates = useMemo(() => Object.keys(draftSlotOffs).sort(), [draftSlotOffs]);
  const totalConfiguredDays = draftFullDates.length + partialDates.length;

  const calendarCells = useMemo(() => {
    const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: Array<{ dateKey: string | null; dayNumber: number | null }> = [];
    for (let i = 0; i < firstDayOfWeek; i += 1) {
      cells.push({ dateKey: null, dayNumber: null });
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push({
        dateKey: formatDateKey(viewYear, viewMonth, day),
        dayNumber: day,
      });
    }
    return cells;
  }, [viewYear, viewMonth]);

  const selectSingleHourOption = (slot: string) => {
    setSelectedHours([slot]);
  };

  const handleDateClick = (dateKey: string) => {
    if (mode === 'FULL') {
      if (fullSet.has(dateKey)) {
        setDraftFullDates((prev) => prev.filter((d) => d !== dateKey));
      } else {
        setDraftFullDates((prev) => [...prev, dateKey].sort());
        setDraftSlotOffs((prev) => {
          if (!prev[dateKey]) return prev;
          const next = { ...prev };
          delete next[dateKey];
          return next;
        });
      }
      return;
    }

    // SLOT mode (1 Job · 1 Off)
    const hoursToApply = selectedHours.length > 0 ? selectedHours : [TIME_SLOTS[0]];
    const existingSlots = draftSlotOffs[dateKey];
    const sameSlots =
      existingSlots &&
      existingSlots.length === hoursToApply.length &&
      existingSlots.every((s, idx) => s === hoursToApply[idx]);

    if (sameSlots) {
      // Clicking again with same hours removes partial day off
      setDraftSlotOffs((prev) => {
        const next = { ...prev };
        delete next[dateKey];
        return next;
      });
    } else {
      // Remove from full day off if it was full, then set partial slots
      setDraftFullDates((prev) => prev.filter((d) => d !== dateKey));
      setDraftSlotOffs((prev) => ({
        ...prev,
        [dateKey]: [...hoursToApply],
      }));
    }
  };

  const handleApplyRange = () => {
    if (!rangeStart || !rangeEnd) return;
    const datesInRange = expandDateRange(rangeStart, rangeEnd);
    if (datesInRange.length === 0) return;

    if (mode === 'FULL') {
      setDraftFullDates((prev) => Array.from(new Set([...prev, ...datesInRange])).sort());
      setDraftSlotOffs((prev) => {
        const next = { ...prev };
        for (const d of datesInRange) {
          delete next[d];
        }
        return next;
      });
    } else {
      const hoursToApply = selectedHours.length > 0 ? selectedHours : [TIME_SLOTS[0]];
      const rangeSet = new Set(datesInRange);
      setDraftFullDates((prev) => prev.filter((d) => !rangeSet.has(d)));
      setDraftSlotOffs((prev) => {
        const next = { ...prev };
        for (const d of datesInRange) {
          next[d] = [...hoursToApply];
        }
        return next;
      });
    }

    const [y, m] = datesInRange[0].split('-').map(Number);
    if (y && m) {
      setViewYear(y);
      setViewMonth(m - 1);
    }
    setRangeStart('');
    setRangeEnd('');
  };

  const handleRemoveDate = (dateKey: string) => {
    setDraftFullDates((prev) => prev.filter((d) => d !== dateKey));
    setDraftSlotOffs((prev) => {
      if (!prev[dateKey]) return prev;
      const next = { ...prev };
      delete next[dateKey];
      return next;
    });
  };

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

  const handleGoToday = () => {
    const now = new Date();
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
  };

  const handleResetDraft = () => {
    const nextFull = Array.from(new Set(savedDates)).sort();
    setDraftFullDates(nextFull);
    setDraftSlotOffs(normalizeSlotMap(savedSlotOffs, nextFull));
  };

  const handleClearAll = () => {
    setDraftFullDates([]);
    setDraftSlotOffs({});
  };

  const combinedScheduleList = useMemo(() => {
    const rows: Array<{
      date: string;
      type: 'FULL' | 'SLOT';
      slots: string[];
    }> = [];
    for (const d of draftFullDates) {
      rows.push({ date: d, type: 'FULL', slots: [] });
    }
    for (const d of partialDates) {
      rows.push({ date: d, type: 'SLOT', slots: draftSlotOffs[d] || [] });
    }
    return rows.sort((a, b) => a.date.localeCompare(b.date));
  }, [draftFullDates, partialDates, draftSlotOffs]);

  return (
    <div className="space-y-4">
      {/* Mode Switcher: Full Day Off vs Off Per Jam (1 Job · 1 Off) */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setMode('FULL')}
          className={`p-2.5 rounded-[5px] border text-left transition-all cursor-pointer ${
            mode === 'FULL'
              ? 'bg-[#FF2E5B]/15 border-[#FF2E5B] text-[#F8FAFC]'
              : 'bg-[#0A0C10] border-white/10 text-[#94A3B8] hover:border-white/25'
          }`}
        >
          <div className="flex items-center gap-1.5 font-telemetry text-xs font-bold uppercase text-[#FF2E5B]">
            <CalendarOff className="w-3.5 h-3.5" />
            Full Day Off
          </div>
          <p className="mt-0.5 font-telemetry text-[10px] text-[#94A3B8]">
            Libur seharian (0 Job · 2 Off)
          </p>
        </button>

        <button
          type="button"
          onClick={() => setMode('SLOT')}
          className={`p-2.5 rounded-[5px] border text-left transition-all cursor-pointer ${
            mode === 'SLOT'
              ? 'bg-[#FACC15]/15 border-[#FACC15] text-[#F8FAFC]'
              : 'bg-[#0A0C10] border-white/10 text-[#94A3B8] hover:border-white/25'
          }`}
        >
          <div className="flex items-center gap-1.5 font-telemetry text-xs font-bold uppercase text-[#FACC15]">
            <Clock className="w-3.5 h-3.5" />
            Off Per Jam
          </div>
          <p className="mt-0.5 font-telemetry text-[10px] text-[#94A3B8]">
            1 Job · 1 Off dalam 1 hari
          </p>
        </button>
      </div>

      {/* Hour Slot Selector (visible when Off Per Jam mode is active) */}
      {mode === 'SLOT' && (
        <div className="p-3.5 bg-[#0A0C10] border border-[#FACC15]/35 rounded-[6px] space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 font-telemetry text-[11px] font-bold uppercase tracking-[0.06em] text-[#FACC15]">
              <Clock className="w-3.5 h-3.5" />
              Pilih Jam yang Di-Off-kan
            </span>
            <span className="font-telemetry text-[10px] text-[#94A3B8]">
              Kuota otomatis: 1 Job/Hari
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {TIME_SLOTS.map((slot) => {
              const active = selectedHours.includes(slot);
              return (
                <button
                  key={slot}
                  type="button"
                  onClick={() => selectSingleHourOption(slot)}
                  className={`py-2 px-3 rounded-[4px] border font-telemetry text-xs font-bold transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#FACC15]/20 border-[#FACC15] text-[#FACC15]'
                      : 'bg-[#12161F] border-white/10 text-[#94A3B8] hover:text-white hover:border-white/25'
                  }`}
                >
                  OFF {slot}
                </button>
              );
            })}
          </div>

          <p className="font-telemetry text-[10px] text-[#94A3B8] leading-relaxed">
            Klik tanggal di kalender untuk menandai jam <span className="text-[#FACC15] font-bold">{selectedHours[0]}</span> sebagai OFF. Jam{' '}
            <span className="text-[#00F0FF] font-bold">
              {TIME_SLOTS.find((s) => s !== selectedHours[0]) || TIME_SLOTS[1]}
            </span>{' '}
            tetap terbuka untuk 1 job scrim.
          </p>
        </div>
      )}

      {/* Calendar Container */}
      <div className="bg-[#0A0C10] border border-white/[0.08] rounded-[6px] p-4 space-y-3">
        {/* Month Header */}
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handlePrevMonth}
            aria-label="Bulan sebelumnya"
            className="w-8 h-8 rounded-[4px] bg-[#12161F] border border-white/10 text-[#94A3B8] hover:text-[#F8FAFC] hover:border-[#00F0FF] flex items-center justify-center transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2">
            <span className="font-display text-base font-bold uppercase tracking-[0.04em] text-[#F8FAFC]">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              onClick={handleGoToday}
              className="px-2 py-0.5 rounded-[3px] bg-white/[0.05] border border-white/10 font-telemetry text-[10px] uppercase text-[#94A3B8] hover:text-[#00F0FF] hover:border-[#00F0FF]/50 transition-colors cursor-pointer"
            >
              Hari Ini
            </button>
          </div>

          <button
            type="button"
            onClick={handleNextMonth}
            aria-label="Bulan berikutnya"
            className="w-8 h-8 rounded-[4px] bg-[#12161F] border border-white/10 text-[#94A3B8] hover:text-[#F8FAFC] hover:border-[#00F0FF] flex items-center justify-center transition-colors cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Weekday Headers */}
        <div className="grid grid-cols-7 gap-1 text-center font-telemetry text-[10px] font-bold uppercase tracking-[0.06em] text-[#64748B]">
          {WEEKDAY_LABELS.map((day) => (
            <div key={day} className="py-1">
              {day}
            </div>
          ))}
        </div>

        {/* Day Cells */}
        <div className="grid grid-cols-7 gap-1.5">
          {calendarCells.map((cell, idx) => {
            if (!cell.dateKey || cell.dayNumber === null) {
              return <div key={`empty-${idx}`} className="h-9" />;
            }
            const isFullOff = fullSet.has(cell.dateKey);
            const partialSlots = draftSlotOffs[cell.dateKey];
            const isPartialOff = Boolean(partialSlots && partialSlots.length > 0);
            const isToday = cell.dateKey === todayKey;
            const bookedCount = bookedCountByDate[cell.dateKey] || 0;

            const tooltipParts = [cell.dateKey];
            if (isFullOff) tooltipParts.push('FULL DAY OFF (0 Job)');
            else if (isPartialOff)
              tooltipParts.push(`1 JOB · OFF: ${partialSlots.join(', ')}`);
            if (bookedCount > 0) tooltipParts.push(`${bookedCount} match terjadwal`);

            return (
              <button
                key={cell.dateKey}
                type="button"
                onClick={() => handleDateClick(cell.dateKey!)}
                title={tooltipParts.join(' · ')}
                className={`relative h-9 rounded-[4px] font-telemetry text-xs font-semibold transition-all cursor-pointer flex items-center justify-center border ${
                  isFullOff
                    ? 'bg-[#FF2E5B]/20 border-[#FF2E5B] text-[#FF2E5B] font-bold shadow-[0_0_10px_rgba(255,46,91,0.22)]'
                    : isPartialOff
                      ? 'bg-[#FACC15]/18 border-[#FACC15] text-[#FACC15] font-bold shadow-[0_0_10px_rgba(250,204,21,0.18)]'
                      : isToday
                        ? 'bg-[#12161F] border-[#00F0FF]/55 text-[#00F0FF] hover:bg-white/[0.06]'
                        : 'bg-[#12161F] border-white/[0.06] text-[#CBD5E1] hover:border-white/30 hover:text-white'
                }`}
              >
                <span>{cell.dayNumber}</span>
                {isPartialOff && (
                  <span className="absolute top-0.5 right-0.5 text-[8px] leading-none font-bold text-[#FACC15]">
                    1J
                  </span>
                )}
                {bookedCount > 0 && (
                  <span
                    className={`absolute bottom-1 w-1.5 h-1.5 rounded-full ${
                      isFullOff || isPartialOff ? 'bg-[#CCFF00]' : 'bg-[#00F0FF]'
                    }`}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="pt-2 border-t border-white/[0.06] flex flex-wrap items-center gap-x-3.5 gap-y-1 font-telemetry text-[10px] text-[#94A3B8]">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-[2px] bg-[#FF2E5B]/30 border border-[#FF2E5B]" />
            Full Off (0 Job)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-[2px] bg-[#FACC15]/25 border border-[#FACC15]" />
            Off Jam (1 Job · 1 Off)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#00F0FF]" />
            Ada Match
          </span>
        </div>
      </div>

      {/* Quick Multi-Day Range Picker */}
      <div className="p-3.5 bg-[#0A0C10] border border-white/[0.08] rounded-[6px] space-y-2.5">
        <div className="flex items-center gap-1.5 font-telemetry text-[11px] font-bold uppercase tracking-[0.06em] text-[#94A3B8]">
          <CalendarDays className="w-3.5 h-3.5 text-[#00F0FF]" />
          Pilih Rentang ({mode === 'FULL' ? 'Full Day Off' : 'Off Per Jam'})
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input
            type="date"
            value={rangeStart}
            onChange={(e) => setRangeStart(e.target.value)}
            aria-label="Tanggal mulai day off"
            className="w-full px-2.5 py-2 bg-[#12161F] border border-white/12 rounded-[4px] font-telemetry text-xs text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
          />
          <input
            type="date"
            value={rangeEnd}
            onChange={(e) => setRangeEnd(e.target.value)}
            aria-label="Tanggal selesai day off"
            className="w-full px-2.5 py-2 bg-[#12161F] border border-white/12 rounded-[4px] font-telemetry text-xs text-[#F8FAFC] focus:outline-none focus:border-[#00F0FF]"
          />
        </div>
        <button
          type="button"
          disabled={!rangeStart || !rangeEnd}
          onClick={handleApplyRange}
          className="w-full py-2 px-3 bg-white/[0.06] hover:bg-[#FF2E5B]/20 border border-white/15 hover:border-[#FF2E5B]/60 text-[#F8FAFC] font-telemetry text-xs font-bold uppercase tracking-[0.06em] rounded-[4px] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          Terapkan Rentang ke Kalender
        </button>
      </div>

      {/* Save & Action Bar */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 font-telemetry text-xs">
          <span className="text-[#94A3B8]">
            Terjadwal:{' '}
            <span className="text-[#FF2E5B] font-bold">{draftFullDates.length} Full</span>
            {' · '}
            <span className="text-[#FACC15] font-bold">{partialDates.length} Off Jam</span>
          </span>
          {isDirty && (
            <span className="px-2 py-0.5 rounded-[3px] bg-[#CCFF00]/15 text-[#CCFF00] text-[10px] font-bold uppercase">
              Belum Disimpan
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={saving || !isDirty}
            onClick={() => onSaveSchedule(draftFullDates, draftSlotOffs)}
            className="flex-1 min-h-[42px] px-4 bg-[#FF2E5B] text-white font-display text-sm font-bold uppercase tracking-[0.05em] rounded-[4px] hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all inline-flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            {saving ? 'Menyimpan...' : `Simpan Jadwal Off (${totalConfiguredDays})`}
          </button>

          {isDirty && (
            <button
              type="button"
              disabled={saving}
              onClick={handleResetDraft}
              title="Batalkan perubahan yang belum disimpan"
              className="px-3 min-h-[42px] bg-[#0A0C10] border border-white/15 text-[#94A3B8] hover:text-white hover:border-white/35 font-telemetry text-xs uppercase rounded-[4px] inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Batal
            </button>
          )}

          {totalConfiguredDays > 0 && (
            <button
              type="button"
              disabled={saving}
              onClick={handleClearAll}
              title="Kosongkan semua jadwal off"
              className="px-3 min-h-[42px] bg-[#0A0C10] border border-white/15 text-[#94A3B8] hover:text-[#FF2E5B] hover:border-[#FF2E5B]/60 font-telemetry text-xs uppercase rounded-[4px] inline-flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Selected Day Off Summary List */}
      <div className="space-y-2">
        <div className="font-telemetry text-[11px] uppercase tracking-[0.08em] text-[#94A3B8]">
          Ringkasan Jadwal Off ({combinedScheduleList.length})
        </div>
        {combinedScheduleList.length === 0 ? (
          <div className="p-4 bg-[#0A0C10] border border-white/[0.06] rounded-[4px] font-telemetry text-xs text-[#94A3B8]">
            Belum ada jadwal Off. Semua hari tersedia (maks 2 match/hari).
          </div>
        ) : (
          <div className="space-y-1.5 max-h-[190px] overflow-y-auto pr-1">
            {combinedScheduleList.map((item) => (
              <div
                key={item.date}
                className={`flex items-center justify-between gap-2 px-3 py-2 rounded-[4px] border font-telemetry text-xs ${
                  item.type === 'FULL'
                    ? 'bg-[#0A0C10] border-[#FF2E5B]/40 text-[#FF2E5B]'
                    : 'bg-[#0A0C10] border-[#FACC15]/40 text-[#FACC15]'
                }`}
              >
                <div className="min-w-0 flex items-center gap-2">
                  {item.type === 'FULL' ? (
                    <CalendarOff className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <span className="font-bold">{item.date}</span>
                    <span className="mx-1.5 text-white/25">·</span>
                    {item.type === 'FULL' ? (
                      <span className="text-[11px] uppercase">FULL OFF (0 JOB)</span>
                    ) : (
                      <span className="text-[11px]">
                        1 JOB · OFF: {item.slots.join(', ')}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveDate(item.date)}
                  aria-label={`Hapus jadwal off ${item.date}`}
                  className="p-1 text-[#94A3B8] hover:text-white cursor-pointer shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
