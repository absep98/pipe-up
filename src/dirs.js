'use strict';

// Where earshot keeps its queue files, session registry and decision log.
//
// One directory per user, created private (mode 0700). On a shared machine
// /tmp is world-writable, so on POSIX we also refuse to use a directory that
// someone else created first: files in it are read back and, for queue markers,
// used to decide which process to stop.

const fs = require('fs');
const os = require('os');
const path = require('path');

let cached = null;

function userName() {
  try { return os.userInfo().username; } catch (_) { return 'user'; }
}

function runDir() {
  if (cached) return cached;

  const dir = process.env.EARSHOT_TMP_DIR ||
    path.join(os.tmpdir(), `earshot-${userName().replace(/[^A-Za-z0-9_.-]/g, '_')}`);

  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

  if (process.platform !== 'win32' && typeof process.getuid === 'function') {
    const st = fs.statSync(dir);
    if (st.uid !== process.getuid()) {
      throw new Error(`earshot: ${dir} is owned by another user; refusing to use it`);
    }
  }

  cached = dir;
  return dir;
}

module.exports = { runDir };
