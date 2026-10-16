'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

// EARSHOT_CONFIG lets tests and scripts point at a throwaway config file.
const CONFIG_PATH = process.env.EARSHOT_CONFIG || path.join(os.homedir(), '.earshot.json');

const DEFAULTS = {
  // "always"  - narrate every response
  // "smart"   - narrate only when the agent is stuck, failed, or asking (default)
  // "off"     - stay silent; Notification alerts still fire
  mode: 'smart',

  // What "smart" says when it does speak.
  //   "precise" - just the question, or just the sentence reporting the failure (default)
  //   "summary" - a short summary of the whole response, but still only when there
  //               is a question or failure
  smartStyle: 'precise',

  voice: '',        // OS voice name; empty = system default
  rate: 2,          // -10 (slowest) .. 10 (fastest)

  maxWords: 60,
  describeCode: true,

  // Spoken when Claude Code needs a decision from you.
  alerts: true,

  // With several Claude Code sessions open, say which one is speaking.
  //   "auto"   - name the session only while 2+ sessions are active (default)
  //   "always" - always name the session
  //   "never"  - never name the session
  label: 'auto',

  // "Claude is waiting for you" when a session sits idle.
  //   "auto"   - only while 2+ sessions are active (you are not watching them all)
  //   "always" / "never"
  idleAlerts: 'auto',

  // A session counts as active if a hook fired for it within this many minutes.
  sessionWindowMinutes: 120
};

const ENUMS = {
  mode: ['smart', 'always', 'off'],
  smartStyle: ['precise', 'summary'],
  label: ['auto', 'always', 'never'],
  idleAlerts: ['auto', 'always', 'never']
};

const BOOLEANS = ['alerts', 'describeCode'];

const INTEGERS = {
  rate: [-10, 10],
  maxWords: [5, 200],
  sessionWindowMinutes: [1, 24 * 60]
};

// Settings from versions that used an online voice. Say so, rather than silently
// ignoring them: someone who set these may expect the neural voice back.
const REMOVED = ['engine', 'edgeVoice'];

/**
 * Turn whatever is in the config file into safe settings, and say what was wrong.
 * A typo must never produce the opposite of what the user meant, so values are
 * trimmed and lower-cased, and anything unusable falls back to the default with a
 * warning that `earshot doctor` shows.
 */
function normalize(user) {
  const cfg = { ...DEFAULTS };
  const warnings = [];

  if (!user || typeof user !== 'object' || Array.isArray(user)) {
    warnings.push('the config file is not a JSON object; using defaults');
    return { cfg, warnings };
  }

  for (const [key, raw] of Object.entries(user)) {
    if (REMOVED.includes(key)) {
      warnings.push(`"${key}" is no longer used: earshot has been offline-only since 0.3.0 and always uses your system voice`);
    } else if (key in ENUMS) {
      const v = typeof raw === 'string' ? raw.trim().toLowerCase() : raw;
      if (ENUMS[key].includes(v)) cfg[key] = v;
      else warnings.push(`"${key}" must be one of ${ENUMS[key].join(', ')} (got ${JSON.stringify(raw)}); using "${DEFAULTS[key]}"`);
    } else if (BOOLEANS.includes(key)) {
      const v = typeof raw === 'string' ? raw.trim().toLowerCase() : raw;
      if (v === true || v === 'true') cfg[key] = true;
      else if (v === false || v === 'false') cfg[key] = false;
      else warnings.push(`"${key}" must be true or false (got ${JSON.stringify(raw)}); using ${DEFAULTS[key]}`);
    } else if (key in INTEGERS) {
      const [lo, hi] = INTEGERS[key];
      const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
      if (typeof n === 'number' && Number.isFinite(n)) {
        const clamped = Math.min(hi, Math.max(lo, Math.round(n)));
        if (clamped !== n) warnings.push(`"${key}" ${JSON.stringify(raw)} is outside ${lo}..${hi}; using ${clamped}`);
        cfg[key] = clamped;
      } else {
        warnings.push(`"${key}" must be a number (got ${JSON.stringify(raw)}); using ${DEFAULTS[key]}`);
      }
    } else if (key === 'voice') {
      cfg.voice = typeof raw === 'string' ? raw.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 120) : '';
    } else {
      warnings.push(`unknown setting "${key}" (ignored)`);
    }
  }
  return { cfg, warnings };
}

/** Settings plus anything wrong with them. Never throws. */
function loadChecked() {
  let text;
  try {
    text = fs.readFileSync(CONFIG_PATH, 'utf8');
  } catch (_) {
    return { cfg: { ...DEFAULTS }, warnings: [], exists: false };
  }

  let user;
  try {
    user = JSON.parse(text);
  } catch (err) {
    return {
      cfg: { ...DEFAULTS },
      warnings: [`${CONFIG_PATH} is not valid JSON (${err.message}); using defaults`],
      exists: true
    };
  }
  return { ...normalize(user), exists: true };
}

function load() {
  return loadChecked().cfg;
}

module.exports = { load, loadChecked, normalize, DEFAULTS, CONFIG_PATH };
