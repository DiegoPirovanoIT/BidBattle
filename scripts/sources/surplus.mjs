// Surplus USA: open lots of the GSA government auctions. The API only knows the
// current high bid, so the lots with the most bidders and the nearest close are
// kept. Lot notes hold names and phone numbers of officials: they are never copied.

import { fetchJson } from './common.mjs';

const API = 'https://api.gsa.gov/assets/gsaauctions/v2/auctions';
const MIN_BIDDERS = 3;
const MIN_BID_USD = 20;
const MAX_LOTS = 80;

const CATEGORIES = [
  ['Aerei', /aircraft|airplane|helicopter|airframe|\bbell oh|beechcraft|cessna/i],
  ['Barche', /\bboat|vessel|barge|marine\b/i],
  ['Veicoli', /^(19|20)\d\d\s|pickup|truck|trailer|\bsuv\b|\batv\b|\butv\b/i],
  ['Elettronica', /laptop|desktop|computer|network|printer|monitor|scanner|server|ipad|tablet|galaxy tab/i],
  ['Macchinari', /excavator|loader|tractor|forklift|mower|generator|drill|mining|plant|pump|machine|equipment|crane/i],
];

export function lotCategory(name) {
  return CATEGORIES.find(([, pattern]) => pattern.test(name))?.[0] ?? 'Varie';
}

export function isPlayableLot(lot) {
  return (lot.biddersCount ?? 0) >= MIN_BIDDERS
    && lot.highBidAmount >= MIN_BID_USD
    && Boolean(lot.imageURL)
    && Boolean(lot.itemName);
}

export function lotProduct(lot) {
  const agency = String(lot.agencyName ?? '').replace(/\s*\(.*\)\s*$/, '').trim();
  const city = String(lot.propertyCity ?? '').trim();
  const place = city ? `, a ${city} (${lot.propertyState})` : '';
  return {
    id: `gsa-${lot.saleNo}-${lot.lotNo}`,
    title: lot.itemName.trim(),
    description: `Messo all'asta da ${agency || 'un ente federale'}${place}.`,
    condition: '',
    category: lotCategory(lot.itemName),
    price: lot.highBidAmount,
    currency: 'USD',
    images: [lot.imageURL],
    url: lot.itemDescURL ?? null,
    credit: 'Dati e foto: GSA Auctions, governo USA',
    creditUrl: 'https://www.gsaauctions.gov',
    auction: {
      startsAt: lot.aucStartDt ?? null,
      endsAt: lot.aucEndDt ?? null,
      bidders: lot.biddersCount ?? null,
    },
  };
}

export async function buildSurplus() {
  const key = process.env.GSA_API_KEY || 'DEMO_KEY';
  const { Results } = await fetchJson(`${API}?api_key=${key}&format=JSON`);
  return Results.filter(isPlayableLot)
    .sort((a, b) => a.aucEndDt.localeCompare(b.aucEndDt))
    .slice(0, MAX_LOTS)
    .map(lotProduct);
}
