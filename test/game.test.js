import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AUCTION_MODES, placeTurnBid, withdrawFromTurn } from '../js/auction.js';
import {
  DEFAULT_SETTINGS,
  REVEAL_TIMINGS,
  SCORE_MODES,
  availableProducts,
  createGame,
  currentProduct,
  gameHighlights,
  nextRound,
  parseEurosToCents,
  recordManualSale,
  revealPrice,
  setLotAside,
  spentCents,
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
  assert.equal(game.players[0].score, 2000);
  assert.equal(game.players[1].score, 0);
});

test('comprare sopra il valore reale fa perdere la differenza', () => {
  let game = startAuction(newGame());
  const value = currentProduct(game).priceCents;
  game = revealPrice(recordManualSale(game, 'p2', value + 3000));
  assert.equal(game.players[1].score, -3000);
});

test('un prodotto invenduto non fa guadagnare né perdere nessuno', () => {
  const game = revealPrice(recordManualSale(startAuction(newGame()), null, null));
  assert.deepEqual(game.players.map((p) => p.score), [0, 0]);
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
      { id: 'a', score: 100 },
      { id: 'b', score: 300 },
      { id: 'c', score: 300 },
    ],
  });
  assert.deepEqual(ranking.map((p) => [p.id, p.rank]), [['b', 1], ['c', 1], ['a', 3]]);
});

test('i giocatori partono da zero e il budget non limita le offerte', () => {
  let game = startAuction(newGame());
  assert.deepEqual(game.players.map((p) => p.score), [0, 0]);
  game = revealPrice(recordManualSale(game, 'p1', 99999900));
  assert.ok(game.players[0].score < 0);
});

test('i premi finali indicano il miglior affare e il peggior acquisto', () => {
  const history = [
    { buyerId: 'p1', scoreDelta: 500 },
    { buyerId: null, scoreDelta: 0 },
    { buyerId: 'p2', scoreDelta: -900 },
    { buyerId: 'p1', scoreDelta: 1200 },
  ];
  const { bestDeal, worstBuy } = gameHighlights({ history });
  assert.equal(bestDeal.scoreDelta, 1200);
  assert.equal(worstBuy.scoreDelta, -900);
});

test('senza guadagni o perdite non ci sono premi', () => {
  const { bestDeal, worstBuy } = gameHighlights({ history: [{ buyerId: 'p1', scoreDelta: 0 }] });
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

test('le categorie escluse non entrano nel mazzo', () => {
  const mixed = [
    { id: '1', category: 'Musica', priceCents: 100, images: ['a'] },
    { id: '2', category: 'Casa', priceCents: 100, images: ['a'] },
    { id: '3', category: '', priceCents: 100, images: ['a'] },
  ];
  assert.deepEqual(availableProducts(mixed, ['Casa']).map((p) => p.id), ['1', '3']);
  const settings = { ...DEFAULT_SETTINGS, rounds: 2, excludedCategories: ['Casa'] };
  const game = createGame({ playerNames: ['Anna', 'Luca'], settings, products: mixed });
  assert.ok(game.deck.every((p) => p.category !== 'Casa'));
});

test('i round non possono superare i prodotti rimasti dopo il filtro', () => {
  const settings = { ...DEFAULT_SETTINGS, rounds: 2, excludedCategories: ['Casa'] };
  const mixed = [
    { id: '1', category: 'Musica', priceCents: 100, images: ['a'] },
    { id: '2', category: 'Casa', priceCents: 100, images: ['a'] },
  ];
  assert.throws(() => createGame({ playerNames: ['Anna', 'Luca'], settings, products: mixed }));
});

const atEnd = (overrides = {}) => newGame({ revealTiming: REVEAL_TIMINGS.AT_END, ...overrides });

test('con i prezzi alla fine nessuno guadagna o perde finché si gioca', () => {
  const game = setLotAside(recordManualSale(startAuction(atEnd()), 'p1', 100));
  assert.equal(game.phase, 'preview');
  assert.equal(game.roundIndex, 1);
  assert.equal(game.history.length, 0);
  assert.deepEqual(game.players.map((p) => p.score), [0, 0]);
});

test('alla fine i prezzi si rivelano uno per volta, nello stesso ordine dei lotti', () => {
  let game = atEnd();
  const [first, second] = game.deck;
  game = setLotAside(recordManualSale(startAuction(game), 'p1', 100));
  game = setLotAside(recordManualSale(startAuction(game), 'p2', 200));

  assert.equal(game.phase, 'reveal');
  assert.equal(game.history.length, 1);
  assert.equal(currentProduct(game).id, first.id);
  assert.equal(game.players[0].score, first.priceCents - 100);
  assert.equal(game.players[1].score, 0);

  game = nextRound(game);
  assert.equal(game.phase, 'reveal');
  assert.equal(game.history.length, 2);
  assert.equal(currentProduct(game).id, second.id);
  assert.equal(game.players[1].score, second.priceCents - 200);

  assert.equal(nextRound(game).phase, 'finished');
});

test('alla fine un lotto invenduto viene rivelato senza cambiare i guadagni', () => {
  let game = setLotAside(recordManualSale(startAuction(atEnd()), null, null));
  game = setLotAside(recordManualSale(startAuction(game), null, null));
  assert.equal(game.history[0].buyerId, null);
  assert.deepEqual(game.players.map((p) => p.score), [0, 0]);
});

test('con un solo round il prezzo si rivela subito dopo la vendita', () => {
  const game = setLotAside(recordManualSale(startAuction(atEnd({ rounds: 1 })), 'p1', 100));
  assert.equal(game.phase, 'reveal');
  assert.equal(nextRound(game).phase, 'finished');
});

test('con i prezzi alla fine si tiene il conto di quanto ha speso ogni giocatore', () => {
  let game = recordManualSale(startAuction(atEnd()), 'p1', 1500);
  assert.equal(spentCents(game, 'p1'), 1500);
  game = setLotAside(game);
  assert.equal(spentCents(game, 'p1'), 1500);
  assert.equal(spentCents(game, 'p2'), 0);
});

test('i lotti invenduti non contano nella spesa e nessuna vendita viene contata due volte', () => {
  let game = setLotAside(recordManualSale(startAuction(atEnd()), null, null));
  game = recordManualSale(startAuction(game), 'p1', 700);
  assert.equal(spentCents(game, 'p1'), 700);
  game = nextRound(setLotAside(game));
  assert.equal(spentCents(game, 'p1'), 700);
});

test('excluded sources stay out of the deck', () => {
  const mixed = [
    { id: '1', source: 'games', category: '', priceCents: 100 },
    { id: '2', source: 'lego', category: 'Casa', priceCents: 100 },
    { id: '3', source: 'paintings', category: '', priceCents: 100 },
  ];
  assert.deepEqual(availableProducts(mixed, [], ['lego']).map((p) => p.id), ['1', '3']);
  assert.throws(() => createGame({
    playerNames: ['Anna', 'Bruno'],
    settings: { ...DEFAULT_SETTINGS, rounds: 3, excludedSources: ['lego'] },
    products: mixed,
  }), /Ci sono solo 2 prodotti/);
});

test('a catalog tags every product with its source', () => {
  const data = { products: [{ id: 'a', title: 'T', price: 10, images: ['x'], credit: 'Foto' }] };
  const [product] = parseCatalog(data, 'games').products;
  assert.equal(product.source, 'games');
  assert.equal(product.credit, 'Foto');
});

function playLot(scoreMode, valueCents, paidCents) {
  const game = createGame({
    playerNames: ['Anna', 'Bruno'],
    settings: { ...DEFAULT_SETTINGS, rounds: 1, scoreMode },
    products: [{ id: 'a', title: 'Lotto', images: ['x'], priceCents: valueCents }],
  });
  return revealPrice(recordManualSale(game, 'p1', paidCents));
}

test('the percent score is measured on the real value of the lot', () => {
  const half = playLot(SCORE_MODES.PERCENT, 10000, 5000);
  assert.equal(half.players[0].score, 5000, 'half price is +50%');
  assert.equal(playLot(SCORE_MODES.PERCENT, 10000, 20000).players[0].score, -10000, 'double price is -100%');
  assert.equal(half.history[0].deltaCents, 5000, 'the lot still knows the money');
});

test('in percent a painting and a receipt weigh the same', () => {
  const painting = playLot(SCORE_MODES.PERCENT, 10000000000, 5000000000);
  const receipt = playLot(SCORE_MODES.PERCENT, 2000, 1000);
  assert.equal(painting.players[0].score, receipt.players[0].score);
});

test('the euro score stays the money gained', () => {
  assert.equal(playLot(SCORE_MODES.EUROS, 10000, 4000).players[0].score, 6000);
});

test('an unsold lot scores nothing in percent', () => {
  const game = createGame({
    playerNames: ['Anna', 'Bruno'],
    settings: { ...DEFAULT_SETTINGS, rounds: 1, scoreMode: SCORE_MODES.PERCENT },
    products: [{ id: 'a', title: 'Lotto', images: ['x'], priceCents: 100 }],
  });
  const done = revealPrice(recordManualSale(game, null, null));
  assert.deepEqual(done.players.map((player) => player.score), [0, 0]);
});
