# SwimFix — design

**Date:** 2026-08-10
**Status:** approved (brainstorming session)

## Problem

Garmin watches over-count lengths in indoor pool swims. When the swimmer pauses
mid-pool (busy lane) or fumbles a push-off, the watch splits one real length into
several, crediting a full pool length for each fragment. Garmin Connect offers no
per-length editing, and its edits never reach the FIT file anyway.

Evidence from the sample activity (`23919673021_ACTIVITY.fit`, 2026-08-10, 50 m
pool, claimed 1300 m / 26 active lengths): the swimmer's normal length is 26–36
strokes over 77–114 s, but the file contains a cluster at 07:10–07:15 with lengths
of 9 strokes/25 s, 9 strokes/22.5 s and 19 strokes/49 s (mislabeled breaststroke
mid-freestyle), and another at 07:22–07:26 with 11 strokes/29 s and 14
strokes/43.6 s. Real distance is likely ~1150–1200 m, over-credited by
~100–150 m.

## Goal

A web app that loads a pool-swim FIT file, visualizes it, automatically flags
suspect lengths with proposed corrections, lets the user accept/reject each (or
edit any length manually), and exports a corrected, valid FIT file for re-upload
to Garmin Connect.

## Decisions made

- **Output:** a corrected `.fit` file (not just a report). Workflow: delete the
  original activity in Garmin Connect, then import the corrected file (GC dedupes
  on start time, not file hash).
- **Form factor:** Next.js web app, fully client-side (static export, no server).
  Files never leave the browser. Deployable later for public use.
- **Fix behavior:** reviewable proposals — auto-flagged with per-proposal
  accept/reject toggles and live before/after totals; nothing applied silently.
- **v1 scope:** merge phantom split lengths, convert phantoms to rest, fix
  stroke labels, manual editing of any length. Out of scope for v1: pool-size correction, drill-mode repair,
  Garmin API integration, multi-file history/baselines.
- **Approach:** fresh app (not a fork of swim-data-analyser), using Garmin's
  official `@garmin/fitsdk` JS library for decode and encode.
  swim-data-analyser (GPL-3.0, swimdata.org) serves as reference prior art
  proving the browser decode→edit→encode→GC-reimport pipeline works.

## Prior art (research summary)

- **swim-data-analyser** (github.com/PeterK-end/swim-data-analyser) — client-side
  manual swim FIT editor using `@garmin/fitsdk` both ways. Best reference.
- **Swim Blueprint** (swimblueprint.com) — closed-source manual editor, same ops.
- **FIT File Repair Tool** — Windows desktop, manual.
- None of them *detect* bad lengths automatically. That is SwimFix's differentiator.
- GC silently rejects inconsistent FIT files (broken message_index chains, bad
  lap references/totals, CRC). Aggregate-recomputation correctness is the core
  engineering risk, not parsing.
- The FIT SDK encoder drops Garmin-proprietary "unknown" messages (the sample
  file has ~7,600). Prior art accepts this loss and GC accepts such files. v1
  does the same; surgical binary patching is a possible later enhancement if GC
  measurably degrades re-imported activities.

## Architecture

Next.js (App Router, TypeScript, `output: 'export'`). No backend. Three pure-TS
libraries isolated from React, plus the UI:

- **`lib/fit`** — decode: `.fit` ArrayBuffer → typed `SwimActivity`; encode:
  `SwimActivity` → valid FIT bytes. Wraps `@garmin/fitsdk` Decoder/Encoder.
- **`lib/analysis`** — detection engine: `SwimActivity` → `Proposal[]`. Pure
  functions; all thresholds in one config object.
- **`lib/edit`** — applies accepted proposals + manual edits, then recomputes all
  derived data: length `message_index` re-chaining, lap `first_length_index` /
  `num_lengths` / `num_active_lengths` remapping, lap and session
  distance/strokes/times/avg-speed totals (`distance = active lengths ×
  pool_length`).
- **`app/` + `components/`** — dropzone, timeline viz, proposals panel, manual
  editor, export.

### Data model

`SwimActivity`: session summary, `Lap[]`, `Length[]` (start time, elapsed/timer
time, strokes, cadence, stroke type, `active`/`idle`, message_index), HR samples
(timestamp + bpm from `record` messages), plus the raw decoded messages needed
for faithful re-encode (file_id, events, device info).

### Data flow

drop `.fit` → decode → detect → user reviews proposals / edits manually → live
before/after totals → apply edits → encode → round-trip validate → download
`<name>_fixed.fit`.

## Detection engine

Baseline is self-calibrating from the file being analyzed — no hardcoded
"normal swimmer" constants. Per stroke type over active lengths: median and MAD
of strokes-per-length and seconds-per-length.

Rules (each proposal carries confidence high/medium/low and a plain-English
reason, e.g. "9 strokes vs your median of 33"):

1. **Fragment merge** — consecutive active lengths each well below baseline
   (e.g. strokes < ~60% of median) whose combined strokes and duration fit one
   normal length → merge into one length (sum times and strokes, keep dominant
   stroke type, count as one pool length).
2. **Phantom delete** — a lone sub-baseline active length that does not combine
   with a neighbor into anything plausible → convert to an idle (rest) length:
   session distance drops by one pool length while the timeline stays contiguous
   (safer for GC than removing the message outright).
3. **Stroke relabel** — a length whose stroke label disagrees with its lap's
   majority while its cadence/strokes match the majority stroke's baseline →
   relabel.

Expected result on the sample file: exactly the 07:10 and 07:22 clusters are
flagged.

## UI

Single page. Timeline of the swim: one bar per length (width = duration, color =
stroke, gray = rest, warning badge = flagged), HR trace aligned below, summary
cards (distance, active lengths, avg pace) showing before → after live as
proposals are toggled. Proposals panel with accept/reject per finding. Clicking
any length (flagged or not) opens manual actions: merge with neighbor, delete,
relabel stroke, mark as rest.

## Error handling

- Non-swim or corrupt FIT → clear user-facing message, no blank screens.
- Export guard: re-decode the just-encoded bytes and assert totals and message
  chains match the edited model before offering the download. This catches the
  "silently rejected by Garmin Connect" bug class at export time.

## Testing

- Vitest unit tests for `lib/analysis` and `lib/edit` on fixtures extracted from
  the real sample file (committed as a test asset).
- Round-trip test: decode → encode → decode, structures equal.
- Golden test: the 2026-08-10 swim produces exactly the expected proposals.
- Acceptance: corrected file imports into Garmin Connect and shows ~1150–1200 m.

## Risks

- `@garmin/fitsdk` encoder fidelity (unknown-message loss) — accepted for v1,
  validated by GC import.
- Detection thresholds too aggressive/lax — mitigated by reviewable proposals,
  a single tunable config, and the golden test.
- Small in-file sample for baselines (short swims) — MAD-based robust stats and
  confidence downgrading when sample size is low.
