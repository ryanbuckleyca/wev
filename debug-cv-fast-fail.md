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
