'use strict';

// TTS backends, ported out of the Markdown TTS extension's VS Code shell.
//
// The streaming/chunking machinery from that extension is deliberately left
// behind: it exists to keep long documents responsive inside a long-lived
// editor process. Here we speak 30-60 words from a short-lived hook, so a
// single generate-then-play pass is both simpler and more reliable.

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP_DIR = path.join(os.tmpdir(), 'earshot');
const LOCK_FILE = path.join(TMP_DIR, 'speaking.pid');

function ensureTmp() {
  try { fs.mkdirSync(TMP_DIR, { recursive: true }); } catch (_) { /* exists */ }
}

// Set while an audio file is on disk so the signal handler can remove it —
// being SIGTERM'd mid-playback skips the finally block that normally cleans up.
let currentAudioPath = null;

function cleanupAudio() {
  if (!currentAudioPath) return;
  try { fs.unlinkSync(currentAudioPath); } catch (_) { /* may be locked; sweep gets it */ }
  currentAudioPath = null;
}

/** Remove audio orphaned by killed players. Cheap, and bounds the temp dir. */
function sweepStale(maxAgeMs = 5 * 60 * 1000) {
  ensureTmp();
  let names;
  try { names = fs.readdirSync(TMP_DIR); } catch (_) { return; }
  const now = Date.now();
  for (const name of names) {
    if (!name.endsWith('.mp3') && !name.endsWith('.json')) continue;
    const file = path.join(TMP_DIR, name);
    try {
      if (now - fs.statSync(file).mtimeMs > maxAgeMs) fs.unlinkSync(file);
    } catch (_) { /* in use or already gone */ }
  }
}

function escapePs(value) {
  return String(value).replace(/'/g, "''");
}

/**
 * Stop whatever is currently being spoken. A new response should interrupt the
 * old one rather than queue behind it — stale narration is worse than none.
 */
function stopCurrent() {
  ensureTmp();
  let pid;
  try { pid = parseInt(fs.readFileSync(LOCK_FILE, 'utf8').trim(), 10); } catch (_) { return false; }
  if (!pid || Number.isNaN(pid) || pid === process.pid) return false;

  try {
    process.kill(pid, 'SIGTERM');
  } catch (_) {
    // Already gone. Windows won't always let us signal, so fall back to taskkill.
    if (process.platform === 'win32') {
      try {
        spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', detached: true, windowsHide: true }).unref();
      } catch (_) { /* best effort */ }
    }
  }
  try { fs.unlinkSync(LOCK_FILE); } catch (_) { /* ignore */ }
  return true;
}

function claimLock() {
  ensureTmp();
  try { fs.writeFileSync(LOCK_FILE, String(process.pid), 'utf8'); } catch (_) { /* ignore */ }
}

function releaseLock() {
  try {
    const pid = parseInt(fs.readFileSync(LOCK_FILE, 'utf8').trim(), 10);
    if (pid === process.pid) fs.unlinkSync(LOCK_FILE);
  } catch (_) { /* ignore */ }
}

function runToCompletion(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    // windowsHide is the fix for a real bug: without it, every powershell.exe
    // child (SAPI speech, edge-tts playback) popped a visible console window
    // on Windows, once per spoken response.
    const child = spawn(cmd, args, { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true, ...opts });
    let stderr = '';
    child.stderr?.on('data', (c) => { stderr += c.toString(); });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (signal) return resolve({ interrupted: true });
      if (code !== 0) return reject(new Error(stderr.trim().split('\n')[0] || `exit ${code}`));
      resolve({ interrupted: false });
    });
    if (opts.stdinText != null) {
      child.stdin.write(opts.stdinText);
      child.stdin.end();
    } else {
      child.stdin?.end();
    }
  });
}

/** Windows SAPI. No network, no dependencies — the reliable floor. */
async function speakSapi(text, cfg) {
  const script = `
$ErrorActionPreference = 'Stop';
Add-Type -AssemblyName System.Speech | Out-Null;
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer;
$synth.Rate = ${Number.isInteger(cfg.rate) ? cfg.rate : 2};
${cfg.voice ? `try { $synth.SelectVoice('${escapePs(cfg.voice)}'); } catch { }` : ''}
$text = [Console]::In.ReadToEnd();
if ($text.Trim()) { $synth.Speak($text); }
$synth.Dispose();
`;
  return runToCompletion(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { stdinText: text }
  );
}

/** macOS / Linux fallbacks. */
async function speakSay(text, cfg) {
  const wpm = 175 + (cfg.rate ?? 2) * 17;
  const args = ['-r', String(wpm)];
  if (cfg.voice) args.push('-v', cfg.voice);
  return runToCompletion('say', args, { stdinText: text });
}

/**
 * Edge neural voices. Much better output, but needs the network and the
 * node-edge-tts package — so every failure path here falls back to SAPI.
 */
async function speakEdge(text, cfg) {
  let EdgeTTS;
  try {
    ({ EdgeTTS } = require('node-edge-tts'));
  } catch (_) {
    return { fellBack: 'node-edge-tts not installed' };
  }

  ensureTmp();
  const audioPath = path.join(TMP_DIR, `speech-${process.pid}-${Date.now()}.mp3`);
  currentAudioPath = audioPath;
  // node-edge-tts wants a percentage string; the config uses the SAPI -10..10 scale.
  const ratePct = `${(cfg.rate ?? 2) >= 0 ? '+' : ''}${Math.round((cfg.rate ?? 2) * 10)}%`;

  try {
    const tts = new EdgeTTS({ voice: cfg.edgeVoice || 'en-US-AriaNeural', rate: ratePct });
    await tts.ttsPromise(text, audioPath);
  } catch (err) {
    try { fs.unlinkSync(audioPath); } catch (_) { /* ignore */ }
    return { fellBack: `edge-tts generation failed: ${err.message}` };
  }

  try {
    if (process.platform === 'darwin') {
      await runToCompletion('afplay', [audioPath]);
    } else if (process.platform === 'win32') {
      const script = `
$ErrorActionPreference = 'Stop';
Add-Type -AssemblyName PresentationCore | Out-Null;
$player = New-Object System.Windows.Media.MediaPlayer;
$player.Open([Uri]::new('${escapePs(audioPath)}'));
Start-Sleep -Milliseconds 400;
$player.Play();
while ($player.NaturalDuration.HasTimeSpan -eq $false) { Start-Sleep -Milliseconds 50 }
$dur = $player.NaturalDuration.TimeSpan.TotalMilliseconds;
Start-Sleep -Milliseconds ([int]$dur + 300);
$player.Stop(); $player.Close();
`;
      await runToCompletion('powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script]);
    } else {
      await runToCompletion('ffplay', ['-nodisp', '-autoexit', '-loglevel', 'quiet', audioPath]);
    }
  } catch (err) {
    return { fellBack: `playback failed: ${err.message}` };
  } finally {
    cleanupAudio();
  }

  return { fellBack: null };
}

/**
 * Speak text in the current process, blocking until done. Used by the detached
 * player, never by a hook directly — see enqueue().
 */
async function speakBlocking(text, cfg = {}) {
  if (!text || !text.trim()) return;
  claimLock();
  const onSignal = () => { cleanupAudio(); releaseLock(); process.exit(0); };
  process.on('SIGTERM', onSignal);
  process.on('SIGINT', onSignal);

  try {
    const engine = cfg.engine || 'edge';
    if (engine === 'edge' && process.platform !== 'linux') {
      const { fellBack } = await speakEdge(text, cfg);
      if (!fellBack) return;
      if (process.env.EARSHOT_DEBUG) console.error(`earshot: ${fellBack}; falling back`);
    }
    if (process.platform === 'win32') await speakSapi(text, cfg);
    else await speakSay(text, cfg);
  } finally {
    releaseLock();
  }
}

/**
 * Hand the text to a detached background process and return immediately.
 *
 * This is the one hard requirement a hook adds over the editor extension: the
 * hook must exit in milliseconds or it stalls the user's terminal for as long
 * as the audio plays.
 */
function enqueue(text, cfg = {}) {
  if (!text || !text.trim()) return false;
  ensureTmp();
  sweepStale();
  stopCurrent();

  const payload = path.join(TMP_DIR, `say-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`);
  fs.writeFileSync(payload, JSON.stringify({ text, cfg }), 'utf8');

  const child = spawn(process.execPath, [path.join(__dirname, 'player.js'), payload], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });
  child.unref();
  return true;
}

module.exports = { enqueue, speakBlocking, stopCurrent, TMP_DIR, LOCK_FILE };
