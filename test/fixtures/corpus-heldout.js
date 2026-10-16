'use strict';
// Written AFTER the fixes, without tuning against them; several are adversarial to the fixes.
module.exports = [
  { id: 'H01', truth: 'speak', mustSay: ['how should i proceed'], raw: `I can't find a reliable way to do this without breaking the public API. How should I proceed?` },
  { id: 'H02-lead-rhetorical', truth: 'silent', raw: `Should you worry about the 3 deprecation warnings? No, they come from a transitive dependency and are harmless. Everything builds and all 77 tests pass. I also updated the changelog.` },
  { id: 'H03-we-cannot', truth: 'speak', mustSay: ['license'], raw: `The code is ready, but we cannot ship this until legal answers the license question about \`libfoo\`.` },
  { id: 'H04-still-500', truth: 'speak', mustSay: ['500'], raw: `The request failed with a 500, so I added a retry, and it still returns 500 on every attempt.` },
  { id: 'H05-lint-fixed-by-tool', truth: 'silent', raw: `The linter failed on 4 files, so I ran \`eslint --fix\` and it passes now.` },
  { id: 'H06-timed-out-routine', truth: 'silent', raw: `Added a \`timeout\` option; requests that previously timed out now retry twice with backoff.` },
  { id: 'H07-aborts-intended', truth: 'silent', raw: `Heads up: the \`release\` script aborts if the working tree is dirty, which is intended.` },
  { id: 'H08-run-to-try', truth: 'silent', raw: `Everything is set up. Run \`npm start\` to try it.` },
  { id: 'H09-which-migration', truth: 'speak', mustSay: ['which of the two migrations'], raw: `Which of the two migrations should run first, \`0042_add_index\` or \`0043_backfill\`?` },
  { id: 'H10-heading-options', truth: 'speak', mustSay: ['which one'], raw: `I've drafted three options.

### Option A
Use a queue.

### Option B
Use cron.

### Option C
Use webhooks.

Which one fits your infra best?` },
  { id: 'H11-thoughts', truth: 'speak', mustSay: ['middleware'], raw: `Here's my proposal: move the auth check into a middleware so every route gets it. Thoughts?` },
  { id: 'H12-sound-good', truth: 'speak', mustSay: ['sound good'], raw: `Plan: add the column, backfill it in batches of 1,000, then add the NOT NULL constraint. Sound good?` },
  { id: 'H13-was-failing-retry', truth: 'silent', raw: `The \`test:e2e\` script was failing intermittently; I added a retry around the login step and it passed 20 times in a row.` },
  { id: 'H14-docker-ask', truth: 'speak', mustSay: ['docker'], raw: `I wasn't able to run the integration tests because Docker isn't running on this machine. Can you start Docker Desktop?` },
  { id: 'H15-zero-failures', truth: 'silent', raw: `Migration ran: 3 tables created, 0 errors, 0 failures.` },
  { id: 'H16-couldnt-push', truth: 'speak', mustSay: ['push'], raw: `Couldn't push: \`remote: Permission to org/repo.git denied to someone\`.` },
  { id: 'H17-tests-failed-count', truth: 'speak', mustSay: ['2 failed'], raw: `Tests: 98 passed, 2 failed.` },
  { id: 'H18-potential-conflict', truth: 'silent', raw: `There's a potential conflict between the two \`useEffect\` hooks, but I ordered them so it's safe.` },
  { id: 'H19-q-then-code-then-prose', truth: 'speak', mustSay: ['keep this'], raw: `I found this workaround in \`legacy/compat.js\`. Should I keep this?

\`\`\`js
if (window.attachEvent) { window.attachEvent('onload', init); }
\`\`\`

It only matters for IE11. Our analytics show no IE11 traffic. Removing it saves 2 KB. It also removes the last \`attachEvent\` call. The rest of the file is fine. I left it untouched.` },
  { id: 'H20-ready-to-merge', truth: 'speak', mustSay: ['merge'], raw: `All checks are green on PR #482 and the reviewer's comments are addressed. Ready to merge?` },
  { id: 'H21-wait-on-you', truth: 'speak', mustSay: ['api key'], raw: `I've stubbed the client. I'll need an API key for the sandbox before I can test the webhook flow.` },
  { id: 'H22-soft-offer-tests', truth: 'soft', raw: `The CSV export works for all three report types. Should I also add an XLSX export?` },
];
