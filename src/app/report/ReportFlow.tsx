'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, HeartHandshake, Loader2, ShieldCheck, Sparkles, Users } from 'lucide-react';
import { analyzeAction, submitAction } from '@/app/actions/report';
import type { Analysis, SubmitResult } from '@/core/intake';
import { CRISIS_SUPPORT_MESSAGE } from '@/core/sensitive';
import { ErrorText, issueCode } from '@/components/ui';

export type TaxonomyOptions = {
  categories: Array<{
    slug: string;
    name: string;
    requiresLocation: boolean;
    isSensitive: boolean;
    subcategories: Array<{ slug: string; name: string }>;
  }>;
  locations: Array<{ slug: string; name: string }>;
  otherLocationSlug: string;
};

const MIN = 10;
const MAX = 2000;

type Step = { kind: 'write' } | { kind: 'review'; analysis: Analysis } | { kind: 'done'; result: SubmitResult };

export function ReportFlow({ options }: { options: TaxonomyOptions }) {
  const [text, setText] = useState('');
  const [step, setStep] = useState<Step>({ kind: 'write' });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const analyze = () => {
    setError(null);
    startTransition(async () => {
      const res = await analyzeAction(text);
      if (res.ok) setStep({ kind: 'review', analysis: res.data });
      else setError(res.error);
    });
  };

  if (step.kind === 'done') {
    return (
      <Done
        result={step.result}
        onAgain={() => {
          setText('');
          setStep({ kind: 'write' });
        }}
      />
    );
  }

  if (step.kind === 'review') {
    return (
      <Review
        key={step.analysis.draftId}
        analysis={step.analysis}
        text={text}
        options={options}
        onBack={() => setStep({ kind: 'write' })}
        onDone={(result) => setStep({ kind: 'done', result })}
        onExpired={analyze}
      />
    );
  }

  const tooShort = text.trim().length < MIN;
  return (
    <form
      className="card p-5 sm:p-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (!tooShort) analyze();
      }}
    >
      <label htmlFor="report-text" className="label">
        What&apos;s wrong?
      </label>
      <textarea
        id="report-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        maxLength={MAX}
        required
        autoFocus
        placeholder="e.g. The Wi-Fi on the 2nd floor of Hostel B has been down since yesterday evening. Can't submit my assignment."
        className="input text-base leading-relaxed"
      />
      <div className="mt-1 flex justify-between text-xs text-slate-500">
        <span>Say what, where, and since when. Any language is fine.</span>
        <span className="tabular-nums">
          {text.length}/{MAX}
        </span>
      </div>
      <div className="mt-4">
        <ErrorText>{error}</ErrorText>
      </div>
      <div className="mt-4 flex items-center justify-end gap-3">
        <button type="submit" disabled={tooShort || pending} className="btn-primary">
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
          {pending ? 'Reading your report…' : 'Continue'}
        </button>
      </div>
    </form>
  );
}

function Review({
  analysis,
  text,
  options,
  onBack,
  onDone,
  onExpired,
}: {
  analysis: Analysis;
  text: string;
  options: TaxonomyOptions;
  onBack: () => void;
  onDone: (r: SubmitResult) => void;
  onExpired: () => void;
}) {
  const sensitiveCategory = options.categories.find((c) => c.isSensitive);
  const [categorySlug, setCategorySlug] = useState(analysis.categorySlug ?? '');
  const [subcategorySlug, setSubcategorySlug] = useState(analysis.subcategorySlug ?? '');
  const [locationSlug, setLocationSlug] = useState(analysis.locationSlug ?? '');
  const [locationDetail, setLocationDetail] = useState(analysis.locationDetail ?? '');
  const [isAnonymous, setAnonymous] = useState(false);
  const [isConfidential, setConfidential] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const category = options.categories.find((c) => c.slug === categorySlug);
  const sensitive = analysis.isSensitive || !!category?.isSensitive;
  const needsLocation = !!category?.requiresLocation && !sensitive;
  const needsDetail = locationSlug === options.otherLocationSlug;
  const canSubmit = !!category && (!needsLocation || !!locationSlug) && (!needsDetail || locationDetail.trim().length > 0);

  const pickable = useMemo(
    () => (analysis.isSensitive ? options.categories.filter((c) => c.isSensitive) : options.categories),
    [analysis.isSensitive, options.categories],
  );

  const send = (choice: { kind: 'new' } | { kind: 'join'; issueId: string }) => {
    setError(null);
    startTransition(async () => {
      const res = await submitAction({
        draftId: analysis.draftId,
        choice,
        categorySlug: categorySlug || null,
        subcategorySlug: subcategorySlug || null,
        locationSlug: locationSlug || null,
        locationDetail: locationDetail.trim() || null,
        isAnonymous,
        isConfidential: isConfidential || sensitive,
      });
      if (res.ok) onDone(res.data);
      else if (/took a while/.test(res.error)) onExpired();
      else setError(res.error);
    });
  };

  return (
    <div className="space-y-5">
      <div className="card flex items-start gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Your report</p>
          <p className="mt-1 text-sm whitespace-pre-wrap text-slate-800">{text}</p>
        </div>
        <button type="button" onClick={onBack} className="btn-ghost btn-sm shrink-0">
          <ArrowLeft className="size-3.5" aria-hidden /> Edit
        </button>
      </div>

      {analysis.crisis && (
        <div role="alert" className="flex gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          <HeartHandshake className="size-5 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">You don&apos;t have to deal with this alone.</p>
            <p className="mt-1">{CRISIS_SUPPORT_MESSAGE}</p>
          </div>
        </div>
      )}

      {sensitive && (
        <div className="flex gap-3 rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950">
          <ShieldCheck className="size-5 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">This will be handled confidentially.</p>
            <p className="mt-1">
              Only the {sensitiveCategory?.name ?? 'Grievance Committee'} will see it. It will not appear on the campus board or be shown to other
              students.
              {analysis.isSensitive && !category?.isSensitive && ' If it turns out not to be for them, they will pass it to the right team.'}
            </p>
          </div>
        </div>
      )}

      {!sensitive && analysis.candidates.length > 0 && (
        <section className="card p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <Users className="size-5 text-brand-600" aria-hidden /> Already reported?
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Adding yourself to an existing issue counts as another report and raises its priority. You&apos;ll be emailed when it&apos;s fixed.
          </p>
          <ul className="mt-4 space-y-3">
            {analysis.candidates.map((c) => (
              <li
                key={c.issueId}
                className={`rounded-lg border p-3 ${c.strength === 'strong' ? 'border-brand-200 bg-brand-50' : 'border-slate-200'}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">
                      <span className="text-slate-500">{issueCode(c.number)}</span> {c.title}
                    </p>
                    <p className="mt-0.5 text-sm text-slate-600">{c.summary}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {c.locationName && `${c.locationName} · `}
                      {c.reporterCount} student{c.reporterCount === 1 ? '' : 's'} reported · {c.status === 'in_progress' ? 'being worked on' : 'open'}
                    </p>
                  </div>
                  {c.alreadyReported ? (
                    <span className="text-sm font-medium text-emerald-700">You reported this</span>
                  ) : (
                    <button type="button" disabled={pending} onClick={() => send({ kind: 'join', issueId: c.issueId })} className="btn-primary btn-sm">
                      Yes, same problem
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card p-5">
        <h2 className="font-semibold">{analysis.candidates.length > 0 && !sensitive ? 'Or report it as a new problem' : 'Check the details'}</h2>
        {!analysis.aiAvailable && (
          <p className="mt-2 flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <AlertTriangle className="size-4 shrink-0" aria-hidden /> Our assistant is unavailable right now, so please pick the category yourself.
          </p>
        )}
        {analysis.aiAvailable && !sensitive && (
          <p className="mt-1 text-sm text-slate-600">We filled these in from your message. Change anything that&apos;s wrong.</p>
        )}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="category" className="label">
              Kind of problem
            </label>
            <select
              id="category"
              className="input"
              value={categorySlug}
              disabled={analysis.isSensitive}
              onChange={(e) => {
                setCategorySlug(e.target.value);
                setSubcategorySlug('');
              }}
            >
              <option value="">Choose…</option>
              {pickable.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {category && category.subcategories.length > 0 && (
            <div>
              <label htmlFor="subcategory" className="label">
                More specifically <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <select id="subcategory" className="input" value={subcategorySlug} onChange={(e) => setSubcategorySlug(e.target.value)}>
                <option value="">—</option>
                {category.subcategories.map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!sensitive && (
            <>
              <div>
                <label htmlFor="location" className="label">
                  Where {needsLocation ? '' : <span className="font-normal text-slate-400">(optional)</span>}
                </label>
                <select
                  id="location"
                  className={`input ${needsLocation && !locationSlug ? 'border-amber-400 ring-2 ring-amber-100' : ''}`}
                  value={locationSlug}
                  onChange={(e) => setLocationSlug(e.target.value)}
                >
                  <option value="">{needsLocation ? 'Choose a place…' : 'Not about a place'}</option>
                  {options.locations.map((l) => (
                    <option key={l.slug} value={l.slug}>
                      {l.name}
                    </option>
                  ))}
                </select>
                {needsLocation && !locationSlug && analysis.followUpQuestion && <p className="hint text-amber-800">{analysis.followUpQuestion}</p>}
              </div>
              <div>
                <label htmlFor="location-detail" className="label">
                  Room / floor {needsDetail ? '' : <span className="font-normal text-slate-400">(optional)</span>}
                </label>
                <input
                  id="location-detail"
                  className="input"
                  value={locationDetail}
                  maxLength={120}
                  onChange={(e) => setLocationDetail(e.target.value)}
                  placeholder={needsDetail ? 'Describe where it is' : 'e.g. Room 214, 2nd floor'}
                />
              </div>
            </>
          )}
        </div>

        <fieldset className="mt-5 space-y-2 border-t border-slate-100 pt-4">
          <legend className="sr-only">Privacy</legend>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 accent-brand-700" checked={isAnonymous} onChange={(e) => setAnonymous(e.target.checked)} />
            <span>
              <span className="font-medium">Hide my name from staff</span>
              <span className="block text-slate-500">You&apos;ll still get updates by email.</span>
            </span>
          </label>
          {!sensitive && (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-brand-700"
                checked={isConfidential}
                onChange={(e) => setConfidential(e.target.checked)}
              />
              <span>
                <span className="font-medium">Keep this off the campus board</span>
                <span className="block text-slate-500">Only the responsible team will see it.</span>
              </span>
            </label>
          )}
        </fieldset>

        <div className="mt-4">
          <ErrorText>{error}</ErrorText>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
          <button type="button" onClick={onBack} className="btn-ghost">
            Back
          </button>
          <button type="button" disabled={!canSubmit || pending} onClick={() => send({ kind: 'new' })} className="btn-primary">
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {sensitive ? 'Send confidentially' : 'Submit report'}
          </button>
        </div>
      </section>
    </div>
  );
}

function Done({ result, onAgain }: { result: SubmitResult; onAgain: () => void }) {
  return (
    <div className="card p-6 text-center sm:p-8">
      <CheckCircle2 className="mx-auto size-12 text-emerald-600" aria-hidden />
      <h2 className="mt-3 text-xl font-semibold">{result.joined ? 'Added to the existing issue' : 'Report sent'}</h2>
      <p className="mt-2 text-slate-600">
        {result.joined
          ? 'Your report has been counted on the existing issue. More reports mean higher priority.'
          : result.isSensitive
            ? 'Your report was sent confidentially to the Grievance & Anti-Ragging Committee.'
            : 'It has been sent to the team responsible. They have a deadline based on how urgent it is.'}
      </p>
      <p className="mt-4 text-sm text-slate-500">
        Reference <span className="font-semibold text-slate-800">{issueCode(result.issueNumber)}</span>. We&apos;ll email you when the status changes.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href={`/issues/${result.issueNumber}`} className="btn-primary">
          Track this issue
        </Link>
        <button type="button" onClick={onAgain} className="btn-secondary">
          Report something else
        </button>
      </div>
    </div>
  );
}
