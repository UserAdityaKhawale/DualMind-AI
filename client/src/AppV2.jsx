import React, { useEffect, useMemo, useRef, useState } from 'react';
import { clearDebates, listDebates, removeDebate, saveDebate, toHistoryRecord } from './history.js';
import { buildReviewPairs, orderSynthesizerCandidates } from './debate.js';
import SiteHeader, { Brand } from './SiteHeader.jsx';
import HowToUse from './HowToUse.jsx';

const FALLBACK_MODELS = [
  { id: 'gpt-5.5', provider: 'openai', name: 'GPT-5.5', capabilities: ['text', 'review', 'synthesis', 'streaming'] },
  { id: 'gemini-3.8-flash', provider: 'gemini', name: 'Gemini 3.8 Flash', capabilities: ['text', 'review', 'synthesis', 'streaming'] },
  { id: 'claude-sonnet-4-6', provider: 'anthropic', name: 'Claude Sonnet 4.6', capabilities: ['text', 'review', 'synthesis', 'streaming'] },
];
const PROVIDERS = [
  { id: 'openai', name: 'OpenAI', label: 'OpenAI API key', color: 'from-emerald-400/20 to-transparent' },
  { id: 'gemini', name: 'Google Gemini', label: 'Gemini API key', color: 'from-blue-400/20 to-transparent' },
  { id: 'anthropic', name: 'Anthropic Claude', label: 'Anthropic API key', color: 'from-orange-300/20 to-transparent' },
];
const DEFAULT_MAX_MODELS = 4;
const INITIAL_CONCURRENCY = 3;

async function apiPost(path, body, signal) {
  if (body.apiKey && window.location.protocol !== 'https:' && !['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)) {
    throw Object.assign(new Error('Provider keys require HTTPS when using a remote server. Open a secure site URL before sending this key.'), { code: 'HTTPS_REQUIRED' });
  }
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(payload.error?.message ?? 'The operation failed.'), { code: payload.error?.code ?? 'REQUEST_FAILED', status: payload.status ?? 'error' });
  return payload;
}

async function apiStream(path, body, onDelta, signal) {
  if (body.apiKey && window.location.protocol !== 'https:' && !['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)) {
    throw Object.assign(new Error('Provider keys require HTTPS when using a remote server. Open a secure site URL before sending this key.'), { code: 'HTTPS_REQUIRED' });
  }
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify(body), signal });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw Object.assign(new Error(payload.error?.message ?? 'The operation failed.'), { code: payload.error?.code ?? 'REQUEST_FAILED', status: payload.status ?? 'error' });
  }
  if (!response.body) throw Object.assign(new Error('This browser could not read the live response.'), { code: 'STREAM_UNAVAILABLE' });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let completed = null;
  let streamError = null;
  const dispatch = (frame) => {
    let event = 'message';
    const data = [];
    for (const line of frame.split(/\r?\n/)) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
    }
    if (!data.length) return;
    const payload = JSON.parse(data.join('\n'));
    if (event === 'delta') onDelta(payload.text ?? '');
    else if (event === 'done') completed = payload;
    else if (event === 'error') streamError = Object.assign(new Error(payload.error?.message ?? 'The model could not complete the response.'), { code: payload.error?.code ?? 'REQUEST_FAILED', status: payload.status ?? 'error' });
  };
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, '\n');
    let boundary;
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      dispatch(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + 2);
    }
    if (done) break;
  }
  if (buffer.trim()) dispatch(buffer);
  if (streamError) throw streamError;
  if (!completed) throw Object.assign(new Error('The live response ended before completion.'), { code: 'STREAM_INCOMPLETE' });
  return completed;
}

async function mapConcurrent(items, limit, callback) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await callback(items[index], index);
    }
  });
  await Promise.all(workers);
}

const localStatus = (error) => error?.status === 'timeout' ? 'timeout' : 'error';
const keyForModel = (model, keys) => keys[model.provider]?.trim() ?? '';
const resultKey = (reviewerModel, targetModel) => `${reviewerModel}::${targetModel}`;

function StatusPill({ status }) {
  const theme = {
    queued: 'border-slate-700 bg-slate-900 text-slate-400', pending: 'border-blue-700/60 bg-blue-950/40 text-blue-200',
    success: 'border-emerald-700/60 bg-emerald-950/40 text-emerald-200', error: 'border-rose-700/60 bg-rose-950/40 text-rose-200',
    timeout: 'border-amber-700/60 bg-amber-950/40 text-amber-200', skipped: 'border-slate-700 bg-slate-900 text-slate-400',
  }[status] ?? 'border-slate-700 bg-slate-900 text-slate-400';
  const label = { pending: 'Running', success: 'Complete', error: 'Failed', timeout: 'Timed out', queued: 'Queued', skipped: 'Skipped' }[status] ?? 'Waiting';
  return <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs ${theme}`} role="status">{status === 'pending' && <span className="size-1.5 animate-pulse rounded-full bg-current"/>}{label}</span>;
}

function ProviderKeyCard({ provider, value, onChange, visible, onToggleVisible, testStatus, onTest, onClear }) {
  const testState = testStatus?.status;
  return <article className={`rounded-2xl border border-slate-800 bg-gradient-to-br ${provider.color} p-5`}>
    <div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold text-white">{provider.name}</h3><p className="mt-1 text-xs text-slate-400">{value.trim() ? 'Key is in this tab’s memory' : 'Not configured in this tab'}</p></div><span className={`size-2.5 rounded-full ${value.trim() ? 'bg-emerald-400' : 'bg-slate-600'}`} aria-label={value.trim() ? 'Configured' : 'Not configured'}/></div>
    <label className="mt-4 block text-xs font-medium text-slate-300" htmlFor={`key-${provider.id}`}>{provider.label}</label>
    <div className="mt-2 flex gap-2"><input id={`key-${provider.id}`} type={visible ? 'text' : 'password'} autoComplete="off" spellCheck="false" value={value} onChange={(event) => onChange(event.target.value)} placeholder="Paste key for this session" className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400"/><button type="button" onClick={onToggleVisible} className="rounded-xl border border-slate-700 px-3 text-xs text-slate-300 hover:border-cyan-400">{visible ? 'Hide' : 'Show'}</button></div>
    <div className="mt-3 flex flex-wrap items-center gap-2"><button type="button" onClick={onTest} disabled={!value.trim() || testState === 'pending'} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-950 disabled:opacity-40">{testState === 'pending' ? 'Testing…' : 'Test connection'}</button>{value && <button type="button" onClick={onClear} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:border-rose-500">Remove key</button>}{testState === 'connected' && <span className="text-xs text-emerald-300">Connection verified</span>}{testState === 'failed' && <span className="text-xs text-rose-300">{testStatus.message}</span>}</div>
  </article>;
}

function ModelPanel({ model, result, onRetry }) {
  return <article className="flex min-h-64 flex-col rounded-2xl border border-slate-800 bg-[#0d1524] p-5 sm:p-6">
    <div className="flex items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-wider text-slate-500">{model.provider}</p><h3 className="mt-1 text-lg font-semibold text-slate-100">{model.name}</h3><p className="mt-1 text-xs text-slate-500">{model.id}</p></div><StatusPill status={result?.status ?? 'queued'}/></div>
    {result?.status === 'pending' && !result.text && <div className="mt-7 space-y-3" aria-label={`${model.name} is responding`}><div className="h-3 animate-pulse rounded bg-slate-800"/><div className="h-3 w-5/6 animate-pulse rounded bg-slate-800"/><div className="h-3 w-2/3 animate-pulse rounded bg-slate-800"/></div>}
    {result?.status === 'pending' && result.text && <div className="mt-5 whitespace-pre-wrap break-words text-sm leading-7 text-slate-200" aria-label={`${model.name} response streaming`}>{result.text}<span className="ml-1 inline-block h-4 w-1 animate-pulse bg-cyan-300 align-middle"/></div>}
    {result?.status === 'success' && <div className="mt-5 whitespace-pre-wrap break-words text-sm leading-7 text-slate-200">{result.text}</div>}
    {['error', 'timeout'].includes(result?.status) && <div className="mt-5 space-y-3 rounded-xl border border-rose-900/70 bg-rose-950/25 p-4 text-sm leading-6 text-rose-100">{result.text && <p className="whitespace-pre-wrap break-words text-slate-200">{result.text}</p>}<p>{result.error?.message ?? 'This model could not complete the request.'}</p></div>}
    {result?.status === 'success' && <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-6 text-xs text-slate-500"><span>{(result.durationMs / 1000).toFixed(1)}s</span>{result.usage?.inputTokens != null && <span>{result.usage.inputTokens.toLocaleString()} input tokens</span>}{result.usage?.outputTokens != null && <span>{result.usage.outputTokens.toLocaleString()} output tokens</span>}</div>}
    {['error', 'timeout'].includes(result?.status) && onRetry && <button type="button" onClick={onRetry} className="mt-auto self-start pt-5 text-xs font-medium text-cyan-300 hover:text-cyan-200">Retry this model</button>}
  </article>;
}

function ReviewCard({ review, modelsById }) {
  const reviewer = modelsById[review.reviewerModel]?.name ?? review.reviewerModel;
  const target = modelsById[review.targetModel]?.name ?? review.targetModel;
  return <article className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-medium text-slate-100">{reviewer} reviews {target}</p><StatusPill status={review.status}/></div>
    {review.review && <><p className="mt-3 text-sm leading-6 text-slate-300">{review.review.assessment}</p><div className="mt-3 grid gap-3 sm:grid-cols-2">{[['Strengths', review.review.strengths], ['Potential concerns', review.review.potentialConcerns], ['Missing information', review.review.missingInformation], ['Corrections', review.review.corrections]].map(([label, values]) => values?.length ? <div key={label}><h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</h4><ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-slate-300">{values.map((text, index) => <li key={`${label}-${index}`}>{text}</li>)}</ul></div> : null)}</div><p className="mt-3 text-xs text-slate-500">Confidence: {review.review.confidence}. {review.review.uncertainty}</p></>}
    {review.error && <p className="mt-3 text-sm text-rose-200">{review.error.message}</p>}
  </article>;
}

function toMarkdown(run, modelsById) {
  const answers = run.results.map((result) => `## ${modelsById[result.modelId]?.name ?? result.modelId} (${result.status})\n\n${result.text ?? result.error?.message ?? 'No response'}`).join('\n\n');
  const reviews = run.reviews.map((review) => `### ${modelsById[review.reviewerModel]?.name ?? review.reviewerModel} → ${modelsById[review.targetModel]?.name ?? review.targetModel}: ${review.status}\n\n${review.review?.assessment ?? review.error?.message ?? 'No review'}`).join('\n\n');
  return `# DualMind AI debate\n\n## Question\n\n${run.prompt}\n\n## Final answer\n\n${run.synthesis?.text ?? run.synthesis?.error?.message ?? 'No synthesis'}\n\n## Model answers\n\n${answers}\n\n## Peer reviews\n\n${reviews || 'Not available (single-model response).'}\n`;
}

function ProductPreview() {
  return <aside className="product-preview animate-rise-in" aria-label="Illustrative preview of a multi-model debate; this is not a live run">
    <div className="preview-light" aria-hidden="true"/>
    <div className="preview-content p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3 border-b border-slate-700/60 pb-4"><div><p className="text-[.65rem] font-semibold uppercase tracking-[.16em] text-slate-500">Product preview</p><p className="mt-1 text-sm font-semibold text-slate-200">One prompt, reviewed from multiple angles</p></div><span className="rounded-full border border-slate-700 px-2.5 py-1 text-[.65rem] text-slate-400">Illustrative</span></div>
      <div className="mt-4 rounded-xl border border-slate-700/80 bg-[#070c16]/90 p-4"><div className="flex items-center justify-between"><span className="text-[.62rem] font-bold tracking-[.15em] text-cyan-300">YOUR QUESTION</span><span className="text-[.65rem] text-slate-600">01 / 04</span></div><p className="mt-2 text-sm leading-6 text-slate-200">How should I compare several approaches to a complex problem?</p></div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">{[['OpenAI', 'text-emerald-200', 'bg-emerald-400/50'], ['Gemini', 'text-blue-200', 'bg-blue-400/50'], ['Claude', 'text-orange-200', 'bg-orange-400/50']].map(([name, tone, bar], index) => <article key={name} className="preview-model"><div className="flex items-center justify-between"><span className={`text-xs font-semibold ${tone}`}>{name}</span><span className="preview-status">Independent</span></div><div className="mt-3 space-y-1.5" aria-hidden="true"><div className="h-1.5 w-full rounded bg-slate-800"/><div className={`h-1.5 rounded ${bar}`} style={{ width: `${78 - index * 11}%` }}/><div className="h-1.5 w-2/3 rounded bg-slate-800"/></div></article>)}</div>
      <div className="preview-review-line"><span className="grid size-6 shrink-0 place-items-center rounded-full border border-blue-400/20 bg-blue-400/10 text-[.7rem] text-blue-200">↗</span><span>Peer reviews look for gaps, assumptions, and disagreements.</span></div>
      <div className="preview-synthesis flex items-start gap-3 p-4"><span className="grid size-8 shrink-0 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200">✳</span><div><div className="flex flex-wrap items-center gap-2"><span className="text-[.62rem] font-bold tracking-[.14em] text-cyan-300">SYNTHESIS</span><span className="text-[.62rem] text-slate-500">Uses available answers and reviews</span></div><p className="mt-1.5 text-xs leading-5 text-slate-300">A consolidated response keeps useful differences and uncertainty visible.</p></div></div>
    </div>
  </aside>;
}

export default function AppV2() {
  const currentPath = typeof window === 'undefined' ? '/' : window.location.pathname;
  const isGuide = currentPath.replace(/\/$/, '') === '/how-to-use';
  const [models, setModels] = useState(FALLBACK_MODELS);
  const [maxModels, setMaxModels] = useState(DEFAULT_MAX_MODELS);
  const [maxParallelRequests, setMaxParallelRequests] = useState(INITIAL_CONCURRENCY);
  const [keys, setKeys] = useState({ openai: '', gemini: '', anthropic: '' });
  const [keyVisibility, setKeyVisibility] = useState({});
  const [keyTests, setKeyTests] = useState({});
  const [selected, setSelected] = useState(['gpt-5.5', 'gemini-3.8-flash']);
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState('simple');
  const [concurrency, setConcurrency] = useState(INITIAL_CONCURRENCY);
  const [synthesizer, setSynthesizer] = useState('auto');
  const [run, setRun] = useState(null);
  const runRef = useRef(null);
  const busy = useRef(false);
  const [stage, setStage] = useState('');
  const [history, setHistory] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('history') === '1');
  const [historyError, setHistoryError] = useState('');
  const [modelsError, setModelsError] = useState('');
  const [notice, setNotice] = useState('');

  const modelsById = useMemo(() => Object.fromEntries(models.map((model) => [model.id, model])), [models]);
  const selectedModels = selected.map((id) => modelsById[id]).filter(Boolean);
  const runnableModels = selectedModels.filter((model) => keyForModel(model, keys));
  const reviewCallCount = runnableModels.length * (runnableModels.length - 1);
  const synthesisCallCount = runnableModels.length > 1 ? 1 : 0;
  const callCount = runnableModels.length + reviewCallCount + synthesisCallCount;
  const configuredCount = selectedModels.filter((model) => keyForModel(model, keys)).length;

  useEffect(() => {
    if (isGuide) return;
    fetch('/api/models').then((response) => response.json()).then((payload) => { if (payload.models?.length) setModels(payload.models); if (Number.isInteger(payload.maxSelectedModels)) setMaxModels(payload.maxSelectedModels); if (Number.isInteger(payload.maxParallelRequests)) { setMaxParallelRequests(payload.maxParallelRequests); setConcurrency(Math.min(INITIAL_CONCURRENCY, payload.maxParallelRequests)); } }).catch(() => setModelsError('Using the built-in model list; the API model registry could not be loaded.'));
    listDebates().then(setHistory).catch((error) => setHistoryError(error.message));
    if (new URLSearchParams(window.location.search).get('history') === '1') window.setTimeout(() => document.getElementById('history')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }, [isGuide]);

  useEffect(() => {
    if (isGuide) return;
    document.title = 'DualMind AI — Multi-Model Debate';
    const description = document.querySelector('meta[name="description"]');
    if (description) description.setAttribute('content', 'Compare independent answers from leading AI models, review their differences, and synthesize a useful response with DualMind AI.');
  }, [isGuide]);

  function updateRun(next) { runRef.current = next; setRun(next); }
  async function refreshHistory() {
    try { setHistory(await listDebates()); setHistoryError(''); }
    catch (error) { setHistoryError(error.message); }
  }

  function toggleHistory() {
    const opening = !historyOpen;
    setHistoryOpen(opening);
    if (!opening) return;
    refreshHistory();
    window.setTimeout(() => document.getElementById('history')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }

  function toggleModel(id) {
    setSelected((current) => current.includes(id) ? current.filter((modelId) => modelId !== id) : current.length >= maxModels ? current : [...current, id]);
  }

  async function testProvider(provider) {
    const model = models.find((item) => item.provider === provider);
    const apiKey = keys[provider]?.trim();
    if (!model || !apiKey) return;
    setKeyTests((current) => ({ ...current, [provider]: { status: 'pending' } }));
    try {
      const result = await apiPost('/api/provider-test', { modelId: model.id, apiKey });
      setKeyTests((current) => ({ ...current, [provider]: { status: 'connected', model: result.model } }));
    } catch (error) {
      setKeyTests((current) => ({ ...current, [provider]: { status: 'failed', message: error.message } }));
    }
  }

  function saveToHistory(value) {
    if (!value) return;
    const safe = toHistoryRecord(value);
    saveDebate(safe).then(refreshHistory).catch((error) => setHistoryError(`${error.message} The current result is still available in this tab.`));
  }

  async function runDebate({ prior = null, retryOnlyModel = null } = {}) {
    if (busy.current) return;
    const requestedModels = prior?.selectedModels?.map((id) => modelsById[id]).filter(Boolean) ?? selectedModels;
    const chosen = requestedModels.filter((model) => keyForModel(model, keys));
    const question = prior?.prompt ?? prompt.trim();
    if (!question) return setNotice('Enter a question first.');
    if (!requestedModels.length) return setNotice('Select at least one model.');
    if (chosen.length < 1) return setNotice('Add a key for at least one selected provider to start a response.');

    busy.current = true;
    const skippedProviders = [...new Set(requestedModels.filter((model) => !keyForModel(model, keys)).map((model) => model.provider))];
    setNotice(skippedProviders.length ? `Skipping unconfigured provider(s): ${skippedProviders.join(', ')}. Add a key later to include them.` : '');
    const base = prior ?? {
      id: crypto.randomUUID(), prompt: question, selectedModels: chosen.map((model) => model.id),
      results: chosen.map((model) => ({ modelId: model.id, provider: model.provider, status: 'queued', text: null, error: null })),
      reviews: [], synthesis: null, status: 'running', createdAt: new Date().toISOString(), usage: null,
    };
    updateRun({ ...base, status: 'running', synthesis: null });

    try {
      setStage('Generating independent answers');
      let currentResults = [...base.results];
      const generationTargets = chosen.filter((model) => {
        if (retryOnlyModel && model.id !== retryOnlyModel) return false;
        const old = currentResults.find((item) => item.modelId === model.id);
        return !old || old.status !== 'success';
      });
      for (const model of generationTargets) {
        currentResults = currentResults.map((item) => item.modelId === model.id ? { ...item, status: 'pending' } : item);
      }
      updateRun({ ...base, status: 'running', results: currentResults, synthesis: null });
      await mapConcurrent(generationTargets, concurrency, async (model) => {
        const key = keyForModel(model, keys);
        let result;
        let streamedText = '';
        try {
          result = await apiStream('/api/generate/stream', { prompt: question, modelId: model.id, apiKey: key }, (delta) => {
            streamedText += delta;
            currentResults = currentResults.map((item) => item.modelId === model.id ? { ...item, status: 'pending', text: streamedText } : item);
            updateRun({ ...base, status: 'running', results: [...currentResults], reviews: base.reviews ?? [], synthesis: null });
          });
          result = { ...result, status: 'success', text: streamedText };
        } catch (error) { result = { status: localStatus(error), text: streamedText || null, error: { code: error.code ?? 'REQUEST_FAILED', message: error.message } }; }
        currentResults = currentResults.map((item) => item.modelId === model.id ? { ...item, ...result, modelId: model.id, provider: model.provider } : item);
        updateRun({ ...base, status: 'running', results: [...currentResults], reviews: base.reviews ?? [], synthesis: null });
      });

      const successful = currentResults.filter((item) => item.status === 'success' && item.text?.trim());
      let currentReviews = [...(base.reviews ?? [])];
      if (successful.length > 0 && chosen.length > 1) {
        setStage('Reviewing every other model');
        const reviewTargets = buildReviewPairs(chosen.map((model) => model.id), currentResults, currentReviews).map((pair) => ({
          ...pair,
          reviewer: chosen.find((model) => model.id === pair.reviewerModel),
          target: currentResults.find((item) => item.modelId === pair.targetModel),
        }));
        currentReviews = currentReviews.filter((item) => !reviewTargets.some((pair) => item.reviewerModel === pair.reviewerModel && item.targetModel === pair.targetModel));
        for (const pair of reviewTargets) currentReviews.push({ reviewerModel: pair.reviewerModel, targetModel: pair.targetModel, status: 'pending', review: null, error: null });
        updateRun({ ...base, status: 'running', results: currentResults, reviews: [...currentReviews], synthesis: null });
        await mapConcurrent(reviewTargets, concurrency, async ({ reviewer, target }) => {
          let outcome;
          try { outcome = await apiPost('/api/review', { prompt: question, modelId: reviewer.id, apiKey: keyForModel(reviewer, keys), answer: target.text, targetModel: target.modelId }); }
          catch (error) { outcome = { status: localStatus(error), error: { code: error.code ?? 'REQUEST_FAILED', message: error.message } }; }
          currentReviews = currentReviews.map((item) => item.reviewerModel === reviewer.id && item.targetModel === target.modelId ? { ...item, ...outcome } : item);
          updateRun({ ...base, status: 'running', results: currentResults, reviews: [...currentReviews], synthesis: null });
        });
      }

      let current = { ...base, status: 'running', results: currentResults, reviews: currentReviews, synthesis: null };
      updateRun(current);
      if (!successful.length) {
        current = { ...current, status: 'partial', synthesis: { status: 'error', error: { code: 'NO_USABLE_ANSWERS', message: 'No selected model returned an answer. Check its key, credits, model access, and network, then retry.' } } };
      } else if (chosen.length === 1) {
        current = { ...current, synthesis: { status: 'success', modelId: successful[0].modelId, text: successful[0].text, selectionReason: 'Single-model response; no peer review or synthesis call was made.', reviewCoverage: { completed: 0, total: 0 } } };
      } else {
        setStage('Preparing final synthesis');
        current = await synthesize(current);
      }
      current = { ...current, status: current.synthesis?.status === 'success' ? 'complete' : 'partial', usage: collectUsage(currentResults, currentReviews, current.synthesis) };
      updateRun(current);
      saveToHistory(current);
    } finally {
      busy.current = false;
      setStage('');
    }
  }

  async function synthesize(current) {
    const answerResults = current.results.filter((item) => item.status === 'success' && item.text?.trim()).map(({ modelId, text }) => ({ modelId, text }));
    const eligible = current.selectedModels.map((id) => modelsById[id]).filter((model) => model && keyForModel(model, keys));
    const ordered = orderSynthesizerCandidates(eligible, answerResults.map((answer) => answer.modelId), synthesizer);
    const attempts = [];
    for (const model of ordered) {
      try {
        const result = await apiPost('/api/synthesize', { prompt: current.prompt, modelId: model.id, apiKey: keyForModel(model, keys), results: answerResults, reviews: current.reviews.map(({ reviewerModel, targetModel, status, review }) => ({ reviewerModel, targetModel, status, review })) });
      return { ...current, synthesis: { ...result, status: 'success', attempts, selectionReason: synthesizer === model.id ? 'Selected in advanced mode.' : synthesizer !== 'auto' ? 'Fallback: the preferred synthesizer was unavailable.' : answerResults.some((answer) => answer.modelId === model.id) ? 'Chosen because it returned an original answer.' : 'Fallback: original-answer models were unavailable for synthesis.' } };
      } catch (error) {
        attempts.push({ modelId: model.id, status: localStatus(error), error: { code: error.code ?? 'REQUEST_FAILED', message: error.message } });
      }
    }
    return { ...current, synthesis: { status: 'error', attempts, error: { code: 'SYNTHESIS_FAILED', message: 'No eligible model could synthesize the available answers. Your original responses remain available above.' } } };
  }

  async function retryModel(modelId) {
    if (!runRef.current || busy.current) return;
    const model = modelsById[modelId];
    if (!model || !keyForModel(model, keys)) return setNotice('Add this provider’s key in session settings before retrying.');
    await runDebate({ prior: runRef.current, retryOnlyModel: modelId });
  }

  async function retrySynthesis() {
    if (!runRef.current || busy.current) return;
    busy.current = true;
    setStage('Retrying final synthesis');
    const current = { ...runRef.current, synthesis: { status: 'pending' } };
    updateRun(current);
    try {
      const next = await synthesize(current);
      const finished = { ...next, status: next.synthesis?.status === 'success' ? 'complete' : 'partial', usage: collectUsage(next.results, next.reviews, next.synthesis) };
      updateRun(finished);
      saveToHistory(finished);
    } finally { busy.current = false; setStage(''); }
  }

  async function retryFailedReviews() {
    const current = runRef.current;
    if (!current || busy.current) return;
    const failed = current.reviews.filter((item) => ['error', 'timeout'].includes(item.status));
    if (!failed.length) return;
    busy.current = true;
    setStage('Retrying failed peer reviews');
    let currentReviews = current.reviews.map((item) => failed.includes(item) ? { ...item, status: 'pending', error: null } : item);
    updateRun({ ...current, status: 'running', reviews: [...currentReviews], synthesis: null });
    try {
      await mapConcurrent(failed, concurrency, async (review) => {
        const reviewer = modelsById[review.reviewerModel];
        const target = current.results.find((item) => item.modelId === review.targetModel && item.status === 'success');
        let outcome;
        if (!reviewer || !keyForModel(reviewer, keys)) {
          outcome = { status: 'error', error: { code: 'NOT_CONFIGURED', message: 'Add this reviewer’s provider key before retrying.' } };
        } else if (!target?.text) {
          outcome = { status: 'error', error: { code: 'TARGET_UNAVAILABLE', message: 'The target model has no successful answer to review.' } };
        } else {
          try { outcome = await apiPost('/api/review', { prompt: current.prompt, modelId: reviewer.id, apiKey: keyForModel(reviewer, keys), answer: target.text, targetModel: target.modelId }); }
          catch (error) { outcome = { status: localStatus(error), error: { code: error.code ?? 'REQUEST_FAILED', message: error.message } }; }
        }
        currentReviews = currentReviews.map((item) => item.reviewerModel === review.reviewerModel && item.targetModel === review.targetModel ? { ...item, ...outcome } : item);
        updateRun({ ...current, status: 'running', reviews: [...currentReviews], synthesis: null });
      });
      const updated = { ...current, reviews: currentReviews, synthesis: null };
      const next = await synthesize(updated);
      const finished = { ...next, status: next.synthesis?.status === 'success' ? 'complete' : 'partial', usage: collectUsage(next.results, next.reviews, next.synthesis) };
      updateRun(finished);
      saveToHistory(finished);
    } finally { busy.current = false; setStage(''); }
  }

  function openHistory(item) {
    setPrompt(item.prompt);
    setSelected(item.selectedModels ?? []);
    updateRun({ ...item, status: item.status ?? 'complete' });
    setHistoryOpen(false);
    setNotice('Loaded a browser-local debate. API keys are not stored in history; add them again to retry operations.');
  }

  async function deleteHistory(id) {
    try { await removeDebate(id); await refreshHistory(); }
    catch (error) { setHistoryError(error.message); }
  }

  async function clearHistory() {
    if (!window.confirm('Clear all debates stored in this browser? This cannot be undone.')) return;
    try { await clearDebates(); await refreshHistory(); }
    catch (error) { setHistoryError(error.message); }
  }

  async function exportAnswer() {
    if (!run) return;
    const blob = new Blob([toMarkdown(run, modelsById)], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `duamind-${new Date(run.createdAt).toISOString().slice(0, 10)}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const usage = run?.usage;
  if (isGuide) return <HowToUse />;
  return <div className="min-h-screen overflow-x-hidden bg-[#070a12] text-slate-100">
    <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-cyan-300 focus:px-4 focus:py-2 focus:text-slate-950">Skip to content</a>
    <SiteHeader onHistory={toggleHistory} historyOpen={historyOpen}/>

    <main id="main-content" className="mx-auto max-w-7xl px-5 pb-20 sm:px-8">
      <section id="top" className="relative grid gap-12 py-16 md:grid-cols-[1.02fr_.98fr] md:items-center md:py-24 lg:gap-16 lg:py-28">
        <div className="hero-halo" aria-hidden="true"/>
        <div className="animate-rise-in">
          <p className="hero-eyebrow"><span className="eyebrow-dot"/> Multi-model comparison, without an account</p>
          <h1 className="hero-title mt-7">One question.<br/><span className="text-gradient">Multiple AI minds.</span><br/>One better answer.</h1>
          <p className="hero-copy mt-6">Compare independent answers from leading AI models, let them challenge one another, and synthesize their strongest insights into one useful response. No account required. Bring your own API keys and pay providers directly for your usage.</p>
          <div className="mt-8 flex flex-wrap items-center gap-3"><a href="#workspace" className="button-primary px-5 py-3.5">Start testing <span aria-hidden="true">↗</span></a><a href="/how-to-use" className="button-secondary px-5 py-3.5">How it works <span aria-hidden="true">→</span></a></div>
          <div className="trust-strip mt-7" aria-label="Product details"><span>No signup</span><span>Bring your own API keys</span><span>Browser-local history</span><span>Usage shown when available</span></div>
        </div>
        <ProductPreview />
      </section>

      {historyOpen && <section id="history" className="scroll-mt-28 mb-8 rounded-2xl border border-slate-800 bg-[#0b1220] p-5 sm:p-6" aria-label="Browser debate history"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="section-kicker">Saved on this device</p><h2 className="mt-1 font-semibold">Your browser history</h2><p className="mt-1 text-xs text-slate-500">Debates are stored locally in this browser. API keys are excluded.</p></div><button type="button" onClick={clearHistory} disabled={!history.length} className="rounded-lg border border-rose-900/70 px-3 py-2 text-xs text-rose-200 disabled:opacity-40">Clear all</button></div>{historyError && <p className="mt-3 text-sm text-rose-200" role="alert">{historyError}</p>}{!historyError && history.length === 0 && <p className="mt-4 text-sm text-slate-400">No local debates saved yet.</p>}<ul className="mt-3 grid gap-2 md:grid-cols-2">{history.map((item) => <li key={item.id} className="flex items-center gap-2 rounded-xl border border-slate-800 p-3"><button type="button" onClick={() => openHistory(item)} className="min-w-0 flex-1 text-left"><span className="block truncate text-sm text-white">{item.prompt}</span><span className="mt-1 block text-xs text-slate-500">{new Date(item.updatedAt).toLocaleString()} · {item.status}</span></button><button type="button" onClick={() => deleteHistory(item.id)} className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:text-rose-300" aria-label="Delete debate">Delete</button></li>)}</ul></section>}

      <section id="features" className="scroll-mt-28 py-16 sm:py-20" aria-labelledby="features-title"><div className="section-heading"><p className="section-kicker">A clearer way to compare</p><h2 id="features-title">See what each model adds—and what it misses.</h2><p>Follow the full debate from independent first responses through critique and synthesis.</p></div><div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[['◎', 'Independent answers', 'Every selected model receives your original prompt before it can see another answer.'], ['↗', 'Peer review', 'Reviewers examine other successful responses for gaps, assumptions, and contradictions.'], ['✳', 'One synthesis', 'A selected model combines the evidence available and makes review coverage visible.'], ['◷', 'Usage you can inspect', 'See provider-reported token usage and latency when available; no price is invented.']].map(([icon, title, body]) => <article key={title} className="feature-card"><span className="feature-icon" aria-hidden="true">{icon}</span><h3 className="mt-4 text-sm font-semibold text-slate-100">{title}</h3><p className="mt-2 text-xs leading-6 text-slate-400">{body}</p></article>)}</div></section>

      <section className="border-y border-slate-800/80 py-12 sm:py-14" aria-labelledby="workflow-title"><div className="flex flex-wrap items-end justify-between gap-5"><div className="section-heading"><p className="section-kicker">How it works</p><h2 id="workflow-title">A transparent four-stage process.</h2></div><a href="/how-to-use" className="footer-link">Explore the step-by-step guide ↗</a></div><ol className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{[['01', 'Ask', 'Set up keys, choose models, and send one prompt.'], ['02', 'Compare', 'Read independent responses side by side.'], ['03', 'Review', 'Models critique other successful responses.'], ['04', 'Synthesize', 'A selected model combines available evidence.']].map(([number, title, body]) => <li className="workflow-step" key={number}><span className="text-xs font-bold tracking-[.15em] text-cyan-300">{number}</span><h3 className="mt-3 text-sm font-semibold text-slate-100">{title}</h3><p className="mt-2 text-xs leading-6 text-slate-400">{body}</p></li>)}</ol></section>

      <section id="models" className="scroll-mt-28 py-16 sm:py-20" aria-labelledby="models-title"><div className="section-heading"><p className="section-kicker">Supported integrations</p><h2 id="models-title">Choose from the models connected today.</h2><p>These are the explicit integrations in this version. Access depends on your provider key, account permissions, and model availability.</p></div>{modelsError && <p className="mt-3 text-xs text-amber-200">Using the built-in registry because the API model list could not be loaded.</p>}<div className="mt-7 grid gap-3 md:grid-cols-3">{models.map((model) => <article key={model.id} className="model-catalog-card"><div className="flex items-start justify-between gap-3"><div><p className="text-[.65rem] font-bold uppercase tracking-[.15em] text-cyan-300">{model.provider === 'gemini' ? 'Google' : model.provider === 'anthropic' ? 'Anthropic' : 'OpenAI'}</p><h3 className="mt-2 text-base font-semibold text-slate-100">{model.name}</h3></div><span className="rounded-full border border-slate-700 px-2 py-1 text-[.62rem] text-slate-400">API key required</span></div><p className="mt-2 break-all font-mono text-xs text-slate-500">{model.id}</p><div className="mt-4 flex flex-wrap gap-1.5">{model.capabilities?.map((capability) => <span key={capability} className="rounded-md bg-slate-800/80 px-2 py-1 text-[.62rem] text-slate-400">{capability === 'text' ? 'Answers' : capability === 'review' ? 'Peer review' : capability === 'synthesis' ? 'Synthesis' : capability}</span>)}</div></article>)}</div><p className="mt-4 text-xs leading-6 text-slate-500">Model registry is explicit and can change as provider models and access rules change. Additional providers are not automatically supported.</p></section>

      <section id="privacy" className="grid scroll-mt-28 gap-4 border-t border-slate-800/80 py-14 md:grid-cols-2" aria-label="Privacy and provider costs"><article className="info-panel"><p className="section-kicker">Private by default</p><h2>Your keys. Your browser history.</h2><p>Keys stay in tab memory and are sent to the server only for the operation you request. Completed debates are saved in this browser; the app does not persist them on its server.</p><a className="mt-5 inline-flex text-xs font-semibold text-cyan-300 hover:text-cyan-200" href="/how-to-use#privacy">Read about keys and local storage ↗</a></article><article className="info-panel info-panel-cost"><p className="section-kicker">Bring your own provider account</p><h2>Know what can incur a charge.</h2><p>Providers may bill your account for model answers, reviews, and synthesis. The workspace estimates call counts and displays usage returned by providers. It does not currently estimate monetary cost.</p><a className="mt-5 inline-flex text-xs font-semibold text-cyan-300 hover:text-cyan-200" href="/how-to-use#faq-title">Read the usage FAQ ↗</a></article></section>

      <section className="scroll-mt-28 rounded-3xl border border-slate-800 bg-[#0b1220] p-5 sm:p-8" id="workspace">
        <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-cyan-300">Debate workspace</p><h2 className="mt-2 text-2xl font-semibold">Set up your run</h2><p className="mt-1 text-sm text-slate-400">Choose models, add session keys, then ask your question.</p></div><button type="button" onClick={() => setMode((value) => value === 'simple' ? 'advanced' : 'simple')} className="rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:border-cyan-400">{mode === 'simple' ? 'Advanced mode' : 'Simple mode'}</button></div>

        <div className="mt-6 grid gap-3 lg:grid-cols-3">{PROVIDERS.map((provider) => <ProviderKeyCard key={provider.id} provider={provider} value={keys[provider.id]} onChange={(value) => { setKeys((current) => ({ ...current, [provider.id]: value })); setKeyTests((current) => ({ ...current, [provider.id]: null })); }} visible={keyVisibility[provider.id]} onToggleVisible={() => setKeyVisibility((current) => ({ ...current, [provider.id]: !current[provider.id] }))} testStatus={keyTests[provider.id]} onTest={() => testProvider(provider.id)} onClear={() => { setKeys((current) => ({ ...current, [provider.id]: '' })); setKeyTests((current) => ({ ...current, [provider.id]: null })); }}/>)}</div>
        <p className="mt-3 text-xs leading-5 text-slate-500">Keys are held in page memory only and cleared when the tab reloads. They are sent to this app’s server only with the model operation you request; use HTTPS for remote deployments. “Test connection” sends a short prompt and may use provider credits.</p>

        <div id="model-selector" className="mt-8"><div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold">Choose models</h3><p className="mt-1 text-xs text-slate-500">Select up to {maxModels}. One model runs without peer review.</p></div><span className="text-xs text-slate-400">{selectedModels.length}/{maxModels} selected · {configuredCount} with keys</span></div>{modelsError && <p className="mt-2 text-xs text-amber-200">{modelsError}</p>}<div className="mt-3 grid gap-3 md:grid-cols-3">{models.map((model) => <label key={model.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${selected.includes(model.id) ? 'border-cyan-500/70 bg-cyan-950/20' : 'border-slate-800 bg-slate-950/40 hover:border-slate-600'}`}><input type="checkbox" checked={selected.includes(model.id)} disabled={!selected.includes(model.id) && selected.length >= maxModels} onChange={() => toggleModel(model.id)} className="mt-1 accent-cyan-300"/><span className="min-w-0"><span className="block text-sm font-medium text-slate-100">{model.name}</span><span className="mt-1 block truncate text-xs text-slate-500">{model.id}</span><span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] ${keyForModel(model, keys) ? 'bg-emerald-950 text-emerald-300' : 'bg-slate-900 text-slate-500'}`}>{keyForModel(model, keys) ? 'Key ready' : 'Needs key'}</span></span></label>)}</div></div>

        {mode === 'advanced' && <div className="mt-6 grid gap-4 rounded-2xl border border-slate-800 bg-slate-950/40 p-4 sm:grid-cols-2"><label className="text-sm text-slate-300">Parallel operations<select value={concurrency} onChange={(event) => setConcurrency(Number(event.target.value))} className="mt-2 block w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white">{Array.from({ length: maxParallelRequests }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value}{value === 1 ? ' · gentler on provider limits' : value === maxParallelRequests ? ' · highest allowed' : ''}</option>)}</select></label><label className="text-sm text-slate-300">Preferred synthesizer<select value={synthesizer} onChange={(event) => setSynthesizer(event.target.value)} className="mt-2 block w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white"><option value="auto">Automatic with fallback</option>{selectedModels.map((model) => <option key={model.id} value={model.id} disabled={!keyForModel(model, keys)}>{model.name}{!keyForModel(model, keys) ? ' · key needed' : ''}</option>)}</select></label></div>}

        <form onSubmit={(event) => { event.preventDefault(); runDebate(); }} className="mt-8 border-t border-slate-800 pt-6"><label htmlFor="prompt" className="text-sm font-medium text-slate-200">Your question</label><textarea id="prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={12000} rows={4} placeholder="Ask a question or compare approaches…" className="mt-2 w-full resize-y rounded-xl border border-slate-700 bg-[#070b14] px-4 py-3 text-sm leading-6 text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-400"/><div className="mt-3 flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs text-slate-400">Estimated calls: <strong className="text-slate-200">{callCount}</strong> ({runnableModels.length} answers + {reviewCallCount} reviews + {synthesisCallCount} synthesis)</p><p className="mt-1 text-xs text-slate-600">Usage and possible charges are billed by providers. No cost estimate is shown without reliable pricing data.</p></div><button type="submit" disabled={busy.current || !prompt.trim() || !selectedModels.length} className="rounded-xl bg-cyan-300 px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-40">{busy.current ? `${stage || 'Running'}…` : run ? 'Run another debate' : 'Run debate'}</button></div>{notice && <p className="mt-4 rounded-xl border border-amber-800/60 bg-amber-950/20 p-3 text-sm text-amber-100" role="alert">{notice}</p>}</form>
      </section>

      {run && <section className="mt-9" aria-live="polite"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs uppercase tracking-wider text-slate-500">Debate run</p><h2 className="mt-1 text-xl font-semibold">{run.prompt}</h2><p className="mt-1 text-xs text-slate-500">{run.status === 'complete' ? 'Finished' : run.status === 'partial' ? 'Partial results' : stage || 'Preparing'}</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => runDebate({ prior: run })} disabled={busy.current || !run.results.some((item) => item.status !== 'success')} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 disabled:opacity-40">Retry failed models</button><button type="button" onClick={exportAnswer} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:border-cyan-400">Export Markdown</button></div></div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">{run.selectedModels.map((id) => modelsById[id]).filter(Boolean).map((model) => <ModelPanel key={model.id} model={model} result={run.results.find((item) => item.modelId === model.id)} onRetry={run.results.find((item) => item.modelId === model.id)?.status !== 'success' ? () => retryModel(model.id) : null}/>)}</div>
        <section className="mt-7" aria-labelledby="review-heading"><div className="flex flex-wrap items-end justify-between gap-3"><div><h3 id="review-heading" className="text-lg font-semibold">Peer review</h3><p className="mt-1 text-sm text-slate-500">Each selected model reviews every other model’s successful answer.</p></div><div className="flex items-center gap-3"><span className="text-xs text-slate-500">{run.reviews.filter((item) => item.status === 'success').length}/{run.reviews.length} reviews complete</span>{run.reviews.some((item) => ['error', 'timeout'].includes(item.status)) && <button type="button" onClick={retryFailedReviews} disabled={busy.current} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 disabled:opacity-40">Retry failed reviews</button>}</div></div>{run.selectedModels.length < 2 && <p className="mt-3 rounded-xl border border-slate-800 bg-slate-950/50 p-4 text-sm text-slate-400">Single-model response: peer review is unavailable because only one model was selected.</p>}<div className="mt-3 grid gap-3">{run.reviews.map((review) => <ReviewCard key={resultKey(review.reviewerModel, review.targetModel)} review={review} modelsById={modelsById}/>)}</div></section>
        <section className="mt-7 rounded-2xl border border-cyan-900/60 bg-gradient-to-br from-[#0e1b2d] to-[#0b1220] p-5 sm:p-7" aria-labelledby="final-heading"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">Final synthesis</p><h3 id="final-heading" className="mt-1 text-xl font-semibold">One answer from the available evidence</h3></div><div className="flex gap-2">{run.synthesis?.status === 'success' && <button type="button" onClick={() => navigator.clipboard.writeText(run.synthesis.text).then(() => setNotice('Copied final answer.')).catch(() => setNotice('Clipboard access is unavailable in this browser.'))} className="rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-200">Copy</button>}{run.synthesis?.status === 'error' && <button type="button" onClick={retrySynthesis} disabled={busy.current} className="rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-200 disabled:opacity-40">Retry synthesis</button>}<button type="button" onClick={exportAnswer} className="rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-200">Export</button></div></div>{!run.synthesis && <p className="mt-4 text-sm text-slate-400">Synthesis will start after available answers and reviews finish.</p>}{run.synthesis?.status === 'success' && <><div className="mt-5 whitespace-pre-wrap break-words text-sm leading-7 text-slate-100">{run.synthesis.text}</div><p className="mt-4 text-xs text-slate-500">Synthesized by {modelsById[run.synthesis.modelId]?.name ?? run.synthesis.model} · {run.synthesis.selectionReason}</p>{run.synthesis.reviewCoverage?.completed < run.synthesis.reviewCoverage?.total && <p className="mt-3 rounded-lg border border-amber-900/70 bg-amber-950/20 p-3 text-xs text-amber-100">Partial synthesis: some peer reviews failed or were unavailable ({run.synthesis.reviewCoverage.completed}/{run.synthesis.reviewCoverage.total} complete).</p>}</>}{run.synthesis?.status === 'error' && <div className="mt-4"><p className="text-sm text-rose-200">{run.synthesis.error.message}</p>{run.synthesis.attempts?.map((attempt) => <p key={attempt.modelId} className="mt-1 text-xs text-slate-500">{modelsById[attempt.modelId]?.name ?? attempt.modelId}: {attempt.error.message}</p>)}</div>}{usage && <p className="mt-4 text-xs text-slate-500">Reported usage: {usage.inputTokens ?? '—'} input tokens, {usage.outputTokens ?? '—'} output tokens. Provider usage data can be incomplete.</p>}<p className="mt-4 text-xs text-slate-500">Model agreement and peer review do not prove factual correctness. Confirm important claims independently.</p></section>
      </section>}

      <section className="guide-cta mt-16 text-center"><p className="section-kicker">Your next question can start here</p><h2>Start with one prompt.<br/><span className="text-gradient">See more than one answer.</span></h2><p>Bring the provider keys you want to use and inspect every stage of the debate.</p><a href="#workspace" className="button-primary mt-7">Start testing <span aria-hidden="true">↗</span></a></section>
    </main>
    <footer className="site-footer"><div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-7 sm:flex-row sm:items-center sm:justify-between lg:px-8"><a href="#top" aria-label="DualMind AI home"><Brand className="footer-brand-logo" /></a><p>No account · Bring your own keys · Provider usage may incur charges</p><a href="/how-to-use" className="footer-link">How to use DualMind AI ↗</a></div></footer>
  </div>;
}

function collectUsage(results, reviews, synthesis) {
  const entries = [...results, ...reviews, ...(synthesis?.usage ? [synthesis] : [])].filter((item) => item.status === 'success' || item.usage);
  if (!entries.length) return null;
  return { inputTokens: entries.reduce((total, item) => total + (item.usage?.inputTokens ?? 0), 0), outputTokens: entries.reduce((total, item) => total + (item.usage?.outputTokens ?? 0), 0) };
}
