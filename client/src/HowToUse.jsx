import React, { useEffect } from 'react';
import SiteHeader, { Brand } from './SiteHeader.jsx';

const guideSteps = [
  { number: '01', title: 'Add your provider keys', body: 'Paste an API key into the matching provider card in the workspace. Keys stay in the current tab’s memory and are sent to the app server with the operations you start. Use a key from a provider account with API access enabled.' },
  { number: '02', title: 'Choose your models', body: 'Select the models you want to compare. The current integrations include GPT-5.5, Gemini 3.8 Flash, and Claude Sonnet 4.6. Different models can take different approaches; selecting multiple models creates more provider calls.' },
  { number: '03', title: 'Ask a clear question', body: 'State the task, give useful context, and mention the format you want. Clear constraints help each model answer the same question on its own.' },
  { number: '04', title: 'Compare independent answers', body: 'Each selected model receives the original prompt without seeing the other answers first. Read the separate response cards and check their reported status, time, and usage where available.' },
  { number: '05', title: 'Review the peer critiques', body: 'Each available reviewer evaluates other successful answers for support, completeness, assumptions, logical consistency, and missing details. A review is another model’s critique, not independent proof.' },
  { number: '06', title: 'Read the final synthesis', body: 'A selected eligible model combines available answers and reviews. If one synthesizer fails, the app tries another eligible model. The final answer can still be incomplete when earlier calls fail.' },
  { number: '07', title: 'Save, revisit, and export', body: 'Completed debates are saved in this browser’s IndexedDB history. Reopen a result, delete one entry, clear all entries, or export the debate as Markdown. Failed answers, reviews, and synthesis can be retried separately.' },
];

const faq = [
  ['Why was my API key rejected?', 'Check that the key belongs to the provider shown on its card, is active, and has API access. Provider keys and model permissions are managed by the provider, not by DualMind AI.'],
  ['Why can’t I find my preferred model?', 'This app uses an explicit model registry. The current list is limited to the models shown on the home page; models are not discovered automatically.'],
  ['Why did a model fail or return a rate-limit message?', 'Provider availability, quotas, credits, and rate limits vary by account. Reduce parallel operations, wait and retry, or check usage and billing in the provider’s own dashboard.'],
  ['Will using the app cost money?', 'The app does not charge for model inference. Providers may bill your account for each generation, review, and synthesis call. The workspace estimates the number of calls and displays provider-reported token usage when available; it does not currently estimate prices.'],
  ['I see a higher provider charge than expected. What should I check?', 'The workspace shows an operation count and provider-reported token totals when available, but it does not estimate prices or control provider billing. Check the provider’s usage dashboard and billing details for the account used.'],
  ['Why is a debate incomplete?', 'A provider may reject a request, run out of quota, time out, or return unusable output. Successful answers and reviews remain visible; retry the failed operation or continue with the available evidence.'],
  ['Does agreement mean the answer is correct?', 'No. Models can share the same mistaken assumptions. Verify important claims with reliable sources, especially for current or high-impact decisions.'],
];

export default function HowToUse() {
  useEffect(() => {
    document.title = 'How to Use DualMind AI';
    const description = document.querySelector('meta[name="description"]');
    if (description) description.setAttribute('content', 'A beginner-friendly guide to setting up provider keys, comparing AI models, reviewing answers, and reading a DualMind AI synthesis.');
  }, []);

  return <div className="min-h-screen bg-[#070a12] text-slate-100">
    <SiteHeader guide />
    <a href="#guide-steps" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-20 focus:z-50 focus:rounded-lg focus:bg-cyan-300 focus:px-4 focus:py-2 focus:text-slate-950">Skip to guide</a>
    <main className="mx-auto max-w-6xl px-5 pb-20 sm:px-8">
      <section className="guide-hero py-16 sm:py-24">
        <a href="/" className="eyebrow-link">← Back to DualMind AI</a>
        <div className="mt-8 max-w-4xl animate-rise-in">
          <p className="eyebrow"><span className="eyebrow-dot"/> A practical guide</p>
          <h1 className="mt-5 text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">Get more from<br/><span className="text-gradient">every AI answer.</span></h1>
          <p className="mt-6 max-w-3xl text-base leading-8 text-slate-400 sm:text-lg">DualMind AI helps you compare independent model responses, inspect their disagreements, and synthesize the available insights into one useful answer—without creating an account.</p>
        </div>
      </section>

      <section id="guide-steps" className="scroll-mt-28" aria-labelledby="guide-steps-title">
        <div className="section-heading"><p className="section-kicker">The workflow</p><h2 id="guide-steps-title">From question to considered answer</h2><p>Each stage is visible, so you can see what ran and what still needs attention.</p></div>
        <ol className="mt-9 grid gap-3 md:grid-cols-2">
          {guideSteps.map((step) => <li key={step.number} className="guide-step-card"><span className="guide-step-number">{step.number}</span><div><h3>{step.title}</h3><p>{step.body}</p></div></li>)}
        </ol>
        <div className="example-prompt mt-5"><span className="text-xs font-semibold uppercase tracking-[.16em] text-cyan-300">Example prompt</span><p className="mt-3 text-sm leading-7 text-slate-200 sm:text-base">“Compare three approaches to reducing API latency in a Node.js service. For each approach, explain the trade-offs, implementation effort, and the metrics I should measure. Assume a small team and an existing PostgreSQL database.”</p></div>
      </section>

      <section className="mt-20" aria-labelledby="walkthrough-title">
        <div className="section-heading"><p className="section-kicker">A debate, at a glance</p><h2 id="walkthrough-title">One prompt. Separate perspectives.</h2><p>This diagram is an illustration of the workflow, not a live run or a model result.</p></div>
        <div className="walkthrough-panel mt-8">
          <div className="walkthrough-prompt"><span className="step-chip">YOUR QUESTION</span><p>Which option best fits my constraints, and what evidence would change that recommendation?</p></div>
          <div className="walkthrough-connectors" aria-hidden="true"><span/><span/><span/></div>
          <div className="walkthrough-columns">
            <article><span className="model-mark openai-mark">O</span><div><span className="step-chip">INDEPENDENT ANSWER</span><h3>OpenAI</h3><p>Responds to the original prompt on its own.</p></div></article>
            <article><span className="model-mark gemini-mark">G</span><div><span className="step-chip">INDEPENDENT ANSWER</span><h3>Google Gemini</h3><p>Builds a separate view from the same question.</p></div></article>
            <article><span className="model-mark claude-mark">C</span><div><span className="step-chip">INDEPENDENT ANSWER</span><h3>Anthropic Claude</h3><p>Offers another perspective when configured.</p></div></article>
          </div>
          <div className="walkthrough-review"><span className="review-icon" aria-hidden="true">↗</span><div><span className="step-chip">CROSS-REVIEW</span><p>Reviewers critique other successful responses for gaps, assumptions, and possible errors.</p></div></div>
          <div className="walkthrough-synthesis"><div className="synthesis-orbit" aria-hidden="true"><span/><span/><span/></div><div><span className="step-chip">FINAL SYNTHESIS · ILLUSTRATIVE</span><h3>A considered response from the available evidence</h3><p>Agreements, differences, and uncertainty remain visible for you to evaluate.</p></div></div>
        </div>
      </section>

      <section className="mt-20 grid gap-4 lg:grid-cols-2" aria-label="API key privacy and provider costs">
        <article className="info-panel" id="privacy"><p className="section-kicker">Keys and history</p><h2>Your keys stay in the session</h2><ul className="info-list"><li>Keys are held in the page’s memory and cleared when the tab reloads.</li><li>A key is sent to the DualMind server with each operation that uses that provider. The server uses it for that call and does not save it in debate history.</li><li>Debates are stored in this browser only. They are not synced to an account or saved by this app’s backend.</li><li>Clearing local history removes those records from this browser. It does not remove provider-side records, browser backups, or copied exports.</li></ul><p className="small-note">Browser memory is not a hardware vault. Use your own trusted device and HTTPS for any remote deployment.</p></article>
        <article className="info-panel info-panel-cost"><p className="section-kicker">Provider usage</p><h2>You control the provider account</h2><p>Bring your own API keys. Model providers may charge directly for generations, peer reviews, and synthesis according to your account’s terms and usage.</p><div className="usage-summary"><span><strong>Calls</strong><small>The workspace shows an operation count before you run.</small></span><span><strong>Tokens</strong><small>Provider-reported usage appears when available.</small></span><span><strong>Prices</strong><small>Exact cost estimates are not currently available.</small></span></div></article>
      </section>

      <section className="mt-20" aria-labelledby="faq-title">
        <div className="section-heading"><p className="section-kicker">Troubleshooting</p><h2 id="faq-title">Questions you may run into</h2></div>
        <div className="faq-list mt-7">{faq.map(([question, answer]) => <details key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div>
      </section>

      <section className="guide-cta mt-20 text-center"><p className="section-kicker">Ready to compare?</p><h2>Bring your question.<br/><span className="text-gradient">Keep the evidence in view.</span></h2><p>Choose the models you have access to and see how their answers differ.</p><a href="/#workspace" className="button-primary mt-7">Start testing <span aria-hidden="true">↗</span></a></section>
    </main>
    <footer className="site-footer"><div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-7 sm:flex-row sm:items-center sm:justify-between lg:px-8"><a href="/" aria-label="DualMind AI home"><Brand className="footer-brand-logo" /></a><p>No account · Bring your own keys · Provider usage may incur charges</p><a href="/#workspace" className="footer-link">Open the workspace ↗</a></div></footer>
  </div>;
}
