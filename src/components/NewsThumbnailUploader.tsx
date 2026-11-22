import React, { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ImagePlus, Info, Trash2, Upload } from 'lucide-react';

interface NewsThumbnailUploaderProps {
  value: string;
  onChange: (dataUrl: string) => void;
}

const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB max upload size
const TARGET_WIDTH = 800;
const TARGET_HEIGHT = 1000; // Exact 4:5 portrait ratio
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function estimateDataUrlBytes(dataUrl: string): number {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return 0;
  const base64Length = dataUrl.length - commaIdx - 1;
  return Math.round((base64Length * 3) / 4);
}

/**
 * Center-crops an image to exact 4:5 portrait ratio (800x1000px) and compresses it
 * to lightweight WebP (with JPEG fallback) for fast website loading.
 */
async function processThumbnailTo4x5(file: File): Promise<{
  dataUrl: string;
  originalWidth: number;
  originalHeight: number;
  optimizedBytes: number;
  cropped: boolean;
}> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Gagal membaca file gambar.'));
      el.src = objectUrl;
    });

    const origW = img.naturalWidth;
    const origH = img.naturalHeight;
    const targetRatio = 4 / 5; // 0.8
    const origRatio = origW / origH;

    let sx = 0;
    let sy = 0;
    let sw = origW;
    let sh = origH;

    if (origRatio > targetRatio) {
      // Source is wider than 4:5 -> crop horizontally from center
      sw = origH * targetRatio;
      sx = (origW - sw) / 2;
    } else if (origRatio < targetRatio) {
      // Source is taller than 4:5 -> crop vertically from center
      sh = origW / targetRatio;
      sy = (origH - sh) / 2;
    }

    const canvas = document.createElement('canvas');
    canvas.width = TARGET_WIDTH;
    canvas.height = TARGET_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Browser tidak mendukung pemrosesan gambar.');
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, TARGET_WIDTH, TARGET_HEIGHT);

    // Prefer WebP for optimal web size, fallback to JPEG
    let dataUrl = canvas.toDataURL('image/webp', 0.84);
    if (!dataUrl.startsWith('data:image/webp')) {
      dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    }

    const optimizedBytes = estimateDataUrlBytes(dataUrl);
    const cropped = Math.abs(origRatio - targetRatio) > 0.02;

    return {
      dataUrl,
      originalWidth: origW,
      originalHeight: origH,
      optimizedBytes,
      cropped,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export const NewsThumbnailUploader: React.FC<NewsThumbnailUploaderProps> = ({
  value,
  onChange,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [processing, setProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [metaInfo, setMetaInfo] = useState<{
    originalSize: string;
    optimizedSize: string;
    originalDim: string;
    cropped: boolean;
    lowResWarning: boolean;
  } | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset input so re-selecting the same file still triggers onChange
    e.target.value = '';
    if (!file) return;

    setErrorMsg(null);

    if (!ALLOWED_TYPES.includes(file.type)) {
      setErrorMsg('Format tidak didukung. Gunakan file JPG, PNG, atau WEBP.');
      return;
    }

    if (file.size > MAX_FILE_BYTES) {
      setErrorMsg(
        `Ukuran file terlalu besar (${formatFileSize(file.size)}). Batas maksimal upload adalah 2 MB.`
      );
      return;
    }

    setProcessing(true);
    try {
      const result = await processThumbnailTo4x5(file);
      onChange(result.dataUrl);
      setMetaInfo({
        originalSize: formatFileSize(file.size),
        optimizedSize: formatFileSize(result.optimizedBytes),
        originalDim: `${result.originalWidth}×${result.originalHeight}px`,
        cropped: result.cropped,
        lowResWarning: result.originalWidth < 400 || result.originalHeight < 500,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memproses gambar thumbnail.');
    } finally {
      setProcessing(false);
    }
  };

  const handleRemove = () => {
    onChange('');
    setMetaInfo(null);
    setErrorMsg(null);
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <label className="block font-telemetry text-xs uppercase text-[#94A3B8]">
          Foto Thumbnail Berita (Rasio 4:5)
        </label>
        <span className="font-telemetry text-[10px] uppercase tracking-[0.06em] text-[#00F0FF]">
          Opsional · Auto-Crop 4:5
        </span>
      </div>

      {/* Spec / File Size Guidance Banner */}
      <div className="p-3 bg-[#0A0C10] border border-[#00F0FF]/25 rounded-[4px] text-[11px] text-[#CBD5E1] space-y-1">
        <div className="flex items-center gap-1.5 font-telemetry font-bold uppercase tracking-[0.05em] text-[#00F0FF]">
          <Info className="w-3.5 h-3.5 shrink-0" />
          Spesifikasi Thumbnail Website ORDAL
        </div>
        <ul className="space-y-0.5 text-[#94A3B8] leading-relaxed pl-5 list-disc">
          <li>
            <strong className="text-[#F8FAFC]">Rasio Wajib:</strong> <span className="text-[#CCFF00] font-telemetry">4:5</span> (Portrait · rekomendasi <span className="font-telemetry text-[#F8FAFC]">800×1000 px</span> atau <span className="font-telemetry text-[#F8FAFC]">1080×1350 px</span>)
          </li>
          <li>
            <strong className="text-[#F8FAFC]">Ukuran File Layak:</strong> Maksimal <span className="font-telemetry text-[#F8FAFC]">2 MB</span> (optimal <span className="font-telemetry text-[#CCFF00]">150 KB – 500 KB</span> agar loading cepat di mobile &amp; desktop)
          </li>
          <li>
            <strong className="text-[#F8FAFC]">Format:</strong> JPG, PNG, atau WEBP — gambar otomatis disesuaikan ke <span className="font-telemetry text-[#F8FAFC]">800×1000 px (4:5)</span> &amp; dikompresi saat diupload.
          </li>
        </ul>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />

      {value ? (
        <div className="p-3 bg-[#0A0C10] border border-white/12 rounded-[6px] flex flex-col sm:flex-row gap-4 items-start">
          {/* 4:5 Preview Frame */}
          <div className="w-28 sm:w-32 aspect-[4/5] rounded-[4px] overflow-hidden border border-[#00F0FF]/40 bg-[#12161F] shrink-0 relative">
            <img
              src={value}
              alt="Preview thumbnail 4:5"
              className="w-full h-full object-cover"
            />
            <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 bg-[#0A0C10]/85 border border-white/15 rounded-[3px] font-telemetry text-[9px] font-bold text-[#CCFF00]">
              4:5
            </span>
          </div>

          <div className="flex-1 min-w-0 space-y-2.5">
            <div className="flex items-center gap-1.5 font-telemetry text-xs font-semibold text-[#CCFF00]">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              Thumbnail Siap Dipublikasikan
            </div>

            {metaInfo ? (
              <div className="font-telemetry text-[11px] text-[#94A3B8] space-y-1">
                <div>
                  Asli: <span className="text-[#F8FAFC]">{metaInfo.originalDim}</span> ({metaInfo.originalSize}) → Hasil:{' '}
                  <span className="text-[#00F0FF] font-semibold">800×1000px ({metaInfo.optimizedSize})</span>
                </div>
                {metaInfo.cropped && (
                  <div className="text-[#CCFF00]/90">
                    • Gambar telah di-crop otomatis dari tengah ke rasio 4:5.
                  </div>
                )}
                {metaInfo.lowResWarning && (
                  <div className="text-amber-400">
                    • Resolusi gambar asli cukup kecil (&lt; 400×500px), disarankan minimal 800×1000px agar tajam.
                  </div>
                )}
              </div>
            ) : (
              <div className="font-telemetry text-[11px] text-[#94A3B8]">
                Ukuran tersimpan: <span className="text-[#00F0FF]">{formatFileSize(estimateDataUrlBytes(value))}</span> · Rasio 4:5
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                disabled={processing}
                onClick={() => inputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 rounded-[4px] font-telemetry text-[11px] font-semibold uppercase text-[#F8FAFC] cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-[#00F0FF]" />
                {processing ? 'Memproses...' : 'Ganti Foto'}
              </button>
              <button
                type="button"
                disabled={processing}
                onClick={handleRemove}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#FF2E5B]/10 hover:bg-[#FF2E5B]/20 border border-[#FF2E5B]/35 rounded-[4px] font-telemetry text-[11px] font-semibold uppercase text-[#FF2E5B] cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Hapus
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={processing}
          onClick={() => inputRef.current?.click()}
          className="w-full p-5 bg-[#0A0C10] hover:bg-[#0A0C10]/80 border border-dashed border-white/20 hover:border-[#00F0FF]/60 rounded-[6px] flex flex-col items-center justify-center gap-2 text-center transition-colors cursor-pointer disabled:opacity-50"
        >
          <div className="w-10 h-10 rounded-full bg-[#00F0FF]/10 border border-[#00F0FF]/30 flex items-center justify-center text-[#00F0FF]">
            <ImagePlus className="w-5 h-5" />
          </div>
          <div className="font-display text-sm font-bold uppercase text-[#F8FAFC]">
            {processing ? 'Mengoptimalkan ke Rasio 4:5...' : 'Klik untuk Upload Foto Thumbnail (4:5)'}
          </div>
          <div className="font-telemetry text-[11px] text-[#94A3B8]">
            JPG / PNG / WEBP · Maks. 2 MB · Ideal 800×1000 px (150–500 KB)
          </div>
        </button>
      )}

      {errorMsg && (
        <div className="p-2.5 bg-[#FF2E5B]/12 border border-[#FF2E5B]/40 rounded-[4px] flex items-start gap-2 font-telemetry text-xs text-[#FF2E5B]">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}
    </div>
  );
};
