# ProofCheck

AI-assisted alcohol **label verification** prototype for TTB-style compliance review.

Agents upload (or demo) a label image, enter application fields, and get a field-by-field match report in seconds — built for reviewers who need something obvious, fast, and judgment-aware.

## Deployed app

**Live URL:** [https://ttb-challenge.vercel.app](https://ttb-challenge.vercel.app)

Demo samples work without an API key. Live image uploads need `OPENAI_API_KEY` set in the Vercel project environment (Production + Preview), then redeploy.

## Why this exists

Compliance agents spend much of their day confirming that label artwork matches the application (brand, ABV, net contents, government warning). ProofCheck automates the routine matching so agents can focus on nuance.

Stakeholder constraints reflected in the design:

| Stakeholder signal | How ProofCheck responds |
|--------------------|-------------------------|
| ~5s max, or agents abandon it | Vision + local compare; demo mode is near-instant |
| “My mother could figure it out” | Numbered 3-step flow, large controls, plain-language results |
| Soft brand casing (`STONE'S THROW` vs `Stone's Throw`) | Soft match → overall **review**, not auto-fail |
| Warning must be exact / all-caps prefix | Strict `GOVERNMENT WARNING:` check (+ best-effort bold) |
| Peak-season dumps of 200–300 labels | Batch CSV + images with per-row results |
| No COLA integration for the PoC | Standalone form fields; nothing stored |
| Outbound cloud APIs often blocked | Offline demo samples still show the full workflow |

## Quick start

```bash
cd proofcheck
npm install
cp .env.example .env.local   # optional for live image checks
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Demo mode (no API key)

1. Leave **Try a demo sample** selected
2. Pick a scenario (Pass / Review / Fail cases: brand, ABV, net contents, warning prefix, warning wording, missing warning)
3. Click **Verify label**

Each demo includes a sample label image under `public/samples/`.

### Live image mode

1. Set `OPENAI_API_KEY` in `.env.local`
2. Click **Upload label image** (or use a file from `public/samples/`)
3. Fill application fields (demos prefill them)
4. Click **Verify label**

### Batch mode (CSV + images)

1. Click **Batch (CSV + images)**
2. Download [`/batch-template.csv`](./public/batch-template.csv)
3. Upload that CSV plus the matching images from [`public/samples/`](./public/samples/) (filenames must match exactly)
4. Start the batch check

Expected CSV columns:
`imageFilename, brandName, classType, alcoholContent, netContents, governmentWarning`

Quote fields that contain commas (the warning statement does). One bad row does not fail the whole batch.

Optional: `OPENAI_MODEL` (default `gpt-4o-mini`).

### Self-check / tests

```bash
npm run selfcheck
npm test
```

## Deploy

Works well on [Vercel](https://vercel.com):

1. Push this repo to GitHub (or point a new remote at this project)
2. Import the project in Vercel (root directory: `proofcheck` if the repo parent contains other folders)
3. Add `OPENAI_API_KEY` (and optional `OPENAI_MODEL`) as environment variables
4. Deploy, then paste the production URL into the **Deployed app** section above

Demo samples still work if the key is omitted; live uploads return a clear configuration error.

## Approach

```
Label image + application fields
        │
        ▼
 Vision extract (OpenAI)  ──or──  demo fixture extract
        │
        ▼
 Deterministic compare engine
        │
        ▼
 Pass / review / fail + per-field messages
```

| Piece | Choice | Rationale |
|-------|--------|-----------|
| App | Next.js (App Router) + TypeScript | One deployable app, simple API routes |
| Extraction | OpenAI Vision (`gpt-4o-mini`) → JSON | Fast structured OCR for a prototype |
| Comparison | Local TypeScript rules | Predictable, testable, no extra latency |
| UI | Single-screen numbered workflow | Matches “no hunting for buttons” feedback |
| Persistence | None | Prototype; no PII/document storage |

### Fields checked (core)

Aligned with the take-home sample distilled-spirits label:

- Brand name
- Class / type designation
- Alcohol content (ABV / proof)
- Net contents
- Government Health Warning Statement

Bottler name/address and country of origin are noted in types for a future extension but are **not** required for this prototype (common elements vary by beverage type; the interviews emphasize brand, ABV, and warning).

### Comparison rules (highlights)

- **Brand / class**: exact match, else soft match (case/punctuation-insensitive)
- **Alcohol**: numeric ABV compare; proof (`90 Proof`) treated as `45%`
- **Net contents**: unit-normalized (`750 mL` ≈ `750ml`)
- **Government warning**: body must match word-for-word; prefix must be exactly `GOVERNMENT WARNING:`; bold header is best-effort from the vision model

Soft matches produce overall **review** (not auto-fail), so agents like Dave keep judgment in the loop.

## Project structure

```
public/
  batch-template.csv      # quoted CSV for batch demos
  samples/                # generated test labels
src/
  app/api/verify/route.ts
  app/api/verify/batch/route.ts
  components/VerifyApp.tsx
  components/BatchVerifyApp.tsx
  lib/compare.ts
  lib/extract.ts
  lib/image.ts
  lib/normalize.ts
  lib/samples.ts
  lib/verifyBatch.ts
  lib/types.ts
```

## Assumptions & trade-offs

1. **Standalone PoC** — not wired to COLA; application fields are entered (or prefilled from demos).
2. **Outbound API dependency for live images** — government networks may block this; demo mode and local compare engine still demonstrate the workflow.
3. **Batch** — CSV + images paired by exact filename; bounded server-side concurrency.
4. **Image quality** — vision models tolerate some glare/angle; poor photos may still return `missing` fields.
5. **Warning boldness** — wording + exact prefix are enforced; typographic bold is best-effort from the model, not a hard fail when confidence is low.
6. **No long-term storage** of images or results.
7. **Sample labels** are synthetic / AI-generated for evaluation — not real COLA filings.

## Evaluation criteria mapping

| Criterion | Where it shows up |
|-----------|-------------------|
| Core correctness | Compare engine + warning exactness + demo scenarios + sample images |
| Code quality | Small typed modules, API validation with Zod, selfcheck + vitest |
| Technical choices | Vision for extraction, deterministic rules for decisions |
| UX / errors | Numbered flow, plain-language statuses, clear API errors |
| Creative problem-solving | Soft-match “review” lane; offline demos for firewall reality; batch CSV |

## License

Prototype / take-home exercise. Not an official TTB product.
