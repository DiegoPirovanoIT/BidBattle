// Pure game flow: setup, rounds, settlement and final standings.
// Budgets are unlimited: a player's score is only the total profit or loss.

import {
  AUCTION_MODES,
  createAuctioneerAuction,
  createTurnAuction,
} from './auction.js';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

export const SETTING_LIMITS = Object.freeze({
  rounds: { min: 1, max: 30 },
  minRaisePct: { min: 1, max: 50 },
  tickSeconds: { min: 1, max: 10 },
});

export const DEFAULT_SETTINGS = Object.freeze({
  mode: AUCTION_MODES.TURNS,
  rounds: 8,
  minRaisePct: 5,
  tickSeconds: 2.5,
});

export function parseEurosToCents(text) {
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

export function createGame({ playerNames, settings, products, rng = Math.random }) {
  const nameError = validatePlayerNames(playerNames);
  if (nameError) throw new Error(nameError);
  if (settings.rounds > products.length) {
    throw new Error(`Ci sono solo ${products.length} prodotti disponibili.`);
  }
  return {
    settings: { ...settings },
    players: playerNames.map((name, index) => ({
      id: `p${index + 1}`,
      name: name.trim(),
      profitCents: 0,
    })),
    deck: shuffled(products, rng).slice(0, settings.rounds),
    roundIndex: 0,
    phase: 'preview',
    auction: null,
    sale: null,
    history: [],
  };
}

export function currentProduct(game) {
  return game.deck[game.roundIndex];
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

export function revealPrice(game) {
  const product = currentProduct(game);
  const { buyerId, priceCents } = game.sale;
  const deltaCents = buyerId === null ? 0 : product.priceCents - priceCents;
  return {
    ...game,
    phase: 'reveal',
    players: game.players.map((player) => (
      player.id === buyerId
        ? { ...player, profitCents: player.profitCents + deltaCents }
        : player
    )),
    history: [...game.history, { product, buyerId, priceCents, deltaCents }],
  };
}

export function nextRound(game) {
  if (game.roundIndex + 1 >= game.settings.rounds) return { ...game, phase: 'finished' };
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
  const sorted = [...game.players].sort((a, b) => b.profitCents - a.profitCents);
  let rank = 0;
  return sorted.map((player, index) => {
    if (index === 0 || player.profitCents !== sorted[index - 1].profitCents) rank = index + 1;
    return { ...player, rank };
  });
}

export function gameHighlights(game) {
  const purchases = game.history.filter((lot) => lot.buyerId !== null);
  const bestDeal = purchases.reduce(
    (best, lot) => (lot.deltaCents > (best?.deltaCents ?? 0) ? lot : best),
    null,
  );
  const worstBuy = purchases.reduce(
    (worst, lot) => (lot.deltaCents < (worst?.deltaCents ?? 0) ? lot : worst),
    null,
  );
  return { bestDeal, worstBuy };
}
