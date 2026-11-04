// Videogiochi: well reviewed PC games from CheapShark, at their full Steam price.

import { USER_AGENT, fetchJson, toEuros, usdToEurRate } from './common.mjs';

const API = 'https://www.cheapshark.com/api/1.0/deals';
const STEAM_STORE_ID = '1';
const PAGES = 8;
const PAGE_SIZE = 60;
const MIN_PRICE_USD = 5;
const MIN_REVIEWS = 2000;
const MAX_GAMES = 120;

export function isPlayableDeal(deal) {
  return Boolean(deal.steamAppID)
    && Number(deal.normalPrice) >= MIN_PRICE_USD
    && Number(deal.steamRatingCount) >= MIN_REVIEWS;
}

export function gameProduct(deal, image, rate) {
  const reviews = Number(deal.steamRatingCount).toLocaleString('it-IT');
  const year = deal.releaseDate ? `Uscito nel ${new Date(deal.releaseDate * 1000).getUTCFullYear()}. ` : '';
  return {
    id: `game-${deal.gameID}`,
    title: deal.title,
    description: `${year}Recensioni positive su Steam: ${deal.steamRatingPercent}% di ${reviews}.`,
    condition: '',
    category: '',
    price: toEuros(Number(deal.normalPrice), rate),
    currency: 'EUR',
    images: [image],
    url: `https://store.steampowered.com/app/${deal.steamAppID}`,
    credit: 'Dati: CheapShark. Immagine: Steam',
    creditUrl: 'https://www.cheapshark.com',
  };
}

// The header picture is sharper than CheapShark's thumbnail, when Steam has it there.
async function bestImage(deal) {
  const header = `https://cdn.akamai.steamstatic.com/steam/apps/${deal.steamAppID}/header.jpg`;
  const response = await fetch(header, { method: 'HEAD', headers: { 'User-Agent': USER_AGENT } });
  return response.ok ? header : deal.thumb;
}

export async function buildGames() {
  const deals = new Map();
  for (let page = 0; page < PAGES; page += 1) {
    const query = new URLSearchParams({
      storeID: STEAM_STORE_ID,
      sortBy: 'Reviews',
      steamRating: '80',
      pageSize: String(PAGE_SIZE),
      pageNumber: String(page),
    });
    for (const deal of await fetchJson(`${API}?${query}`)) {
      if (isPlayableDeal(deal)) deals.set(deal.gameID, deal);
    }
  }
  const rate = await usdToEurRate();
  const chosen = [...deals.values()].slice(0, MAX_GAMES);
  return Promise.all(chosen.map(async (deal) => gameProduct(deal, await bestImage(deal), rate)));
}
