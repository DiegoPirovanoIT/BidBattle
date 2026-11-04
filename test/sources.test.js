import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gameProduct, isPlayableDeal } from '../scripts/sources/games.mjs';
import { limitPerCountry, pickLocations, receiptLots } from '../scripts/sources/groceries.mjs';
import { isPlayableSet, setProduct } from '../scripts/sources/lego.mjs';
import { paintingProduct, parsePaintings } from '../scripts/sources/paintings.mjs';
import { auctionSummary, parseCatalog } from '../js/products.js';
import { eurosPerUnit } from '../scripts/sources/rates.mjs';
import { isPlayableLot, lotCategory, lotProduct } from '../scripts/sources/surplus.mjs';

const WIKITEXT = `Intro
{| class="wikitable sortable"
! Adjusted !! Original !! Name
|-
! \${{Inflation|US|450.3|2017|r=1}}
| data-sort-value="$450.3"|$450.3 <!-- note -->
|''[[Salvator Mundi (Leonardo)|Salvator Mundi]]''
|[[File:Salvator.jpg|95px]]
|{{sort|Leonardo da Vinci|[[Leonardo da Vinci]]}}<br>(attribution disputed)
|data-sort-value=1500|{{circa|1500}}
|{{Dts|2017-11-15}}
|1
|Seller{{refn|group=note|A note with {{nested|template}} inside}}
|Buyer
|Christie's
|-
! $100
| data-sort-value="$50"|$50
|''No picture''
|
|Someone
|1900
|2000
|}
`;

test('paintings keep the sale price, not the inflation-adjusted one', () => {
  const [painting, ...others] = parsePaintings(WIKITEXT);
  assert.equal(others.length, 0, 'a row without an image is skipped');
  assert.deepEqual(painting, {
    title: 'Salvator Mundi',
    file: 'Salvator.jpg',
    priceUsd: 450300000,
    saleYear: '2017',
    artist: 'Leonardo da Vinci',
    year: 'c. 1500',
  });
});

test('a painting credits its image and does not show its price', () => {
  const product = paintingProduct(
    { title: 'Opera', file: 'A b.jpg', priceUsd: 100123456, saleYear: '2017', artist: 'Tiziano', year: '1550' },
    { url: 'https://img/a.jpg', pageUrl: 'https://commons/a', license: 'Public domain', artist: '<a href="x">Tiziano</a>' },
  );
  assert.deepEqual([product.price, product.currency], [100100000, 'USD']);
  assert.equal(product.description, 'Dipinto di Tiziano, 1550. Venduto nel 2017.');
  assert.match(product.credit, /^Immagine: Tiziano, Public domain/);
});

test('games need a Steam page, a real price and enough reviews', () => {
  const deal = { steamAppID: '620', normalPrice: '9.99', steamRatingCount: '5000' };
  assert.equal(isPlayableDeal(deal), true);
  assert.equal(isPlayableDeal({ ...deal, steamAppID: null }), false);
  assert.equal(isPlayableDeal({ ...deal, normalPrice: '0.00' }), false);
  assert.equal(isPlayableDeal({ ...deal, steamRatingCount: '20' }), false);
});

test('games use the full price, not the sale price', () => {
  const deal = {
    gameID: '1', title: 'Portal 2', normalPrice: '10.00', salePrice: '1.00',
    steamAppID: '620', steamRatingCount: '5000', steamRatingPercent: '98', releaseDate: 1303171200,
  };
  assert.equal(gameProduct(deal, 'https://img').price, 10);
});

const receiptPrice = (overrides = {}) => ({
  proof_id: 7,
  proof: { type: 'RECEIPT' },
  location: { osm_address_country_code: 'IT', osm_brand: 'Coop' },
  currency: 'EUR',
  price: 3,
  price_per: null,
  receipt_quantity: 1,
  product: { product_name: 'Pasta', image_url: 'https://img/p.jpg' },
  ...overrides,
});

test('a receipt becomes one lot worth the sum of its lines', () => {
  const prices = [receiptPrice({ receipt_quantity: 2 }), ...Array.from({ length: 4 }, () => receiptPrice())];
  const [lot] = receiptLots(prices);
  assert.equal(lot.price, 18);
  assert.equal(lot.title, 'Scontrino Coop: 5 prodotti');
  assert.match(lot.description, /^2 x Pasta, Pasta/);
});

test('a receipt keeps the country of its shop', () => {
  const five = (location) => Array.from({ length: 5 }, () => receiptPrice({ location }));
  assert.equal(receiptLots(five({ osm_address_country_code: 'FR', osm_brand: 'Carrefour' }))[0].country, 'FR');
  assert.equal(receiptLots(five({ osm_brand: 'Senza paese' })).length, 0, 'the country must be on the lot');
});

test('a receipt stays in its currency and the minimum is measured in euros', () => {
  const five = (overrides) => Array.from({ length: 5 }, () => receiptPrice({ currency: 'NOK', ...overrides }));
  const rates = { EUR: 1, NOK: 0.1 };
  const [lot] = receiptLots(five({ price: 30 }), rates);
  assert.deepEqual([lot.price, lot.currency], [150, 'NOK']);
  assert.equal(receiptLots(five({ price: 10 }), rates).length, 0, 'worth 5 euros');
});

test('rates say what one unit is worth in euros', () => {
  assert.deepEqual(eurosPerUnit({ USD: 1.25, NOK: 10 }), { EUR: 1, USD: 0.8, NOK: 0.1 });
});

test('a lot needs a rate for its currency', () => {
  const raw = { id: 'a', title: 'A', images: ['i'], price: 10 };
  const data = { products: [{ ...raw, currency: 'USD' }, { ...raw, id: 'b', currency: 'XXX' }, { ...raw, id: 'c' }] };
  const { products } = parseCatalog(data, 'test', { EUR: 1, USD: 0.8 });
  assert.deepEqual(products.map(({ id, currency, eurRate }) => [id, currency, eurRate]), [['a', 'USD', 0.8], ['c', 'EUR', 1]]);
});

test('every country gets a limited share of shops and lots', () => {
  const shops = (country, count) => Array.from({ length: count }, () => ({ osm_address_country_code: country }));
  const picked = pickLocations([...shops('IT', 2), ...shops('DE', 1)], [...shops('FR', 15), ...shops('IT', 1), ...shops('DE', 1)]);
  const count = (list, country) => list.filter((item) => item.osm_address_country_code === country).length;
  assert.deepEqual([count(picked, 'IT'), count(picked, 'FR'), count(picked, 'DE')], [2, 10, 1]);

  const lots = (country, length) => Array.from({ length }, () => ({ country }));
  const limited = limitPerCountry([...lots('FR', 50), ...lots('IT', 50)]);
  assert.equal(limited.filter(({ country }) => country === 'FR').length, 40);
  assert.equal(limited.filter(({ country }) => country === 'IT').length, 50);
});

test('price tags, other currencies and short receipts are left out', () => {
  const five = (overrides) => Array.from({ length: 5 }, () => receiptPrice(overrides));
  assert.equal(receiptLots(five({ currency: 'USD' })).length, 0, 'a currency without a rate');
  assert.equal(receiptLots(five({ proof: { type: 'PRICE_TAG' } })).length, 0);
  assert.equal(receiptLots(five({}).slice(0, 4)).length, 0);
  assert.equal(receiptLots(five({ price: 1 })).length, 0, 'under the minimum total');
});

test('surplus lots need real bidding', () => {
  const lot = { biddersCount: 5, highBidAmount: 900, imageURL: 'https://img', itemName: 'Truck' };
  assert.equal(isPlayableLot(lot), true);
  assert.equal(isPlayableLot({ ...lot, biddersCount: 1 }), false);
  assert.equal(isPlayableLot({ ...lot, highBidAmount: null }), false);
});

test('surplus lots never copy contact details', () => {
  const product = lotProduct({
    saleNo: 'S', lotNo: '1', itemName: '2020 Ford F150 ', highBidAmount: 1000,
    imageURL: 'https://img', agencyName: 'Forest Service (Code 12)', propertyCity: 'Reno ', propertyState: 'NV',
    lotInfo: 'Call Jane at 520-228-8880', coEmail: 'jane@gsa.gov', contractOfficer: 'Jane', coPhone: '5202288880',
  });
  assert.equal(product.price, 1000);
  assert.equal(product.currency, 'USD');
  assert.equal(product.description, "Messo all'asta da Forest Service, a Reno (NV).");
  assert.doesNotMatch(JSON.stringify(product), /Jane|jane|520/);
});

test('surplus lots keep the auction dates and bidders', () => {
  const { auction } = lotProduct({
    saleNo: 'S', lotNo: '1', itemName: 'Truck', highBidAmount: 1000, imageURL: 'https://img',
    aucStartDt: '2026-11-01T12:00:00Z', aucEndDt: '2026-11-10T12:00:00Z', biddersCount: 7,
  });
  assert.deepEqual(auction, { startsAt: '2026-11-01T12:00:00Z', endsAt: '2026-11-10T12:00:00Z', bidders: 7 });
});

test('the auction line follows the clock and skips what is missing', () => {
  const auction = { startsAt: '2026-11-01T12:00:00Z', endsAt: '2026-11-10T12:00:00Z', bidders: 7 };
  assert.equal(auctionSummary(auction, new Date('2026-11-04T13:00:00Z')), 'Aperta da 3 giorni · Chiude il 10 nov 2026 · 7 offerenti');
  assert.equal(auctionSummary(auction, new Date('2026-11-01T13:00:00Z')), 'Aperta da oggi · Chiude il 10 nov 2026 · 7 offerenti');
  assert.equal(auctionSummary(auction, new Date('2026-11-20T12:00:00Z')), 'Rimasta aperta 9 giorni · Chiusa il 10 nov 2026 · 7 offerenti');
  assert.equal(auctionSummary({ endsAt: '2026-11-05' }, new Date('2026-11-05T18:00:00Z')), 'Chiude il 5 nov 2026');
  assert.equal(auctionSummary({ endsAt: '2026-11-05' }, new Date('2026-11-06T01:00:00Z')), 'Chiusa il 5 nov 2026');
  assert.equal(auctionSummary({ endsAt: 'non una data', bidders: 1 }), '1 offerente');
  assert.equal(auctionSummary(null), '');
});

test('surplus categories come from the lot name', () => {
  assert.equal(lotCategory('Scrap Bell OH58A Aircraft'), 'Aerei');
  assert.equal(lotCategory('2009 International WorkStar 7400'), 'Veicoli');
  assert.equal(lotCategory('One Lot of Laptops'), 'Elettronica');
  assert.equal(lotCategory('Tents and Flooring'), 'Varie');
});

test('LEGO sets use the euro list price', () => {
  const set = {
    setID: 1, number: '10300-1', name: 'DeLorean', theme: 'Icons', year: 2022, pieces: 1872,
    LEGOCom: { DE: { retailPrice: 169.99 } }, image: { imageURL: 'https://img' },
  };
  assert.equal(isPlayableSet(set), true);
  assert.equal(isPlayableSet({ ...set, LEGOCom: { US: { retailPrice: 10 } } }), false);
  assert.equal(setProduct(set).price, 169.99);
});
