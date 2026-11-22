import React, { createContext, useContext } from 'react';
import type { BrandSettings, NewsArticle } from '../types';

export const ORDAL_LOGOS = {
  wordmarkDark: '/assets/aistudio/Gemini_Generated_Image_ibl0niibl0niibl0_1623bd61.jpg',
  monogramDark: '/assets/aistudio/Gemini_Generated_Image_80ltcc80ltcc80lt_d0d533b5.jpg',
  wordmarkLight: '/assets/aistudio/Gemini_Generated_Image_f0qs94f0qs94f0qs_f061a009.jpg',
  monogramLight: '/assets/aistudio/Gemini_Generated_Image_f0qs94f0qs94f0qs__1__32d5cd08.jpg',
};

export function isSafeLogoSrc(raw?: string | null): string | null {
  if (!raw) return null;
  const val = raw.trim();
  if (!val) return null;
  if (/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/i.test(val)) {
    return val;
  }
  if (val.startsWith('/assets/')) {
    return val;
  }
  try {
    const parsed = new URL(val);
    if (parsed.protocol === 'https:') {
      return val;
    }
  } catch {
    // invalid url
  }
  return null;
}

const BrandSettingsContext = createContext<BrandSettings | undefined>(undefined);

export const BrandSettingsProvider: React.FC<{
  settings?: BrandSettings;
  children: React.ReactNode;
}> = ({ settings, children }) => {
  return <BrandSettingsContext.Provider value={settings}>{children}</BrandSettingsContext.Provider>;
};

export function useBrandSettings(): BrandSettings | undefined {
  return useContext(BrandSettingsContext);
}

interface LogoProps {
  className?: string;
  height?: number;
  srcOverride?: string;
}

export const OrdalWordmark: React.FC<LogoProps> = ({
  className = '',
  height = 42,
  srcOverride,
}) => {
  const settings = useBrandSettings();
  const customSrc = isSafeLogoSrc(srcOverride !== undefined ? srcOverride : settings?.wordmarkUrl);
  const effectiveSrc = customSrc || ORDAL_LOGOS.wordmarkDark;
  const altText = settings?.brandName || 'ORDAL Esports Hub';

  return (
    <div
      className={`inline-flex items-center overflow-hidden rounded-[2px] shrink-0 select-none ${className}`}
      style={{ height }}
    >
      <img
        src={effectiveSrc}
        alt={altText}
        referrerPolicy="no-referrer"
        className={
          customSrc
            ? 'h-full w-auto max-w-[200px] object-contain'
            : 'h-full w-auto object-contain scale-[1.55] mix-blend-lighten'
        }
      />
    </div>
  );
};

export const OrdalMonogram: React.FC<{
  size?: number;
  className?: string;
  srcOverride?: string;
}> = ({ size = 36, className = '', srcOverride }) => {
  const settings = useBrandSettings();
  const customSrc = isSafeLogoSrc(srcOverride !== undefined ? srcOverride : settings?.monogramUrl);
  const effectiveSrc = customSrc || ORDAL_LOGOS.monogramDark;
  const altText = settings?.brandName ? `${settings.brandName} Monogram` : 'ORDAL Monogram';

  return (
    <div
      className={`inline-flex items-center justify-center overflow-hidden rounded-[4px] border border-white/10 bg-[#0A0C10] shrink-0 select-none ${className}`}
      style={{ width: size, height: size }}
    >
      <img
        src={effectiveSrc}
        alt={altText}
        referrerPolicy="no-referrer"
        className={
          customSrc
            ? 'w-full h-full object-contain p-0.5'
            : 'w-full h-full object-contain scale-[1.25] mix-blend-lighten'
        }
      />
    </div>
  );
};

export const NewsCardArtwork: React.FC<{ article: NewsArticle }> = ({ article }) => {
  const accentHex =
    article.accentTone === 'crimson'
      ? '#FF2E5B'
      : article.accentTone === 'cyan'
        ? '#00F0FF'
        : '#CCFF00';

  return (
    <div className="relative w-full aspect-[4/5] bg-[#0A0C10] overflow-hidden ordal-tactical-grid">
      {article.thumbnailUrl ? (
        <img
          src={article.thumbnailUrl}
          alt={article.title}
          loading="lazy"
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      ) : (
        <svg
          viewBox="0 0 480 600"
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={`grad-${article.id}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={accentHex} stopOpacity="0.22" />
              <stop offset="55%" stopColor="#12161F" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#0A0C10" stopOpacity="0.95" />
            </linearGradient>
          </defs>
          <rect width="480" height="600" fill={`url(#grad-${article.id})`} />
          {/* Tactical reticle & diagonal slash lines */}
          <line x1="0" y1="600" x2="420" y2="0" stroke={accentHex} strokeWidth="2" strokeOpacity="0.55" />
          <line x1="110" y1="600" x2="480" y2="60" stroke="#00F0FF" strokeWidth="1" strokeOpacity="0.2" />
          <circle cx="330" cy="220" r="88" fill="none" stroke={accentHex} strokeWidth="1.2" strokeOpacity="0.35" />
          <circle cx="330" cy="220" r="50" fill="none" stroke="#F8FAFC" strokeWidth="1" strokeOpacity="0.18" strokeDasharray="6 6" />
          <line x1="330" y1="115" x2="330" y2="325" stroke={accentHex} strokeWidth="1" strokeOpacity="0.3" />
          <line x1="225" y1="220" x2="435" y2="220" stroke={accentHex} strokeWidth="1" strokeOpacity="0.3" />
          {/* Corner HUD brackets */}
          <path d="M 24 44 L 24 24 L 44 24" fill="none" stroke="#F8FAFC" strokeWidth="1.5" strokeOpacity="0.35" />
          <path d="M 456 44 L 456 24 L 436 24" fill="none" stroke="#F8FAFC" strokeWidth="1.5" strokeOpacity="0.35" />
          <path d="M 24 556 L 24 576 L 44 576" fill="none" stroke={accentHex} strokeWidth="1.5" strokeOpacity="0.6" />
        </svg>
      )}

      {/* Monogram watermark stamp in corner */}
      <div className="absolute top-3 right-3 opacity-85 drop-shadow">
        <OrdalMonogram size={28} />
      </div>

      {/* Bottom vertical dark scrim */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0A0C10]/90 via-[#0A0C10]/20 to-transparent pointer-events-none" />

      <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-[11px] font-telemetry uppercase tracking-[0.08em] text-[#94A3B8]">
        <span style={{ color: accentHex }} className="font-semibold">
          {article.category}
        </span>
        <span>{article.readTime}</span>
      </div>
    </div>
  );
};
