import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AUCTION_MODES, placeTurnBid, withdrawFromTurn } from '../js/auction.js';
import {
  DEFAULT_SETTINGS,
  createGame,
  currentProduct,
  gameHighlights,
  nextRound,
  parseEurosToCents,
  recordManualSale,
  revealPrice,
  standings,
  startAuction,
  updateAuction,
  validatePlayerNames,
} from '../js/game.js';
import { parseCatalog } from '../js/products.js';

const products = [
  { id: '1', title: 'Uno', priceCents: 10000, images: ['a'] },
  { id: '2', title: 'Due', priceCents: 5000, images: ['a'] },
];

const newGame = (overrides = {}) => createGame({
  playerNames: ['Anna', 'Luca'],
  settings: { ...DEFAULT_SETTINGS, rounds: 2, mode: AUCTION_MODES.MANUAL, ...overrides },
  products,
  rng: () => 0.5,
});

test('i nomi devono essere da 2 a 6, non vuoti e diversi', () => {
  assert.ok(validatePlayerNames(['Anna']));
  assert.ok(validatePlayerNames(['a', 'b', 'c', 'd', 'e', 'f', 'g']));
  assert.ok(validatePlayerNames(['Anna', ' ']));
  assert.ok(validatePlayerNames(['Anna', 'anna ']));
  assert.equal(validatePlayerNames(['Anna', 'Luca']), null);
});

test('i round non possono superare i prodotti disponibili', () => {
  assert.throws(() => newGame({ rounds: 3 }));
});

test('gli importi accettano virgola e punto e rifiutano il resto', () => {
  assert.equal(parseEurosToCents('12,50'), 1250);
  assert.equal(parseEurosToCents('12.5'), 1250);
  assert.equal(parseEurosToCents('19.99'), 1999);
  assert.equal(parseEurosToCents('abc'), null);
  assert.equal(parseEurosToCents('-5'), null);
  assert.equal(parseEurosToCents('1,234'), null);
});

test('comprare sotto il valore reale fa guadagnare la differenza', () => {
  let game = startAuction(newGame());
  const value = currentProduct(game).priceCents;
  game = revealPrice(recordManualSale(game, 'p1', value - 2000));
  assert.equal(game.players[0].profitCents, 2000);
  assert.equal(game.players[1].profitCents, 0);
});

test('comprare sopra il valore reale fa perdere la differenza', () => {
  let game = startAuction(newGame());
  const value = currentProduct(game).priceCents;
  game = revealPrice(recordManualSale(game, 'p2', value + 3000));
  assert.equal(game.players[1].profitCents, -3000);
});

test('un prodotto invenduto non fa guadagnare né perdere nessuno', () => {
  const game = revealPrice(recordManualSale(startAuction(newGame()), null, null));
  assert.deepEqual(game.players.map((p) => p.profitCents), [0, 0]);
  assert.equal(game.history[0].deltaCents, 0);
});

test('il prezzo manuale deve essere positivo e il compratore esistere', () => {
  const game = startAuction(newGame());
  assert.throws(() => recordManualSale(game, 'p1', 0));
  assert.throws(() => recordManualSale(game, 'p9', 100));
});

test("un'asta a turni chiusa porta alla vendita", () => {
  let game = startAuction(newGame({ mode: AUCTION_MODES.TURNS }), () => 0);
  game = updateAuction(game, placeTurnBid(game.auction, 'p1', 4000));
  assert.equal(game.phase, 'auction');
  game = updateAuction(game, withdrawFromTurn(game.auction, 'p2'));
  assert.equal(game.phase, 'hammer');
  assert.deepEqual(game.sale, { buyerId: 'p1', priceCents: 4000 });
});

test('la partita finisce dopo il numero di round stabilito, senza ripetere prodotti', () => {
  let game = newGame();
  const seen = new Set();
  for (let round = 0; round < 2; round += 1) {
    seen.add(currentProduct(game).id);
    game = nextRound(revealPrice(recordManualSale(startAuction(game), null, null)));
  }
  assert.equal(seen.size, 2);
  assert.equal(game.phase, 'finished');
});

test('la classifica ordina per saldo e gestisce i pari merito', () => {
  const ranking = standings({
    players: [
      { id: 'a', profitCents: 100 },
      { id: 'b', profitCents: 300 },
      { id: 'c', profitCents: 300 },
    ],
  });
  assert.deepEqual(ranking.map((p) => [p.id, p.rank]), [['b', 1], ['c', 1], ['a', 3]]);
});

test('i giocatori partono da zero e il budget non limita le offerte', () => {
  let game = startAuction(newGame());
  assert.deepEqual(game.players.map((p) => p.profitCents), [0, 0]);
  game = revealPrice(recordManualSale(game, 'p1', 99999900));
  assert.ok(game.players[0].profitCents < 0);
});

test('i premi finali indicano il miglior affare e il peggior acquisto', () => {
  const history = [
    { buyerId: 'p1', deltaCents: 500 },
    { buyerId: null, deltaCents: 0 },
    { buyerId: 'p2', deltaCents: -900 },
    { buyerId: 'p1', deltaCents: 1200 },
  ];
  const { bestDeal, worstBuy } = gameHighlights({ history });
  assert.equal(bestDeal.deltaCents, 1200);
  assert.equal(worstBuy.deltaCents, -900);
});

test('senza guadagni o perdite non ci sono premi', () => {
  const { bestDeal, worstBuy } = gameHighlights({ history: [{ buyerId: 'p1', deltaCents: 0 }] });
  assert.equal(bestDeal, null);
  assert.equal(worstBuy, null);
});

test('il catalogo scarta i prodotti senza foto o senza prezzo', () => {
  const catalog = parseCatalog({
    source: 'mock',
    products: [
      { id: '1', title: 'Valido', price: 12.5, images: ['x'] },
      { id: '2', title: 'Senza foto', price: 10, images: [] },
      { id: '3', title: 'Senza prezzo', images: ['x'] },
    ],
  });
  assert.deepEqual(catalog.products.map((p) => p.id), ['1']);
  assert.equal(catalog.products[0].priceCents, 1250);
});
