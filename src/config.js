'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const CONFIG_PATH = path.join(os.homedir(), '.earshot.json');

const DEFAULTS = {
  // "always"  - narrate every response
  // "smart"   - narrate only when the agent is stuck, failed, or asking (default)
  // "off"     - stay silent; Notification alerts still fire
  mode: 'smart',

  // 'edge' (neural, needs network + node-edge-tts) falls back to the OS voice.
  engine: 'edge',
  edgeVoice: 'en-US-AriaNeural',
  voice: '',        // OS voice name; empty = system default
  rate: 2,          // SAPI scale, -10..10

  maxWords: 60,
  describeCode: true,

  // Spoken when Claude Code needs a decision from you.
  alerts: true
};

function load() {
  let user = {};
  try {
    user = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (_) { /* no config yet; defaults are fine */ }
  return { ...DEFAULTS, ...user };
}

module.exports = { load, DEFAULTS, CONFIG_PATH };
