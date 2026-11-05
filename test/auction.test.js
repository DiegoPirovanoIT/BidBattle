import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  HAMMER_COUNT,
  auctioneerBid,
  auctioneerTick,
  createAuctioneerAuction,
  expertEstimate,
  createTurnAuction,
  expireTurn,
  minimumNextBid,
  placeTurnBid,
  turnMinimumBid,
  withdrawFromTurn,
} from '../js/auction.js';

const ids = ['a', 'b', 'c'];
const firstPlayer = () => 0;

test('il rilancio minimo è la percentuale arrotondata per eccesso, almeno 1 euro', () => {
  assert.equal(minimumNextBid(10000, 5), 10500);
  assert.equal(minimumNextBid(10100, 5), 10700);
  assert.equal(minimumNextBid(500, 5), 600);
});

test("il giocatore estratto deve aprire l'asta e non può ritirarsi", () => {
  const auction = createTurnAuction(ids, 5, () => 0.5);
  assert.equal(auction.currentPlayerId, 'b');
  assert.throws(() => withdrawFromTurn(auction, 'b'));
  assert.throws(() => placeTurnBid(auction, 'a', 1000));
});

test('un rilancio sotto il minimo viene rifiutato', () => {
  const auction = placeTurnBid(createTurnAuction(ids, 5, firstPlayer), 'a', 10000);
  assert.equal(turnMinimumBid(auction), 10500);
  assert.throws(() => placeTurnBid(auction, 'b', 10499));
  assert.equal(placeTurnBid(auction, 'b', 10500).leaderId, 'b');
});

test("l'ultimo giocatore rimasto compra al prezzo della sua offerta", () => {
  let auction = placeTurnBid(createTurnAuction(ids, 5, firstPlayer), 'a', 10000);
  auction = placeTurnBid(auction, 'b', 12000);
  auction = withdrawFromTurn(auction, 'c');
  assert.equal(auction.currentPlayerId, 'a');
  auction = withdrawFromTurn(auction, 'a');
  assert.equal(auction.status, 'sold');
  assert.equal(auction.leaderId, 'b');
  assert.equal(auction.highBidCents, 12000);
});

test('i giocatori ritirati vengono saltati e il turno non torna mai a chi è in testa', () => {
  let auction = placeTurnBid(createTurnAuction(['a', 'b', 'c', 'd'], 5, firstPlayer), 'a', 1000);
  auction = withdrawFromTurn(auction, 'b');
  auction = placeTurnBid(auction, 'c', 2000);
  assert.equal(auction.currentPlayerId, 'd');
  auction = withdrawFromTurn(auction, 'd');
  assert.equal(auction.currentPlayerId, 'a');
  auction = placeTurnBid(auction, 'a', 3000);
  assert.equal(auction.currentPlayerId, 'c');
  assert.throws(() => placeTurnBid(auction, 'b', 9000));
});

const newAuctioneer = () => createAuctioneerAuction({
  valueCents: 10000,
  minRaisePct: 5,
  rng: () => 0.5,
});

test('il prezzo scende a ogni annuncio e resta invenduto sotto la soglia', () => {
  let auction = newAuctioneer();
  const { startCents, stepCents } = auction;
  auction = auctioneerTick(auction);
  assert.equal(auction.announcedCents, startCents - stepCents);
  while (auction.status === 'open') auction = auctioneerTick(auction);
  assert.equal(auction.status, 'unsold');
  assert.equal(auction.leaderId, null);
});

test('la prima offerta ferma la discesa e il prezzo inizia a salire', () => {
  let auction = auctioneerTick(newAuctioneer());
  const offered = auction.announcedCents;
  auction = auctioneerBid(auction, 'a');
  assert.equal(auction.phase, 'ascending');
  assert.equal(auction.highBidCents, offered);
  assert.equal(auction.announcedCents, minimumNextBid(offered, 5));
  assert.throws(() => auctioneerBid(auction, 'a'));
});

test('una nuova offerta azzera il conto alla rovescia', () => {
  let auction = auctioneerBid(newAuctioneer(), 'a');
  auction = auctioneerTick(auctioneerTick(auction));
  assert.equal(auction.hammerCount, 2);
  auction = auctioneerBid(auction, 'b');
  assert.equal(auction.hammerCount, 0);
  for (let i = 0; i < HAMMER_COUNT; i += 1) auction = auctioneerTick(auction);
  assert.equal(auction.status, 'sold');
  assert.equal(auction.leaderId, 'b');
});

test("il prezzo di partenza è tra il 10% e il 150% del valore", () => {
  const startAt = (random) => createAuctioneerAuction({
    valueCents: 10000,
    minRaisePct: 5,
    rng: () => random,
  }).startCents;
  assert.equal(startAt(0), 1000);
  assert.equal(startAt(0.5), 8000);
  assert.equal(startAt(0.999), 15000);
});

test('il prezzo di partenza segue i valori scelti nelle impostazioni', () => {
  const startAt = (random) => createAuctioneerAuction({
    valueCents: 10000, minRaisePct: 5, startMinPct: 50, startMaxPct: 70, rng: () => random,
  }).startCents;
  assert.equal(startAt(0), 5000);
  assert.equal(startAt(0.999), 7000);
});

test("la stima dell'esperto contiene sempre il valore ed è larga almeno il 50%", () => {
  for (const valueCents of [1010, 4750, 18300, 99900, 750000, 15900000]) {
    for (const first of [0, 0.3, 0.999]) {
      for (const second of [0, 0.5, 0.999]) {
        const draws = [first, second];
        const { lowCents, highCents } = expertEstimate(valueCents, () => draws.shift());
        assert.ok(lowCents > 0 && lowCents <= valueCents && valueCents <= highCents);
        assert.ok(highCents - lowCents >= valueCents * 0.5);
      }
    }
  }
});

test("il valore non è al centro della stima dell'esperto", () => {
  const middle = (position) => {
    const draws = [0, position];
    const { lowCents, highCents } = expertEstimate(100000, () => draws.shift());
    return (lowCents + highCents) / 2;
  };
  assert.notEqual(middle(0), middle(0.999));
});

test('un prodotto economico parte comunque da almeno 1 euro', () => {
  const auction = createAuctioneerAuction({ valueCents: 100, minRaisePct: 5, rng: () => 0 });
  assert.equal(auction.startCents, 100);
  assert.ok(auction.stepCents > 0);
});

test("a tempo scaduto chi deve aprire offre il minimo, perché non può ritirarsi", () => {
  const auction = expireTurn(createTurnAuction(ids, 5, firstPlayer));
  assert.equal(auction.highBidCents, 100);
  assert.equal(auction.leaderId, 'a');
  assert.equal(auction.currentPlayerId, 'b');
});

test('a tempo scaduto chi deve rilanciare si ritira', () => {
  let auction = placeTurnBid(createTurnAuction(ids, 5, firstPlayer), 'a', 1000);
  auction = expireTurn(auction);
  assert.deepEqual(auction.activeIds, ['a', 'c']);
  auction = expireTurn(auction);
  assert.equal(auction.status, 'sold');
  assert.equal(auction.leaderId, 'a');
  assert.equal(auction.highBidCents, 1000);
});

test('the auctioneer announces round figures for very expensive lots', () => {
  const auction = createAuctioneerAuction({ valueCents: 40000000000, minRaisePct: 5, rng: () => 0.5 });
  assert.equal(auction.startCents, 32000000000);
  assert.equal(auction.stepCents, 2600000000);
  assert.ok(auction.floorCents < auction.startCents);
});
