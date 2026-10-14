const { test } = require('node:test');
const assert = require('node:assert/strict');
const { schedule, isLeech, isBeyondSalvage } = require('../dist/shared/srs');
test('shared SM-2 preserves review intervals and Lightner thresholds', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const initial = {
    ease_factor: 2.5,
    interval_days: 0,
    repetitions: 0,
    lapses: 0,
  };
  const good = schedule(initial, 'good', now);
  assert.equal(good.interval_days, 1);
  const next = schedule(good, 'good', now);
  assert.equal(next.interval_days, 6);
  assert.equal(schedule(next, 'good', now).interval_days, 15);
  const again = schedule(next, 'again', now);
  assert.equal(again.repetitions, 0);
  assert.equal(again.interval_days, 0);
  assert.equal(again.lapses, 1);
  assert.equal(again.due_at, '2026-01-01T00:05:00.000Z');
  assert.equal(
    schedule({ ...initial, ease_factor: 1.3 }, 'again', now).ease_factor,
    1.3,
  );
  assert.equal(isLeech({ lapses: 8, ease_factor: 1.3 }), true);
  assert.equal(isLeech({ lapses: 7, ease_factor: 1.3 }), false);
  assert.equal(isBeyondSalvage({ suspensions: 2 }), true);
  assert.equal(isBeyondSalvage({ suspensions: 1 }), false);
});
