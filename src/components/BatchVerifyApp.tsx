"use client";

import { useMemo, useState } from "react";
import Papa from "papaparse";
import type { ApplicationFields, VerificationResult } from "@/lib/types";
import { STANDARD_GOVERNMENT_WARNING } from "@/lib/types";
import { fileToDataUrlResized } from "@/lib/image";

type Mode = "idle" | "ready" | "running" | "done" | "error";

type BatchItem = {
  id: string;
  imageFilename: string;
  application: ApplicationFields;
};

type BatchRowResult =
  | { kind: "pending"; item: BatchItem }
  | { kind: "ok"; item: BatchItem; result: VerificationResult }
  | { kind: "error"; item: BatchItem; error: string };

function csvEscape(value: string): string {
  const needsQuotes = /[",\n\r]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

function statusBadge(overall: VerificationResult["overall"]): {
  label: string;
  className: string;
} {
  if (overall === "pass") return { label: "Match", className: "result-ok" };
  if (overall === "review") return { label: "Needs review", className: "result-warn" };
  return { label: "Mismatch", className: "result-bad" };
}

export default function BatchVerifyApp() {
  const [mode, setMode] = useState<Mode>("idle");
  const [csvError, setCsvError] = useState<string | null>(null);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [imagesByFilename, setImagesByFilename] = useState<Map<string, File>>(
    () => new Map(),
  );
  const [rows, setRows] = useState<BatchRowResult[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0, running: false });

  const computedSummary = useMemo(() => {
    const total = rows.length;
    const done = rows.filter((r) => r.kind !== "pending").length;
    const pass = rows.filter((r) => r.kind === "ok" && r.result.overall === "pass")
      .length;
    const review = rows.filter(
      (r) => r.kind === "ok" && r.result.overall === "review",
    ).length;
    const fail = rows.filter(
      (r) => r.kind === "ok" && r.result.overall === "fail",
    ).length;
    const errors = rows.filter((r) => r.kind === "error").length;
    return { total, done, pass, review, fail, errors };
  }, [rows]);

  async function onCsvSelected(file: File) {
    setCsvError(null);
    setMode("idle");
    setBatchItems([]);
    setRows([]);
    setImagesByFilename(new Map());

    const text = await file.text();
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
    });

    if (parsed.errors?.length) {
      setCsvError(`CSV parse error: ${parsed.errors[0]?.message ?? "unknown error"}`);
      setMode("error");
      return;
    }

    const rows = parsed.data ?? [];
    const normalized = rows
      .map((r, idx) => {
        // Expected columns (case-insensitive):
        // imageFilename, brandName, classType, alcoholContent, netContents, governmentWarning
        const get = (key: string) => {
          const found = Object.entries(r).find(([k]) => k.toLowerCase() === key.toLowerCase());
          return found?.[1] ?? "";
        };

        const imageFilename = get("imageFilename").trim();
        if (!imageFilename) return null;

        const brandName = get("brandName").trim();
        const classType = get("classType").trim();
        const alcoholContent = get("alcoholContent").trim();
        const netContents = get("netContents").trim();
        const governmentWarning = get("governmentWarning").trim();

        if (!brandName || !classType || !alcoholContent || !netContents) return null;

        const application: ApplicationFields = {
          brandName,
          classType,
          alcoholContent,
          netContents,
          governmentWarning: governmentWarning || STANDARD_GOVERNMENT_WARNING,
        };

        return {
          id: `${idx}-${imageFilename}`,
          imageFilename,
          application,
        } satisfies BatchItem;
      })
      .filter(Boolean) as BatchItem[];

    if (normalized.length === 0) {
      setCsvError(
        "No valid rows found. Make sure the CSV has columns: imageFilename, brandName, classType, alcoholContent, netContents, governmentWarning (optional).",
      );
      setMode("error");
      return;
    }

    setBatchItems(normalized);
    setMode("ready");
  }

  function onImagesSelected(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    const map = new Map<string, File>();
    for (const f of list) {
      // Pairing uses exact filename match.
      map.set(f.name, f);
    }
    setImagesByFilename(map);
  }

  async function startBatch() {
    if (batchItems.length === 0) return;
    setRows(
      batchItems.map((item) => ({
        kind: "pending",
        item,
      })),
    );
    setMode("running");
    setProgress({ done: 0, total: batchItems.length, running: true });

    const chunkSize = 6;
    for (let i = 0; i < batchItems.length; i += chunkSize) {
      const chunk = batchItems.slice(i, i + chunkSize);

      type EndpointItem = {
        id: string;
        application: ApplicationFields;
        imageDataUrl: string;
      };

      const endpointItems: EndpointItem[] = [];
      let chunkCompleted = 0;

      // Convert images to data URLs for this chunk, and immediately mark missing images as errors.
      for (const item of chunk) {
        const file = imagesByFilename.get(item.imageFilename);
        if (!file) {
          const errRow: BatchRowResult = {
            kind: "error",
            item,
            error: `Image not found for filename “${item.imageFilename}”.`,
          };
          setRows((prev) => prev.map((r) => (r.item.id === item.id ? errRow : r)));
          chunkCompleted++;
          continue;
        }

        const imageDataUrl = await fileToDataUrlResized(file);
        endpointItems.push({
          id: item.id,
          application: item.application,
          imageDataUrl,
        });
      }

      if (endpointItems.length > 0) {
        const response = await fetch("/api/verify/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: endpointItems,
            mode: "auto",
            concurrency: chunkSize,
          }),
        });

        const data: unknown = await response.json();
        if (!response.ok) {
          const message =
            typeof data === "object" && data && "error" in data
              ? String((data as any).error)
              : "Batch verification failed.";
          // Mark all items in this endpoint call as errors (safer than leaving pending).
          for (const epItem of endpointItems) {
            const item = chunk.find((c) => c.id === epItem.id);
            if (!item) continue;
            const errRow: BatchRowResult = {
              kind: "error",
              item,
              error: message,
            };
            setRows((prev) => prev.map((r) => (r.item.id === item.id ? errRow : r)));
          }
        } else {
          const payload = data as {
            items: Array<
              | { id: string; kind: "ok"; result: VerificationResult }
              | { id: string; kind: "error"; error: string }
            >;
          };

          for (const out of payload.items) {
            const item = chunk.find((c) => c.id === out.id);
            if (!item) continue;

            if (out.kind === "ok") {
              const okRow: BatchRowResult = {
                kind: "ok",
                item,
                result: out.result,
              };
              setRows((prev) => prev.map((r) => (r.item.id === item.id ? okRow : r)));
            } else {
              const errRow: BatchRowResult = {
                kind: "error",
                item,
                error: out.error,
              };
              setRows((prev) => prev.map((r) => (r.item.id === item.id ? errRow : r)));
            }
          }
        }
      }

      chunkCompleted += endpointItems.length;
      setProgress((p) => ({ ...p, done: p.done + chunkCompleted }));
    }

    setMode("done");
    setProgress((p) => ({ ...p, running: false, done: p.total }));
  }

  function exportResultsCsv() {
    const headers = [
      "imageFilename",
      "overall",
      "brandName_status",
      "classType_status",
      "alcoholContent_status",
      "netContents_status",
      "governmentWarning_status",
      "error",
    ];

    const lines = [headers.join(",")];

    for (const row of rows) {
      const base = [
        row.item.imageFilename,
        row.kind === "ok" ? row.result.overall : "",
        row.kind === "ok"
          ? row.result.comparisons.find((c) => c.field === "brandName")?.status ?? ""
          : "",
        row.kind === "ok"
          ? row.result.comparisons.find((c) => c.field === "classType")?.status ?? ""
          : "",
        row.kind === "ok"
          ? row.result.comparisons.find((c) => c.field === "alcoholContent")?.status ?? ""
          : "",
        row.kind === "ok"
          ? row.result.comparisons.find((c) => c.field === "netContents")?.status ?? ""
          : "",
        row.kind === "ok"
          ? row.result.comparisons.find((c) => c.field === "governmentWarning")?.status ?? ""
          : "",
        row.kind === "error" ? row.error : "",
      ].map((v) => csvEscape(String(v)));
      lines.push(base.join(","));
    }

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "proofcheck-batch-results.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">Batch check</h2>
        <p className="text-[var(--ink-soft)]">
          For peak-season importer dumps: upload a CSV of application fields plus
          the matching label images. Filenames must match exactly. Runs ~6 labels
          at a time.
        </p>
        <p className="text-sm text-[var(--ink-soft)]">
          Starter kit:{" "}
          <a
            className="font-semibold text-[var(--brand)] underline"
            href="/batch-template.csv"
          >
            batch-template.csv
          </a>{" "}
          and sample images under{" "}
          <code className="text-[var(--ink)]">public/samples/</code> (e.g.{" "}
          <a
            className="font-semibold text-[var(--brand)] underline"
            href="/samples/old-tom-pass.jpg"
          >
            old-tom-pass.jpg
          </a>
          ).
        </p>
      </div>

      {csvError ? (
        <div className="result-bad rounded-xl border px-4 py-3 text-[0.95rem] leading-relaxed">
          {csvError}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <div>
            <label className="mb-2 block text-sm font-semibold">Applications CSV</label>
            <input
              type="file"
              accept=".csv,text/csv"
              className="field-input"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onCsvSelected(f);
              }}
              disabled={progress.running}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold">Label images</label>
            <input
              type="file"
              accept="image/*"
              multiple
              className="field-input"
              onChange={(e) => {
                if (e.target.files) onImagesSelected(e.target.files);
              }}
              disabled={progress.running}
            />
          </div>

          <button
            type="button"
            className="btn-primary w-full sm:w-auto sm:min-w-56"
            disabled={mode !== "ready" || progress.running}
            onClick={() => void startBatch()}
          >
            {progress.running ? "Checking batch..." : "Start batch check"}
          </button>

          <p className="text-sm text-[var(--ink-soft)]">
            Pairing rule: each CSV row must specify <code>imageFilename</code> that exactly matches the uploaded image’s filename.
          </p>
        </section>

        <aside className="rounded-2xl border border-[var(--line)] bg-white/80 p-6 shadow-[var(--shadow)] backdrop-blur-sm">
          <h3 className="text-xl font-bold tracking-tight">Progress</h3>
          <p
            className="mt-2 text-sm text-[var(--ink-soft)]"
            role="status"
            aria-live="polite"
            aria-busy={progress.running}
          >
            {computedSummary.done} of {computedSummary.total} completed
          </p>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold">Match</span>
              <span className="font-bold text-[var(--ok)]">{computedSummary.pass}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold">Needs review</span>
              <span className="font-bold text-[var(--warn)]">{computedSummary.review}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold">Mismatch</span>
              <span className="font-bold text-[var(--bad)]">{computedSummary.fail}</span>
            </div>
            {computedSummary.errors > 0 ? (
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold">Errors</span>
                <span className="font-bold">{computedSummary.errors}</span>
              </div>
            ) : null}
          </div>

          {rows.length > 0 && mode === "done" ? (
            <button
              type="button"
              className="btn-secondary mt-4 w-full"
              onClick={exportResultsCsv}
            >
              Export results CSV
            </button>
          ) : null}
        </aside>
      </div>

      {rows.length > 0 ? (
        <section className="space-y-3">
          <h3 className="text-xl font-bold tracking-tight">Results</h3>
          <div className="overflow-auto rounded-2xl border border-[var(--line)] bg-white/60">
            <table className="min-w-[900px] w-full border-collapse">
              <thead className="bg-white/80 text-left">
                <tr>
                  <th className="p-3 text-sm font-semibold border-b border-[var(--line)]">Image</th>
                  <th className="p-3 text-sm font-semibold border-b border-[var(--line)]">Overall</th>
                  <th className="p-3 text-sm font-semibold border-b border-[var(--line)]">Details</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  if (row.kind === "pending") {
                    return (
                      <tr key={row.item.id}>
                        <td className="p-3 text-sm border-b border-[var(--line)]">{row.item.imageFilename}</td>
                        <td className="p-3 text-sm border-b border-[var(--line)] opacity-70">Pending</td>
                        <td className="p-3 text-sm border-b border-[var(--line)] opacity-70">Waiting…</td>
                      </tr>
                    );
                  }

                  if (row.kind === "error") {
                    return (
                      <tr key={row.item.id}>
                        <td className="p-3 text-sm border-b border-[var(--line)]">{row.item.imageFilename}</td>
                        <td className="p-3 text-sm border-b border-[var(--line)]">
                          <span className="result-bad inline-block rounded-full px-3 py-1 border border-transparent">Error</span>
                        </td>
                        <td className="p-3 text-sm border-b border-[var(--line)]">
                          <div className="text-[var(--ink-soft)]">{row.error}</div>
                        </td>
                      </tr>
                    );
                  }

                  const badge = statusBadge(row.result.overall);
                  return (
                    <tr key={row.item.id}>
                      <td className="p-3 text-sm border-b border-[var(--line)]">{row.item.imageFilename}</td>
                      <td className="p-3 text-sm border-b border-[var(--line)]">
                        <span className={`inline-block rounded-full px-3 py-1 border border-transparent ${badge.className}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="p-3 text-sm border-b border-[var(--line)]">
                        <details>
                          <summary className="cursor-pointer text-[var(--ink-soft)] font-semibold">Show fields</summary>
                          <div className="mt-2 space-y-2">
                            <div className="text-[var(--ink-soft)] text-sm opacity-90">
                              {row.result.elapsedMs} ms
                            </div>
                            {row.result.comparisons.map((c) => (
                              <div key={c.field} className="text-sm">
                                <div className="flex items-baseline justify-between gap-3">
                                  <span className="font-semibold">{c.label}</span>
                                  <span className="opacity-90">{c.status}</span>
                                </div>
                                <div className="text-[var(--ink-soft)] mt-1">{c.message}</div>
                              </div>
                            ))}
                          </div>
                        </details>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

