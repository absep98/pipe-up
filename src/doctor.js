'use strict';

// `pipe-up doctor`: answer "why is it silent?" without guessing.
//
// Pipe Up's default is to say nothing, so the first question every user has is
// whether it is working. This checks the whole path and shows the last decisions.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const config = require('./config');
const { runDir } = require('./dirs');
const log = require('./log');
const sessions = require('./sessions');

const OK = '[ok]  ';
const WARN = '[warn]';
const BAD = '[FAIL]';

function sh(cmd, args, timeout = 10000) {
  return spawnSync(cmd, args, { encoding: 'utf8', timeout, windowsHide: true });
}

function speechEngine() {
  if (process.platform === 'win32') {
    const r = sh('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      '$ExecutionContext.SessionState.LanguageMode; Add-Type -AssemblyName System.Speech; ' +
      '(New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices().Count']);
    if (r.error || r.status !== 0) {
      return [BAD, `Windows speech is not available: ${(r.error && r.error.message) || (r.stderr || '').trim().split('\n')[0] || `exit ${r.status}`}`];
    }
    const [mode, count] = r.stdout.trim().split(/\r?\n/);
    if (mode && mode !== 'FullLanguage') {
      return [WARN, `PowerShell is in ${mode} mode (a corporate policy?). Speech may be blocked.`];
    }
    return [OK, `Windows speech (SAPI): ${count} voice(s) installed, PowerShell ${mode}`];
  }
  if (process.platform === 'darwin') {
    const r = sh('say', ['-v', '?']);
    if (r.error || r.status !== 0) return [BAD, 'macOS `say` is not available'];
    return [OK, `macOS say: ${r.stdout.trim().split('\n').length} voice(s) (untested by the author)`];
  }
  for (const cmd of ['spd-say', 'espeak-ng']) {
    const r = sh(cmd, ['--version'], 4000);
    if (!r.error) return [WARN, `Linux: ${cmd} found. Linux is untested.`];
  }
  return [BAD, 'No speech command found. Install speech-dispatcher (spd-say) or espeak-ng.'];
}

function runDirCheck() {
  try {
    const dir = runDir();
    const probe = path.join(dir, `.probe-${process.pid}`);
    fs.writeFileSync(probe, 'x');
    fs.unlinkSync(probe);
    return [OK, `Working folder is writable: ${dir}`];
  } catch (err) {
    return [BAD, `Cannot use the working folder: ${err.message}`];
  }
}

function describe(entry) {
  if (entry.hook === 'player') {
    return `speech ${entry.ok ? 'finished' : 'FAILED'}${entry.error ? ` (${entry.error})` : ''}${entry.outcome && entry.outcome !== 'spoke' ? ` [${entry.outcome}]` : ''}`;
  }
  if (entry.hook === 'enqueue') return `could not start speech: ${entry.error}`;
  const what = entry.speak ? `SPOKE ${entry.kind || ''}`.trim() : 'stayed silent';
  return `${entry.hook}: ${what} (${entry.reason})${entry.session ? ` [${entry.session}]` : ''}`;
}

/**
 * @param {{speak?: boolean}} opts
 * @returns {Promise<number>} exit code
 */
async function runDoctor(opts = {}) {
  const lines = [];
  const add = (tag, text) => lines.push(`${tag} ${text}`);

  const major = Number(process.versions.node.split('.')[0]);
  add(major >= 18 ? OK : BAD, `Node ${process.versions.node}${major >= 18 ? '' : ' (18 or newer is required)'}`);
  add(...speechEngine());
  add(...runDirCheck());

  const { cfg, warnings, exists } = config.loadChecked();
  add(OK, `Config: ${config.CONFIG_PATH} ${exists ? '' : '(not created yet, using defaults) '}| mode=${cfg.mode}, smartStyle=${cfg.smartStyle}, label=${cfg.label}, alerts=${cfg.alerts}`);
  warnings.forEach((w) => add(WARN, `Config: ${w}`));
  if (config.usingLegacy) add(WARN, `Settings are still in the old file ${config.CONFIG_PATH} (from when this plugin was called earshot). It works, and you can rename it to ${config.NEW_PATH}.`);
  if (cfg.mode === 'off') add(WARN, 'mode is "off": responses will not be spoken (alerts still are). Run `pipe-up mode smart` to turn it back on.');

  try {
    const entries = sessions.readEntries();
    const { count } = sessions.computeLabels(entries, Date.now(), cfg.sessionWindowMinutes * 60 * 1000);
    add(OK, `Active Claude Code sessions: ${count}`);
  } catch (err) {
    add(WARN, `Session registry unreadable: ${err.message}`);
  }

  if (opts.speak) {
    const { speakBlocking } = require('./speak');
    const r = await speakBlocking('Pipe Up is working.', cfg);
    add(r.ok ? OK : BAD, r.ok ? 'Test phrase spoken. Did you hear it?' : `Speaking failed: ${r.error}`);
  } else {
    add(OK, 'Run `pipe-up doctor --speak` to hear a test phrase.');
  }

  console.log(lines.join('\n'));
  const recent = log.tail(8);
  console.log('\nRecent decisions (newest last):');
  if (!recent.length) console.log('  (none yet: nothing has fired since install, or the log was cleared)');
  recent.forEach((e) => console.log(`  ${(e.t || '').slice(11, 19)}  ${describe(e)}`));

  return lines.some((l) => l.startsWith(BAD)) ? 1 : 0;
}

module.exports = { runDoctor, describe };
