import React, { useRef } from 'react';
import { flushSync } from 'react-dom';

function Brand({ className = '' }) {
  return <span className={`brand-wordmark ${className}`}><img src="/dualmind-wordmark.png" alt="" className="brand-logo"/><span>dualmind<span className="brand-suffix">.ai</span></span></span>;
}

export default function SiteHeader({ theme = 'dark', onToggleTheme }) {
  const themeButtonRef = useRef(null);
  const path = typeof window === 'undefined' ? '/' : window.location.pathname;
  const navItems = [
    { href: '/', label: 'Overview' },
    { href: '/debate', label: 'Workspace' },
    { href: '/history', label: 'History' },
    { href: '/how-to-use', label: 'Security & guide' },
  ];
  function toggleTheme() {
    const button = themeButtonRef.current;
    if (!button || typeof document.startViewTransition !== 'function') {
      onToggleTheme?.();
      return;
    }

    const { left, top, width, height } = button.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const x = left + width / 2;
    const y = top + height / 2;
    const maxRadius = Math.hypot(Math.max(x, viewportWidth - x), Math.max(y, viewportHeight - y));
    const radiusPercent = maxRadius / (Math.hypot(viewportWidth, viewportHeight) / Math.SQRT2) * 100;
    const clipPath = [
      `circle(0% at ${x / viewportWidth * 100}% ${y / viewportHeight * 100}%)`,
      `circle(${radiusPercent}% at ${x / viewportWidth * 100}% ${y / viewportHeight * 100}%)`,
    ];
    const root = document.documentElement;
    root.dataset.dualmindThemeTransition = 'active';
    root.style.setProperty('--dualmind-theme-transition-duration', '480ms');
    const transition = document.startViewTransition(() => {
      flushSync(() => onToggleTheme?.());
    });
    transition.finished.then(
      () => {
        delete root.dataset.dualmindThemeTransition;
        root.style.removeProperty('--dualmind-theme-transition-duration');
      },
      () => {
        delete root.dataset.dualmindThemeTransition;
        root.style.removeProperty('--dualmind-theme-transition-duration');
      },
    );
    transition.ready.then(() => {
      root.animate({ clipPath }, {
        duration: 480,
        easing: 'ease-in-out',
        fill: 'forwards',
        pseudoElement: '::view-transition-new(root)',
      });
    }).catch((error) => {
      if (error.name !== 'InvalidStateError' && error.name !== 'AbortError') {
        console.error('Could not animate the theme transition.', error);
      }
    });
  }

  return <header className="site-header">
    <nav className="nav-inner" aria-label="Main navigation">
      <a href="/" aria-label="DualMind AI home"><Brand /></a>
      <div className="nav-links">
        {navItems.map((item) => <a key={item.href} href={item.href} aria-current={path === item.href ? 'page' : undefined} className={path === item.href ? 'nav-link is-active' : 'nav-link'}>{item.label}</a>)}
      </div>
      <div className="nav-actions">
        <span className="nav-secure"><span aria-hidden="true">⌑</span> BYOK · Local-first</span>
        <button ref={themeButtonRef} type="button" className="theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} aria-pressed={theme === 'dark'}>
          {theme === 'dark'
            ? <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20.2 15.5A8.5 8.5 0 0 1 8.5 3.8 8.6 8.6 0 1 0 20.2 15.5Z"/></svg>
            : <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>}
        </button>
        <a className="nav-cta" href="/debate">Open workspace <span aria-hidden="true">↗</span></a>
      </div>
    </nav>
  </header>;
}

export { Brand };
