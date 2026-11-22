import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Globe,
  Image as ImageIcon,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { api } from '../api';
import type { BrandSettings, HeroSettings, OrdalDatabase } from '../types';
import { isSafeLogoSrc, ORDAL_LOGOS, OrdalMonogram, OrdalWordmark } from './BrandAssets';

interface HeroSettingsPanelProps {
  db: OrdalDatabase;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string) => void;
}

const DEFAULT_HERO: HeroSettings = {
  eyebrowPrimary: 'ORDAL COMPETITIVE ESPORTS HUB',
  eyebrowSecondary: 'POINT BLANK · FREE FIRE · EFOOTBALL',
  headline: '',
  subtitle: '',
  primaryCtaLabel: 'Register Squad',
  secondaryCtaLabel: 'Lihat Turnamen',
  secondaryCtaHref: '#turnamen',
  featuredTournamentId: '',
  backgroundImageUrl: '',
};

const DEFAULT_BRAND: BrandSettings = {
  wordmarkUrl: '',
  monogramUrl: '',
  faviconUrl: '',
  brandName: 'ORDAL Esports Hub',
};

const MAX_BG_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function optimizeHeroBackground(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Format gambar tidak dapat diproses.'));
      img.onload = () => {
        const targetW = Math.min(1600, img.width);
        const targetH = Math.round((img.height / img.width) * targetW);
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas tidak tersedia di browser.'));
          return;
        }
        ctx.drawImage(img, 0, 0, targetW, targetH);
        const dataUrl = canvas.toDataURL('image/webp', 0.82);
        resolve(dataUrl);
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

function optimizeLogoImage(file: File, maxDimension: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file logo.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Format gambar logo tidak dapat diproses.'));
      img.onload = () => {
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
        const targetW = Math.max(1, Math.round(img.width * scale));
        const targetH = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas tidak tersedia di browser.'));
          return;
        }
        ctx.clearRect(0, 0, targetW, targetH);
        ctx.drawImage(img, 0, 0, targetW, targetH);
        // Preserve alpha transparency for PNG files
        const mime = file.type === 'image/png' ? 'image/png' : 'image/webp';
        const dataUrl = canvas.toDataURL(mime, 0.9);
        resolve(dataUrl);
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

function formatUpdatedAt(iso?: string): string {
  if (!iso) return 'Belum pernah diubah';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const HeroSettingsPanel: React.FC<HeroSettingsPanelProps> = ({
  db,
  onRefresh,
  onNotify,
}) => {
  const savedHero: HeroSettings = useMemo(
    () => ({
      ...DEFAULT_HERO,
      ...(db.heroSettings || {}),
    }),
    [db.heroSettings]
  );

  const savedBrand: BrandSettings = useMemo(
    () => ({
      ...DEFAULT_BRAND,
      ...(db.brandSettings || {}),
    }),
    [db.brandSettings]
  );

  const [form, setForm] = useState<HeroSettings>(savedHero);
  const [brandForm, setBrandForm] = useState<BrandSettings>(savedBrand);
  const [saving, setSaving] = useState(false);
  const [savingBrand, setSavingBrand] = useState(false);
  const [uploadingBg, setUploadingBg] = useState(false);
  const [uploadingBrandField, setUploadingBrandField] = useState<
    'wordmarkUrl' | 'monogramUrl' | 'faviconUrl' | null
  >(null);
  const [brandFeedback, setBrandFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
    timestamp: string;
  } | null>(null);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
    timestamp: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const wordmarkInputRef = useRef<HTMLInputElement | null>(null);
  const monogramInputRef = useRef<HTMLInputElement | null>(null);
  const faviconInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setForm(savedHero);
  }, [savedHero]);

  useEffect(() => {
    setBrandForm(savedBrand);
  }, [savedBrand]);

  const isBrandDirty = useMemo(() => {
    return (
      (brandForm.wordmarkUrl || '') !== (savedBrand.wordmarkUrl || '') ||
      (brandForm.monogramUrl || '') !== (savedBrand.monogramUrl || '') ||
      (brandForm.faviconUrl || '') !== (savedBrand.faviconUrl || '') ||
      (brandForm.brandName || '') !== (savedBrand.brandName || '')
    );
  }, [brandForm, savedBrand]);

  const isDirty = useMemo(() => {
    return (
      form.eyebrowPrimary !== savedHero.eyebrowPrimary ||
      form.eyebrowSecondary !== savedHero.eyebrowSecondary ||
      form.headline !== savedHero.headline ||
      form.subtitle !== savedHero.subtitle ||
      form.primaryCtaLabel !== savedHero.primaryCtaLabel ||
      form.secondaryCtaLabel !== savedHero.secondaryCtaLabel ||
      form.secondaryCtaHref !== savedHero.secondaryCtaHref ||
      form.featuredTournamentId !== savedHero.featuredTournamentId ||
      (form.backgroundImageUrl || '') !== (savedHero.backgroundImageUrl || '')
    );
  }, [form, savedHero]);

  const resolvedTournament = useMemo(() => {
    if (form.featuredTournamentId) {
      const explicit = db.tournaments.find((t) => t.id === form.featuredTournamentId);
      if (explicit) return explicit;
    }
    return db.tournaments.find((t) => t.status === 'ONGOING') || db.tournaments[0];
  }, [db.tournaments, form.featuredTournamentId]);

  const previewHeadline =
    form.headline.trim() ||
    resolvedTournament?.name ||
    'ARENA TURNAMEN POINT BLANK, FREE FIRE & EFOOTBALL';

  const previewSubtitle =
    form.subtitle.trim() ||
    resolvedTournament?.description ||
    'Platform kompetitif terintegrasi untuk komunitas First-Person Shooter dengan otomasi bracket real-time, check-in roster instan, dan verifikasi sengketa cepat.';

  const handleBackgroundUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setFeedback({
        type: 'error',
        message: 'Format gambar harus JPG, PNG, atau WEBP.',
        timestamp: new Date().toLocaleTimeString('id-ID'),
      });
      e.target.value = '';
      return;
    }
    if (file.size > MAX_BG_BYTES) {
      setFeedback({
        type: 'error',
        message: 'Ukuran file maksimal 2 MB agar halaman utama tetap cepat.',
        timestamp: new Date().toLocaleTimeString('id-ID'),
      });
      e.target.value = '';
      return;
    }
    setUploadingBg(true);
    try {
      const optimized = await optimizeHeroBackground(file);
      setForm((prev) => ({ ...prev, backgroundImageUrl: optimized }));
      setFeedback(null);
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Gagal memproses gambar latar.',
        timestamp: new Date().toLocaleTimeString('id-ID'),
      });
    } finally {
      setUploadingBg(false);
      e.target.value = '';
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      await api.updateHeroSettings({
        eyebrowPrimary: form.eyebrowPrimary,
        eyebrowSecondary: form.eyebrowSecondary,
        headline: form.headline,
        subtitle: form.subtitle,
        primaryCtaLabel: form.primaryCtaLabel,
        secondaryCtaLabel: form.secondaryCtaLabel,
        secondaryCtaHref: form.secondaryCtaHref,
        featuredTournamentId: form.featuredTournamentId,
        backgroundImageUrl: form.backgroundImageUrl || '',
      });
      await onRefresh();
      const nowLabel = new Date().toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      setFeedback({
        type: 'success',
        message: 'Hero Settings berhasil disimpan dan langsung aktif di halaman utama.',
        timestamp: nowLabel,
      });
      onNotify('Hero Settings berhasil diperbarui & tayang di Website Publik.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan Hero Settings.';
      setFeedback({
        type: 'error',
        message: msg,
        timestamp: new Date().toLocaleTimeString('id-ID'),
      });
      onNotify(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleResetToDefault = () => {
    setForm({
      ...DEFAULT_HERO,
      updatedAt: savedHero.updatedAt,
    });
    setFeedback(null);
  };

  const handleDiscardChanges = () => {
    setForm(savedHero);
    setFeedback(null);
  };

  const handleBrandUpload = async (
    field: 'wordmarkUrl' | 'monogramUrl' | 'faviconUrl',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setBrandFeedback({
        type: 'error',
        message: 'Format file harus PNG, JPG, atau WEBP.',
        timestamp: new Date().toLocaleTimeString('id-ID'),
      });
      e.target.value = '';
      return;
    }
    if (file.size > MAX_BG_BYTES) {
      setBrandFeedback({
        type: 'error',
        message: 'Ukuran file maksimal 2 MB.',
        timestamp: new Date().toLocaleTimeString('id-ID'),
      });
      e.target.value = '';
      return;
    }
    setUploadingBrandField(field);
    try {
      const maxDim = field === 'wordmarkUrl' ? 600 : field === 'monogramUrl' ? 256 : 128;
      const optimized = await optimizeLogoImage(file, maxDim);
      setBrandForm((prev) => ({ ...prev, [field]: optimized }));
      setBrandFeedback(null);
    } catch (err) {
      setBrandFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Gagal memproses file gambar logo.',
        timestamp: new Date().toLocaleTimeString('id-ID'),
      });
    } finally {
      setUploadingBrandField(null);
      e.target.value = '';
    }
  };

  const handleSaveBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBrand(true);
    setBrandFeedback(null);
    try {
      await api.updateBrandSettings({
        wordmarkUrl: brandForm.wordmarkUrl || '',
        monogramUrl: brandForm.monogramUrl || '',
        faviconUrl: brandForm.faviconUrl || '',
        brandName: (brandForm.brandName || '').trim() || 'ORDAL Esports Hub',
      });
      await onRefresh();
      const nowLabel = new Date().toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      setBrandFeedback({
        type: 'success',
        message: 'Logo & Icon Website berhasil diperbarui dan langsung aktif di seluruh halaman.',
        timestamp: nowLabel,
      });
      onNotify('Logo & Favicon Website berhasil diperbarui.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan pengaturan logo.';
      setBrandFeedback({
        type: 'error',
        message: msg,
        timestamp: new Date().toLocaleTimeString('id-ID'),
      });
      onNotify(msg);
    } finally {
      setSavingBrand(false);
    }
  };

  const handleResetBrandToDefault = () => {
    setBrandForm({
      ...DEFAULT_BRAND,
      updatedAt: savedBrand.updatedAt,
    });
    setBrandFeedback(null);
  };

  const effectivePreviewFavicon =
    isSafeLogoSrc(brandForm.faviconUrl) ||
    isSafeLogoSrc(brandForm.monogramUrl) ||
    ORDAL_LOGOS.monogramDark;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 font-telemetry text-[11px] font-bold uppercase tracking-[0.1em] text-[#00F0FF]">
            <Sparkles className="w-3.5 h-3.5" />
            Branding & Homepage Hero Manager
          </div>
          <h1 className="mt-1 font-display text-3xl font-bold uppercase text-[#F8FAFC]">
            Hero &amp; Logo Website
          </h1>
          <p className="text-sm text-[#94A3B8] mt-1">
            Ubah icon logo website (Wordmark, Monogram, Favicon) serta konten Hero halaman utama secara real-time.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 font-telemetry text-[11px]">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#12161F] border border-white/[0.08] rounded-[4px] text-[#94A3B8]">
            <Clock className="w-3.5 h-3.5 text-[#00F0FF]" />
            Terakhir disimpan: <strong className="text-[#F8FAFC]">{formatUpdatedAt(savedHero.updatedAt)}</strong>
          </span>
          {(isDirty || isBrandDirty) ? (
            <span className="px-2.5 py-1.5 bg-[#CCFF00]/15 border border-[#CCFF00]/40 text-[#CCFF00] font-bold uppercase rounded-[4px]">
              Perubahan Belum Disimpan
            </span>
          ) : (
            <span className="px-2.5 py-1.5 bg-[#00F0FF]/10 border border-[#00F0FF]/35 text-[#00F0FF] font-bold uppercase rounded-[4px]">
              Tersinkronisasi
            </span>
          )}
        </div>
      </div>

      {/* BRAND / LOGO WEBSITE MANAGER */}
      <form
        onSubmit={handleSaveBrand}
        className="bg-[#12161F] border border-white/[0.08] rounded-[6px] p-5 sm:p-6 space-y-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-white/[0.08]">
          <div>
            <div className="inline-flex items-center gap-2 font-telemetry text-[11px] font-bold uppercase tracking-[0.08em] text-[#CCFF00]">
              <ImageIcon className="w-3.5 h-3.5" />
              Identitas Visual &amp; Icon Website
            </div>
            <h2 className="mt-1 font-display text-xl font-bold uppercase text-[#F8FAFC]">
              Logo Wordmark, Monogram &amp; Favicon
            </h2>
            <p className="text-xs text-[#94A3B8] mt-0.5">
              Unggah gambar PNG transparan / WEBP / JPG (maks. 2 MB) atau masukkan URL HTTPS. Perubahan berlaku di header, footer, login, seluruh dashboard, dan tab browser.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isBrandDirty && (
              <span className="px-2 py-1 bg-[#CCFF00]/15 border border-[#CCFF00]/40 text-[#CCFF00] font-telemetry text-[10px] font-bold uppercase rounded-[4px]">
                Logo Belum Disimpan
              </span>
            )}
            <button
              type="button"
              onClick={handleResetBrandToDefault}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.03] hover:bg-white/[0.08] border border-white/15 rounded-[4px] font-telemetry text-[11px] font-semibold uppercase text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Logo Default
            </button>
          </div>
        </div>

        {brandFeedback && (
          <div
            role="status"
            className={`p-3.5 rounded-[6px] border flex items-start gap-2.5 text-xs ${
              brandFeedback.type === 'success'
                ? 'bg-[#CCFF00]/10 border-[#CCFF00]/45 text-[#CCFF00]'
                : 'bg-[#FF2E5B]/12 border-[#FF2E5B]/50 text-[#FFDADB]'
            }`}
          >
            {brandFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <div className="font-semibold">{brandFeedback.message}</div>
              <div className="font-telemetry text-[10px] opacity-80 mt-0.5">
                Waktu server: {brandFeedback.timestamp} WIB
              </div>
            </div>
          </div>
        )}

        {/* Live Logo Preview Strip */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="p-3.5 bg-[#0A0C10] border border-white/[0.08] rounded-[4px] flex items-center justify-between gap-3">
            <div>
              <div className="font-telemetry text-[10px] uppercase tracking-[0.08em] text-[#94A3B8]">
                Preview Navbar / Wordmark
              </div>
              <div className="text-[11px] text-[#64748B] mt-0.5">Header &amp; Footer</div>
            </div>
            <OrdalWordmark height={34} srcOverride={brandForm.wordmarkUrl} />
          </div>

          <div className="p-3.5 bg-[#0A0C10] border border-white/[0.08] rounded-[4px] flex items-center justify-between gap-3">
            <div>
              <div className="font-telemetry text-[10px] uppercase tracking-[0.08em] text-[#94A3B8]">
                Preview Monogram Icon
              </div>
              <div className="text-[11px] text-[#64748B] mt-0.5">Dashboard &amp; Badge</div>
            </div>
            <OrdalMonogram size={38} srcOverride={brandForm.monogramUrl} />
          </div>

          <div className="p-3.5 bg-[#0A0C10] border border-white/[0.08] rounded-[4px] flex items-center justify-between gap-3">
            <div>
              <div className="font-telemetry text-[10px] uppercase tracking-[0.08em] text-[#94A3B8]">
                Preview Tab Browser
              </div>
              <div className="text-[11px] text-[#64748B] mt-0.5">Favicon 16×16 / 32×32</div>
            </div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1.5 bg-[#12161F] border border-white/15 rounded-[4px] max-w-[170px]">
              <img
                src={effectivePreviewFavicon}
                alt="Preview Favicon"
                className="w-4 h-4 object-contain rounded-[2px] shrink-0"
              />
              <span className="text-[11px] text-[#F8FAFC] truncate">
                {brandForm.brandName || 'ORDAL Esports Hub'}
              </span>
            </div>
          </div>
        </div>

        {/* 3 Upload / URL Controls */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* 1. Wordmark */}
          <div className="p-4 bg-[#0A0C10] border border-white/[0.08] rounded-[4px] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-telemetry text-xs font-bold uppercase tracking-[0.06em] text-[#F8FAFC]">
                1. Logo Wordmark
              </span>
              {brandForm.wordmarkUrl && (
                <button
                  type="button"
                  onClick={() => setBrandForm((p) => ({ ...p, wordmarkUrl: '' }))}
                  className="inline-flex items-center gap-1 font-telemetry text-[10px] text-[#FF2E5B] hover:underline cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  Hapus
                </button>
              )}
            </div>
            <input
              ref={wordmarkInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => void handleBrandUpload('wordmarkUrl', e)}
              className="hidden"
            />
            <button
              type="button"
              disabled={uploadingBrandField === 'wordmarkUrl'}
              onClick={() => wordmarkInputRef.current?.click()}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 bg-[#12161F] border border-[#00F0FF]/40 text-[#00F0FF] hover:bg-[#00F0FF]/10 font-telemetry text-xs font-bold uppercase rounded-[4px] cursor-pointer disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5" />
              {uploadingBrandField === 'wordmarkUrl' ? 'Memproses...' : 'Upload Logo Header'}
            </button>
            <input
              type="url"
              value={brandForm.wordmarkUrl.startsWith('data:') ? '' : brandForm.wordmarkUrl}
              onChange={(e) => setBrandForm((p) => ({ ...p, wordmarkUrl: e.target.value }))}
              placeholder={
                brandForm.wordmarkUrl.startsWith('data:')
                  ? 'Menggunakan gambar hasil upload'
                  : 'Atau tempel URL https://...'
              }
              className="w-full px-3 py-2 bg-[#12161F] border border-white/12 rounded-[4px] font-telemetry text-xs text-[#F8FAFC] focus:border-[#00F0FF] focus:outline-none"
            />
          </div>

          {/* 2. Monogram */}
          <div className="p-4 bg-[#0A0C10] border border-white/[0.08] rounded-[4px] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-telemetry text-xs font-bold uppercase tracking-[0.06em] text-[#F8FAFC]">
                2. Ikon Monogram (1:1)
              </span>
              {brandForm.monogramUrl && (
                <button
                  type="button"
                  onClick={() => setBrandForm((p) => ({ ...p, monogramUrl: '' }))}
                  className="inline-flex items-center gap-1 font-telemetry text-[10px] text-[#FF2E5B] hover:underline cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  Hapus
                </button>
              )}
            </div>
            <input
              ref={monogramInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => void handleBrandUpload('monogramUrl', e)}
              className="hidden"
            />
            <button
              type="button"
              disabled={uploadingBrandField === 'monogramUrl'}
              onClick={() => monogramInputRef.current?.click()}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 bg-[#12161F] border border-[#00F0FF]/40 text-[#00F0FF] hover:bg-[#00F0FF]/10 font-telemetry text-xs font-bold uppercase rounded-[4px] cursor-pointer disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5" />
              {uploadingBrandField === 'monogramUrl' ? 'Memproses...' : 'Upload Ikon Monogram'}
            </button>
            <input
              type="url"
              value={brandForm.monogramUrl.startsWith('data:') ? '' : brandForm.monogramUrl}
              onChange={(e) => setBrandForm((p) => ({ ...p, monogramUrl: e.target.value }))}
              placeholder={
                brandForm.monogramUrl.startsWith('data:')
                  ? 'Menggunakan gambar hasil upload'
                  : 'Atau tempel URL https://...'
              }
              className="w-full px-3 py-2 bg-[#12161F] border border-white/12 rounded-[4px] font-telemetry text-xs text-[#F8FAFC] focus:border-[#00F0FF] focus:outline-none"
            />
          </div>

          {/* 3. Favicon */}
          <div className="p-4 bg-[#0A0C10] border border-white/[0.08] rounded-[4px] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-telemetry text-xs font-bold uppercase tracking-[0.06em] text-[#F8FAFC] inline-flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-[#CCFF00]" />
                3. Favicon Browser
              </span>
              {brandForm.faviconUrl && (
                <button
                  type="button"
                  onClick={() => setBrandForm((p) => ({ ...p, faviconUrl: '' }))}
                  className="inline-flex items-center gap-1 font-telemetry text-[10px] text-[#FF2E5B] hover:underline cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  Hapus
                </button>
              )}
            </div>
            <input
              ref={faviconInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => void handleBrandUpload('faviconUrl', e)}
              className="hidden"
            />
            <button
              type="button"
              disabled={uploadingBrandField === 'faviconUrl'}
              onClick={() => faviconInputRef.current?.click()}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 bg-[#12161F] border border-[#CCFF00]/40 text-[#CCFF00] hover:bg-[#CCFF00]/10 font-telemetry text-xs font-bold uppercase rounded-[4px] cursor-pointer disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5" />
              {uploadingBrandField === 'faviconUrl' ? 'Memproses...' : 'Upload Favicon'}
            </button>
            <input
              type="url"
              value={brandForm.faviconUrl.startsWith('data:') ? '' : brandForm.faviconUrl}
              onChange={(e) => setBrandForm((p) => ({ ...p, faviconUrl: e.target.value }))}
              placeholder={
                brandForm.faviconUrl.startsWith('data:')
                  ? 'Menggunakan gambar hasil upload'
                  : 'Kosong = ikuti Ikon Monogram'
              }
              className="w-full px-3 py-2 bg-[#12161F] border border-white/12 rounded-[4px] font-telemetry text-xs text-[#F8FAFC] focus:border-[#CCFF00] focus:outline-none"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pt-2 border-t border-white/[0.08]">
          <div className="flex-1 max-w-sm">
            <label
              htmlFor="brand-name-input"
              className="block font-telemetry text-[11px] font-semibold uppercase tracking-[0.06em] text-[#94A3B8] mb-1"
            >
              Nama Alt Logo / Brand (Opsional)
            </label>
            <input
              id="brand-name-input"
              type="text"
              maxLength={60}
              value={brandForm.brandName || ''}
              onChange={(e) => setBrandForm((p) => ({ ...p, brandName: e.target.value }))}
              placeholder="ORDAL Esports Hub"
              className="w-full px-3 py-2 bg-[#0A0C10] border border-white/12 rounded-[4px] text-xs text-[#F8FAFC] focus:border-[#00F0FF] focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2.5">
            {isBrandDirty && (
              <button
                type="button"
                disabled={savingBrand}
                onClick={() => {
                  setBrandForm(savedBrand);
                  setBrandFeedback(null);
                }}
                className="px-4 min-h-[40px] border border-white/15 text-[#94A3B8] hover:text-[#F8FAFC] font-telemetry text-xs font-semibold uppercase rounded-[4px] cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>
            )}
            <button
              type="submit"
              disabled={savingBrand || uploadingBrandField !== null}
              className="inline-flex items-center justify-center gap-2 px-5 min-h-[40px] bg-[#CCFF00] text-[#0A0C10] font-display text-sm font-bold uppercase tracking-[0.05em] rounded-[4px] hover:brightness-110 transition-all cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {savingBrand ? 'Menyimpan Logo...' : 'Simpan Logo & Favicon'}
            </button>
          </div>
        </div>
      </form>

      {/* Real-Time Feedback Banner */}
      {feedback && (
        <div
          role="status"
          aria-live="polite"
          className={`p-4 rounded-[6px] border flex items-start justify-between gap-3 ${
            feedback.type === 'success'
              ? 'bg-[#CCFF00]/10 border-[#CCFF00]/40 text-[#CCFF00]'
              : 'bg-[#FF2E5B]/10 border-[#FF2E5B]/40 text-[#FF2E5B]'
          }`}
        >
          <div className="flex items-start gap-2.5">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            )}
            <div className="text-xs sm:text-sm font-medium">
              <span className="text-[#F8FAFC]">{feedback.message}</span>
              <span className="ml-2 font-telemetry text-[11px] opacity-80">
                ({feedback.timestamp})
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="font-telemetry text-[11px] uppercase opacity-75 hover:opacity-100 cursor-pointer shrink-0"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Live Preview Card */}
      <div className="bg-[#12161F] border border-white/[0.08] rounded-[6px] overflow-hidden">
        <div className="px-5 py-3 border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-2 bg-[#0A0C10]/60">
          <span className="font-telemetry text-xs font-bold uppercase tracking-[0.08em] text-[#F8FAFC]">
            Live Preview Hero (Tampilan Publik)
          </span>
          <span className="font-telemetry text-[11px] uppercase text-[#94A3B8]">
            Featured Tournament:{' '}
            <strong className="text-[#00F0FF]">
              {resolvedTournament ? resolvedTournament.name : 'Belum ada turnamen'}
            </strong>
          </span>
        </div>

        <div className="relative ordal-tactical-grid overflow-hidden">
          {form.backgroundImageUrl && (
            <img
              src={form.backgroundImageUrl}
              alt="Hero Background Preview"
              className="absolute inset-0 w-full h-full object-cover opacity-35"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-[#0A0C10]/95 via-[#0A0C10]/80 to-[#0A0C10]/55 pointer-events-none" />

          <div className="relative p-6 sm:p-8 lg:p-10 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            <div className="lg:col-span-8">
              <div className="flex flex-wrap items-center gap-2 font-telemetry text-[11px] font-semibold uppercase tracking-[0.1em] text-[#94A3B8]">
                <span className="text-[#00F0FF]">
                  {form.eyebrowPrimary.trim() || DEFAULT_HERO.eyebrowPrimary}
                </span>
                {form.eyebrowSecondary.trim() && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{form.eyebrowSecondary.trim()}</span>
                  </>
                )}
              </div>

              <h2 className="mt-3 font-display text-2xl sm:text-4xl font-bold uppercase leading-[1.08] text-[#F8FAFC] max-w-2xl">
                {previewHeadline}
              </h2>

              <p className="mt-3 text-xs sm:text-sm text-[#94A3B8] leading-relaxed max-w-xl">
                {previewSubtitle}
              </p>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center px-4 py-2.5 bg-[#FF2E5B] text-white font-display text-xs sm:text-sm font-bold uppercase tracking-[0.05em] rounded-[4px]">
                  {form.primaryCtaLabel.trim() || DEFAULT_HERO.primaryCtaLabel}
                </span>
                <span className="inline-flex items-center gap-1.5 px-4 py-2.5 border border-white/20 text-[#F8FAFC] font-display text-xs sm:text-sm font-semibold uppercase tracking-[0.05em] rounded-[4px]">
                  {form.secondaryCtaLabel.trim() || DEFAULT_HERO.secondaryCtaLabel}
                  <ArrowRight className="w-3.5 h-3.5 text-[#00F0FF]" />
                </span>
              </div>
            </div>

            <div className="lg:col-span-4 bg-[#0A0C10]/85 border border-white/[0.08] rounded-[6px] p-4 space-y-2.5 font-telemetry text-xs">
              <div className="text-[10px] uppercase tracking-[0.1em] text-[#94A3B8]">
                Ringkasan Data Hero Aktif
              </div>
              <div className="flex items-center justify-between gap-2 py-1 border-b border-white/[0.06]">
                <span className="text-[#94A3B8]">Prize Pool</span>
                <span className="font-bold text-[#CCFF00]">
                  {resolvedTournament?.prizePool || 'Rp 25.000.000'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 py-1 border-b border-white/[0.06]">
                <span className="text-[#94A3B8]">Link CTA Sekunder</span>
                <span className="font-bold text-[#00F0FF] truncate max-w-[150px]">
                  {form.secondaryCtaHref.trim() || '#turnamen'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 py-1">
                <span className="text-[#94A3B8]">Banner Latar</span>
                <span className="font-bold text-[#F8FAFC]">
                  {form.backgroundImageUrl ? 'Custom Image' : 'Tactical Grid Default'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Form */}
      <form
        onSubmit={handleSave}
        className="bg-[#12161F] border border-white/[0.08] rounded-[6px] p-5 sm:p-6 space-y-6"
      >
        <div className="pb-4 border-b border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold uppercase text-[#F8FAFC]">
              Form Konfigurasi Hero
            </h2>
            <p className="text-xs text-[#94A3B8] mt-0.5">
              Kosongkan Headline atau Subtitle jika ingin otomatis mengikuti data Turnamen Unggulan.
            </p>
          </div>
          <button
            type="button"
            onClick={handleResetToDefault}
            className="inline-flex items-center gap-1.5 px-3 py-2 border border-white/15 text-[#94A3B8] hover:text-[#F8FAFC] hover:border-white/30 font-telemetry text-xs font-semibold uppercase rounded-[4px] transition-colors cursor-pointer self-start sm:self-auto"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset ke Default
          </button>
        </div>

        {/* Featured Tournament Selector */}
        <div>
          <label
            htmlFor="hero-featured-tournament"
            className="block font-telemetry text-xs font-semibold uppercase tracking-[0.06em] text-[#94A3B8] mb-1.5"
          >
            Turnamen Unggulan di Hero (Featured Tournament)
          </label>
          <select
            id="hero-featured-tournament"
            value={form.featuredTournamentId}
            onChange={(e) => setForm({ ...form, featuredTournamentId: e.target.value })}
            className="w-full px-3.5 py-2.5 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC] focus:border-[#00F0FF] focus:outline-none"
          >
            <option value="">Otomatis (Turnamen ONGOING atau Terbaru)</option>
            {db.tournaments.map((t) => (
              <option key={t.id} value={t.id}>
                [{t.status}] {t.name} — {t.game} ({t.prizePool})
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-[11px] text-[#94A3B8]">
            Menentukan turnamen yang ditautkan pada tombol CTA utama, Prize Pool spotlight, serta fallback judul/deskripsi.
          </p>
        </div>

        {/* Eyebrow Labels */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="hero-eyebrow-primary"
              className="block font-telemetry text-xs font-semibold uppercase tracking-[0.06em] text-[#94A3B8] mb-1.5"
            >
              Eyebrow Label Utama (Cyan)
            </label>
            <input
              id="hero-eyebrow-primary"
              type="text"
              maxLength={80}
              value={form.eyebrowPrimary}
              onChange={(e) => setForm({ ...form, eyebrowPrimary: e.target.value })}
              placeholder="ORDAL COMPETITIVE ESPORTS HUB"
              className="w-full px-3.5 py-2.5 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC] focus:border-[#00F0FF] focus:outline-none"
            />
          </div>
          <div>
            <label
              htmlFor="hero-eyebrow-secondary"
              className="block font-telemetry text-xs font-semibold uppercase tracking-[0.06em] text-[#94A3B8] mb-1.5"
            >
              Eyebrow Label Sekunder
            </label>
            <input
              id="hero-eyebrow-secondary"
              type="text"
              maxLength={80}
              value={form.eyebrowSecondary}
              onChange={(e) => setForm({ ...form, eyebrowSecondary: e.target.value })}
              placeholder="POINT BLANK · FREE FIRE · EFOOTBALL"
              className="w-full px-3.5 py-2.5 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC] focus:border-[#00F0FF] focus:outline-none"
            />
          </div>
        </div>

        {/* Headline & Subtitle */}
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="hero-headline"
                className="font-telemetry text-xs font-semibold uppercase tracking-[0.06em] text-[#94A3B8]"
              >
                Custom Headline (Opsional)
              </label>
              <span className="font-telemetry text-[11px] text-[#94A3B8]">
                {form.headline.length}/140
              </span>
            </div>
            <input
              id="hero-headline"
              type="text"
              maxLength={140}
              value={form.headline}
              onChange={(e) => setForm({ ...form, headline: e.target.value })}
              placeholder={
                resolvedTournament
                  ? `Default: ${resolvedTournament.name}`
                  : 'ARENA TURNAMEN POINT BLANK, FREE FIRE & EFOOTBALL'
              }
              className="w-full px-3.5 py-2.5 bg-[#0A0C10] border border-white/12 rounded-[4px] text-sm text-[#F8FAFC] focus:border-[#00F0FF] focus:outline-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="hero-subtitle"
                className="font-telemetry text-xs font-semibold uppercase tracking-[0.06em] text-[#94A3B8]"
              >
                Custom Deskripsi / Subtitle (Opsional)
              </label>
              <span className="font-telemetry text-[11px] text-[#94A3B8]">
                {form.subtitle.length}/420
              </span>
            </div>
            <textarea
              id="hero-subtitle"
              rows={3}
              maxLength={420}
              value={form.subtitle}
              onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
              placeholder={
                resolvedTournament?.description ||
                'Platform kompetitif terintegrasi untuk komunitas First-Person Shooter...'
              }
              className="w-full px-3.5 py-2.5 bg-[#0A0C10] border border-white/12 rounded-[4px] text-sm text-[#F8FAFC] focus:border-[#00F0FF] focus:outline-none resize-y"
            />
          </div>
        </div>

        {/* CTA Configuration */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label
              htmlFor="hero-primary-cta"
              className="block font-telemetry text-xs font-semibold uppercase tracking-[0.06em] text-[#94A3B8] mb-1.5"
            >
              Label Tombol Utama (CTA)
            </label>
            <input
              id="hero-primary-cta"
              type="text"
              required
              maxLength={40}
              value={form.primaryCtaLabel}
              onChange={(e) => setForm({ ...form, primaryCtaLabel: e.target.value })}
              placeholder="Register Squad"
              className="w-full px-3.5 py-2.5 bg-[#0A0C10] border border-white/12 rounded-[4px] text-sm text-[#F8FAFC] focus:border-[#00F0FF] focus:outline-none"
            />
          </div>
          <div>
            <label
              htmlFor="hero-secondary-cta"
              className="block font-telemetry text-xs font-semibold uppercase tracking-[0.06em] text-[#94A3B8] mb-1.5"
            >
              Label Tombol Sekunder
            </label>
            <input
              id="hero-secondary-cta"
              type="text"
              required
              maxLength={40}
              value={form.secondaryCtaLabel}
              onChange={(e) => setForm({ ...form, secondaryCtaLabel: e.target.value })}
              placeholder="Lihat Turnamen"
              className="w-full px-3.5 py-2.5 bg-[#0A0C10] border border-white/12 rounded-[4px] text-sm text-[#F8FAFC] focus:border-[#00F0FF] focus:outline-none"
            />
          </div>
          <div>
            <label
              htmlFor="hero-secondary-href"
              className="block font-telemetry text-xs font-semibold uppercase tracking-[0.06em] text-[#94A3B8] mb-1.5"
            >
              Target Link Sekunder
            </label>
            <input
              id="hero-secondary-href"
              type="text"
              required
              value={form.secondaryCtaHref}
              onChange={(e) => setForm({ ...form, secondaryCtaHref: e.target.value })}
              placeholder="#turnamen"
              className="w-full px-3.5 py-2.5 bg-[#0A0C10] border border-white/12 rounded-[4px] font-telemetry text-sm text-[#F8FAFC] focus:border-[#00F0FF] focus:outline-none"
            />
          </div>
        </div>

        {/* Optional Hero Background Image */}
        <div className="p-4 bg-[#0A0C10] border border-white/[0.08] rounded-[6px] space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-[#00F0FF]" />
              <span className="font-telemetry text-xs font-bold uppercase tracking-[0.06em] text-[#F8FAFC]">
                Banner Latar Hero (Opsional)
              </span>
            </div>
            <span className="font-telemetry text-[11px] text-[#94A3B8]">
              JPG / PNG / WEBP · Maks 2 MB · Disarankan rasio 16:9
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleBackgroundUpload}
              className="hidden"
            />
            <button
              type="button"
              disabled={uploadingBg}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#12161F] border border-[#00F0FF]/40 text-[#00F0FF] hover:bg-[#00F0FF]/10 font-telemetry text-xs font-bold uppercase rounded-[4px] transition-colors cursor-pointer disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5" />
              {uploadingBg ? 'Memproses...' : form.backgroundImageUrl ? 'Ganti Gambar Latar' : 'Upload Gambar Latar'}
            </button>

            {form.backgroundImageUrl && (
              <button
                type="button"
                onClick={() => setForm({ ...form, backgroundImageUrl: '' })}
                className="inline-flex items-center gap-1.5 px-3 py-2 border border-[#FF2E5B]/40 text-[#FF2E5B] hover:bg-[#FF2E5B]/10 font-telemetry text-xs font-semibold uppercase rounded-[4px] transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Hapus Gambar
              </button>
            )}
          </div>
        </div>

        {/* Action Footer */}
        <div className="pt-4 border-t border-white/[0.08] flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-3">
          {isDirty && (
            <button
              type="button"
              disabled={saving}
              onClick={handleDiscardChanges}
              className="px-4 min-h-[44px] border border-white/15 text-[#94A3B8] hover:text-[#F8FAFC] font-telemetry text-xs font-semibold uppercase rounded-[4px] transition-colors cursor-pointer disabled:opacity-50"
            >
              Batalkan Perubahan
            </button>
          )}
          <button
            type="submit"
            disabled={saving || uploadingBg}
            className="inline-flex items-center justify-center gap-2 px-6 min-h-[44px] bg-[#00F0FF] text-[#0A0C10] font-display text-sm font-bold uppercase tracking-[0.05em] rounded-[4px] hover:shadow-[0_0_20px_rgba(0,240,255,0.45)] transition-all cursor-pointer disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Menyimpan...' : 'Simpan Hero Settings'}
          </button>
        </div>
      </form>
    </div>
  );
};
