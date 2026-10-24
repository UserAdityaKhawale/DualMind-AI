import { useEffect, useRef, useState } from 'react';

const MAX_PROMPT_CHARS = 12000;
const providers = [
  { key: 'openai', name: 'OpenAI', modelLabel: 'OpenAI model' },
  { key: 'gemini', name: 'Google Gemini', modelLabel: 'Gemini model' },
];

function Status({ status }) {
  const label = {
    pending: 'Working…',
    success: 'Answered',
    error: 'Could not answer',
    timeout: 'Timed out',
  }[status] ?? 'Waiting';
  const colors = {
    pending: 'text-amber-200',
    success: 'text-emerald-300',
    error: 'text-rose-300',
    timeout: 'text-orange-300',
  }[status] ?? 'text-slate-400';
  return <span className={`text-xs font-medium ${colors}`} role="status">{status === 'pending' && <span className="mr-2 inline-block size-2 animate-pulse rounded-full bg-current" />}{label}</span>;
}

function ProviderPanel({ provider, result, pending }) {
  const status = pending ? 'pending' : result?.status ?? 'waiting';
  return (
    <article className="flex min-h-64 flex-col rounded-2xl border border-slate-700 bg-slate-900/80 p-5 sm:p-6" aria-labelledby={`${provider.key}-title`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id={`${provider.key}-title`} className="text-lg font-semibold">{provider.name}</h2>
          <p className="mt-1 text-xs text-slate-500">Independent response</p>
        </div>
        <Status status={status} />
      </div>
      {!result && !pending && <p className="mt-8 text-sm leading-6 text-slate-400">Your answer will appear here after you start a comparison.</p>}
      {pending && <div className="mt-8 space-y-3" aria-label={`${provider.name} is generating a response`}><div className="h-3 animate-pulse rounded bg-slate-800" /><div className="h-3 w-5/6 animate-pulse rounded bg-slate-800" /><div className="h-3 w-2/3 animate-pulse rounded bg-slate-800" /></div>}
      {result?.status === 'success' && <div className="mt-6 whitespace-pre-wrap break-words text-sm leading-7 text-slate-200">{result.text}</div>}
      {result && !['success', 'pending'].includes(result.status) && <div className="mt-6 rounded-xl border border-rose-900/70 bg-rose-950/30 p-4 text-sm leading-6 text-rose-100">{result.error?.message ?? 'This provider did not return an answer.'}</div>}
      {result?.model && <p className="mt-auto pt-6 text-xs text-slate-500">{result.model}{Number.isFinite(result.durationMs) && ` · ${(result.durationMs / 1000).toFixed(1)}s`}</p>}
    </article>
  );
}

function ReviewPanel({ provider, review }) {
  const reviewerName = provider === 'openai' ? 'OpenAI' : 'Google Gemini';
  const subjectName = provider === 'openai' ? 'Google Gemini' : 'OpenAI';
  const statusLabel = { pending: 'Reviewing', success: 'Review complete', error: 'Review failed', timeout: 'Review timed out', skipped: 'Skipped' }[review?.status] ?? 'Waiting';
  const lists = [
    ['Strengths', review?.review?.strengths],
    ['Missing information', review?.review?.missingInformation],
    ['Potential factual concerns', review?.review?.potentialConcerns],
    ['Reasoning weaknesses', review?.review?.logicalWeaknesses],
    ['Clarity and relevance', review?.review?.clarityIssues],
    ['Useful corrections', review?.review?.corrections],
  ];
  return <article className="rounded-2xl border border-slate-700 bg-slate-900/80 p-5 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="font-semibold">{reviewerName} reviews {subjectName}'s answer</h3>
      <span className="text-xs text-cyan-200" role="status">{statusLabel}</span>
    </div>
    {review?.status === 'pending' && <div className="mt-5 space-y-3" aria-label={`${reviewerName} is reviewing`}><div className="h-3 animate-pulse rounded bg-slate-800" /><div className="h-3 w-4/5 animate-pulse rounded bg-slate-800" /></div>}
    {review?.error && <p className="mt-4 text-sm text-rose-200" role="alert">{review.error.message}</p>}
    {review?.review && <>
      <p className="mt-4 text-sm leading-6 text-slate-200">{review.review.assessment}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {lists.map(([title, items]) => items?.length > 0 && <div key={title}><h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h4><ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-300">{items.map((item, index) => <li key={`${title}-${index}`}>{item}</li>)}</ul></div>)}
      </div>
      <div className="mt-4 rounded-lg bg-slate-950/70 p-3 text-sm text-slate-300"><strong className="text-slate-100">Confidence: {review.review.confidence}.</strong> {review.review.uncertainty}</div>
      <p className="mt-3 text-xs text-slate-500">Model-generated critique is untrusted analysis, not proof that a claim is true or false.</p>
    </>}
  </article>;
}

export default function App() {
  const [prompt, setPrompt] = useState('');
  const [comparison, setComparison] = useState(null);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState('');
  const [requestError, setRequestError] = useState('');
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  const synthesisBusy = useRef(false);
  const comparisonBusy = useRef(false);
  const [history, setHistory] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');

  async function refreshHistory() {
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const response = await fetch('/api/conversations');
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error?.message ?? 'Conversation history could not be loaded.');
      setHistory(payload.conversations ?? []);
    } catch (error) { setHistoryError(error.message || 'Conversation history could not be loaded.'); }
    finally { setHistoryLoading(false); }
  }

  useEffect(() => { refreshHistory(); }, []);

  async function openConversation(id) {
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const response = await fetch(`/api/conversations/${encodeURIComponent(id)}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error?.message ?? 'The saved conversation could not be opened.');
      setComparison(payload.conversation);
      setPrompt(payload.conversation.prompt);
      setRequestError('');
      setHistoryOpen(false);
    } catch (error) { setHistoryError(error.message || 'The saved conversation could not be opened.'); }
    finally { setHistoryLoading(false); }
  }

  async function runSynthesis(current, requestId = crypto.randomUUID()) {
    if (synthesisBusy.current) return;
    synthesisBusy.current = true;
    setLoading(true);
    setStage('Synthesizing final answer');
    setComparison({ ...current, synthesis: { status: 'pending', provider: 'openai' } });
    try {
      const response = await fetch('/api/synthesize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: current.prompt, results: current.results, reviews: current.reviews, requestId, conversationId: current.persistence?.conversationId ?? null }) });
      const payload = await response.json().catch(() => ({}));
      if (payload.synthesis) setComparison((previous) => ({ ...previous, synthesis: payload.synthesis, persistence: payload.persistence ?? previous.persistence }));
      else setComparison((previous) => ({ ...previous, synthesis: { status: 'error', provider: null, text: null, error: { message: payload.error?.message ?? 'The final answer could not be synthesized.' }, crossReviewComplete: false } }));
      if (payload.persistence?.status === 'saved') refreshHistory();
    } catch {
      setComparison((previous) => ({ ...previous, synthesis: { status: 'error', provider: null, text: null, error: { message: 'Could not reach the server to synthesize a final answer.' }, crossReviewComplete: false } }));
    } finally {
      synthesisBusy.current = false;
      setLoading(false);
      setStage('');
    }
  }

  function startNewComparison() {
    if (loading) return;
    setPrompt('');
    setComparison(null);
    setStage('');
    setRequestError('');
  }

  async function submitPrompt(event) {
    event.preventDefault();
    const trimmedPrompt = prompt.trim();
    if (comparisonBusy.current || loading || !trimmedPrompt || trimmedPrompt.length > MAX_PROMPT_CHARS) return;

    comparisonBusy.current = true;
    setLoading(true);
    setStage('Generating independent answers');
    setRequestError('');
    setComparison({ results: { openai: { status: 'pending' }, gemini: { status: 'pending' } }, persistence: null });
    try {
      const response = await fetch('/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: trimmedPrompt }),
      });
      const payload = await response.json().catch(() => ({}));
      if (payload.results) {
        const originalComparison = { ...payload, prompt: trimmedPrompt };
        setComparison(originalComparison);
        if (!Object.values(payload.results).some((result) => result.status === 'success')) {
          setRequestError('Neither provider could answer this prompt. You can try again in a moment.');
        } else {
          setStage('Cross-reviewing both answers');
          setComparison({ ...payload, reviews: { openai: { status: 'pending' }, gemini: { status: 'pending' } } });
          try {
            const reviewResponse = await fetch('/api/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: trimmedPrompt, results: payload.results, conversationId: payload.persistence?.conversationId ?? null }) });
            const reviewPayload = await reviewResponse.json().catch(() => ({}));
            if (reviewPayload.reviews) { originalComparison.reviews = reviewPayload.reviews; if (reviewPayload.persistence) originalComparison.persistence = reviewPayload.persistence; }
            else originalComparison.reviews = Object.fromEntries(providers.map(({ key }) => [key, { status: 'error', review: null, error: { message: reviewPayload.error?.message ?? 'The review stage could not be completed.' } }]));
          } catch {
            originalComparison.reviews = Object.fromEntries(providers.map(({ key }) => [key, { status: 'error', review: null, error: { message: 'Could not reach the server for cross-review.' } }]));
          }
          if (originalComparison.persistence?.status === 'saved' || originalComparison.persistence?.status === 'unavailable') refreshHistory();
          const completedComparison = { ...originalComparison };
          setComparison(completedComparison);
          await runSynthesis(completedComparison);
        }
      } else {
        setComparison(null);
        setRequestError(payload.error?.message ?? 'The server could not start this comparison. Please try again.');
      }
    } catch {
      setComparison(null);
      setRequestError('Could not reach the server. Check that the API is running and try again.');
    } finally {
      comparisonBusy.current = false;
      setLoading(false);
      setStage('');
    }
  }

  const characterCount = prompt.trim().length;
  const canSubmit = characterCount > 0 && characterCount <= MAX_PROMPT_CHARS && !loading;

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-8 sm:px-8 sm:py-12">
      <header className="mb-10 flex flex-wrap items-end justify-between gap-5 sm:mb-12">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">DualMind AI</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">Two perspectives.<br className="sm:hidden" /> One prompt.</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">Compare independent answers from OpenAI and Google Gemini. Their agreement does not prove a claim is correct.</p>
        </div>
        <div className="flex gap-2"><button type="button" onClick={() => { setHistoryOpen((open) => !open); if (!historyOpen) refreshHistory(); }} className="rounded-xl border border-slate-600 px-4 py-2.5 text-sm font-medium text-slate-200 hover:border-cyan-300">{historyOpen ? 'Hide history' : 'History'}</button>{comparison && <button type="button" onClick={startNewComparison} disabled={loading} className="rounded-xl border border-slate-600 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:border-cyan-300 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50">New comparison</button>}</div>
      </header>

      {historyOpen && <aside className="mb-6 rounded-2xl border border-slate-700 bg-slate-900/70 p-4 sm:p-5" aria-label="Conversation history">
        <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Saved conversations</h2><button type="button" onClick={refreshHistory} disabled={historyLoading} className="text-xs text-cyan-200 disabled:opacity-50">Refresh</button></div>
        {historyLoading && <p className="mt-3 text-sm text-slate-400" role="status">Loading history…</p>}
        {historyError && <p className="mt-3 text-sm text-amber-200" role="alert">{historyError}</p>}
        {!historyLoading && !historyError && history.length === 0 && <p className="mt-3 text-sm text-slate-400">No saved conversations yet. History requires a configured PostgreSQL database.</p>}
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">{history.map((item) => <li key={item.id}><button type="button" disabled={loading} onClick={() => openConversation(item.id)} className="w-full rounded-xl border border-slate-700 bg-slate-950/60 p-3 text-left hover:border-cyan-700 disabled:opacity-50"><span className="block truncate text-sm font-medium text-slate-100">{item.title}</span><span className="mt-1 block text-xs text-slate-500">{new Date(item.updatedAt).toLocaleString()} · {item.workflowStatus}</span></button></li>)}</ul>
        <p className="mt-4 text-xs text-slate-500">History is shared by anyone who can access this deployment. Authentication and per-user privacy are not implemented.</p>
      </aside>}

      <form onSubmit={submitPrompt} className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4 shadow-xl sm:p-6">
        <label htmlFor="prompt" className="block text-sm font-medium text-slate-200">What would you like both models to answer?</label>
        <textarea
          id="prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          disabled={loading}
          maxLength={MAX_PROMPT_CHARS}
          required
          rows={4}
          placeholder="Ask a question, request an explanation, or compare ideas…"
          className="mt-3 w-full resize-y rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm leading-6 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 disabled:opacity-60"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <span className={`text-xs ${characterCount > MAX_PROMPT_CHARS ? 'text-rose-300' : 'text-slate-500'}`}>{characterCount.toLocaleString()} / {MAX_PROMPT_CHARS.toLocaleString()} characters</span>
          <button type="submit" disabled={!canSubmit} className="rounded-xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-45">
            {loading ? `${stage}…` : 'Compare answers'}
          </button>
        </div>
      </form>

      {requestError && <p className="mt-5 rounded-xl border border-rose-900/70 bg-rose-950/30 px-4 py-3 text-sm text-rose-100" role="alert">{requestError}</p>}

      <section className="mt-7 grid gap-4 md:grid-cols-2" aria-label="Provider responses" aria-live="polite">
        {providers.map((provider) => <ProviderPanel key={provider.key} provider={provider} result={comparison?.results?.[provider.key]} pending={loading && stage === 'Generating independent answers'} />)}
      </section>

      {comparison?.reviews && <section className="mt-8 space-y-4" aria-labelledby="review-heading">
        <div><h2 id="review-heading" className="text-xl font-semibold">Cross-review</h2><p className="mt-1 text-sm text-slate-400">Each model evaluates the other model's original answer.</p></div>
        <div className="grid gap-4">{providers.map(({ key }) => <ReviewPanel key={key} provider={key} review={comparison.reviews[key]} />)}</div>
        {!loading && Object.values(comparison.reviews).length > 0 && Object.values(comparison.reviews).every((review) => !['pending', undefined].includes(review.status)) && <p className="text-xs text-slate-500" role="status">Cross-review stage finished. Review results may be incomplete if a provider failed.</p>}
      </section>}

      {comparison?.synthesis && <section className="mt-8 rounded-2xl border border-cyan-900/70 bg-slate-900/80 p-5 sm:p-7" aria-labelledby="synthesis-heading">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="synthesis-heading" className="text-xl font-semibold">Final Answer</h2><p className="mt-1 text-sm text-slate-400">Synthesized from available answers and reviews.</p></div>
          {comparison.synthesis.status === 'success' && <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(comparison.synthesis.text); setCopyError(''); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { setCopied(false); setCopyError('Copy is unavailable in this browser context.'); } }} className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:border-cyan-300">{copied ? 'Copied' : 'Copy answer'}</button>}
        </div>
        {comparison.synthesis.status === 'pending' && <div className="mt-5 space-y-3" aria-label="Synthesizing final answer"><div className="h-3 animate-pulse rounded bg-slate-800"/><div className="h-3 w-5/6 animate-pulse rounded bg-slate-800"/><div className="h-3 w-2/3 animate-pulse rounded bg-slate-800"/></div>}
        {comparison.synthesis.status === 'success' && <><div className="mt-5 whitespace-pre-wrap break-words text-sm leading-7 text-slate-100">{comparison.synthesis.text}</div><p className="mt-5 text-xs text-slate-500">Synthesized by {comparison.synthesis.provider}{comparison.synthesis.model ? ` · ${comparison.synthesis.model}` : ''}{Number.isFinite(comparison.synthesis.durationMs) ? ` · ${(comparison.synthesis.durationMs / 1000).toFixed(1)}s` : ''}</p></>}
        {copyError && <p className="mt-2 text-xs text-rose-200" role="status">{copyError}</p>}
        {comparison.synthesis.status !== 'pending' && comparison.synthesis.status !== 'success' && <div className="mt-4 flex flex-wrap items-center gap-3"><p className="text-sm text-rose-200" role="alert">{comparison.synthesis.error?.message ?? 'Synthesis failed.'}</p><button type="button" onClick={() => runSynthesis(comparison)} disabled={loading} className="rounded-lg border border-slate-600 px-3 py-2 text-sm hover:border-cyan-300 disabled:opacity-50">Retry synthesis</button></div>}
        {comparison.synthesis.status === 'success' && comparison.synthesis.crossReviewComplete === false && <p className="mt-4 rounded-lg border border-amber-900 bg-amber-950/30 p-3 text-sm text-amber-100" role="status">Cross-review was incomplete. The final answer used the original answers and reviews that were available.</p>}
        <p className="mt-4 text-xs text-slate-500">A synthesis is not an independent fact check. Confirm important claims from reliable sources.</p>
      </section>}

      {comparison?.persistence?.status === 'unavailable' && <p className="mt-4 text-sm text-amber-200" role="status">{comparison.persistence.message}</p>}
      {comparison?.persistence?.status === 'saved' && <p className="mt-4 text-xs text-slate-500" role="status">Saved conversation {comparison.persistence.conversationId}</p>}
      {comparison?.persistence?.status === 'disabled' && <p className="mt-4 text-sm text-amber-200" role="status">Conversation history is off because PostgreSQL is not configured. Results are only available in this page until you leave.</p>}

      <footer className="mt-auto pt-10 text-xs leading-5 text-slate-500">Each model answers on its own. Review important claims independently; model agreement is not a fact check.</footer>
    </main>
  );
}
