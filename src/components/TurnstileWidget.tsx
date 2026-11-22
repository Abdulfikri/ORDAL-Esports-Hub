import React, { useEffect, useRef } from 'react';

interface TurnstileWidgetProps {
  onToken: (token: string) => void;
  resetSignal?: number;
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          theme?: 'dark' | 'light';
          callback?: (token: string) => void;
          'expired-callback'?: () => void;
          'error-callback'?: () => void;
        }
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

const rawTurnstileKey = (import.meta.env.VITE_TURNSTILE_SITE_KEY || '').trim();
const isPlaceholderTurnstileKey =
  !rawTurnstileKey ||
  rawTurnstileKey.toLowerCase() === 'secret value' ||
  rawTurnstileKey.toLowerCase() === 'placeholder' ||
  rawTurnstileKey.toLowerCase() === 'your_secret_here' ||
  rawTurnstileKey.startsWith('CHANGE_ME_') ||
  rawTurnstileKey.startsWith('MY_');

export const TURNSTILE_SITE_KEY = isPlaceholderTurnstileKey ? '' : rawTurnstileKey;

export const TurnstileWidget: React.FC<TurnstileWidgetProps> = ({
  onToken,
  resetSignal = 0,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !containerRef.current) return;
    let mounted = true;

    const mountWidget = () => {
      if (!mounted || !containerRef.current || !window.turnstile) return;
      if (widgetIdRef.current) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // ignore
        }
      }
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: 'dark',
        callback: (token: string) => onTokenRef.current(token),
        'expired-callback': () => onTokenRef.current(''),
        'error-callback': () => onTokenRef.current(''),
      });
    };

    if (window.turnstile) {
      mountWidget();
    } else {
      const existing = document.querySelector<HTMLScriptElement>(
        'script[data-ordal-turnstile="true"]'
      );
      if (!existing) {
        const script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        script.dataset.ordalTurnstile = 'true';
        script.onload = mountWidget;
        document.head.appendChild(script);
      } else {
        const timer = window.setInterval(() => {
          if (window.turnstile) {
            window.clearInterval(timer);
            mountWidget();
          }
        }, 150);
        return () => {
          mounted = false;
          window.clearInterval(timer);
        };
      }
    }

    return () => {
      mounted = false;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // ignore
        }
        widgetIdRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (resetSignal > 0 && widgetIdRef.current && window.turnstile) {
      try {
        window.turnstile.reset(widgetIdRef.current);
      } catch {
        // ignore
      }
    }
  }, [resetSignal]);

  if (!TURNSTILE_SITE_KEY) return null;

  return (
    <div className="pt-1">
      <div ref={containerRef} />
    </div>
  );
};
