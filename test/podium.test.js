import assert from 'node:assert/strict';
import { test } from 'node:test';
import { podiumBeats, podiumSlots } from '../js/podium.js';

const ranked = (...ranks) => ranks.map((rank, index) => ({ id: `p${index + 1}`, rank }));

test('il podio mette il secondo a sinistra, il primo al centro e il terzo a destra', () => {
  assert.deepEqual(podiumSlots(ranked(1, 2, 3)).map((p) => p.id), ['p2', 'p1', 'p3']);
});

test('con due giocatori il podio ha due gradini', () => {
  assert.deepEqual(podiumSlots(ranked(1, 2)).map((p) => p.id), ['p2', 'p1']);
});

test('sul podio salgono al massimo tre giocatori', () => {
  assert.equal(podiumSlots(ranked(1, 2, 3, 4, 5, 6)).length, 3);
});

test('il primo posto sale per ultimo', () => {
  assert.deepEqual(podiumBeats(ranked(2, 1, 3)), [3, 2, 1]);
});

test('i pari merito salgono insieme', () => {
  assert.deepEqual(podiumBeats(ranked(1, 1, 3)), [3, 1]);
  assert.deepEqual(podiumBeats(ranked(1, 1)), [1]);
});
