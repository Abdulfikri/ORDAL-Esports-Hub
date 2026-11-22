import React from 'react';
import { OrdalMonogram } from './BrandAssets';

export const PublicHubSkeleton: React.FC = () => {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="min-h-screen bg-[#0A0C10] text-[#F8FAFC] flex flex-col"
    >
      <span className="sr-only">Memuat Data ORDAL Esports Hub...</span>

      {/* Top Navbar Skeleton */}
      <header className="h-16 border-b border-white/[0.06] bg-[#0A0C10]/90 px-4 sm:px-8">
        <div className="max-w-[1440px] mx-auto h-full flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <OrdalMonogram size={32} />
            <div className="h-4 w-28 rounded-[3px] bg-white/[0.08] animate-pulse" />
          </div>
          <div className="hidden md:flex items-center gap-5">
            {[72, 68, 54, 60, 56].map((w, idx) => (
              <div
                key={idx}
                style={{ width: `${w}px` }}
                className="h-3 rounded-[2px] bg-white/[0.06] animate-pulse"
              />
            ))}
          </div>
          <div className="h-10 w-32 rounded-[4px] bg-[#00F0FF]/15 border border-[#00F0FF]/25 animate-pulse" />
        </div>
      </header>

      {/* Live Match Ticker Skeleton */}
      <div className="h-10 border-b border-white/[0.06] bg-[#12161F]/70 px-4 sm:px-8 flex items-center gap-6 overflow-hidden">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-4 w-48 shrink-0 rounded-[2px] bg-white/[0.06] animate-pulse"
          />
        ))}
      </div>

      {/* Hero Split Skeleton */}
      <div className="border-b border-white/[0.08] ordal-tactical-grid">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-8 py-14 lg:py-20 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10">
          <div className="lg:col-span-7 flex flex-col justify-center space-y-5">
            <div className="h-3.5 w-64 rounded-[2px] bg-[#00F0FF]/20 animate-pulse" />
            <div className="space-y-3">
              <div className="h-10 sm:h-12 w-full max-w-xl rounded-[4px] bg-white/[0.08] animate-pulse" />
              <div className="h-10 sm:h-12 w-4/5 max-w-lg rounded-[4px] bg-white/[0.08] animate-pulse" />
            </div>
            <div className="space-y-2 max-w-xl pt-1">
              <div className="h-4 w-full rounded-[2px] bg-white/[0.05] animate-pulse" />
              <div className="h-4 w-5/6 rounded-[2px] bg-white/[0.05] animate-pulse" />
            </div>
            <div className="pt-3 flex flex-wrap gap-3">
              <div className="h-12 w-44 rounded-[4px] bg-[#FF2E5B]/25 animate-pulse" />
              <div className="h-12 w-40 rounded-[4px] bg-white/[0.06] border border-white/10 animate-pulse" />
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="bg-[#12161F] border border-white/[0.08] rounded-[6px] p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
                <div className="h-3.5 w-40 rounded-[2px] bg-[#FF2E5B]/25 animate-pulse" />
                <div className="h-3.5 w-24 rounded-[2px] bg-[#CCFF00]/20 animate-pulse" />
              </div>
              <div className="grid grid-cols-4 gap-1.5 p-1 bg-[#0A0C10] rounded-[4px]">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-8 rounded-[3px] bg-white/[0.05] animate-pulse" />
                ))}
              </div>
              <div className="space-y-2.5">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-[74px] rounded-[4px] bg-[#0A0C10] border border-white/[0.06] animate-pulse"
                  />
                ))}
              </div>
              <div className="pt-3 border-t border-white/[0.08] grid grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="space-y-2">
                    <div className="h-2.5 w-16 rounded-[2px] bg-white/[0.05] animate-pulse" />
                    <div className="h-6 w-12 rounded-[3px] bg-white/[0.08] animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tournament Cards Skeleton */}
      <div className="max-w-[1440px] w-full mx-auto px-4 sm:px-8 py-14 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-white/[0.08]">
          <div className="space-y-2">
            <div className="h-3 w-56 rounded-[2px] bg-[#00F0FF]/20 animate-pulse" />
            <div className="h-8 w-72 rounded-[4px] bg-white/[0.08] animate-pulse" />
          </div>
          <div className="h-10 w-64 rounded-[4px] bg-[#12161F] border border-white/[0.08] animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-[340px] bg-[#12161F] border border-white/[0.08] rounded-[6px] p-6 flex flex-col justify-between animate-pulse"
            >
              <div className="space-y-3">
                <div className="flex justify-between">
                  <div className="h-3 w-28 rounded-[2px] bg-[#00F0FF]/20" />
                  <div className="h-3 w-20 rounded-[2px] bg-white/[0.06]" />
                </div>
                <div className="h-7 w-4/5 rounded-[4px] bg-white/[0.08]" />
                <div className="h-4 w-full rounded-[2px] bg-white/[0.05]" />
                <div className="h-4 w-2/3 rounded-[2px] bg-white/[0.05]" />
              </div>
              <div className="space-y-3 pt-4 border-t border-white/[0.06]">
                <div className="h-1.5 w-full rounded-[2px] bg-[#0A0C10]" />
                <div className="h-10 w-full rounded-[4px] bg-white/[0.06]" />
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="h-11 rounded-[4px] bg-[#00F0FF]/15" />
                  <div className="h-11 rounded-[4px] bg-white/[0.06]" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
