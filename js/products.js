// Loads every price source and keeps only the products the game can actually show.

// A source without a file yet, such as one still waiting for its API key, simply
// stays out of the game and shows as unavailable in the setup screen.
export const SOURCES = Object.freeze([
  {
    id: 'paintings',
    name: 'Capolavori',
    text: 'I dipinti più costosi mai venduti. Con il punteggio in euro, un solo quadro può decidere la partita.',
    file: 'data/sources/paintings.json',
    linkLabel: 'Wikipedia',
    priceNote: 'Prezzo di vendita in dollari.',
    glyph: '<rect x="6" y="4" width="36" height="32" rx="2"/><path d="M12 29l9-11 7 8 4-4 6 7"/>',
  },
  {
    id: 'lego',
    name: 'LEGO',
    text: 'Set LEGO recenti, con il prezzo di listino.',
    file: 'data/sources/lego.json',
    linkLabel: 'Brickset',
    priceNote: 'Prezzo di listino tedesco, in euro.',
    glyph: '<rect x="5" y="16" width="38" height="20" rx="2"/><path d="M12 16v-6h9v6M27 16v-6h9v6"/>',
  },
  {
    id: 'games',
    name: 'Videogiochi',
    text: 'Giochi per PC molto recensiti su Steam, a prezzo pieno.',
    file: 'data/sources/games.json',
    linkLabel: 'Steam',
    priceNote: 'Prezzo pieno su Steam, in dollari.',
    glyph: '<rect x="4" y="11" width="40" height="22" rx="10"/><path d="M15 17v10M10 22h10"/><circle cx="33" cy="22" r="3" class="fill"/>',
  },
  {
    id: 'groceries',
    name: 'La Spesa',
    text: 'Scontrini veri di supermercati italiani e stranieri: si offre sul totale di tutta la spesa.',
    file: 'data/sources/groceries.json',
    linkLabel: 'Open Prices',
    priceNote: 'Somma dei prezzi registrati sullo scontrino.',
    glyph: '<path d="M4 7h7l5 21h22l4-15H13"/><circle cx="19" cy="34" r="3" class="fill"/><circle cx="35" cy="34" r="3" class="fill"/>',
  },
  {
    id: 'surplus',
    name: 'Surplus USA',
    text: 'Lotti delle aste del governo americano: camion, macchinari, a volte aerei.',
    file: 'data/sources/surplus.json',
    linkLabel: 'GSA Auctions',
    priceNote: 'Offerta più alta rilevata ad asta ancora aperta.',
    glyph: '<path d="M4 29V12h24v17M28 18h9l7 7v4H4"/><circle cx="14" cy="32" r="4" class="fill"/><circle cx="35" cy="32" r="4" class="fill"/>',
  },
  {
    id: 'ebay',
    name: 'eBay',
    text: 'Inserzioni di venditori italiani, sempre diverse: dagli oggetti di casa alle carte Pokémon, ai lingotti e alle auto d\'epoca.',
    file: 'data/sources/ebay.json',
    linkLabel: 'eBay',
    priceNote: 'Prezzo chiesto dal venditore su eBay, spedizione esclusa.',
    glyph: '<path d="M8 17h32l-3 21H11z"/><path d="M17 17v-5a7 7 0 0 1 14 0v5"/>',
  },
]);

const NO_RATES = Object.freeze({ EUR: 1 });
const DAY_MS = 86400000;
const dayFormat = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

function validDate(value) {
  const date = new Date(value ?? NaN);
  return Number.isNaN(date.getTime()) ? null : date;
}

const daysWord = (days) => (days === 1 ? '1 giorno' : `${days} giorni`);

// Dates are stored rather than "days left", so the line stays true as the catalog ages.
export function auctionSummary(auction, now = new Date()) {
  const start = validDate(auction?.startsAt);
  const end = validDate(auction?.endsAt);
  // GSA gives days without a time: an auction is still open on its last day.
  const closed = end !== null && end.getTime() + DAY_MS <= now.getTime();
  const parts = [];
  if (start && start <= now) {
    const days = Math.floor(((closed ? end : now) - start) / DAY_MS);
    if (closed) parts.push(`Rimasta aperta ${daysWord(days)}`);
    else parts.push(days > 0 ? `Aperta da ${daysWord(days)}` : 'Aperta da oggi');
  }
  if (end) parts.push(`${closed ? 'Chiusa' : 'Chiude'} il ${dayFormat.format(end)}`);
  if (auction?.bidders > 0) parts.push(auction.bidders === 1 ? '1 offerente' : `${auction.bidders} offerenti`);
  return parts.join(' · ');
}

// A lot in a currency without a rate has no euro value for the score, so it stays out.
function normalizeProduct(raw, source, rates) {
  const priceCents = Math.round(Number(raw?.price) * 100);
  const images = Array.isArray(raw?.images) ? raw.images.filter(Boolean) : [];
  const currency = String(raw?.currency ?? 'EUR');
  const eurRate = rates[currency];
  if (!raw?.id || !raw?.title || !images.length || !(priceCents > 0) || !(eurRate > 0)) return null;
  return {
    id: String(raw.id),
    source,
    title: String(raw.title),
    description: String(raw.description ?? ''),
    condition: String(raw.condition ?? ''),
    category: String(raw.category ?? ''),
    images,
    url: raw.url ?? null,
    credit: String(raw.credit ?? ''),
    creditUrl: raw.creditUrl ?? null,
    auction: raw.auction ?? null,
    country: raw.country ?? null,
    priceCents,
    currency,
    eurRate,
  };
}

export function parseCatalog(data, source = data?.source ?? 'unknown', rates = NO_RATES) {
  const rawProducts = Array.isArray(data?.products) ? data.products : [];
  return {
    source,
    generatedAt: data?.generatedAt ?? null,
    products: rawProducts.map((raw) => normalizeProduct(raw, source, rates)).filter(Boolean),
  };
}

async function loadRates() {
  try {
    const response = await fetch('data/rates.json', { cache: 'no-cache' });
    if (!response.ok) return { date: null, rates: NO_RATES };
    const { date, rates } = await response.json();
    return { date: date ?? null, rates: { ...rates, ...NO_RATES } };
  } catch {
    return { date: null, rates: NO_RATES };
  }
}

async function loadSource(source, rates) {
  try {
    const response = await fetch(source.file, { cache: 'no-cache' });
    if (!response.ok) return { generatedAt: null, products: [] };
    return parseCatalog(await response.json(), source.id, rates);
  } catch {
    return { generatedAt: null, products: [] };
  }
}

export async function loadCatalog() {
  const { date, rates } = await loadRates();
  const loaded = await Promise.all(SOURCES.map((source) => loadSource(source, rates)));
  return {
    ratesDate: date,
    sources: SOURCES.map((source, index) => ({
      ...source,
      count: loaded[index].products.length,
      generatedAt: loaded[index].generatedAt,
    })),
    products: loaded.flatMap(({ products }) => products),
  };
}
