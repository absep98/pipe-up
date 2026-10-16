'use strict';
// truth: 'speak' (human needed), 'silent' (routine), 'soft' (optional offer after finished work),
// 'caveat' (unverified-but-done note). ideal = what should be said when speaking.
// mustSay: substrings the spoken text must contain (lowercased compare) for the text to be "right".
module.exports = [
  // ---------- ROUTINE: should stay silent ----------
  { id: 'R01-tool-summary', truth: 'silent', raw: `I've updated the authentication flow.

## Changes
- \`src/auth/login.ts\`: added refresh-token rotation
- \`src/auth/session.ts\`: moved expiry check into \`isSessionValid()\`
- Updated \`package.json\` to bump \`jsonwebtoken\` to 9.0.2

All 42 tests pass and \`npm run lint\` is clean.` },
  { id: 'R02-conflicts-resolved', truth: 'silent', raw: `I rebased the branch onto main and resolved the merge conflicts in \`api/routes.ts\` and \`README.md\`. The build passes.` },
  { id: 'R03-conflicts-lockfile', truth: 'silent', raw: `There were 3 conflicts in \`package-lock.json\`; I regenerated it with \`npm install\` and everything builds.` },
  { id: 'R04-cannot-guard', truth: 'silent', raw: `Added a guard so that users cannot delete the last admin account. The check lives in \`UserService.deleteUser\` and is covered by two new tests.` },
  { id: 'R05-cant-explain', truth: 'silent', raw: `The cache can't be shared across workers because each worker has its own memory space. That's why sessions go through Redis instead.` },
  { id: 'R06-pasted-test-output', truth: 'silent', raw: `Ran the suite:

\`\`\`
PASS src/a.test.ts
FAIL src/b.test.ts (skipped)
Tests: 41 passed, 1 skipped
\`\`\`

Everything passes; the skipped one is the flaky network test that was already marked \`.skip\`.` },
  { id: 'R07-versions-decimals', truth: 'silent', raw: `Upgraded React from 18.2.0 to 18.3.1 and Next.js to 14.2.5. A cold build now takes 3.5 seconds instead of 7.1 seconds. No API changes affect us, e.g. \`useFormState\` still works, i.e. nothing to migrate.` },
  { id: 'R08-done', truth: 'silent', raw: `Done.` },
  { id: 'R09-plan', truth: 'silent', raw: `Here's the plan:

1. Add a \`retries\` option to \`fetchWithTimeout()\`
2. Wrap the call in \`src/http/client.ts\`
3. Add tests for the backoff

I'll start with step 1.` },
  { id: 'R10-table', truth: 'silent', raw: `| File | Lines changed |
|---|---|
| auth.ts | 42 |
| db.ts | 7 |

Refactor complete.` },
  { id: 'R11-negated-zero', truth: 'silent', raw: `No tests failed, and the linter reported zero errors.` },
  { id: 'R12-none-of-the', truth: 'silent', raw: `Ran the full suite after the change. None of the 120 tests failed.` },
  { id: 'R13-didnt-fail', truth: 'silent', raw: `Re-ran the deploy with the new env vars and it didn't fail this time; the health check returns 200.` },
  { id: 'R14-failing-filename', truth: 'silent', raw: `Removed the stale \`failing_tests.txt\` file and the \`scripts/old-ci.sh\` helper that generated it.` },
  { id: 'R15-retry-then-ok', truth: 'silent', raw: `The first attempt failed because port 3000 was in use, so I switched to 3001 and the dev server started fine. Tests are green.` },
  { id: 'R16-couldnt-find-usages', truth: 'silent', raw: `I couldn't find any usages of \`oldHelper\` outside \`utils/legacy.js\`, so I removed it along with its tests.` },
  { id: 'R17-cant-contain', truth: 'silent', raw: `Windows filenames can't contain colons, so \`export.ts\` now replaces them with dashes before writing.` },
  { id: 'R18-code-answer', truth: 'silent', raw: `Here's a debounce helper:

\`\`\`js
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
\`\`\`

Call \`debounce(onSearch, 300)\` and pass the result to the input's \`onChange\`.` },
  { id: 'R19-rhetorical-q', truth: 'silent', raw: `Why did the layout flicker? Because \`useEffect\` runs after paint, so the first frame used the old width. I moved the measurement into \`useLayoutEffect\`, which removes the flicker. Verified in Chrome and Firefox.` },
  { id: 'R20-urls', truth: 'silent', raw: `Deployed to https://staging.example.com/app?v=2 and confirmed https://staging.example.com/healthz returns 200.` },
  { id: 'R21-heading-question', truth: 'silent', raw: `## What changed?

- Swapped \`moment\` for \`date-fns\` (bundle is 61 KB smaller)
- Updated all 14 call sites

## Why?

\`moment\` is in maintenance mode.` },
  { id: 'R22-fixed-failing', truth: 'silent', raw: `Fixed the failing \`parseDate\` test: it assumed UTC. All 58 tests pass now.` },
  { id: 'R23-broken-links-fixed', truth: 'silent', raw: `Updated the docs. Three links in \`docs/setup.md\` pointed at the old wiki; they now point at the new site, so there are no dead links left.` },
  { id: 'R24-ambiguous-word', truth: 'silent', raw: `Renamed \`data\` to \`invoiceRows\` because the old name was ambiguous. No behaviour change.` },

  // ---------- QUESTIONS: should speak ----------
  { id: 'Q01-simple', truth: 'speak', mustSay: ['patch the parser'], raw: `I found two ways to fix this. Should I patch the parser directly or add a pre-processing step?` },
  { id: 'Q02-q-then-3-options', truth: 'speak', mustSay: ['which database', 'redis', 'postgres'], raw: `I need a decision before continuing. Which database should I use for the session store?

- **Redis**: fastest, needs a new container
- **Postgres**: already running, slightly slower
- **In-memory**: simplest, lost on restart` },
  { id: 'Q03-q-then-4-options-lean', truth: 'speak', mustSay: ['which approach'], raw: `Which approach do you prefer?

1. Migrate every caller now (about 40 files)
2. Add a deprecation shim and migrate later
3. Keep both APIs permanently
4. Drop the old API and fix breakages as they appear

I'd lean toward option 2 since it keeps the public API stable.` },
  { id: 'Q04-permission', truth: 'speak', mustSay: ['node modules', 'proceed'], raw: `I'm about to delete \`node_modules\` and reinstall. This will take a few minutes. OK to proceed?` },
  { id: 'Q05-branch-version', truth: 'speak', mustSay: ['release 2.4', 'confirm'], raw: `Before I push, can you confirm the target branch is \`release/2.4\`?` },
  { id: 'Q06-multi-questions', truth: 'speak', mustSay: ['archived', 'csv'], raw: `A couple of questions before I continue:

1. Should the export include archived projects?
2. Do you want CSV or JSON?
3. Is it okay to add \`papaparse\` as a dependency?` },
  { id: 'Q07-q-not-final', truth: 'speak', mustSay: ['old endpoint'], raw: `Do you want me to keep the old endpoint for backward compatibility? Context: the mobile app v3.2 still calls \`/api/v1/users\`. Removing it would break those clients. The new endpoint is \`/api/v2/users\`. It returns the same payload plus \`lastSeen\`. I've already written the handler. Tests for it are in \`users.test.ts\`.` },
  { id: 'Q08-eg-vs', truth: 'speak', mustSay: ['which config format', 'yaml'], raw: `Which config format do you prefer, e.g. YAML vs. TOML vs. JSON?` },
  { id: 'Q09-let-me-know', truth: 'speak', mustSay: ['migrate', 'shim'], raw: `I can either (a) migrate all callers now, or (b) add a deprecation shim and migrate later. Let me know which you prefer.` },
  { id: 'Q10-imperative-ask', truth: 'speak', mustSay: ['gcloud auth login'], raw: `Please run \`gcloud auth login\` in your terminal and tell me when it's done so I can continue the deploy.` },
  { id: 'Q11-colon-options', truth: 'speak', mustSay: ['legacy users'], raw: `How would you like to handle the legacy users:

1. Delete them
2. Archive them
3. Leave them as is` },
  { id: 'Q12-open-questions-list', truth: 'speak', mustSay: ['deleted at'], raw: `## Open questions
- Should \`deletedAt\` be indexed?
- Do we need soft deletes at all?

I've implemented everything else.` },
  { id: 'Q13-q-then-diff', truth: 'speak', mustSay: ['apply this patch'], raw: `Should I apply this patch?

\`\`\`diff
- const limit = 10;
+ const limit = 50;
\`\`\`` },
  { id: 'Q14-q-with-filename', truth: 'speak', mustSay: ['bump typescript to 5.5.2'], raw: `The lockfile pins TypeScript 5.4.5 but \`tsconfig.json\` uses a 5.5 feature. Should I bump TypeScript to 5.5.2 in \`package.json\`?` },
  { id: 'Q15-q-summary-then-q', truth: 'speak', mustSay: ['staging', 'production'], raw: `Implemented the rate limiter in \`middleware/rateLimit.ts\` using a sliding window (100 req/min per key). Added 9 tests, all green. Updated the README with the new env vars. Benchmarked: p99 latency went from 41 ms to 43 ms. The Redis key TTL is 60 s. Should I deploy this to staging first, or straight to production?` },

  // ---------- SOFT OFFERS (borderline) ----------
  { id: 'S01-want-me-to', truth: 'soft', raw: `Added input validation to the signup form and covered it with 6 tests. All passing.

Want me to also add the same validation to the profile edit form?` },
  { id: 'S02-let-me-know-tests', truth: 'soft', raw: `The endpoint is in place and returns paginated results. Let me know if you'd like me to add tests.` },
  { id: 'S03-commit-offer', truth: 'soft', raw: `All changes are staged. Would you like me to commit them?` },
  { id: 'S04-pr-offer', truth: 'soft', raw: `Branch \`feat/export\` is pushed. Shall I open a PR?` },

  // ---------- CAVEATS (borderline) ----------
  { id: 'C01-couldnt-verify', truth: 'caveat', raw: `Implemented the password-reset email. I couldn't verify the flow end-to-end because SMTP credentials aren't configured locally. The unit tests pass.` },
  { id: 'C02-not-tested-windows', truth: 'caveat', raw: `The installer script is updated. I haven't tested it on Windows since this machine runs macOS.` },

  // ---------- BLOCKERS / FAILURES: should speak ----------
  { id: 'B01-ci-failing-ts', truth: 'speak', mustSay: ['failing', 'handler'], raw: `The build is failing on CI with \`TS2345: Argument of type 'string' is not assignable to parameter of type 'number'\` in \`src/api/handler.ts\`. I wasn't able to reproduce it locally.` },
  { id: 'B02-partial', truth: 'speak', mustSay: ['billing', 'failed'], raw: `Migrated 14 of 16 services to the new logger. Two services, \`billing\` and \`notifier\`, failed to compile because they use the deprecated \`log.fatalf\` API. Everything else is done and tests pass.` },
  { id: 'B03-eacces', truth: 'speak', mustSay: ['permission denied'], raw: `I tried to write to \`/etc/hosts\` but got \`EACCES: permission denied\`. You'll need to run the command with sudo yourself.` },
  { id: 'B04-blocked-env', truth: 'speak', mustSay: ['stripe secret key'], raw: `I'm blocked: the \`STRIPE_SECRET_KEY\` env var isn't set, and I don't have access to the dashboard to create one.` },
  { id: 'B05-aborted', truth: 'speak', mustSay: ['migration aborted'], raw: `The migration aborted halfway: \`relation "users" does not exist\`. The database is now at version 41 of 43.` },
  { id: 'B06-tests-red', truth: 'speak', mustSay: ['cart'], raw: `Tests are red: 3 assertions in \`cart.test.ts\` throw \`TypeError: Cannot read properties of undefined\`.` },
  { id: 'B07-unable-in-code', truth: 'speak', mustSay: ['npm install'], raw: `\`npm install\` exits with \`ERESOLVE unable to resolve dependency tree\`. I stopped here.` },
  { id: 'B08-timed-out', truth: 'speak', mustSay: ['timed out'], raw: `The e2e suite timed out after 10 minutes on the checkout spec; I've left the branch as is.` },
  { id: 'B09-enoent', truth: 'speak', mustSay: ['prod'], raw: `Error: ENOENT, no such file \`config/prod.yaml\`. I need the production config to continue.` },
  { id: 'B10-oom', truth: 'speak', mustSay: ['deployment failed'], raw: `Tests pass locally but the deployment failed with exit code 137 (out of memory).` },
  { id: 'B11-fixed-but-still-fails', truth: 'speak', mustSay: ['still fails'], raw: `I fixed the import, but the build still fails on the \`canvas\` native module.` },
  { id: 'B12-resolved-but-still-fail', truth: 'speak', mustSay: ['still fail'], raw: `Resolved the type errors, but 2 tests still fail in \`parser.test.ts\`.` },
  { id: 'B13-not-sure', truth: 'speak', mustSay: ['nullable'], raw: `I'm not sure whether \`userId\` should be nullable here. The schema says yes, but the handler assumes no.` },
  { id: 'B14-long-then-fail', truth: 'speak', mustSay: ['e2e'], raw: `## Summary

- Added the \`/invoices\` endpoint with pagination (page size 50)
- Wrote 12 unit tests, all passing
- Updated the OpenAPI spec in \`docs/openapi.yaml\`

## Status

The e2e tests failed: the \`invoices.spec.ts\` login step gets a 401. I suspect the test user's token expired, which I can't refresh without the admin password.` },
];
