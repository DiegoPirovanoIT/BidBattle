import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  HAMMER_COUNT,
  auctioneerBid,
  auctioneerTick,
  createAuctioneerAuction,
  createTurnAuction,
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

test('un prodotto economico parte comunque da almeno 5 euro', () => {
  const auction = createAuctioneerAuction({ valueCents: 100, minRaisePct: 5, rng: () => 0 });
  assert.equal(auction.startCents, 500);
  assert.ok(auction.stepCents > 0);
});
