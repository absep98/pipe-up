#!/usr/bin/env node
'use strict';

// CLI and hook entry point.
//
//   pipe-up stop        Stop hook          (stdin: hook JSON)
//   pipe-up notify      Notification hook  (stdin: hook JSON)
//   pipe-up doctor      check the whole path; add --speak to hear a test phrase
//   pipe-up mode [m]    show or set the mode: smart, always, off
//   pipe-up preview     print what WOULD be spoken, say nothing
//   pipe-up say         speak stdin or argv, for testing
//   pipe-up sessions    which Claude Code sessions pipe-up knows about
//   pipe-up log [n]     the last n decisions
//   pipe-up silence     stop everything being spoken or queued

// Registered before anything else loads: a hook that fails for ANY reason, even a
// module that cannot load, must exit 0. Exit code 2 would block Claude from stopping.
const isHook = ['stop', 'notify'].includes(process.argv[2]);
if (isHook) process.on('uncaughtException', () => process.exit(0));

const { env } = require('../src/env');
const fs = require('fs');

const { toSpokenText, smartSummary } = require('../src/filter');
const { enqueue, stopAll, listActive } = require('../src/speak');
const sessions = require('../src/sessions');
const alerts = require('../src/alerts');
const config = require('../src/config');
const log = require('../src/log');
const { describe, runDoctor } = require('../src/doctor');

// Responses are summarised from one end only. A huge message must not cost the hook
// its 10-second budget: the ask is at the end, the gist is at the start.
const MAX_CHARS = 30000;

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (_) {
    return '';
  }
}

function parseHookInput() {
  const raw = readStdin();
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

const words = (s) => s.split(/\s+/).filter(Boolean).length;
const windowOf = (cfg) => ({ windowMs: Math.max(1, Number(cfg.sessionWindowMinutes) || 120) * 60 * 1000 });

/**
 * What to say for a response, given the mode.
 *   always            -> a short summary of every response
 *   smart + precise   -> only the question or failure, and only when there is one
 *   smart + summary   -> a short summary, but only when there is a question or failure
 */
function narrationFor(message, cfg) {
  const head = message.length > MAX_CHARS ? message.slice(0, MAX_CHARS) : message;
  const summary = () => toSpokenText(head, { maxWords: cfg.maxWords, describeCode: cfg.describeCode });

  if (cfg.mode === 'always') {
    const { text } = summary();
    return { speak: Boolean(text), kind: 'summary', text, reason: 'always' };
  }

  const smart = smartSummary(message);   // reads the tail of a long message itself
  if (!smart.speak) return smart;
  if (cfg.smartStyle === 'summary') return { ...smart, text: summary().text };
  return smart;
}

/**
 * Stop hook. Must exit 0 fast and must never exit 2: exit 2 blocks Claude from
 * stopping, which would turn a narration bug into a runaway session.
 */
function cmdStop() {
  const started = Date.now();
  const cfg = config.load();
  if (cfg.mode === 'off') {
    log.log({ hook: 'stop', mode: 'off', speak: false, reason: 'mode is off' });
    return 0;
  }

  const input = parseHookInput();
  // Note this session even when it stays silent, so the active count is right.
  const info = sessions.touch(input.session_id, input.cwd, windowOf(cfg));

  const message = typeof input.last_assistant_message === 'string' ? input.last_assistant_message : '';
  if (!message.trim()) {
    log.log({ hook: 'stop', mode: cfg.mode, speak: false, reason: 'no message', session: info.label });
    return 0;
  }

  const verdict = narrationFor(message, cfg);
  const entry = {
    hook: 'stop', mode: cfg.mode, style: cfg.smartStyle, speak: Boolean(verdict.speak && verdict.text),
    kind: verdict.kind, reason: verdict.reason, chars: message.length, session: info.label
  };

  if (entry.speak) {
    // With several sessions open, say which one is talking.
    const spoken = info.label && alerts.shouldLabel(cfg, info.count) ? `${info.label}. ${verdict.text}` : verdict.text;
    entry.words = words(spoken);
    if (!enqueue(spoken, cfg, { kind: 'narration', session: input.session_id })) {
      entry.speak = false;
      entry.reason = 'could not start speech';
    }
  }
  log.log({ ...entry, ms: Date.now() - started });
  return 0;
}

/**
 * Notification hook. This is the silence-by-default feature: Claude Code tells
 * us directly when a human is needed, so we don't have to infer it.
 *
 * Alerts use the system voice, are short, and are never dropped.
 */
function cmdNotify() {
  const started = Date.now();
  const cfg = config.load();
  const input = parseHookInput();
  const type = input.notification_type;

  if (!cfg.alerts) {
    log.log({ hook: 'notify', type, speak: false, reason: 'alerts are off' });
    return 0;
  }

  const info = sessions.touch(input.session_id, input.cwd, windowOf(cfg));
  if (!alerts.shouldAlert(type, cfg, info.count)) {
    log.log({ hook: 'notify', type, speak: false, reason: 'not announced', session: info.label, ms: Date.now() - started });
    return 0;
  }

  const label = info.label && alerts.shouldLabel(cfg, info.count) ? info.label : '';
  const text = alerts.alertText(type, label);
  const ok = text ? enqueue(text, { ...cfg, maxWords: 20 }, { kind: 'alert', session: input.session_id }) : false;
  log.log({ hook: 'notify', type, speak: ok, kind: 'alert', reason: ok ? 'alert' : 'could not start speech', session: info.label, ms: Date.now() - started });
  return 0;
}

function cmdSay(args) {
  const cfg = config.load();
  const raw = args.length ? args.join(' ') : readStdin();
  const { text } = toSpokenText(raw, { maxWords: cfg.maxWords, describeCode: cfg.describeCode });
  if (!text) {
    console.error('pipe-up: nothing speakable in that input.');
    return 1;
  }
  console.log(text);
  enqueue(text, cfg);
  return 0;
}

function cmdPreview(args) {
  const { cfg, warnings } = config.loadChecked();
  const raw = args.length ? args.join(' ') : readStdin();
  const { stats } = toSpokenText(raw, { maxWords: cfg.maxWords, describeCode: cfg.describeCode });
  const verdict = narrationFor(raw, cfg);

  console.log(`mode:    ${cfg.mode}${cfg.mode === 'smart' ? ` (${cfg.smartStyle})` : ''}`);
  console.log(`speaks:  ${verdict.speak ? 'yes' : 'no'}  (${verdict.reason})`);
  console.log(`in:      ${stats.originalChars} chars`);
  console.log(`out:     ${words(verdict.text)} words`);
  console.log(`dropped: ${stats.codeBlocks} code block(s), ${stats.codeLines} lines${stats.tables ? ', 1 table' : ''}`);
  warnings.forEach((w) => console.log(`warning: ${w}`));
  console.log('---');
  console.log(verdict.speak ? verdict.text : '(silence)');
  return 0;
}

/** Show or change the mode without editing JSON by hand. */
function cmdMode(args) {
  const wanted = (args[0] || '').trim().toLowerCase();
  if (!wanted) {
    console.log(`mode: ${config.load().mode}   (smart | always | off)   file: ${config.CONFIG_PATH}`);
    return 0;
  }
  if (!['smart', 'always', 'off'].includes(wanted)) {
    console.error('pipe-up: mode must be smart, always or off.');
    return 1;
  }

  let current = {};
  if (fs.existsSync(config.CONFIG_PATH)) {
    try {
      current = JSON.parse(fs.readFileSync(config.CONFIG_PATH, 'utf8'));
    } catch (err) {
      console.error(`pipe-up: ${config.CONFIG_PATH} is not valid JSON (${err.message}). Fix it first; I will not overwrite it.`);
      return 1;
    }
  }
  fs.writeFileSync(config.CONFIG_PATH, `${JSON.stringify({ ...current, mode: wanted }, null, 2)}\n`, 'utf8');
  console.log(`mode is now "${wanted}".`);
  return 0;
}

function cmdSessions() {
  const cfg = config.load();
  const now = Date.now();
  const entries = sessions.readEntries();
  const { count, labels } = sessions.computeLabels(entries, now, windowOf(cfg).windowMs);

  console.log(`active sessions: ${count}  (window ${cfg.sessionWindowMinutes} min, label: ${cfg.label})`);
  for (const [id, label] of Object.entries(labels)) {
    const mins = Math.round((now - entries[id].lastSeen) / 60000);
    console.log(`  ${label.padEnd(30)} last seen ${mins} min ago   (${id.slice(0, 8)})`);
  }
  console.log(`speech queued or playing: ${listActive().length}`);
  return 0;
}

function cmdLog(args) {
  const n = Math.max(1, Math.min(150, Number(args[0]) || 20));
  const entries = log.tail(n);
  if (!entries.length) console.log('(no decisions logged yet)');
  entries.forEach((e) => console.log(`${(e.t || '').replace('T', ' ').slice(0, 19)}  ${describe(e)}`));
  return 0;
}

function usage() {
  console.log(`pipe-up: hear what your coding agent did, without reading it.

  pipe-up doctor [--speak]   check everything; why is it silent?
  pipe-up mode [smart|always|off]
  pipe-up preview [text]     show what would be spoken (reads stdin if no text)
  pipe-up say [text]         speak it now, for testing
  pipe-up sessions           which Claude Code sessions are active
  pipe-up log [n]            the last n decisions
  pipe-up silence            stop everything being spoken or queued
  pipe-up stop | notify      hook entry points (called by Claude Code)

Config: ${config.CONFIG_PATH}`);
  return 0;
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  switch (cmd) {
    case 'stop': return cmdStop();
    case 'notify': return cmdNotify();
    case 'doctor': return runDoctor({ speak: args.includes('--speak') });
    case 'mode': return cmdMode(args);
    case 'say': return cmdSay(args);
    case 'preview': return cmdPreview(args);
    case 'sessions': return cmdSessions();
    case 'log': return cmdLog(args);
    case 'silence': stopAll(); return 0;
    default: return usage();
  }
}

// A narration bug must never break someone's Claude Code session: on the hook
// paths swallow everything and exit 0.
Promise.resolve()
  .then(main)
  .then((code) => { process.exitCode = isHook ? 0 : code; })
  .catch((err) => {
    if (env('DEBUG') || !isHook) console.error(`pipe-up: ${err.message}`);
    process.exitCode = isHook ? 0 : 1;
  });
