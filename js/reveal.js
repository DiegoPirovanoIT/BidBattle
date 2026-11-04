// The price reveal: a split-flap board, a verdict stamp and flying money.
// The pure helpers at the top are tested. Everything else needs a browser and
// touches the DOM only when called.

import { REVEAL_PACES } from './game.js';

const BLANK = ' ';
const MIN_EURO_CELLS = 4;
const DECIMAL_CELLS = 2;

const BIG_GAIN_RATIO = 0.5;
const BIG_LOSS_RATIO = -1 / 3;

const PACE_SPEED = { [REVEAL_PACES.FULL]: 1, [REVEAL_PACES.QUICK]: 0.4 };

const FLIP_MS = 80;
const SLOWDOWN_WINDOW_MS = 450;
const SLOWDOWN_FACTOR = 0.4;
const LOCK_FLIP_MS = 170;
const MONEY_MS = 2600;

// Every price gets the same minimum number of cells, so the board does not
// give away how many digits it has before it stops.
export function flapChars(cents) {
  const [euros, decimals] = (cents / 100).toFixed(DECIMAL_CELLS).split('.');
  return [...euros.padStart(MIN_EURO_CELLS, BLANK), ...decimals];
}

// Cells lock from right to left, each gap longer than the last, so the digit
// that decides the round lands at the end. Leading blanks lock with it.
export function lockTimes(chars, { first = 1100, gap = 300, growth = 1.4 } = {}) {
  const lead = chars.findIndex((char) => char !== BLANK);
  const times = new Array(chars.length);
  let at = first;
  let step = gap;
  for (let index = chars.length - 1; index >= lead; index -= 1) {
    times[index] = Math.round(at);
    at += step;
    step *= growth;
  }
  return times.fill(times[lead], 0, lead);
}

export function revealVerdict({ buyerId, priceCents, deltaCents }) {
  if (buyerId === null) return { label: 'Invenduto', tone: 'neutral', intensity: 0 };
  if (deltaCents === 0) return { label: 'Pari', tone: 'neutral', intensity: 0 };
  const ratio = deltaCents / priceCents;
  const intensity = Math.min(1, Math.abs(ratio));
  if (ratio > 0) {
    return { label: ratio >= BIG_GAIN_RATIO ? 'Affarone!' : 'Affare!', tone: 'gain', intensity };
  }
  return { label: ratio <= BIG_LOSS_RATIO ? 'Bidone!' : 'Pagato troppo!', tone: 'loss', intensity };
}

function flapMarkup(char) {
  const half = (classes) => `<span class="half ${classes}"><b>${char}</b></span>`;
  return `<span class="flap" data-char="${char}">
    ${half('top')}${half('bottom')}${half('top leaf-out')}${half('bottom leaf-in')}
  </span>`;
}

export function boardMarkup(cents, { staged }) {
  const chars = flapChars(cents);
  const flaps = chars.map((char) => flapMarkup(staged ? BLANK : char));
  const euroCells = flaps.slice(0, -DECIMAL_CELLS).join('');
  const decimalCells = flaps.slice(-DECIMAL_CELLS).join('');
  return `
    <div class="board" style="--cells: ${chars.length}" aria-hidden="true">
      ${euroCells}<span class="board-mark">,</span>${decimalCells}<span class="board-mark">€</span>
    </div>`;
}

function writeHalf(half, char) {
  half.firstElementChild.textContent = char;
}

function setFlap(cell, char) {
  cell.dataset.char = char;
  cell.querySelectorAll('.half').forEach((half) => writeHalf(half, char));
}

function flip(cell, next, ms) {
  const [top, bottom, leafOut, leafIn] = cell.children;
  const previous = cell.dataset.char;
  cell.dataset.char = next;
  writeHalf(top, next);
  writeHalf(leafOut, previous);
  writeHalf(leafIn, next);
  const half = ms / 2;
  leafOut.animate(
    [{ transform: 'rotateX(0deg)' }, { transform: 'rotateX(-90deg)' }],
    { duration: half, easing: 'ease-in' },
  );
  const fall = leafIn.animate(
    [{ transform: 'rotateX(90deg)' }, { transform: 'rotateX(0deg)' }],
    { duration: half, delay: half, easing: 'ease-out', fill: 'both' },
  );
  fall.onfinish = () => {
    writeHalf(bottom, next);
    fall.cancel();
  };
}

function nextDigit(char) {
  const digit = Number(char);
  return String(Number.isNaN(digit) ? Math.floor(Math.random() * 10) : (digit + 1) % 10);
}

function lightsDown(panel) {
  const scrim = document.createElement('div');
  scrim.className = 'house-lights';
  const box = panel.getBoundingClientRect();
  scrim.style.setProperty('--spot-x', `${box.left + box.width / 2}px`);
  scrim.style.setProperty('--spot-y', `${box.top + box.height / 2}px`);
  document.body.append(scrim);
  requestAnimationFrame(() => scrim.classList.add('down'));
  return scrim;
}

function lightsUp(scrim) {
  scrim.classList.remove('down');
  scrim.addEventListener('transitionend', () => scrim.remove(), { once: true });
  setTimeout(() => scrim.remove(), 700);
}

function drawCoin(context, coin) {
  const face = Math.cos(coin.spin);
  context.scale(Math.max(0.12, Math.abs(face)), 1);
  context.fillStyle = face > 0 ? '#ffc933' : '#ffe08a';
  context.beginPath();
  context.arc(0, 0, coin.size, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = '#b5820f';
  context.lineWidth = 2;
  context.beginPath();
  context.arc(0, 0, coin.size * 0.68, 0, Math.PI * 2);
  context.stroke();
}

function drawNote(context, note) {
  const width = note.size * 3.2;
  const height = note.size * 1.7;
  context.rotate(Math.sin(note.spin) * 0.7);
  context.scale(1, Math.max(0.25, Math.abs(Math.cos(note.spin * 0.7))));
  context.fillStyle = '#1a2fc4';
  context.fillRect(-width / 2, -height / 2, width, height);
  context.fillStyle = '#fff8e6';
  context.beginPath();
  context.ellipse(0, 0, height * 0.42, height * 0.36, 0, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = '#c9d0ff';
  context.lineWidth = 1.5;
  context.strokeRect(-width / 2 + 3, -height / 2 + 3, width - 6, height - 6);
}

const between = (min, max) => min + Math.random() * (max - min);

function coinRain(count, width) {
  return Array.from({ length: count }, () => ({
    x: between(0, width),
    y: between(-420, -20),
    vx: between(-40, 40),
    vy: between(180, 460),
    gravity: 520,
    spin: between(0, Math.PI * 2),
    spinRate: between(6, 14),
    size: between(8, 15),
    draw: drawCoin,
  }));
}

function notesFlyingAway(count, origin) {
  return Array.from({ length: count }, () => ({
    x: origin.x + between(-origin.spread, origin.spread),
    y: origin.y + between(-30, 30),
    vx: between(-120, 120),
    vy: between(-420, -200),
    gravity: -60,
    spin: between(0, Math.PI * 2),
    spinRate: between(2, 5),
    size: between(11, 16),
    draw: drawNote,
  }));
}

export function throwMoney(verdict, panel) {
  const canvas = document.createElement('canvas');
  canvas.className = 'money';
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const { innerWidth: width, innerHeight: height } = window;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  document.body.append(canvas);
  const context = canvas.getContext('2d');

  const box = panel.getBoundingClientRect();
  const origin = { x: box.left + box.width / 2, y: box.top + box.height / 3, spread: box.width / 3 };
  const pieces = verdict.tone === 'gain'
    ? coinRain(Math.round(40 + 110 * verdict.intensity), width)
    : notesFlyingAway(Math.round(14 + 36 * verdict.intensity), origin);

  const startedAt = performance.now();
  let previous = startedAt;
  let frame = null;

  const stop = () => {
    cancelAnimationFrame(frame);
    canvas.remove();
  };

  const paint = (now) => {
    const seconds = (now - previous) / 1000;
    const remaining = MONEY_MS - (now - startedAt);
    previous = now;
    if (remaining <= 0) {
      stop();
      return;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.globalAlpha = Math.min(1, remaining / 500);
    pieces.forEach((piece) => {
      piece.vy += piece.gravity * seconds;
      piece.x += piece.vx * seconds;
      piece.y += piece.vy * seconds;
      piece.spin += piece.spinRate * seconds;
      context.save();
      context.translate(piece.x, piece.y);
      piece.draw(context, piece);
      context.restore();
    });
    frame = requestAnimationFrame(paint);
  };
  frame = requestAnimationFrame(paint);
  return stop;
}

function shake(panel, tone) {
  const force = tone === 'neutral' ? 2 : 6;
  panel.animate(
    [0, -force, force * 0.7, -force * 0.4, force * 0.2, 0].map((x) => ({
      transform: `translate(${x}px, ${Math.abs(x) * 0.4}px)`,
    })),
    { duration: 320, easing: 'ease-out' },
  );
}

// Timers and counters that can all be stopped at once when a show is skipped.
export function createTimeline() {
  const timers = new Set();
  const frames = new Set();

  const later = (ms, action) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      action();
    }, ms);
    timers.add(timer);
  };

  const countTo = (ms, from, to, write) => {
    const startedAt = performance.now();
    const step = (now) => {
      const progress = Math.min(1, (now - startedAt) / ms);
      const eased = 1 - (1 - progress) ** 3;
      write(Math.round(from + (to - from) * eased));
      if (progress < 1) schedule();
    };
    const schedule = () => {
      const frame = requestAnimationFrame((now) => {
        frames.delete(frame);
        step(now);
      });
      frames.add(frame);
    };
    schedule();
  };

  const clear = () => {
    timers.forEach(clearTimeout);
    timers.clear();
    frames.forEach(cancelAnimationFrame);
    frames.clear();
  };

  return { later, countTo, clear };
}

const prefersStillness = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Plays the show on a panel rendered with boardMarkup({ staged: true }).
// `delta` is what the lot adds to the score, in the unit `formatSigned` understands.
// `score` is the buyer's card and scores, or null for an unsold lot.
// `verdictClass` colours the panel, so it is applied only when the stamp lands.
// Returns skip(), which jumps to the result, and cancel(), which clears the room.
export function playReveal({
  panel,
  valueCents,
  delta,
  verdict,
  verdictClass,
  pace,
  score,
  formatSigned,
  toneClass,
  onDone,
}) {
  const cells = [...panel.querySelectorAll('.flap')];
  const chars = flapChars(valueCents);
  const speed = PACE_SPEED[pace] ?? 1;
  const deltaLine = panel.querySelector('[data-delta]');
  const stamp = panel.querySelector('.verdict-stamp');
  const scoreAmount = score?.card.querySelector('.amount');

  const { later, countTo, clear: clearSchedule } = createTimeline();
  let scrim = null;
  let stopMoney = null;
  let done = false;

  const writeScore = (value) => {
    scoreAmount.textContent = formatSigned(value);
    scoreAmount.className = `amount ${toneClass(value)}`;
  };

  const finish = () => {
    if (done) return;
    done = true;
    clearSchedule();
    panel.getAnimations({ subtree: true })
      .filter((animation) => animation.effect.target.closest('.flap'))
      .forEach((animation) => animation.cancel());
    cells.forEach((cell, index) => {
      setFlap(cell, chars[index]);
      cell.classList.add('locked');
    });
    if (deltaLine) deltaLine.textContent = formatSigned(delta);
    if (score) {
      writeScore(score.to);
      score.card.classList.remove('lit');
    }
    panel.classList.remove('staged');
    if (verdictClass) panel.classList.add(verdictClass);
    if (scrim) lightsUp(scrim);
    scrim = null;
    onDone();
  };

  const spin = (cell, index, lockAt) => {
    const left = lockAt - performance.now();
    if (left <= 0) {
      flip(cell, chars[index], LOCK_FLIP_MS);
      cell.classList.add('locked');
      return;
    }
    const slowdown = Math.max(0, SLOWDOWN_WINDOW_MS - left) * SLOWDOWN_FACTOR;
    const wait = FLIP_MS + slowdown;
    flip(cell, nextDigit(cell.dataset.char), wait);
    later(wait, () => spin(cell, index, lockAt));
  };

  const slam = () => {
    stamp.classList.add('slam');
    later(120, () => {
      if (verdictClass) panel.classList.add(verdictClass);
      shake(panel, verdict.tone);
      if (scrim) lightsUp(scrim);
      scrim = null;
      if (verdict.tone !== 'neutral') stopMoney = throwMoney(verdict, panel);
    });
  };

  const settleScore = () => {
    if (!score) return;
    const float = document.createElement('span');
    float.className = `score-float ${toneClass(delta)}`;
    float.textContent = formatSigned(delta);
    float.addEventListener('animationend', () => float.remove());
    score.card.append(float);
    score.card.classList.remove('lit');
    score.card.classList.add(`pulse-${verdict.tone}`);
    countTo(600 * speed, score.from, score.to, writeScore);
  };

  if (prefersStillness()) {
    finish();
  } else {
    panel.scrollIntoView({ block: 'nearest' });
    scrim = lightsDown(panel);
    const startAt = performance.now() + 350 * speed;
    const locks = lockTimes(chars).map((ms) => ms * speed);
    const lastLock = Math.max(...locks);

    later(350 * speed, () => {
      cells.forEach((cell, index) => spin(cell, index, startAt + locks[index]));
    });

    const landed = 350 * speed + lastLock + LOCK_FLIP_MS;
    later(landed, () => panel.querySelector('.board').classList.add('landed'));

    const countAt = landed + 350 * speed;
    if (deltaLine) {
      later(countAt, () => {
        deltaLine.closest('.total').classList.add('shown');
        countTo(700 * speed, 0, delta, (value) => {
          deltaLine.textContent = formatSigned(value);
        });
      });
    }

    const slamAt = countAt + (deltaLine ? 800 : 200) * speed;
    later(slamAt, slam);
    later(slamAt + 260, settleScore);
    later(slamAt + 260 + 700 * speed, finish);
  }

  return {
    skip: finish,
    cancel() {
      done = true;
      clearSchedule();
      stopMoney?.();
      scrim?.remove();
    },
  };
}
