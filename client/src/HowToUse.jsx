import React, { useEffect } from 'react';
import SiteHeader from './SiteHeader.jsx';
import ShineBorder from './ShineBorder.jsx';

const steps = [
  ['01', 'Keep keys in this tab', 'Paste provider keys in the workspace. They live in React memory only, are never written to local or session storage, and disappear when the tab reloads or closes. A key is sent to the app server only with an operation you request; use HTTPS for remote deployments.'],
  ['02', 'Generate independently', 'Each selected model receives your original prompt without seeing another model’s answer. Requests run in parallel, and each response is shown separately with its provider-reported usage where available.'],
  ['03', 'Cross-review the answers', 'Every successful answer can be reviewed by each other selected model. For N successful models, this creates N × (N − 1) directed reviews; no model reviews its own answer.'],
  ['04', 'Synthesize with evidence visible', 'An eligible model combines the available answers and critiques. If a call fails, successful output remains visible and synthesis can fall back to another configured model. Agreement is not proof of correctness.'],
  ['05', 'Revisit local history', 'Debates are stored in this browser’s IndexedDB, not on the app server. You can search, reopen, export, or purge those records. History does not contain provider keys.'],
];

export default function HowToUse({ theme, onToggleTheme }) {
  useEffect(() => {
    document.title = 'Security & Guide — DualMind AI';
    const description = document.querySelector('meta[name="description"]');
    if (description) description.setAttribute('content', 'Learn how DualMind AI handles provider keys, browser-local history, and quadratic cross-model peer review.');
  }, []);

  return <div className="app-shell" data-theme={theme}>
    <SiteHeader theme={theme} onToggleTheme={onToggleTheme} />
    <main className="page-container">
      <section className="guide-content" style={{ paddingTop: '3.2rem' }}>
        <p className="page-eyebrow">Security & guide</p>
        <h1 className="section-title" style={{ fontSize: 'clamp(2rem, 5vw, 3.4rem)', marginTop: '.7rem' }}>Designed for visibility.<br />Built around your keys.</h1>
        <p className="page-lede">A practical look at the BYOK flow, how independent answers are challenged, and what remains on this device.</p>

        <ShineBorder as="section" className="surface-card guide-callout" aria-labelledby="privacy-heading">
          <p className="page-eyebrow">Privacy model</p>
          <h2 className="section-title" id="privacy-heading" style={{ marginTop: '.45rem' }}>Tab memory for keys. IndexedDB for history.</h2>
          <p className="guide-copy">Provider keys are held in volatile page memory and are not persisted. To fulfill a generation, review, or synthesis request, the chosen key is sent to the DualMind API server and used for that provider call. Completed debate data is saved locally in your browser’s IndexedDB. No account sync is involved.</p>
          <div className="guide-diagram">
            <div className="subtle-card"><strong>1 · Your browser</strong>Key entered in tab memory; answers and history remain local.</div>
            <div className="subtle-card"><strong>2 · Requested operation</strong>Only the selected key and request are sent over HTTPS to the app server.</div>
            <div className="subtle-card"><strong>3 · Provider API</strong>The provider processes the call under your provider account and its own terms.</div>
          </div>
          <p className="compat-note" style={{ marginTop: '.85rem' }}>Browser memory is not a hardware vault. Use a trusted device, protect your provider account, and avoid public or shared deployments.</p>
        </ShineBorder>

        <section style={{ marginTop: '2.5rem' }} aria-labelledby="workflow-heading">
          <p className="page-eyebrow">How the workflow works</p>
          <h2 className="section-title" id="workflow-heading" style={{ marginTop: '.45rem' }}>A transparent, quadratic review pipeline</h2>
          <p className="section-copy">The number of peer reviews grows quadratically because every model critiques every other successful response.</p>
          <ol style={{ listStyle: 'none', padding: 0, margin: '1rem 0 0' }}>
            {steps.map(([number, title, body]) => <li className="guide-step" key={number}><span>{number}</span><div><h3>{title}</h3><p>{body}</p></div></li>)}
          </ol>
          <ShineBorder className="surface-card guide-callout" style={{ marginTop: '1rem' }}>
            <strong style={{ color: 'var(--text)' }}>Review count examples</strong>
            <div className="guide-diagram" style={{ marginTop: '.7rem' }}>
              <div className="subtle-card"><strong>2 models</strong>2 directed reviews</div>
              <div className="subtle-card"><strong>3 models</strong>6 directed reviews</div>
              <div className="subtle-card"><strong>4 models</strong>12 directed reviews</div>
            </div>
            <p className="compat-note" style={{ marginTop: '.75rem' }}>A complete run may use N answer calls + N × (N − 1) review calls + one synthesis call. Retries and connection tests add requests and may incur provider charges.</p>
          </ShineBorder>
        </section>

        <ShineBorder as="section" className="surface-card guide-callout" style={{ marginTop: '2rem' }} aria-label="Important reliability note">
          <p className="page-eyebrow">A note on reliability</p>
          <p className="guide-copy">Cross-review can surface disagreement, missing assumptions, and possible errors. The reviews are still generated by language models and are not independent verification. Model consensus is not proof; verify important claims with trusted sources.</p>
        </ShineBorder>
        <p style={{ marginTop: '1.5rem' }}><a className="button-primary" href="/debate">Open the workspace <span aria-hidden="true">↗</span></a></p>
      </section>
    </main>
  </div>;
}
