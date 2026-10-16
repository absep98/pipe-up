'use strict';
// Third set, written after the final patch, not used for tuning.
module.exports = [
  { id: 'F01', truth: 'silent', raw: `Bumped \`eslint\` to 9.12.0 and migrated to flat config (\`eslint.config.js\`). The old \`.eslintrc\` is deleted. Lint passes with 0 warnings.` },
  { id: 'F02', truth: 'speak', mustSay: ['staging'], raw: `The deploy to staging failed at the health-check step: the container exits after 3 s with \`Error: listen EADDRINUSE: address already in use :::8080\`.` },
  { id: 'F03', truth: 'speak', mustSay: ['squash'], raw: `Rebase is done and the branch is up to date with main. Do you want me to squash the 14 commits into one, or keep the history as is?` },
  { id: 'F04', truth: 'silent', raw: `Explained in the PR description why the old cache couldn't handle concurrent writes; the new one uses a mutex per key.` },
  { id: 'F05', truth: 'speak', mustSay: ['api key'], raw: `I'm stuck on the Maps integration: the API key in \`.env\` is rejected with 403, and I don't have a valid one.` },
  { id: 'F06', truth: 'silent', raw: `Wrote a migration guide covering what fails when you skip step 2, e.g. the \`users.email\` index can't be built on duplicate rows.` },
  { id: 'F07', truth: 'speak', mustSay: ['which'], raw: `Two of the 5 endpoints share the same handler name.

- \`GET /orders\` uses \`listHandler\`
- \`GET /invoices\` uses \`listHandler\`

Which name should each one get?` },
  { id: 'F08', truth: 'silent', raw: `Profiled the import: 2.8 s was spent in \`JSON.parse\`, so I switched to streaming with \`stream-json\`. It now takes 0.4 s.` },
  { id: 'F09', truth: 'speak', mustSay: ['docker'], raw: `Docker isn't running, so I can't start the Postgres container for the integration tests.` },
  { id: 'F10', truth: 'speak', mustSay: ['typecheck'], raw: `Implemented the feature and the unit tests pass. However, \`npm run typecheck\` reports 12 errors in files I didn't touch, so I haven't committed yet. How do you want to handle those?` },
  { id: 'F11', truth: 'silent', raw: `Q: why does the hook run twice? A: React 18 StrictMode double-invokes effects in development only. Nothing to change.` },
  { id: 'F12', truth: 'speak', mustSay: ['credentials'], raw: `Waiting on you for the AWS credentials; everything else is ready.` },
];
