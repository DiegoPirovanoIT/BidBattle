// The end of the game: steps rise from last place to first, then the winner is crowned.
// The pure helpers are tested. playPodium needs a browser.

import { createTimeline, throwMoney } from './reveal.js';

const FIRST_BEAT_MS = 500;
const BEAT_GAP_MS = 1500;
const WINNER_PAUSE_MS = 500;
const AMOUNT_DELAY_MS = 450;
const AMOUNT_COUNT_MS = 800;
const CROWN_DELAY_MS = 1300;
const FINISH_DELAY_MS = 1200;

// The classic layout: second on the left, first in the middle, third on the right.
export function podiumSlots(ranking) {
  const [first, second, third] = ranking;
  return [second, first, third].filter(Boolean);
}

// Players sharing a rank step up together, and first place always comes last.
export function podiumBeats(slots) {
  return [...new Set(slots.map((slot) => slot.rank))].sort((a, b) => b - a);
}

const prefersStillness = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Returns skip(), which jumps to the end, and cancel(), which clears the room.
export function playPodium({ section, format, onDone }) {
  const slots = [...section.querySelectorAll('.podium-slot')];
  const beats = podiumBeats(slots.map((slot) => ({ rank: Number(slot.dataset.rank) })));
  const atRank = (rank) => slots.filter((slot) => Number(slot.dataset.rank) === rank);
  const { later, countTo, clear } = createTimeline();
  let stopMoney = null;
  let done = false;

  const raise = (rank) => {
    atRank(rank).forEach((slot) => {
      slot.classList.add('on');
      const amount = slot.querySelector('[data-score]');
      later(AMOUNT_DELAY_MS, () => {
        countTo(AMOUNT_COUNT_MS, 0, Number(amount.dataset.score), (value) => {
          amount.textContent = format(value);
        });
      });
    });
  };

  const crown = () => {
    atRank(1).forEach((slot) => slot.classList.add('crowned'));
    section.querySelector('.final-title').classList.add('slam');
    stopMoney = throwMoney({ tone: 'gain', intensity: 1 }, section);
  };

  const finish = () => {
    if (done) return;
    done = true;
    clear();
    slots.forEach((slot) => {
      slot.classList.add('on');
      const amount = slot.querySelector('[data-score]');
      amount.textContent = format(Number(amount.dataset.score));
    });
    atRank(1).forEach((slot) => slot.classList.add('crowned'));
    section.classList.remove('staged');
    onDone();
  };

  if (prefersStillness()) {
    finish();
  } else {
    let at = FIRST_BEAT_MS;
    beats.slice(0, -1).forEach((rank) => {
      later(at, () => raise(rank));
      at += BEAT_GAP_MS;
    });
    at += beats.length > 1 ? WINNER_PAUSE_MS : 0;
    later(at, () => raise(1));
    later(at + CROWN_DELAY_MS, crown);
    later(at + CROWN_DELAY_MS + FINISH_DELAY_MS, finish);
  }

  return {
    skip: finish,
    cancel() {
      done = true;
      clear();
      stopMoney?.();
    },
  };
}
