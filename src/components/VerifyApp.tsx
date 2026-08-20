"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { statusTone } from "@/lib/compare";
import { DEMO_SAMPLES } from "@/lib/samples";
import { fileToDataUrlResized } from "@/lib/image";
import {
  STANDARD_GOVERNMENT_WARNING,
  type ApplicationFields,
  type MatchStatus,
  type VerificationResult,
} from "@/lib/types";
import BatchVerifyApp from "@/components/BatchVerifyApp";
import {
  clearReviews,
  deleteReview,
  loadSavedReviews,
  saveReview,
  type SavedReview,
} from "@/lib/history";

type Mode = "upload" | "demo";
type AgentDetermination = "accept" | "reject" | "hold" | null;

const emptyApplication = (): ApplicationFields => ({
  brandName: "",
  classType: "",
  alcoholContent: "",
  netContents: "",
  governmentWarning: STANDARD_GOVERNMENT_WARNING,
});

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
    return { title: "Quick review recommended", className: "result-warn" };
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
      detail: "You marked this application as matching the label.",
      className: "result-ok",
    };
  }
  if (d === "reject") {
    return {
      title: "Rejected",
      detail: "You marked this application for rejection / return to applicant.",
      className: "result-bad",
    };
  }
  return {
    title: "Held for review",
    detail: "Parked for a supervisor or second-look review.",
    className: "result-warn",
  };
}

export default function VerifyApp() {
  const [view, setView] = useState<"single" | "batch">("single");
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>("demo");
  const [application, setApplication] =
    useState<ApplicationFields>(emptyApplication);
  const [demoSampleId, setDemoSampleId] = useState(DEMO_SAMPLES[0].id);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [determination, setDetermination] = useState<AgentDetermination>(null);
  const [savedReviews, setSavedReviews] = useState<SavedReview[]>([]);
  const [keepNote, setKeepNote] = useState<string | null>(null);
  const [batchQueue, setBatchQueue] = useState<File[]>([]);
  const [batchIndex, setBatchIndex] = useState(0);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setSavedReviews(loadSavedReviews());
  }, []);

  useEffect(() => {
    const sample = DEMO_SAMPLES.find((s) => s.id === demoSampleId);
    if (sample && mode === "demo") {
      setApplication({ ...sample.application });
      setResult(null);
      setDetermination(null);
      setKeepNote(null);
      setError(null);
    }
  }, [demoSampleId, mode]);

  function updateField<K extends keyof ApplicationFields>(
    key: K,
    value: ApplicationFields[K],
  ) {
    setApplication((prev) => ({ ...prev, [key]: value }));
  }

  async function onFilesSelected(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (list.length === 0) {
      setError("Please choose an image file (PNG, JPG, or WEBP).");
      return;
    }

    setMode("upload");
    setError(null);
    setResult(null);
    setDetermination(null);
    setKeepNote(null);

    if (list.length > 1) {
      setBatchQueue(list);
      setBatchIndex(0);
      const first = list[0];
      setImageName(first.name);
      setImageDataUrl(await fileToDataUrlResized(first));
    } else {
      setBatchQueue([]);
      setBatchIndex(0);
      setImageName(list[0].name);
      setImageDataUrl(await fileToDataUrlResized(list[0]));
    }
  }

  function verify() {
    setError(null);
    setDetermination(null);
    setKeepNote(null);
    startTransition(async () => {
      try {
        const payload =
          mode === "demo"
            ? { application, demoSampleId }
            : { application, imageDataUrl };

        const response = await fetch("/api/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Verification failed.");
        }
        setResult(data as VerificationResult);
      } catch (err) {
        setResult(null);
        setError(err instanceof Error ? err.message : "Verification failed.");
      }
    });
  }

  async function loadNextBatchItem() {
    const next = batchIndex + 1;
    if (next >= batchQueue.length) return;
    const file = batchQueue[next];
    setBatchIndex(next);
    setImageName(file.name);
    setImageDataUrl(await fileToDataUrlResized(file));
    setResult(null);
    setDetermination(null);
    setKeepNote(null);
    setError(null);
  }

  function keepCurrentReview() {
    if (!result || !determination) return;
    const label =
      application.brandName.trim() ||
      imageName ||
      DEMO_SAMPLES.find((s) => s.id === demoSampleId)?.name ||
      "Label review";
    const next = saveReview({
      label,
      determination,
      overall: result.overall,
      application,
      result,
      imageDataUrl: mode === "upload" ? imageDataUrl : null,
      demoSampleId: mode === "demo" ? demoSampleId : undefined,
    });
    setSavedReviews(next);
    setKeepNote("Kept in this browser (local only).");
  }

  function discardCurrentReview() {
    setResult(null);
    setDetermination(null);
    setKeepNote(null);
    setError(null);
  }

  function removeSaved(id: string) {
    setSavedReviews(deleteReview(id));
  }

  function removeAllSaved() {
    setSavedReviews(clearReviews());
  }

  function openSaved(review: SavedReview) {
    setView("single");
    setApplication({ ...review.application });
    setResult(review.result);
    setDetermination(review.determination);
    setKeepNote("Loaded from saved reviews.");
    setError(null);
    if (review.demoSampleId) {
      setMode("demo");
      setDemoSampleId(review.demoSampleId);
      setImageDataUrl(null);
      setImageName(null);
    } else if (review.imageDataUrl) {
      setMode("upload");
      setImageDataUrl(review.imageDataUrl);
      setImageName(review.label);
    }
  }

  const canVerify =
    application.brandName.trim() &&
    application.classType.trim() &&
    application.alcoholContent.trim() &&
    application.netContents.trim() &&
    application.governmentWarning.trim() &&
    (mode === "demo" || Boolean(imageDataUrl));

  if (view === "batch") {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-col px-5 pb-16 pt-10 sm:px-8 sm:pt-14">
        <div className="mb-6 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setView("single")}
          >
            Back to single label
          </button>
        </div>
        <BatchVerifyApp />
      </main>
    );
  }

  const activeDemo = DEMO_SAMPLES.find((s) => s.id === demoSampleId);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col px-5 pb-16 pt-10 sm:px-8 sm:pt-14">
      <header className="animate-rise mb-10 max-w-2xl">
        <p className="mb-3 text-sm font-semibold tracking-[0.14em] text-[var(--brand)] uppercase">
          TTB label assist · prototype
        </p>
        <h1
          className="font-[family-name:var(--font-fraunces)] text-5xl leading-[1.05] font-bold tracking-tight text-[var(--ink)] sm:text-6xl"
          style={{ fontFamily: "var(--font-fraunces), Georgia, serif" }}
        >
          ProofCheck
        </h1>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-[var(--ink-soft)] sm:text-xl">
          Check that the label matches the application — brand, ABV, net
          contents, and government warning — in about 5 seconds.
        </p>
      </header>

      <div className="grid items-start gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="animate-rise-delay space-y-6">
          <div>
            <p className="mb-2 text-sm font-semibold text-[var(--ink)]">
              1. Choose how to start
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-secondary"
                data-active={mode === "demo"}
                onClick={() => {
                setMode("demo");
                setImageDataUrl(null);
                setImageName(null);
                setBatchQueue([]);
                setResult(null);
                setDetermination(null);
                setKeepNote(null);
                setError(null);
                }}
                style={
                  mode === "demo"
                    ? { borderColor: "var(--brand)", background: "#fff" }
                    : undefined
                }
              >
                Try a demo sample
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setMode("upload");
                  fileInputRef.current?.click();
                }}
                style={
                  mode === "upload"
                    ? { borderColor: "var(--brand)", background: "#fff" }
                    : undefined
                }
              >
                Upload label image
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setView("batch")}
              >
                Batch (CSV + images)
              </button>
            </div>
          </div>

          {mode === "demo" ? (
            <div className="space-y-4">
              <div>
                <label
                  htmlFor={`${inputId}-sample`}
                  className="mb-2 block text-sm font-semibold text-[var(--ink)]"
                >
                  Demo sample
                </label>
                <select
                  id={`${inputId}-sample`}
                  className="field-input"
                  value={demoSampleId}
                  onChange={(e) => setDemoSampleId(e.target.value)}
                >
                  {DEMO_SAMPLES.map((sample) => (
                    <option key={sample.id} value={sample.id}>
                      {sample.name}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-sm leading-relaxed text-[var(--ink-soft)]">
                  {activeDemo?.description}
                </p>
              </div>
              {activeDemo?.imagePath ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={activeDemo.imagePath}
                  alt={`${activeDemo.name} sample alcohol label`}
                  className="max-h-72 w-full rounded-xl border border-[var(--line)] bg-white object-contain p-2"
                />
              ) : null}
            </div>
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
                multiple
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
                  Drop label image(s) here
                </span>
                <span className="text-[var(--ink-soft)]">
                  Or click to choose. Multiple files run as a simple batch queue.
                </span>
                {imageName ? (
                  <span className="mt-2 font-medium text-[var(--brand)]">
                    Selected: {imageName}
                    {batchQueue.length > 1
                      ? ` (${batchIndex + 1} of ${batchQueue.length})`
                      : ""}
                  </span>
                ) : null}
              </label>
              {imageDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageDataUrl}
                  alt="Uploaded alcohol label"
                  className="mt-4 max-h-64 w-full rounded-xl object-contain bg-white"
                />
              ) : null}
            </div>
          )}

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (canVerify && !isPending) verify();
            }}
          >
            <p className="text-sm font-semibold text-[var(--ink)]">
              2. Confirm application fields
            </p>
            <Field
              id={`${inputId}-brand`}
              label="Brand name"
              value={application.brandName}
              onChange={(v) => updateField("brandName", v)}
            />
            <Field
              id={`${inputId}-class`}
              label="Class / type"
              value={application.classType}
              onChange={(v) => updateField("classType", v)}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id={`${inputId}-abv`}
                label="Alcohol content"
                value={application.alcoholContent}
                onChange={(v) => updateField("alcoholContent", v)}
                placeholder="45% Alc./Vol. (90 Proof)"
              />
              <Field
                id={`${inputId}-net`}
                label="Net contents"
                value={application.netContents}
                onChange={(v) => updateField("netContents", v)}
                placeholder="750 mL"
              />
            </div>
            <div>
              <label
                htmlFor={`${inputId}-warning`}
                className="mb-2 block text-sm font-semibold"
              >
                Government warning (application)
              </label>
              <textarea
                id={`${inputId}-warning`}
                className="field-input min-h-32 resize-y"
                value={application.governmentWarning}
                onChange={(e) =>
                  updateField("governmentWarning", e.target.value)
                }
              />
            </div>

            <div className="pt-1">
              <p className="mb-3 text-sm font-semibold text-[var(--ink)]">
                3. Run the check
              </p>
              <button
                type="submit"
                className="btn-primary w-full sm:w-auto sm:min-w-56"
                disabled={!canVerify || isPending}
              >
                {isPending ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="working-dot">●</span> Checking label…
                  </span>
                ) : (
                  "Verify label"
                )}
              </button>
            </div>
          </form>
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
            <p className="mt-2 text-[var(--ink-soft)]">
              System recommendation first — then record your determination.
            </p>

            {error ? (
              <div className="result-bad mt-5 rounded-xl border px-4 py-3 text-[0.95rem] leading-relaxed">
                {error}
              </div>
            ) : null}

            {!result && !error ? (
              <div className="mt-8 space-y-4">
                <p className="text-[var(--ink-soft)]">
                  Choose a demo sample or upload a label, then press{" "}
                  <strong className="text-[var(--ink)]">Verify label</strong>.
                </p>
                {savedReviews.length > 0 ? (
                  <div className="rounded-xl border border-[var(--line)] bg-white/70 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[var(--ink)]">
                        Saved in this browser ({savedReviews.length})
                      </p>
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ padding: "0.4rem 0.7rem", fontSize: "0.85rem" }}
                        onClick={removeAllSaved}
                      >
                        Delete all
                      </button>
                    </div>
                    <ul className="mt-3 space-y-2">
                      {savedReviews.map((review) => (
                        <li
                          key={review.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--line)] bg-white/80 px-3 py-2 text-sm"
                        >
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-left"
                            onClick={() => openSaved(review)}
                          >
                            <span className="font-semibold text-[var(--ink)]">
                              {review.label}
                            </span>
                            <span className="mt-0.5 block text-[var(--ink-soft)]">
                              {review.determination} · {review.overall} ·{" "}
                              {new Date(review.savedAt).toLocaleString()}
                            </span>
                          </button>
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ padding: "0.35rem 0.65rem", fontSize: "0.8rem" }}
                            onClick={() => removeSaved(review.id)}
                          >
                            Delete
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}

            {result ? (
              <div className="mt-5 space-y-4">
                <div
                  className={`rounded-xl border px-4 py-3 ${overallCopy(result.overall).className}`}
                >
                  <p className="text-xs font-semibold tracking-wide uppercase opacity-80">
                    System check
                  </p>
                  <p className="text-lg font-bold">
                    {overallCopy(result.overall).title}
                  </p>
                  <p className="mt-1 text-[0.95rem] leading-relaxed">
                    {result.summary}
                  </p>
                  <p className="mt-2 text-sm opacity-80">
                    {result.elapsedMs} ms ·{" "}
                    {result.mode === "demo" ? "demo mode" : "live vision"}
                  </p>
                </div>

                <div className="rounded-xl border border-[var(--line)] bg-white/70 px-4 py-3">
                  <p className="text-sm font-semibold text-[var(--ink)]">
                    Agent determination
                  </p>
                  <p className="mt-1 text-sm text-[var(--ink-soft)]">
                    Prototype only — not sent to COLA. Choose how you would
                    handle this application.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-primary"
                      style={{ padding: "0.65rem 1rem", fontSize: "1rem" }}
                      onClick={() => setDetermination("accept")}
                      aria-pressed={determination === "accept"}
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setDetermination("reject")}
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
                      onClick={() => setDetermination("hold")}
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
                      Hold for review
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
                        {determinationCopy(determination).detail}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn-primary"
                          style={{ padding: "0.55rem 0.9rem", fontSize: "0.95rem" }}
                          onClick={keepCurrentReview}
                        >
                          Keep in app
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={discardCurrentReview}
                        >
                          Discard
                        </button>
                      </div>
                      {keepNote ? (
                        <p className="mt-2 text-sm opacity-90">{keepNote}</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {savedReviews.length > 0 ? (
                  <div className="rounded-xl border border-[var(--line)] bg-white/70 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[var(--ink)]">
                        Saved in this browser ({savedReviews.length})
                      </p>
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ padding: "0.4rem 0.7rem", fontSize: "0.85rem" }}
                        onClick={removeAllSaved}
                      >
                        Delete all
                      </button>
                    </div>
                    <ul className="mt-3 space-y-2">
                      {savedReviews.map((review) => (
                        <li
                          key={review.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--line)] bg-white/80 px-3 py-2 text-sm"
                        >
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-left"
                            onClick={() => openSaved(review)}
                          >
                            <span className="font-semibold text-[var(--ink)]">
                              {review.label}
                            </span>
                            <span className="mt-0.5 block text-[var(--ink-soft)]">
                              {review.determination} · {review.overall} ·{" "}
                              {new Date(review.savedAt).toLocaleString()}
                            </span>
                          </button>
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ padding: "0.35rem 0.65rem", fontSize: "0.8rem" }}
                            onClick={() => removeSaved(review.id)}
                          >
                            Delete
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

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
                          <pre
                            className="mt-3 whitespace-pre-wrap rounded-xl border border-[var(--line)] bg-white/40 p-3 text-[0.88rem] leading-relaxed opacity-95 overflow-auto"
                          >
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

                {batchQueue.length > 1 && batchIndex < batchQueue.length - 1 ? (
                  <button
                    type="button"
                    className="btn-secondary w-full"
                    onClick={() => void loadNextBatchItem()}
                  >
                    Next label in batch ({batchIndex + 2} of {batchQueue.length})
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </main>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-semibold">
        {label}
      </label>
      <input
        id={id}
        className="field-input"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
      />
    </div>
  );
}
