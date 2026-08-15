#!/usr/bin/env node
'use strict';

// CLI + hook entry point.
//
//   earshot stop      Stop hook         (stdin: hook JSON)
//   earshot notify    Notification hook (stdin: hook JSON)
//   earshot say       speak stdin or argv, for testing
//   earshot preview   print what WOULD be spoken, say nothing
//   earshot install   wire both hooks into ~/.claude/settings.json
//   earshot silence   stop whatever is speaking right now

const fs = require('fs');
const os = require('os');
const path = require('path');

const { toSpokenText, shouldSpeak } = require('../src/filter');
const { enqueue, stopCurrent } = require('../src/speak');
const config = require('../src/config');

const SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');

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
  try { return JSON.parse(raw); } catch (_) { return {}; }
}

/**
 * Stop hook. Must exit 0 fast and must never exit 2 — exit 2 blocks Claude
 * from stopping, which would turn a narration bug into a runaway session.
 */
function cmdStop() {
  const cfg = config.load();
  if (cfg.mode === 'off') return 0;

  const input = parseHookInput();
  const message = input.last_assistant_message || '';
  if (!message.trim()) return 0;

  if (cfg.mode === 'smart') {
    const { speak } = shouldSpeak(message);
    if (!speak) return 0;
  }

  const { text } = toSpokenText(message, {
    maxWords: cfg.maxWords,
    describeCode: cfg.describeCode
  });
  if (text) enqueue(text, cfg);
  return 0;
}

/**
 * Notification hook. This is the silence-by-default feature: Claude Code tells
 * us directly when a human is needed, so we don't have to infer it.
 */
function cmdNotify() {
  const cfg = config.load();
  if (!cfg.alerts) return 0;

  const input = parseHookInput();
  const lines = {
    permission_prompt: 'Claude needs permission to continue.',
    agent_needs_input: 'Claude is waiting on you.',
    idle_prompt: 'Claude is idle.',
    elicitation_dialog: 'Claude is asking you something.'
  };
  const line = lines[input.notification_type];
  if (line) enqueue(line, { ...cfg, maxWords: 20 });
  return 0;
}

function cmdSay(args) {
  const cfg = config.load();
  const raw = args.length ? args.join(' ') : readStdin();
  const { text, stats } = toSpokenText(raw, { maxWords: cfg.maxWords, describeCode: cfg.describeCode });
  if (!text) {
    console.error('earshot: nothing speakable in that input.');
    return 1;
  }
  console.log(text);
  if (process.env.EARSHOT_DEBUG) console.error(JSON.stringify(stats));
  enqueue(text, cfg);
  return 0;
}

function cmdPreview(args) {
  const cfg = config.load();
  const raw = args.length ? args.join(' ') : readStdin();
  const { text, stats } = toSpokenText(raw, { maxWords: cfg.maxWords, describeCode: cfg.describeCode });
  const verdict = shouldSpeak(raw);

  console.log(`mode:    ${cfg.mode}`);
  console.log(`speaks:  ${cfg.mode === 'always' ? 'yes (always)' : verdict.speak ? 'yes' : 'no'}  (${verdict.reason})`);
  console.log(`in:      ${stats.originalChars} chars`);
  console.log(`out:     ${text.split(/\s+/).filter(Boolean).length} words${stats.truncated ? ' (truncated)' : ''}`);
  console.log(`dropped: ${stats.codeBlocks} code block(s), ${stats.codeLines} lines${stats.tables ? ', 1 table' : ''}`);
  console.log('---');
  console.log(text || '(silence)');
  return 0;
}

function cmdInstall() {
  const entry = { type: 'command', command: `node "${path.resolve(__dirname, 'earshot.js')}"`, timeout: 10 };

  let settings = {};
  if (fs.existsSync(SETTINGS_PATH)) {
    try {
      settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    } catch (err) {
      console.error(`earshot: ${SETTINGS_PATH} is not valid JSON — fix it first. (${err.message})`);
      return 1;
    }
    fs.copyFileSync(SETTINGS_PATH, `${SETTINGS_PATH}.earshot-backup`);
    console.log(`Backed up existing settings to ${SETTINGS_PATH}.earshot-backup`);
  } else {
    fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
  }

  // Matcher entries wrap a "hooks" array — a bare {type, command} at the top
  // level is silently ignored by Claude Code, even for matcher-less events
  // like Stop/Notification. Learned this from a live settings.json where the
  // flat shape got installed and simply never fired.
  settings.hooks = settings.hooks || {};
  for (const [event, sub] of [['Stop', 'stop'], ['Notification', 'notify']]) {
    settings.hooks[event] = (settings.hooks[event] || []).filter(
      (matcher) => !(matcher.hooks || []).some((h) => String(h.command || '').includes('earshot'))
    );
    settings.hooks[event].push({ hooks: [{ ...entry, command: `${entry.command} ${sub}` }] });
  }

  fs.writeFileSync(SETTINGS_PATH, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  console.log(`Installed Stop and Notification hooks into ${SETTINGS_PATH}`);
  console.log(`Config lives at ${config.CONFIG_PATH} (mode defaults to "smart").`);
  console.log('Restart Claude Code for the hooks to take effect.');
  return 0;
}

function usage() {
  console.log(`earshot — hear what your coding agent did, without reading it.

  earshot install          wire the Stop + Notification hooks into Claude Code
  earshot preview [text]   show what would be spoken (reads stdin if no text)
  earshot say [text]       speak it now, for testing
  earshot silence          stop current narration
  earshot stop | notify    hook entry points (called by Claude Code)

Config: ${config.CONFIG_PATH}
  mode: "smart" (default) speaks only on questions, failures and blockers
        "always" narrates every response
        "off"    silent, alerts only`);
  return 0;
}

function main() {
  const [cmd, ...args] = process.argv.slice(2);
  switch (cmd) {
    case 'stop': return cmdStop();
    case 'notify': return cmdNotify();
    case 'say': return cmdSay(args);
    case 'preview': return cmdPreview(args);
    case 'silence': stopCurrent(); return 0;
    case 'install': return cmdInstall();
    default: return usage();
  }
}

// A narration bug must never break someone's Claude Code session: swallow
// everything and exit 0 on the hook paths.
try {
  process.exitCode = main();
} catch (err) {
  if (process.env.EARSHOT_DEBUG) console.error(`earshot: ${err.stack}`);
  process.exitCode = 0;
}
