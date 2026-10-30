'use strict';

// Environment overrides for tests and scripts. The names were EARSHOT_* before the
// plugin was renamed; they are still honoured so old scripts keep working.
function env(name) {
  const v = process.env[`PIPE_UP_${name}`];
  return v !== undefined && v !== '' ? v : process.env[`EARSHOT_${name}`];
}

module.exports = { env };
