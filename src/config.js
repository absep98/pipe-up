'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { env } = require('./env');

// PIPE_UP_CONFIG lets tests and scripts point at a throwaway config file.
//
// The plugin used to be called "earshot" and kept its settings in ~/.earshot.json.
// If that file exists and the new one does not, keep using it, so nobody loses their
// settings in the rename. `doctor` points it out. New settings go wherever the file
// in use lives.
const NEW_PATH = path.join(os.homedir(), '.pipe-up.json');
const LEGACY_PATH = path.join(os.homedir(), '.earshot.json');
const usingLegacy = !env('CONFIG') && !fs.existsSync(NEW_PATH) && fs.existsSync(LEGACY_PATH);
const CONFIG_PATH = env('CONFIG') || (usingLegacy ? LEGACY_PATH : NEW_PATH);

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
 * warning that `pipe-up doctor` shows.
 */
function normalize(user) {
  const cfg = { ...DEFAULTS };
  const warnings = [];

  if (!user || typeof user !== 'object' || Array.isArray(user)) {
    warnings.push('the config file is not a JSON object; using defaults');
    return { cfg, warnings };
  }

  for (const [name, raw] of Object.entries(user)) {
    if (REMOVED.includes(name)) {
      warnings.push(`"${name}" is no longer used: pipe-up has been offline-only since 0.3.0 and always uses your system voice`);
    } else if (name in ENUMS) {
      const v = typeof raw === 'string' ? raw.trim().toLowerCase() : raw;
      if (ENUMS[name].includes(v)) cfg[name] = v;
      else warnings.push(`"${name}" must be one of ${ENUMS[name].join(', ')} (got ${JSON.stringify(raw)}); using "${DEFAULTS[name]}"`);
    } else if (BOOLEANS.includes(name)) {
      const v = typeof raw === 'string' ? raw.trim().toLowerCase() : raw;
      if (v === true || v === 'true') cfg[name] = true;
      else if (v === false || v === 'false') cfg[name] = false;
      else warnings.push(`"${name}" must be true or false (got ${JSON.stringify(raw)}); using ${DEFAULTS[name]}`);
    } else if (name in INTEGERS) {
      const [lo, hi] = INTEGERS[name];
      const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
      if (typeof n === 'number' && Number.isFinite(n)) {
        const clamped = Math.min(hi, Math.max(lo, Math.round(n)));
        if (clamped !== n) warnings.push(`"${name}" ${JSON.stringify(raw)} is outside ${lo}..${hi}; using ${clamped}`);
        cfg[name] = clamped;
      } else {
        warnings.push(`"${name}" must be a number (got ${JSON.stringify(raw)}); using ${DEFAULTS[name]}`);
      }
    } else if (name === 'voice') {
      cfg.voice = typeof raw === 'string' ? raw.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 120) : '';
    } else {
      warnings.push(`unknown setting "${name}" (ignored)`);
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

module.exports = { load, loadChecked, normalize, DEFAULTS, CONFIG_PATH, NEW_PATH, usingLegacy };
