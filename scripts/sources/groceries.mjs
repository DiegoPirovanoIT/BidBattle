// La Spesa: real receipts from Italian shops, from Open Prices. One item costs
// too little for an auction, so a lot is a whole receipt.

import { fetchJson } from './common.mjs';

const API = 'https://prices.openfoodfacts.org/api/v1';
const LOCATIONS = 100;
const PAGES_PER_LOCATION = 3;
const MIN_ITEMS = 5;
const MIN_TOTAL_EUR = 10;
const MAX_IMAGES = 4;
const MAX_LOTS = 80;
const MAX_LISTED_ITEMS = 12;

const itemLine = ({ name, quantity }) => (quantity > 1 ? `${quantity} x ${name}` : name);

// Weighed goods are priced per kilo, so their line total is not on the record.
function receiptItem(price) {
  const name = price.product?.product_name?.trim();
  if (!name || price.price_per || !(price.price > 0) || price.currency !== 'EUR') return null;
  const quantity = Math.max(1, Math.round(price.receipt_quantity ?? 1));
  return { name, quantity, cost: price.price * quantity, image: price.product.image_url };
}

// The filters of the API let foreign shops through, so the country is checked here.
export const isItalian = (location) => location?.osm_address_country_code === 'IT';

export function receiptLots(prices) {
  const receipts = new Map();
  for (const price of prices) {
    const item = isItalian(price.location) && price.proof?.type === 'RECEIPT' ? receiptItem(price) : null;
    if (item) {
      if (!receipts.has(price.proof_id)) receipts.set(price.proof_id, { price, items: [] });
      receipts.get(price.proof_id).items.push(item);
    }
  }
  return [...receipts.entries()].flatMap(([proofId, { price, items }]) => {
    const total = Math.round(items.reduce((sum, { cost }) => sum + cost, 0) * 100) / 100;
    const images = items.map(({ image }) => image).filter(Boolean).slice(0, MAX_IMAGES);
    if (items.length < MIN_ITEMS || total < MIN_TOTAL_EUR || !images.length) return [];
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
      currency: 'EUR',
      images,
      url: null,
      credit: 'Prezzi: Open Prices (ODbL). Foto: Open Food Facts (CC BY-SA)',
      creditUrl: 'https://prices.openfoodfacts.org',
    }];
  });
}

export async function buildGroceries() {
  const locations = await fetchJson(
    `${API}/locations?osm_address_country__like=Italia&order_by=-price_count&size=${LOCATIONS}`,
  );
  const prices = [];
  for (const location of locations.items.filter(isItalian)) {
    for (let page = 1; page <= PAGES_PER_LOCATION; page += 1) {
      const query = new URLSearchParams({
        location_id: String(location.id),
        type: 'PRODUCT',
        proof__type: 'RECEIPT',
        currency: 'EUR',
        order_by: '-date',
        size: '100',
        page: String(page),
      });
      const { items, pages } = await fetchJson(`${API}/prices?${query}`);
      prices.push(...items);
      if (page >= pages) break;
    }
  }
  return receiptLots(prices).slice(0, MAX_LOTS);
}
