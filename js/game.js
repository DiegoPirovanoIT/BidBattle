// Pure game flow: setup, rounds, settlement and final standings.
// Budgets are unlimited: a player's score is only the total profit or loss.
// A score is an integer: cents of a euro, or hundredths of a percentage point.
// Bids and prices are in hundredths of the lot's currency. By default a game turns
// every lot into euros when it starts. With local currencies only the score is
// converted, because lots in different currencies add up to it.

import {
  AUCTION_MODES,
  createAuctioneerAuction,
  createTurnAuction,
} from './auction.js';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

// A paddle's colour is its position here, and css/style.css has a class .pN for each one.
export const PADDLE_COLORS = Object.freeze([
  'Corallo', 'Cielo', 'Sole', 'Menta', 'Lilla', 'Rosa',
  'Lime', 'Arancio', 'Turchese', 'Pervinca', 'Sabbia', 'Ghiaccio',
]);

export const SETTING_LIMITS = Object.freeze({
  rounds: { min: 1, max: 30 },
  minRaisePct: { min: 1, max: 50 },
  tickSeconds: { min: 1, max: 10 },
});

// Seconds a player has to bid in the turn mode. Zero means no limit.
export const TURN_TIMER_OPTIONS = Object.freeze([0, 15, 30, 60]);

export const REVEAL_PACES = Object.freeze({ FULL: 'full', QUICK: 'quick' });

export const REVEAL_TIMINGS = Object.freeze({ EACH_ROUND: 'each-round', AT_END: 'at-end' });

export const SCORE_MODES = Object.freeze({ EUROS: 'euros', PERCENT: 'percent' });

export const AUCTION_CURRENCIES = Object.freeze({ EUROS: 'euros', LOCAL: 'local' });

export const GROCERY_SCOPES = Object.freeze({ ALL: 'all', ITALY: 'italy' });

export const DEFAULT_SETTINGS = Object.freeze({
  mode: AUCTION_MODES.TURNS,
  rounds: 8,
  minRaisePct: 5,
  tickSeconds: 2.5,
  turnSeconds: 0,
  revealPace: REVEAL_PACES.FULL,
  revealTiming: REVEAL_TIMINGS.EACH_ROUND,
  scoreMode: SCORE_MODES.EUROS,
  auctionCurrency: AUCTION_CURRENCIES.EUROS,
  excludedCategories: Object.freeze([]),
  excludedSources: Object.freeze([]),
  groceryScope: GROCERY_SCOPES.ALL,
});

export function parseAmountToCents(text) {
  const normalized = String(text).trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

function shuffled(items, rng) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function validatePlayerNames(names) {
  const cleaned = names.map((name) => name.trim());
  if (cleaned.length < MIN_PLAYERS || cleaned.length > MAX_PLAYERS) {
    return `Servono da ${MIN_PLAYERS} a ${MAX_PLAYERS} giocatori.`;
  }
  if (cleaned.some((name) => !name)) return 'Ogni giocatore deve avere un nome.';
  const unique = new Set(cleaned.map((name) => name.toLowerCase()));
  if (unique.size !== cleaned.length) return 'I nomi dei giocatori devono essere diversi.';
  return null;
}

// The number stays text, so a paddle can read 007.
export function validatePaddles(paddles) {
  if (paddles.some(({ number }) => !/^\d{1,3}$/.test(number))) {
    return 'Ogni palette deve avere un numero da 0 a 999.';
  }
  if (new Set(paddles.map(({ number }) => Number(number))).size !== paddles.length) {
    return 'I numeri delle palette devono essere diversi.';
  }
  if (new Set(paddles.map(({ color }) => color)).size !== paddles.length) {
    return 'I colori delle palette devono essere diversi.';
  }
  return null;
}

// A new paddle takes the lowest number and the first colour still free.
export function nextPaddle(paddles) {
  const numbers = new Set(paddles.map(({ number }) => Number(number)));
  const colors = new Set(paddles.map(({ color }) => color));
  let number = 1;
  while (numbers.has(number)) number += 1;
  return {
    number: String(number),
    color: PADDLE_COLORS.findIndex((_, color) => !colors.has(color)),
  };
}

export function defaultPaddles(count) {
  const paddles = [];
  while (paddles.length < count) paddles.push(nextPaddle(paddles));
  return paddles;
}

// Categories and sources are stored as exclusions, so new ones start enabled.
export function availableProducts(
  products,
  excludedCategories = [],
  excludedSources = [],
  groceryScope = GROCERY_SCOPES.ALL,
) {
  const italyOnly = groceryScope === GROCERY_SCOPES.ITALY;
  return products.filter((product) => (
    !excludedCategories.includes(product.category)
    && !excludedSources.includes(product.source)
    && !(italyOnly && product.source === 'groceries' && product.country !== 'IT')
  ));
}

export const toEuroCents = (cents, { eurRate = 1 }) => Math.round(cents * eurRate);

// The original price stays on the lot, so the reveal can show what it really was.
function inEuros(product) {
  const { priceCents, currency = 'EUR' } = product;
  if (currency === 'EUR') return product;
  return {
    ...product,
    priceCents: toEuroCents(priceCents, product),
    currency: 'EUR',
    eurRate: 1,
    original: { priceCents, currency },
  };
}

export function createGame({
  playerNames,
  paddles = defaultPaddles(playerNames.length),
  settings,
  products,
  rng = Math.random,
}) {
  const playerError = validatePlayerNames(playerNames) ?? validatePaddles(paddles);
  if (playerError) throw new Error(playerError);
  const pool = availableProducts(
    products,
    settings.excludedCategories,
    settings.excludedSources,
    settings.groceryScope,
  );
  if (settings.rounds > pool.length) {
    throw new Error(`Ci sono solo ${pool.length} prodotti disponibili.`);
  }
  const lots = shuffled(pool, rng).slice(0, settings.rounds);
  return {
    settings: { ...settings },
    players: playerNames.map((name, index) => ({
      id: `p${index + 1}`,
      name: name.trim(),
      ...paddles[index],
      score: 0,
    })),
    deck: settings.auctionCurrency === AUCTION_CURRENCIES.EUROS ? lots.map(inEuros) : lots,
    roundIndex: 0,
    phase: 'preview',
    auction: null,
    sale: null,
    sales: [],
    history: [],
  };
}

export function currentProduct(game) {
  return game.deck[game.roundIndex];
}

export function isLastRound(game) {
  return game.roundIndex + 1 >= game.settings.rounds;
}

export function revealsAtEnd(game) {
  return game.settings.revealTiming === REVEAL_TIMINGS.AT_END;
}

// Euros committed so far, including a lot that has just been knocked down.
export function spentCents(game, playerId) {
  const lots = game.sales.map((sale, index) => ({ sale, product: game.deck[index] }));
  if (game.sale && !game.sales.includes(game.sale)) {
    lots.push({ sale: game.sale, product: currentProduct(game) });
  }
  return lots
    .filter(({ sale }) => sale.buyerId === playerId)
    .reduce((total, { sale, product }) => total + toEuroCents(sale.priceCents, product), 0);
}

export function startAuction(game, rng = Math.random) {
  const { mode, minRaisePct } = game.settings;
  const playerIds = game.players.map((player) => player.id);
  let auction = { mode: AUCTION_MODES.MANUAL, status: 'open' };
  if (mode === AUCTION_MODES.TURNS) {
    auction = createTurnAuction(playerIds, minRaisePct, rng);
  } else if (mode === AUCTION_MODES.AUCTIONEER) {
    auction = createAuctioneerAuction({
      valueCents: currentProduct(game).priceCents,
      minRaisePct,
      rng,
    });
  }
  return { ...game, phase: 'auction', auction };
}

// Moves to the hammer phase as soon as the auction closes.
export function updateAuction(game, auction) {
  if (auction.status === 'open') return { ...game, auction };
  const sale = auction.status === 'sold'
    ? { buyerId: auction.leaderId, priceCents: auction.highBidCents }
    : { buyerId: null, priceCents: null };
  return { ...game, auction, sale, phase: 'hammer' };
}

export function recordManualSale(game, buyerId, priceCents) {
  if (buyerId === null) {
    return { ...game, sale: { buyerId: null, priceCents: null }, phase: 'hammer' };
  }
  if (!game.players.some((player) => player.id === buyerId)) {
    throw new Error('Giocatore sconosciuto.');
  }
  if (!Number.isInteger(priceCents) || priceCents <= 0) {
    throw new Error('Inserisci un prezzo valido.');
  }
  return { ...game, sale: { buyerId, priceCents }, phase: 'hammer' };
}

// In percent the gain is measured on the real value, so a painting and a receipt
// weigh the same: half price is +50%, double price is -100%.
function lotScore(deltaCents, product, scoreMode) {
  return scoreMode === SCORE_MODES.PERCENT
    ? Math.round((deltaCents / product.priceCents) * 10000)
    : toEuroCents(deltaCents, product);
}

export function revealPrice(game) {
  const product = currentProduct(game);
  const { buyerId, priceCents } = game.sale;
  const deltaCents = buyerId === null ? 0 : product.priceCents - priceCents;
  const scoreDelta = lotScore(deltaCents, product, game.settings.scoreMode);
  return {
    ...game,
    phase: 'reveal',
    players: game.players.map((player) => (
      player.id === buyerId
        ? { ...player, score: player.score + scoreDelta }
        : player
    )),
    history: [...game.history, { product, buyerId, priceCents, deltaCents, scoreDelta }],
  };
}

function revealLot(game, roundIndex) {
  return revealPrice({ ...game, roundIndex, sale: game.sales[roundIndex] });
}

// With prices kept for the end, a closed lot is set aside unrevealed. After the
// last auction the game goes back to the first lot and reveals them in order.
export function setLotAside(game) {
  const sales = [...game.sales, game.sale];
  const next = { ...game, sales, auction: null, sale: null };
  if (isLastRound(game)) return revealLot(next, 0);
  return { ...next, roundIndex: game.roundIndex + 1, phase: 'preview' };
}

export function nextRound(game) {
  if (isLastRound(game)) return { ...game, phase: 'finished' };
  if (revealsAtEnd(game)) return revealLot(game, game.roundIndex + 1);
  return {
    ...game,
    roundIndex: game.roundIndex + 1,
    phase: 'preview',
    auction: null,
    sale: null,
  };
}

// Players with the same profit share the same rank.
export function standings(game) {
  const sorted = [...game.players].sort((a, b) => b.score - a.score);
  let rank = 0;
  return sorted.map((player, index) => {
    if (index === 0 || player.score !== sorted[index - 1].score) rank = index + 1;
    return { ...player, rank };
  });
}

export function gameHighlights(game) {
  const purchases = game.history.filter((lot) => lot.buyerId !== null);
  const bestDeal = purchases.reduce(
    (best, lot) => (lot.scoreDelta > (best?.scoreDelta ?? 0) ? lot : best),
    null,
  );
  const worstBuy = purchases.reduce(
    (worst, lot) => (lot.scoreDelta < (worst?.scoreDelta ?? 0) ? lot : worst),
    null,
  );
  return { bestDeal, worstBuy };
}
