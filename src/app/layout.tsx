'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Outfit } from 'next/font/google';
import './globals.css';

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit'
});

function LayoutInner({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showInstallTip, setShowInstallTip] = useState(false);

  useEffect(() => {
    const ua = window.navigator.userAgent;
    setIsIOS(/iPad|iPhone|iPod/.test(ua));

    // Check if already installed (running in standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setIsInstalled(true);
    }

    function handler(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e);
    }
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (isIOS) {
      setShowInstallTip(true);
      return;
    }
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!search.trim()) return;
    router.push(`/search/${encodeURIComponent(search.trim())}`);
    setSearch('');
  };

  const navItems = [
    { label: 'Home', href: '/', icon: '⌂' },
    { label: 'Football', href: '/?filter=football', icon: '⚽' },
    { label: 'Formula 1', href: '/?filter=formula1', icon: '🏎' },
  ];

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/' && !searchParams.has('filter');
    if (href.includes('?filter=')) {
      const filterValue = href.split('?filter=')[1];
      return searchParams.get('filter') === filterValue;
    }
    return pathname === href;
  };

  return (
    <>
      {/* Pure CSS Loading Screen — fades out via animation, no JS needed */}
      <div className="app-loading" aria-hidden="false">
        <div className="app-loading-inner">
          <div className="app-loading-mark">H+</div>
          <div className="app-loading-name">HSN+</div>
          <div className="app-loading-tagline">Live Sports</div>
          <div className="app-loading-bar"><span /></div>
          <div className="app-loading-text">Loading…</div>
        </div>
      </div>

      {/* Glass Topbar */}
      <header className="topbar" role="banner">
        <button className="brand-block" onClick={() => router.push('/')} aria-label="HSN+ home">
          <div className="brand-mark" aria-hidden="true">H+</div>
          <div className="brand-text">
            <span className="brand-title">HSN+</span>
            <span className="brand-tagline">Live Sports</span>
          </div>
        </button>

        <nav className="nav-links" aria-label="Primary navigation">
          {navItems.map((item) => (
            <button
              key={item.label}
              className={`nav-link ${isActive(item.href) ? 'is-active' : ''}`}
              onClick={() => router.push(item.href)}
            >
              {item.icon} {item.label}
            </button>
          ))}
        </nav>

        <form className="search-shell" onSubmit={handleSearch} aria-label="Search matches">
          <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            className="search-inline"
            type="search"
            placeholder="Search matches…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
          />
        </form>

        {!isInstalled && (deferredPrompt || isIOS) ? (
          <button className="ghost-button install-btn" onClick={handleInstall} style={{ fontSize: '0.78rem', padding: '7px 14px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
            Install
          </button>
        ) : null}

        <button
          className="mobile-menu-toggle"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          aria-expanded={mobileOpen}
        >
          <span className="mobile-menu-bars" aria-hidden="true">
            <span /><span /><span />
          </span>
        </button>
      </header>

      {/* Mobile nav drawer */}
      <div className={`mobile-nav ${mobileOpen ? 'is-open' : ''}`} role="dialog" aria-modal="true">
        <div className="mobile-nav-backdrop" onClick={() => setMobileOpen(false)} />
        <aside className="mobile-nav-panel">
          <button className="mobile-nav-close" onClick={() => setMobileOpen(false)} aria-label="Close menu">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M2 2l12 12M14 2L2 14" />
            </svg>
          </button>
          <div className="mobile-nav-brand">
            <div className="brand-mark" aria-hidden="true">H+</div>
            <div className="brand-text">
              <span className="brand-title">HSN+</span>
              <span className="brand-tagline">Live Sports</span>
            </div>
          </div>
          <nav className="mobile-nav-links">
            {navItems.map((item) => (
              <button
                key={item.label}
                className={`mobile-nav-link ${isActive(item.href) ? 'is-active' : ''}`}
                onClick={() => {
                  router.push(item.href);
                  setMobileOpen(false);
                }}
              >
                <span>{item.icon}</span> {item.label}
              </button>
            ))}
            {!isInstalled ? (
              <button className="mobile-nav-link" onClick={() => { handleInstall(); setMobileOpen(false); }}>
                <span>📲</span> Install App
              </button>
            ) : null}
          </nav>
        </aside>
      </div>

      {/* iOS install tip overlay */}
      {showInstallTip ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setShowInstallTip(false)}>
          <section className="modal" role="dialog" onClick={(e) => e.stopPropagation()}>
            <p className="eyebrow">Install HSN+</p>
            <h1>Add to Home Screen</h1>
            <p>
              Tap the <strong>Share</strong> button (square with arrow) in Safari, then select
              &nbsp;<strong>"Add to Home Screen"</strong>.
            </p>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-dim)', marginTop: 8 }}>
              iOS does not support automatic PWA installation — this is the only way to install on iPhone/iPad.
            </p>
            <button type="button" className="primary-button" onClick={() => setShowInstallTip(false)} style={{ marginTop: 16 }}>
              Got it
            </button>
          </section>
        </div>
      ) : null}

      {children}
    </>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#e01020" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="HSN+" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png" />
      </head>
      <body className={outfit.variable}>
        <Suspense fallback={null}>
          <LayoutInner>{children}</LayoutInner>
        </Suspense>
      </body>
    </html>
  );
}