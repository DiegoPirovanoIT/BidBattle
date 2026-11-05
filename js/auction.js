// Pure auction rules. Every amount is an integer number of hundredths of the lot's
// currency: the names say euro, the rules work the same in any currency.
// Each function returns a new state and never mutates its input.

export const AUCTION_MODES = Object.freeze({
  TURNS: 'turns',
  AUCTIONEER: 'auctioneer',
  MANUAL: 'manual',
});

export const HAMMER_COUNT = 3;

const EURO = 100;
export const START_MIN_PCT = 10;
export const START_MAX_PCT = 150;
const ESTIMATE_MIN_WIDTH = 0.5;
const ESTIMATE_WIDTH_RANGE = 0.4;
const DESCENDING_STEP_RATIO = 0.08;
const FLOOR_RATIO = 0.1;

export function minimumNextBid(currentCents, minRaisePct) {
  const raiseInWholeEuros = Math.ceil((currentCents * minRaisePct) / 100 / EURO) * EURO;
  return currentCents + Math.max(EURO, raiseInWholeEuros);
}

function niceUnit(euros) {
  if (euros < 20) return 1;
  if (euros < 100) return 5;
  if (euros < 500) return 10;
  if (euros < 2000) return 50;
  if (euros < 20000) return 100;
  return 10 ** (Math.floor(Math.log10(euros)) - 1);
}

function roundToNiceAmount(cents) {
  const euros = cents / EURO;
  const unit = niceUnit(euros);
  return Math.max(unit, Math.round(euros / unit) * unit) * EURO;
}

// The expert's range always holds the value, somewhere random inside it: a range
// centred on the value would give it away. Rounding only ever widens the range.
export function expertEstimate(valueCents, rng = Math.random) {
  const width = valueCents * (ESTIMATE_MIN_WIDTH + rng() * ESTIMATE_WIDTH_RANGE);
  const lowCents = valueCents - width * rng();
  const unitCents = niceUnit(valueCents / EURO) * EURO;
  return {
    lowCents: Math.max(unitCents, Math.floor(lowCents / unitCents) * unitCents),
    highCents: Math.ceil((lowCents + width) / unitCents) * unitCents,
  };
}

function assertOpen(state) {
  if (state.status !== 'open') throw new Error("L'asta è già chiusa.");
}

// Mode 1: players take turns raising or withdrawing.

export function createTurnAuction(playerIds, minRaisePct, rng = Math.random) {
  const openerId = playerIds[Math.floor(rng() * playerIds.length)];
  return {
    mode: AUCTION_MODES.TURNS,
    playerIds: [...playerIds],
    activeIds: [...playerIds],
    openerId,
    currentPlayerId: openerId,
    highBidCents: null,
    leaderId: null,
    minRaisePct,
    status: 'open',
  };
}

function nextActivePlayer(playerIds, activeIds, afterId) {
  const start = playerIds.indexOf(afterId);
  for (let offset = 1; offset <= playerIds.length; offset += 1) {
    const candidate = playerIds[(start + offset) % playerIds.length];
    if (activeIds.includes(candidate)) return candidate;
  }
  throw new Error('Nessun giocatore attivo.');
}

export function turnMinimumBid(state) {
  return state.highBidCents === null
    ? EURO
    : minimumNextBid(state.highBidCents, state.minRaisePct);
}

export function placeTurnBid(state, playerId, amountCents) {
  assertOpen(state);
  if (playerId !== state.currentPlayerId) throw new Error('Non è il turno di questo giocatore.');
  if (!Number.isInteger(amountCents) || amountCents < turnMinimumBid(state)) {
    throw new Error('Offerta troppo bassa.');
  }
  return {
    ...state,
    highBidCents: amountCents,
    leaderId: playerId,
    currentPlayerId: nextActivePlayer(state.playerIds, state.activeIds, playerId),
  };
}

export function withdrawFromTurn(state, playerId) {
  assertOpen(state);
  if (playerId !== state.currentPlayerId) throw new Error('Non è il turno di questo giocatore.');
  if (state.highBidCents === null) throw new Error("Chi apre l'asta deve fare un'offerta.");

  const activeIds = state.activeIds.filter((id) => id !== playerId);
  if (activeIds.length === 1) {
    return { ...state, activeIds, currentPlayerId: null, leaderId: activeIds[0], status: 'sold' };
  }
  return {
    ...state,
    activeIds,
    currentPlayerId: nextActivePlayer(state.playerIds, activeIds, playerId),
  };
}

// When the clock runs out the opener bids the minimum, because the opener cannot
// withdraw. Everyone else is out of the round.
export function expireTurn(state) {
  return state.highBidCents === null
    ? placeTurnBid(state, state.currentPlayerId, turnMinimumBid(state))
    : withdrawFromTurn(state, state.currentPlayerId);
}

// Mode 2: the auctioneer lowers the price until someone bids, then raises it.

export function createAuctioneerAuction({
  valueCents,
  minRaisePct,
  startMinPct = START_MIN_PCT,
  startMaxPct = START_MAX_PCT,
  rng = Math.random,
}) {
  const pct = startMinPct + rng() * (startMaxPct - startMinPct);
  const startCents = roundToNiceAmount((valueCents * pct) / 100);
  return {
    mode: AUCTION_MODES.AUCTIONEER,
    phase: 'descending',
    startCents,
    stepCents: roundToNiceAmount(startCents * DESCENDING_STEP_RATIO),
    floorCents: Math.max(EURO, Math.round(startCents * FLOOR_RATIO)),
    announcedCents: startCents,
    highBidCents: null,
    leaderId: null,
    hammerCount: 0,
    minRaisePct,
    status: 'open',
  };
}

export function auctioneerBid(state, playerId) {
  assertOpen(state);
  if (playerId === state.leaderId) throw new Error('Questo giocatore è già in testa.');
  return {
    ...state,
    phase: 'ascending',
    highBidCents: state.announcedCents,
    leaderId: playerId,
    announcedCents: minimumNextBid(state.announcedCents, state.minRaisePct),
    hammerCount: 0,
  };
}

export function auctioneerTick(state) {
  assertOpen(state);
  if (state.phase === 'descending') {
    const nextCents = state.announcedCents - state.stepCents;
    return nextCents < state.floorCents
      ? { ...state, status: 'unsold' }
      : { ...state, announcedCents: nextCents };
  }
  const hammerCount = state.hammerCount + 1;
  return { ...state, hammerCount, status: hammerCount >= HAMMER_COUNT ? 'sold' : 'open' };
}
