import React, { useEffect, useState } from 'react';

function Brand({ className = '' }) {
  return <img src="/duamind-logo.png" alt="" className={`brand-logo ${className}`} />;
}

export default function SiteHeader({ guide = false, onHistory, historyOpen = false }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const home = guide ? '/' : '';
  const featuresHref = guide ? '/#features' : '#features';
  const modelsHref = guide ? '/#models' : '#models';
  const howHref = guide ? '#guide-steps' : '/how-to-use';
  const workspaceHref = guide ? '/#workspace' : '#workspace';

  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeOnEscape = (event) => { if (event.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);
  const historyLink = guide ? '/?history=1#history' : '#history';
  return <header className="site-header sticky top-0 z-30 border-b border-white/[.07] bg-[#070a12]/85 backdrop-blur-xl">
    <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3.5 lg:px-8" aria-label="Main navigation">
      <a href={home || '#top'} aria-label="DualMind AI home" onClick={closeMenu}><Brand /></a>
      <div className="hidden items-center gap-8 lg:flex">
        <a className="nav-link" href={featuresHref}>Features</a>
        <a className="nav-link" href={howHref}>How it works</a>
        <a className="nav-link" href={modelsHref}>Models</a>
        <span className="rounded-full border border-emerald-500/25 bg-emerald-400/[.06] px-3 py-1 text-xs font-medium text-emerald-300">No signup</span>
      </div>
      <div className="hidden items-center gap-2.5 sm:flex">
        {onHistory ? <button type="button" onClick={onHistory} aria-expanded={historyOpen} aria-controls="history" className="button-secondary">History</button> : <a href={historyLink} className="button-secondary">History</a>}
        <a href={workspaceHref} className="button-primary">Start testing <span aria-hidden="true">↗</span></a>
      </div>
      <button type="button" className="menu-toggle lg:hidden" aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={menuOpen} aria-controls="mobile-navigation" onClick={() => setMenuOpen((open) => !open)}>
        <span className={menuOpen ? 'menu-line menu-line-top is-open' : 'menu-line menu-line-top'} />
        <span className={menuOpen ? 'menu-line menu-line-bottom is-open' : 'menu-line menu-line-bottom'} />
      </button>
    </nav>
    {menuOpen && <div id="mobile-navigation" className="mobile-navigation border-t border-white/[.07] bg-[#0a101b] px-5 py-4 lg:hidden">
      <div className="mx-auto grid max-w-7xl gap-1">
        <a className="mobile-nav-link" href={featuresHref} onClick={closeMenu}>Features</a>
        <a className="mobile-nav-link" href={howHref} onClick={closeMenu}>How it works</a>
        <a className="mobile-nav-link" href={modelsHref} onClick={closeMenu}>Models</a>
        {onHistory ? <button type="button" className="mobile-nav-link text-left" onClick={() => { closeMenu(); onHistory(); }}>History</button> : <a className="mobile-nav-link" href={historyLink} onClick={closeMenu}>History</a>}
        <a href={workspaceHref} className="button-primary mt-2 justify-center" onClick={closeMenu}>Start testing <span aria-hidden="true">↗</span></a>
      </div>
    </div>}
  </header>;
}

export { Brand };
