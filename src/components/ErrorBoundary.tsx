import React from 'react';
import { RefreshCw, ShieldAlert } from 'lucide-react';
import { OrdalMonogram } from './BrandAssets';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let readable = 'Terjadi gangguan saat memproses permintaan.';
    try {
      const parsed = JSON.parse(error.message) as { error?: string };
      if (parsed?.error) {
        if (parsed.error.toLowerCase().includes('permission') || parsed.error.toLowerCase().includes('insufficient')) {
          readable = 'Akses ditolak oleh aturan keamanan. Pastikan Anda login dengan akun yang sesuai.';
        } else {
          readable = parsed.error;
        }
      }
    } catch {
      if (error?.message) {
        readable = error.message;
      }
    }
    return { hasError: true, message: readable };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('ORDAL ErrorBoundary:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0A0C10] text-[#F8FAFC] flex flex-col items-center justify-center p-6 text-center">
          <OrdalMonogram size={48} />
          <div className="mt-4 inline-flex items-center gap-2 px-3 py-1 rounded-[4px] bg-[#FF2E5B]/15 border border-[#FF2E5B]/40 font-telemetry text-xs font-bold uppercase text-[#FF2E5B]">
            <ShieldAlert className="w-4 h-4" />
            Proteksi Aplikasi Aktif
          </div>
          <h1 className="mt-3 font-display text-2xl font-bold uppercase">
            Terjadi Kesalahan Sistem
          </h1>
          <p className="mt-2 text-sm text-[#94A3B8] max-w-md">{this.state.message}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-[#00F0FF] text-[#0A0C10] font-display text-sm font-bold uppercase rounded-[4px] cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            Muat Ulang Halaman
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
