'use strict';

// A small local decision log: why earshot spoke, or why it stayed silent.
//
// Silence is earshot's default, which makes "why didn't it say anything?" the
// question every user will ask. Each hook and player run appends one line here.
// Entries never contain response text, only the decision and its reason.

const fs = require('fs');
const path = require('path');

const { runDir } = require('./dirs');

const MAX_BYTES = 64 * 1024;
const KEEP_LINES = 150;

function logFile() {
  return path.join(runDir(), 'earshot.log');
}

/** Append one entry. Never throws: diagnostics must not break a hook. */
function log(entry) {
  try {
    const file = logFile();
    fs.appendFileSync(file, `${JSON.stringify({ t: new Date().toISOString(), ...entry })}\n`, 'utf8');
    if (fs.statSync(file).size > MAX_BYTES) {
      const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
      fs.writeFileSync(file, `${lines.slice(-KEEP_LINES).join('\n')}\n`, 'utf8');
    }
  } catch (_) { /* best effort */ }
}

/** The last n entries, oldest first. */
function tail(n = 10) {
  try {
    return fs.readFileSync(logFile(), 'utf8')
      .split('\n').filter(Boolean).slice(-n)
      .map((line) => { try { return JSON.parse(line); } catch (_) { return { raw: line }; } });
  } catch (_) {
    return [];
  }
}

module.exports = { log, tail, logFile };
