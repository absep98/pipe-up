'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { alertText, shouldAlert, shouldLabel } = require('../src/alerts');
const { DEFAULTS } = require('../src/config');

test('plain wording when no session label is given', () => {
  assert.equal(alertText('permission_prompt'), 'Claude needs permission to continue.');
  assert.equal(alertText('idle_prompt'), 'Claude is waiting for you.');
});

test('the session name replaces "Claude" when there is one', () => {
  assert.equal(alertText('permission_prompt', 'waypoint'), 'waypoint needs permission.');
  assert.equal(alertText('idle_prompt', 'earshot 2'), 'earshot 2 is waiting for you.');
  assert.equal(alertText('elicitation_dialog', 'waypoint'), 'waypoint is asking you something.');
  assert.equal(alertText('agent_needs_input', 'waypoint'), 'waypoint needs your input.');
});

test('notification types we do not announce produce no text', () => {
  assert.equal(alertText('auth_success', 'waypoint'), '');
  assert.equal(alertText(undefined), '');
});

test('permission prompts and questions always speak', () => {
  for (const type of ['permission_prompt', 'elicitation_dialog', 'agent_needs_input']) {
    assert.equal(shouldAlert(type, DEFAULTS, 1), true, type);
    assert.equal(shouldAlert(type, DEFAULTS, 3), true, type);
  }
});

test('an idle session only speaks when several are open (default "auto")', () => {
  assert.equal(shouldAlert('idle_prompt', DEFAULTS, 1), false);
  assert.equal(shouldAlert('idle_prompt', DEFAULTS, 2), true);
});

test('idleAlerts can force idle alerts on or off', () => {
  assert.equal(shouldAlert('idle_prompt', { ...DEFAULTS, idleAlerts: 'always' }, 1), true);
  assert.equal(shouldAlert('idle_prompt', { ...DEFAULTS, idleAlerts: 'never' }, 5), false);
});

test('alerts:false silences everything, and unknown types never speak', () => {
  assert.equal(shouldAlert('permission_prompt', { ...DEFAULTS, alerts: false }, 3), false);
  assert.equal(shouldAlert('auth_success', DEFAULTS, 3), false);
});

test('labels follow the "label" setting', () => {
  assert.equal(shouldLabel({ label: 'auto' }, 1), false);
  assert.equal(shouldLabel({ label: 'auto' }, 2), true);
  assert.equal(shouldLabel({ label: 'always' }, 1), true);
  assert.equal(shouldLabel({ label: 'never' }, 4), false);
});
