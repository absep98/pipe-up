'use strict';

// What to say, and whether to say it, when Claude Code raises a notification.

const PLAIN = {
  permission_prompt: 'Claude needs permission to continue.',
  agent_needs_input: 'Claude needs your input.',
  idle_prompt: 'Claude is waiting for you.',
  elicitation_dialog: 'Claude is asking you something.'
};

const NAMED = {
  permission_prompt: (n) => `${n} needs permission.`,
  agent_needs_input: (n) => `${n} needs your input.`,
  idle_prompt: (n) => `${n} is waiting for you.`,
  elicitation_dialog: (n) => `${n} is asking you something.`
};

/**
 * @param {string} type   Claude Code's notification_type
 * @param {string} [label] session name; omit for the plain wording
 * @returns {string} '' for a notification type we don't announce
 */
function alertText(type, label) {
  if (label && NAMED[type]) return NAMED[type](label);
  return PLAIN[type] || '';
}

/**
 * Should this notification be spoken?
 *
 * Permission prompts, questions and input requests always are: a human is
 * blocking the agent. An idle session is only worth interrupting for when you
 * have several open and cannot be watching them all.
 */
function shouldAlert(type, cfg, activeCount) {
  if (!PLAIN[type]) return false;
  if (!cfg.alerts) return false;
  if (type !== 'idle_prompt') return true;

  if (cfg.idleAlerts === 'never') return false;
  if (cfg.idleAlerts === 'always') return true;
  return activeCount >= 2; // "auto"
}

/** Name the session in speech? Depends on the `label` setting and how many are open. */
function shouldLabel(cfg, activeCount) {
  if (cfg.label === 'never') return false;
  if (cfg.label === 'always') return true;
  return activeCount >= 2; // "auto"
}

module.exports = { alertText, shouldAlert, shouldLabel, PLAIN };
