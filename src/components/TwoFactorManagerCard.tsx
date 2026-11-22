import React from 'react';
import { CheckCircle2, ShieldCheck, Smartphone } from 'lucide-react';
import type { AuthUser } from '../types';

interface TwoFactorManagerCardProps {
  user: AuthUser;
  onUserUpdated?: (nextUser: AuthUser) => void;
  onNotify?: (msg: string) => void;
}

export const TwoFactorManagerCard: React.FC<TwoFactorManagerCardProps> = ({ user }) => {
  return (
    <div className="p-5 bg-[#12161F] border border-white/[0.08] rounded-[6px] space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/[0.08]">
        <div className="flex items-center gap-2.5">
          <Smartphone className="w-4 h-4 text-[#00F0FF]" />
          <div>
            <h2 className="font-display text-lg font-bold uppercase text-[#F8FAFC]">
              Proteksi Autentikasi &amp; Verifikasi 2 Langkah
            </h2>
            <p className="text-xs text-[#94A3B8]">
              Akses akun {user.role === 'SUPER_ADMIN' ? 'Super Admin' : 'League Ops'} diamankan langsung melalui Google OAuth dan verifikasi email terenkripsi.
            </p>
          </div>
        </div>

        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] border font-telemetry text-[11px] font-bold uppercase bg-[#CCFF00]/15 border-[#CCFF00]/50 text-[#CCFF00]">
          <ShieldCheck className="w-3.5 h-3.5" />
          GOOGLE OAUTH AKTIF
        </span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-[#0A0C10] border border-white/[0.08] rounded-[5px]">
        <div className="space-y-1">
          <div className="font-telemetry text-xs font-bold text-[#F8FAFC] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#CCFF00]" />
            Akun Terverifikasi: {user.email}
          </div>
          <p className="text-xs text-[#94A3B8]">
            Untuk keamanan ekstra (2-Step Verification / Passkey), pastikan fitur Verifikasi 2 Langkah diaktifkan pada pengaturan keamanan Google Account Anda.
          </p>
        </div>
      </div>
    </div>
  );
};
