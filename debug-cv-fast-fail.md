# Debug Session: cv-fast-fail

Status: [OPEN]

## Symptom

- Staging CV import fails quickly, around 5 seconds after submission.
- The currently deployed branch for the observed failure is `improve-jina-error`.
- Recent logs include Supabase auth warnings and Next.js config warnings, but no obvious CV parser timeout.

## Initial Hypotheses

1. The request is failing before the parser worker timeout, likely inside auth, form parsing, provider setup, or the upstream extraction/matching step.
2. The visible Supabase auth warning is noisy but non-fatal, and is not the direct cause of the CV import failure.
3. The failure is a handled `CvImportError` or provider/API error that is being returned as a generic `cv_import_failed`, masking the real sub-cause in staging.
4. The request is aborting or failing due to an infra/runtime limit in staging around a few seconds, rather than the application-level `CV_PARSING_TIMEOUT_MS`.
5. The `next.config.mjs` warning is unrelated startup noise and not causally connected to the per-request CV import failure.

## Evidence So Far

- `CV_PARSING_TIMEOUT_MS` in code is 60 seconds.
- Reported staging failure occurs around 5 seconds.
- Startup logs show `next.config.mjs` warnings and Supabase auth warnings, but no stack trace tied to `/api/cv/extract` yet.
- `getRequestUser()` currently calls `supabase.auth.getSession()`, which explains the warning text in logs but does not by itself indicate a request failure.
- `next.config.mjs` contains deprecated `eslint` config, which explains the startup warning but is not specific to the CV import route.
- `/api/cv/extract` has several fast-fail paths before the worker timeout: auth rejection, missing provider keys, invalid file, parser error, upstream extraction error, or generic extraction failure.

## Next Steps

- Inspect request auth path and current route behavior for likely early-exit points.
- Add targeted instrumentation around `/api/cv/extract` only if static inspection does not already explain the 5-second failure window.
- Compare staging symptom timing against known app-level and platform-level timeouts.

## Static Inspection Notes

- The parser timeout hypothesis is weakened because the only explicit timeout in this flow is 60 seconds.
- The auth warning is likely incidental log noise unless the route is returning unauthorized responses.
- The most useful next evidence would be route-stage logging around:
  - auth result
  - form-data parsing
  - server parse completion
  - LLM extraction start/end
  - embedding/matching start/end
  - final caught error code/message

## Instrumentation Added

- `wev-bulletin/app/api/cv/extract/route.ts`
  - route entry
  - auth success
  - rate limit branch
  - missing provider keys
  - form-data parsed
  - file accepted
  - parse start/done
  - extraction pipeline start/done
  - catch path with elapsed time and error message
- `wev-bulletin/lib/cv/index.ts`
  - LLM stage start/done
  - embedding start/done
  - ESCO match start/done
- `wev-bulletin/lib/cv/llm.ts`
  - Groq request start/done
- `wev-bulletin/lib/cv/matcher.ts`
  - Supabase RPC start/done
  - ESCO hydrate start/done

## Reproduction Instructions

- Deploy current branch with instrumentation.
- Trigger one CV import in staging.
- Capture the structured server logs containing `[DEBUG]` and the matching `traceId`.
- Compare the last successful stage log against the terminal catch/error log to identify the failing segment.

## Evidence Update From Staging

- Trace ID: `aff05b47-5094-4599-9997-e0a571a34a4e`
- Observed sequence:
  - `[DEBUG] CV extract route entered`
  - `[DEBUG] CV extract auth succeeded`
  - `[DEBUG] CV extract form-data parsed`
  - `[DEBUG] CV extract file accepted`
  - `[DEBUG] CV parse start`
  - process stderr: `Killed`
- Notably absent:
  - `CV parse done`
  - any LLM-stage logs
  - any embedding / ESCO match logs
  - route catch log

## Hypothesis Status

| ID | Hypothesis | Status | Evidence Summary |
|----|------------|--------|------------------|
| A | Failure occurs before provider calls, in auth/form parsing/parser startup | Partially confirmed | Logs progress through auth and form parsing, then stop immediately after `CV parse start`. |
| B | Supabase `getSession()` warning is the direct cause | Rejected | Request proceeds past auth and into parser stage despite the warning. |
| C | Generic `CvImportError`/provider error is masking the real issue | Rejected | No catch-path log is emitted; process dies before app-level error handling returns. |
| D | Staging runtime/process is being terminated during parser execution | Confirmed | `stderr F Killed` appears after `CV parse start`, with no subsequent app logs. |
| E | `next.config.mjs` warning is causally related | Rejected | The request reaches parser stage; startup warning is unrelated to the failing stage. |

## Updated Evidence

- Additional staging route-catch log:
  - `errorName: "CvImportError"`
  - `errorMessage: "Setting up fake worker failed: \"Cannot find module '/workspace/wev-bulletin/.next/server/chunks/pdf.worker.mjs' ...\"."`
  - elapsed time about `4694ms`

## Current Root-Cause Read

- The failure is not the 60-second timeout path.
- The failure is not in Groq, Jina, or Supabase matching.
- The parser reaches the PDF stage and then fails because `pdfjs-dist` attempts to set up a fake worker and auto-resolve `pdf.worker.mjs` from the bundled Next server output, where that module path does not exist.
- The earlier `Killed` log is likely a side effect/noise from a separate process termination event and is not the primary application error for this reproduction.

## Hypothesis Status (Revised)

| ID | Hypothesis | Status | Evidence Summary |
|----|------------|--------|------------------|
| A | Failure occurs before provider calls, in auth/form parsing/parser startup | Confirmed | Catch log shows parser-stage `CvImportError` before any LLM or embedding logs. |
| B | Supabase `getSession()` warning is the direct cause | Rejected | Route proceeds into parser and the caught error is unrelated to auth. |
| C | Generic `CvImportError`/provider error is masking the real issue | Confirmed | Instrumentation exposed the specific parser message about `pdf.worker.mjs` resolution. |
| D | Staging runtime/process is being terminated during parser execution | Rejected for primary root cause | The parser emits a concrete `CvImportError`; provider/runtime timeouts are not the first failure. |
| E | `next.config.mjs` warning is causally related | Rejected | Error is isolated to `pdfjs-dist` worker resolution during PDF parse. |

## Fix Direction

- Configure `pdfjs-dist` in the server worker without relying on runtime path resolution for `workerSrc`.
- The more robust approach is to preload `pdfjs-dist/legacy/build/pdf.worker.mjs` and assign it to `globalThis.pdfjsWorker`, which is exactly what PDF.js checks first in Node fake-worker mode.

## Fix Iteration

- First attempted fix: point `workerSrc` at a filesystem path under `node_modules`.
- Result: still failed in staging because that deployment layout did not expose the worker file at the assumed path.
- Revised fix: directly import `pdfjs-dist/legacy/build/pdf.worker.mjs` and set `globalThis.pdfjsWorker` before calling `getDocument()`.
