'use strict';

// Detached speech process. Started by speak.enqueue() so the hook itself can
// exit immediately; killed by the next enqueue() so new narration interrupts old.

const fs = require('fs');
const { speakBlocking } = require('./speak');

async function main() {
  const payloadPath = process.argv[2];
  if (!payloadPath) process.exit(1);

  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
  } catch (_) {
    process.exit(1);
  } finally {
    try { fs.unlinkSync(payloadPath); } catch (_) { /* ignore */ }
  }

  try {
    await speakBlocking(payload.text, payload.cfg);
  } catch (err) {
    if (process.env.EARSHOT_DEBUG) console.error(`earshot player: ${err.message}`);
  }
}

main();
