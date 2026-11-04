import assert from 'node:assert/strict';
import { test } from 'node:test';
import { flapChars, lockTimes, revealVerdict } from '../js/reveal.js';

const BLANK = ' ';

test('il tabellone ha sempre almeno quattro cifre intere, per non svelare la grandezza', () => {
  assert.deepEqual(flapChars(14500), [BLANK, '1', '4', '5', '0', '0']);
  assert.deepEqual(flapChars(950), [BLANK, BLANK, BLANK, '9', '5', '0']);
  assert.deepEqual(flapChars(1234567), ['1', '2', '3', '4', '5', '6', '7']);
});

test('le cifre si fermano da destra a sinistra, con pause sempre più lunghe', () => {
  const times = lockTimes(flapChars(14500));
  const [, hundreds, tens, units, decimal, cent] = times;
  assert.ok(cent < decimal && decimal < units && units < tens && tens < hundreds);
  assert.ok(hundreds - tens > tens - units);
});

test('le caselle vuote si fermano insieme alla cifra più importante', () => {
  const times = lockTimes(flapChars(950));
  assert.equal(times[0], times[3]);
  assert.equal(Math.max(...times), times[3]);
});

test('il verdetto dipende da quanto è buono o cattivo il prezzo', () => {
  const label = (priceCents, deltaCents) => revealVerdict({ buyerId: 'p1', priceCents, deltaCents }).label;
  assert.equal(label(10000, 1000), 'Affare!');
  assert.equal(label(10000, 5000), 'Affarone!');
  assert.equal(label(10000, -1000), 'Pagato troppo!');
  assert.equal(label(15000, -5000), 'Bidone!');
  assert.equal(label(10000, 0), 'Pari');
});

test('un lotto invenduto non ha esito', () => {
  const verdict = revealVerdict({ buyerId: null, priceCents: null, deltaCents: 0 });
  assert.equal(verdict.label, 'Invenduto');
  assert.equal(verdict.tone, 'neutral');
});
