import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../../client/src/AppV2.jsx';
import HowToUse from '../../client/src/HowToUse.jsx';

function renderAppAtPath(pathname) {
  vi.stubGlobal('window', {
    location: { pathname, search: '' },
    localStorage: { getItem: () => null },
    matchMedia: () => ({ matches: false }),
  });
  return renderToStaticMarkup(React.createElement(App));
}

afterEach(() => vi.unstubAllGlobals());

describe('multi-page frontend UI', () => {
  it('renders the security-focused product overview at the root route', () => {
    const markup = renderAppAtPath('/');
    expect(markup).toContain('Collective AI Intelligence.');
    expect(markup).toContain('Zero Trust,');
    expect(markup).toContain('N × (N − 1)');
    expect(markup).toContain('Keys stay in tab memory');
    expect(markup).toContain('Launch workspace');
    expect(markup).toContain('shine-border-effect');
  });

  it('renders provider setup and the core debate workspace at /debate', () => {
    const markup = renderAppAtPath('/debate');
    expect(markup).toContain('Keys held only in tab memory');
    expect(markup).toContain('OpenAI API key');
    expect(markup).toContain('Gemini API key');
    expect(markup).toContain('Anthropic API key');
    expect(markup).toContain('Run debate');
    expect(markup).toContain('Peer reviews');
    expect(markup).toContain('shine-border-effect');
    expect(markup).not.toMatch(/>(?:Sign up|Log in|Login|Signup)<\/(?:a|button)>/i);
  });

  it('renders the searchable local archive actions at /history', () => {
    const markup = renderAppAtPath('/history');
    expect(markup).toContain('Debate history');
    expect(markup).toContain('Search local debate history');
    expect(markup).toContain('Export all to Markdown');
    expect(markup).toContain('Purge Local Storage');
    expect(markup).toContain('Locally Stored');
    expect(markup).toContain('shine-border-effect');
  });

  it('renders a security guide with local-key and quadratic-review details', () => {
    const markup = renderToStaticMarkup(React.createElement(HowToUse));
    expect(markup).toContain('Designed for visibility.');
    expect(markup).toContain('Tab memory for keys. IndexedDB for history.');
    expect(markup).toContain('Cross-review the answers');
    expect(markup).toContain('N × (N − 1)');
    expect(markup).toContain('Model consensus is not proof');
    expect(markup).toContain('shine-border-effect');
  });
});
