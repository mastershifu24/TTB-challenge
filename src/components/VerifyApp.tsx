"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { statusTone } from "@/lib/compare";
import { DEMO_SAMPLES, type DemoSample } from "@/lib/samples";
import { fileToDataUrlResized } from "@/lib/image";
import {
  type ApplicationFields,
  type MatchStatus,
  type VerificationResult,
} from "@/lib/types";
import BatchVerifyApp from "@/components/BatchVerifyApp";
import {
  loadSavedReviews,
  saveReview,
  type SavedReview,
} from "@/lib/history";

type Mode = "demo" | "upload";
type AgentDetermination = "accept" | "reject" | "hold" | null;

function pickRandomSample(excludeId?: string): DemoSample {
  const pool =
    DEMO_SAMPLES.length > 1 && excludeId
      ? DEMO_SAMPLES.filter((s) => s.id !== excludeId)
      : DEMO_SAMPLES;
  return pool[Math.floor(Math.random() * pool.length)]!;
}

function statusLabel(status: MatchStatus): string {
  switch (status) {
    case "match":
      return "Match";
    case "soft_match":
      return "Needs judgment";
    case "mismatch":
      return "Mismatch";
    case "missing":
      return "Not found";
  }
}

function overallCopy(overall: VerificationResult["overall"]): {
  title: string;
  className: string;
} {
  if (overall === "pass") {
    return { title: "Looks good", className: "result-ok" };
  }
  if (overall === "review") {
    return { title: "Needs your judgment", className: "result-warn" };
  }
  return { title: "Issues found", className: "result-bad" };
}

function determinationCopy(d: Exclude<AgentDetermination, null>): {
  title: string;
  detail: string;
  className: string;
} {
  if (d === "accept") {
    return {
      title: "Accepted",
      detail: "You accepted this application.",
      className: "result-ok",
    };
  }
  if (d === "reject") {
    return {
      title: "Rejected",
      detail: "You rejected this application.",
      className: "result-bad",
    };
  }
  return {
    title: "Held",
    detail: "Held for a second look.",
    className: "result-warn",
  };
}

export default function VerifyApp() {
  const [view, setView] = useState<"single" | "batch">("single");
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>("demo");
  const [sample, setSample] = useState<DemoSample>(DEMO_SAMPLES[0]!);
  const [application, setApplication] = useState<ApplicationFields>(
    () => ({ ...DEMO_SAMPLES[0]!.application }),
  );
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [determination, setDetermination] = useState<AgentDetermination>(null);
  const [savedReviews, setSavedReviews] = useState<SavedReview[]>([]);
  const [showMore, setShowMore] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Sync application from sample on first client paint (avoid SSR/client random mismatch).
  useEffect(() => {
    const first = pickRandomSample();
    setSample(first);
    setApplication({ ...first.application });
    setSavedReviews(loadSavedReviews());
  }, []);

  function loadRandomCase() {
    const next = pickRandomSample(sample.id);
    setMode("demo");
    setSample(next);
    setApplication({ ...next.application });
    setImageDataUrl(null);
    setImageName(null);
    setResult(null);
    setDetermination(null);
    setError(null);
  }

  async function onFilesSelected(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (list.length === 0) {
      setError("Please choose a picture of a label (PNG, JPG, or WEBP).");
      return;
    }

    setMode("upload");
    setError(null);
    setResult(null);
    setDetermination(null);
    setImageName(list[0].name);
    setImageDataUrl(await fileToDataUrlResized(list[0]));
  }

  function verify() {
    setError(null);
    setDetermination(null);
    startTransition(async () => {
      try {
        const payload =
          mode === "demo"
            ? { application, demoSampleId: sample.id }
            : { application, imageDataUrl };

        const response = await fetch("/api/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Something went wrong. Please try again.");
        }
        setResult(data as VerificationResult);
      } catch (err) {
        setResult(null);
        setError(
          err instanceof Error
            ? err.message
            : "Something went wrong. Please try again.",
        );
      }
    });
  }

  function recordDetermination(value: Exclude<AgentDetermination, null>) {
    if (!result) return;
    setDetermination(value);
    const next = saveReview({
      label: application.brandName || sample.name,
      determination: value,
      overall: result.overall,
      application,
      result,
      imageDataUrl: mode === "upload" ? imageDataUrl : null,
      demoSampleId: mode === "demo" ? sample.id : undefined,
    });
    setSavedReviews(next);
  }

  const canVerify =
    Boolean(application.brandName.trim()) &&
    (mode === "demo" || Boolean(imageDataUrl));

  if (view === "batch") {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-col px-5 pb-16 pt-10 sm:px-8 sm:pt-14">
        <button
          type="button"
          className="btn-secondary mb-6 self-start"
          onClick={() => setView("single")}
        >
          ← Back
        </button>
        <BatchVerifyApp />
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col px-5 pb-16 pt-10 sm:px-8 sm:pt-14">
      <header className="animate-rise mb-8 max-w-2xl">
        <p className="mb-3 text-sm font-semibold tracking-[0.14em] text-[var(--brand)] uppercase">
          TTB label assist · prototype
        </p>
        <h1
          className="text-5xl leading-[1.05] font-bold tracking-tight text-[var(--ink)] sm:text-6xl"
          style={{ fontFamily: "var(--font-fraunces), Georgia, serif" }}
        >
          ProofCheck
        </h1>
        <p className="mt-4 max-w-xl text-xl leading-relaxed text-[var(--ink-soft)]">
          Look at the label. Read the application. Press Check. Then Accept,
          Reject, or Hold.
        </p>
      </header>

      <div className="grid items-start gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="animate-rise-delay space-y-6">
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="btn-primary"
              onClick={loadRandomCase}
            >
              Next random case
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!canVerify || isPending}
              onClick={verify}
            >
              {isPending ? (
                <span className="inline-flex items-center gap-2">
                  <span className="working-dot">●</span> Checking…
                </span>
              ) : (
                "Check label"
              )}
            </button>
          </div>

          <div className="space-y-3">
            <p className="text-lg font-semibold text-[var(--ink)]">Label</p>
            {mode === "demo" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={sample.imagePath}
                alt="Alcohol label for this case"
                className="max-h-80 w-full rounded-xl border border-[var(--line)] bg-white object-contain p-2"
              />
            ) : (
              <div
                className="dropzone rounded-2xl p-6"
                data-active={dragActive}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragOver={(e) => e.preventDefault()}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  void onFilesSelected(e.dataTransfer.files);
                }}
              >
                <input
                  ref={fileInputRef}
                  id={`${inputId}-file`}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => {
                    if (e.target.files) void onFilesSelected(e.target.files);
                  }}
                />
                <label
                  htmlFor={`${inputId}-file`}
                  className="flex cursor-pointer flex-col gap-2"
                >
                  <span className="text-lg font-semibold text-[var(--ink)]">
                    Drop a label picture here
                  </span>
                  <span className="text-[var(--ink-soft)]">
                    Or click to choose one. Application fields stay locked.
                  </span>
                  {imageName ? (
                    <span className="mt-2 font-medium text-[var(--brand)]">
                      Selected: {imageName}
                    </span>
                  ) : null}
                </label>
                {imageDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageDataUrl}
                    alt="Uploaded alcohol label"
                    className="mt-4 max-h-64 w-full rounded-xl bg-white object-contain"
                  />
                ) : null}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-lg font-semibold text-[var(--ink)]">
                Application (locked)
              </p>
              <p className="text-sm text-[var(--ink-soft)]">
                Reviewers cannot edit these fields
              </p>
            </div>
            <LockedField label="Brand name" value={application.brandName} />
            <LockedField label="Class / type" value={application.classType} />
            <div className="grid gap-3 sm:grid-cols-2">
              <LockedField
                label="Alcohol content"
                value={application.alcoholContent}
              />
              <LockedField
                label="Net contents"
                value={application.netContents}
              />
            </div>
            <LockedField
              label="Government warning"
              value={application.governmentWarning}
              multiline
            />
          </div>

          <div>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowMore((v) => !v)}
              aria-expanded={showMore}
            >
              {showMore ? "Hide extra options" : "Extra options"}
            </button>
            {showMore ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setMode("upload");
                    setResult(null);
                    setDetermination(null);
                    setError(null);
                    fileInputRef.current?.click();
                  }}
                >
                  Upload my own label picture
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setView("batch")}
                >
                  Check many at once (CSV)
                </button>
                {mode === "upload" ? (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={loadRandomCase}
                  >
                    Back to practice cases
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>

        <aside className="animate-rise-delay-2 lg:sticky lg:top-8">
          <div
            className="rounded-2xl border border-[var(--line)] bg-white/80 p-6 shadow-[var(--shadow)] backdrop-blur-sm"
            aria-live="polite"
          >
            <h2
              className="text-2xl font-bold tracking-tight"
              style={{ fontFamily: "var(--font-fraunces), Georgia, serif" }}
            >
              Results
            </h2>
            <p className="mt-2 text-lg text-[var(--ink-soft)]">
              See the system check, then make your decision.
            </p>

            {error ? (
              <div className="result-bad mt-5 rounded-xl border px-4 py-3 text-[0.95rem] leading-relaxed">
                {error}
              </div>
            ) : null}

            {!result && !error ? (
              <p className="mt-8 text-lg text-[var(--ink-soft)]">
                Press <strong className="text-[var(--ink)]">Check label</strong>{" "}
                when you are ready.
              </p>
            ) : null}

            {result ? (
              <div className="mt-5 space-y-4">
                <div
                  className={`rounded-xl border px-4 py-3 ${overallCopy(result.overall).className}`}
                >
                  <p className="text-xs font-semibold tracking-wide uppercase opacity-80">
                    System check
                  </p>
                  <p className="text-xl font-bold">
                    {overallCopy(result.overall).title}
                  </p>
                  <p className="mt-1 text-[0.95rem] leading-relaxed">
                    {result.summary}
                  </p>
                  <p className="mt-2 text-sm opacity-80">
                    {result.elapsedMs} ms
                  </p>
                </div>

                <div className="rounded-xl border border-[var(--line)] bg-white/70 px-4 py-4">
                  <p className="text-lg font-semibold text-[var(--ink)]">
                    Your decision
                  </p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => recordDetermination("accept")}
                      aria-pressed={determination === "accept"}
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => recordDetermination("reject")}
                      aria-pressed={determination === "reject"}
                      style={
                        determination === "reject"
                          ? { borderColor: "var(--bad)", color: "var(--bad)" }
                          : undefined
                      }
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => recordDetermination("hold")}
                      aria-pressed={determination === "hold"}
                      style={
                        determination === "hold"
                          ? {
                              borderColor: "var(--warn)",
                              color: "var(--warn)",
                            }
                          : undefined
                      }
                    >
                      Hold
                    </button>
                  </div>
                  {determination ? (
                    <div
                      className={`mt-3 rounded-lg border px-3 py-2 text-sm ${determinationCopy(determination).className}`}
                      role="status"
                    >
                      <p className="font-bold">
                        {determinationCopy(determination).title}
                      </p>
                      <p className="mt-0.5 opacity-90">
                        {determinationCopy(determination).detail} Saved on this
                        computer.
                      </p>
                      <button
                        type="button"
                        className="btn-primary mt-3"
                        onClick={loadRandomCase}
                      >
                        Next random case
                      </button>
                    </div>
                  ) : null}
                </div>

                <ul className="space-y-3">
                  {result.comparisons.map((row) => {
                    const tone = statusTone(row.status);
                    const toneClass =
                      tone === "ok"
                        ? "result-ok"
                        : tone === "warn"
                          ? "result-warn"
                          : "result-bad";
                    return (
                      <li
                        key={row.field}
                        className={`rounded-xl border px-4 py-3 ${toneClass}`}
                      >
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="font-bold">{row.label}</p>
                          <p className="text-sm font-semibold tracking-wide uppercase">
                            {statusLabel(row.status)}
                          </p>
                        </div>
                        <p className="mt-1 text-sm leading-relaxed opacity-90">
                          {row.message}
                        </p>
                        {row.diffText ? (
                          <pre className="mt-3 overflow-auto whitespace-pre-wrap rounded-xl border border-[var(--line)] bg-white/40 p-3 text-[0.88rem] leading-relaxed opacity-95">
                            {row.diffText}
                          </pre>
                        ) : null}
                        <dl className="mt-3 grid gap-2 text-sm">
                          <div>
                            <dt className="font-semibold opacity-80">
                              Application
                            </dt>
                            <dd className="mt-0.5 break-words opacity-95">
                              {row.applicationValue}
                            </dd>
                          </div>
                          <div>
                            <dt className="font-semibold opacity-80">
                              On label
                            </dt>
                            <dd className="mt-0.5 break-words opacity-95">
                              {row.extractedValue ?? "—"}
                            </dd>
                          </div>
                        </dl>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            {savedReviews.length > 0 ? (
              <div className="mt-6 rounded-xl border border-[var(--line)] bg-white/70 px-4 py-3">
                <p className="text-sm font-semibold text-[var(--ink)]">
                  Recent decisions ({savedReviews.length})
                </p>
                <p className="mt-1 text-sm text-[var(--ink-soft)]">
                  Stored on this computer only. Cannot be deleted here.
                </p>
                <ul className="mt-3 max-h-48 space-y-2 overflow-auto">
                  {savedReviews.slice(0, 12).map((review) => (
                    <li
                      key={review.id}
                      className="rounded-lg border border-[var(--line)] bg-white/80 px-3 py-2 text-sm"
                    >
                      <span className="font-semibold text-[var(--ink)]">
                        {review.label}
                      </span>
                      <span className="mt-0.5 block text-[var(--ink-soft)]">
                        {review.determination} · {review.overall} ·{" "}
                        {new Date(review.savedAt).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </main>
  );
}

function LockedField({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-[var(--ink)]">{label}</p>
      <div
        className={`field-input bg-[var(--paper-2)] text-[var(--ink)] ${
          multiline ? "min-h-28 whitespace-pre-wrap" : ""
        }`}
        aria-readonly="true"
      >
        {value || "—"}
      </div>
    </div>
  );
}
