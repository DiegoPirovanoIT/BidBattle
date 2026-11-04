// La Spesa: real receipts from Open Prices, in the currency they were paid in. One
// item costs too little for an auction, so a lot is a whole receipt. Each lot keeps
// its shop's country.

import { fetchJson } from './common.mjs';
import { readRates } from './rates.mjs';

const API = 'https://prices.openfoodfacts.org/api/v1';
const LOCATIONS = 100;
const PAGES_PER_LOCATION = 3;
const MIN_ITEMS = 5;
const MIN_TOTAL_EUR = 10;
const MAX_IMAGES = 4;
const MAX_LOTS_ITALY = 80;
const MAX_LOTS_ABROAD = 40;
const MAX_LOCATIONS_ABROAD = 10;
const MAX_LISTED_ITEMS = 12;

const itemLine = ({ name, quantity }) => (quantity > 1 ? `${quantity} x ${name}` : name);

// Weighed goods are priced per kilo, so their line total is not on the record.
function receiptItem(price) {
  const name = price.product?.product_name?.trim();
  if (!name || price.price_per || !(price.price > 0)) return null;
  const quantity = Math.max(1, Math.round(price.receipt_quantity ?? 1));
  return { name, quantity, cost: price.price * quantity, image: price.product.image_url };
}

const countryOf = (location) => location?.osm_address_country_code ?? null;

// The filters of the API let foreign shops through, so the country is checked here.
const isItalian = (location) => countryOf(location) === 'IT';

// One country fills the worldwide ranking, so each one gets a limited number of shops.
export function pickLocations(italian, worldwide) {
  const seen = new Map();
  const abroad = worldwide.filter((location) => {
    const country = countryOf(location);
    if (!country || country === 'IT') return false;
    seen.set(country, (seen.get(country) ?? 0) + 1);
    return seen.get(country) <= MAX_LOCATIONS_ABROAD;
  });
  return [...italian.filter(isItalian), ...abroad];
}

export function limitPerCountry(lots) {
  const seen = new Map();
  return lots.filter(({ country }) => {
    seen.set(country, (seen.get(country) ?? 0) + 1);
    return seen.get(country) <= (country === 'IT' ? MAX_LOTS_ITALY : MAX_LOTS_ABROAD);
  });
}

// A currency without a rate has no euro estimate, so its receipts stay out.
export function receiptLots(prices, rates = { EUR: 1 }) {
  const receipts = new Map();
  for (const price of prices) {
    const usable = countryOf(price.location) && price.proof?.type === 'RECEIPT' && rates[price.currency] > 0;
    const item = usable ? receiptItem(price) : null;
    if (item) {
      if (!receipts.has(price.proof_id)) receipts.set(price.proof_id, { price, items: [] });
      const receipt = receipts.get(price.proof_id);
      if (receipt.price.currency === price.currency) receipt.items.push(item);
    }
  }
  return [...receipts.entries()].flatMap(([proofId, { price, items }]) => {
    const total = Math.round(items.reduce((sum, { cost }) => sum + cost, 0) * 100) / 100;
    const images = items.map(({ image }) => image).filter(Boolean).slice(0, MAX_IMAGES);
    const { currency } = price;
    if (items.length < MIN_ITEMS || total * rates[currency] < MIN_TOTAL_EUR || !images.length) return [];
    const shop = price.location.osm_brand || price.location.osm_name || 'supermercato';
    const listed = items.slice(0, MAX_LISTED_ITEMS).map(itemLine).join(', ');
    const others = items.length - MAX_LISTED_ITEMS;
    return [{
      id: `receipt-${proofId}`,
      title: `Scontrino ${shop}: ${items.length} prodotti`,
      description: `${listed}${others > 0 ? ` e altri ${others}` : ''}.`,
      condition: '',
      category: '',
      price: total,
      currency,
      country: countryOf(price.location),
      images,
      url: null,
      credit: 'Prezzi: Open Prices (ODbL). Foto: Open Food Facts (CC BY-SA)',
      creditUrl: 'https://prices.openfoodfacts.org',
    }];
  });
}

export async function buildGroceries() {
  const ranking = `order_by=-price_count&size=${LOCATIONS}`;
  const italian = await fetchJson(`${API}/locations?osm_address_country__like=Italia&${ranking}`);
  const worldwide = await fetchJson(`${API}/locations?${ranking}`);
  const prices = [];
  for (const location of pickLocations(italian.items, worldwide.items)) {
    for (let page = 1; page <= PAGES_PER_LOCATION; page += 1) {
      const query = new URLSearchParams({
        location_id: String(location.id),
        type: 'PRODUCT',
        proof__type: 'RECEIPT',
        order_by: '-date',
        size: '100',
        page: String(page),
      });
      const { items, pages } = await fetchJson(`${API}/prices?${query}`);
      prices.push(...items);
      if (page >= pages) break;
    }
  }
  return limitPerCountry(receiptLots(prices, await readRates()));
}
