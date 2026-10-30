'use strict';

// Environment overrides for tests and scripts, read by explicit name. They were
// EARSHOT_* before the plugin was renamed; the old names still work so old scripts
// keep working. Nothing is looked up by a computed name.
const pick = (a, b) => (a !== undefined && a !== '' ? a : b);

const readers = {
  TMP_DIR: () => pick(process.env.PIPE_UP_TMP_DIR, process.env.EARSHOT_TMP_DIR),
  CONFIG: () => pick(process.env.PIPE_UP_CONFIG, process.env.EARSHOT_CONFIG),
  DRY_RUN: () => pick(process.env.PIPE_UP_DRY_RUN, process.env.EARSHOT_DRY_RUN),
  DEBUG: () => pick(process.env.PIPE_UP_DEBUG, process.env.EARSHOT_DEBUG)
};

function env(name) {
  const read = readers[name];
  return read ? read() : undefined;
}

module.exports = { env };
