// LEGO: recent sets from Brickset, with the German list price because it is in
// euros. Brickset needs a free key: https://brickset.com/tools/webservices/requestkey

import { fetchJson } from './common.mjs';

const API = 'https://brickset.com/api/v3.asmx/getSets';
const YEARS_BACK = 4;
const PAGE_SIZE = 500;
const MIN_PRICE_EUR = 10;
const MAX_SETS = 150;

export function isPlayableSet(set) {
  return set.LEGOCom?.DE?.retailPrice >= MIN_PRICE_EUR && Boolean(set.image?.imageURL);
}

export function setProduct(set) {
  const pieces = set.pieces ? `, ${set.pieces} pezzi` : '';
  return {
    id: `lego-${set.setID}`,
    title: `${set.name} (${set.number})`,
    description: `Set LEGO ${set.theme} del ${set.year}${pieces}.`,
    condition: '',
    category: '',
    price: set.LEGOCom.DE.retailPrice,
    currency: 'EUR',
    images: [set.image.imageURL],
    url: set.bricksetURL ?? null,
    credit: 'Dati e immagine: Brickset',
    creditUrl: 'https://brickset.com',
  };
}

export async function buildLego() {
  const apiKey = process.env.BRICKSET_API_KEY;
  if (!apiKey) throw new Error('manca BRICKSET_API_KEY');
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: YEARS_BACK }, (_, index) => thisYear - index);
  const query = new URLSearchParams({
    apiKey,
    userHash: '',
    params: JSON.stringify({ year: years.join(','), pageSize: PAGE_SIZE, orderBy: 'Rating' }),
  });
  const { status, message, sets } = await fetchJson(`${API}?${query}`);
  if (status !== 'success') throw new Error(message);
  return sets.filter(isPlayableSet).slice(0, MAX_SETS).map(setProduct);
}
