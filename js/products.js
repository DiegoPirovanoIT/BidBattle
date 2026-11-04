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
    priceNote: 'Prezzo di vendita in dollari, convertito in euro al cambio recente.',
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
    priceNote: 'Prezzo pieno in dollari, convertito in euro al cambio recente.',
    glyph: '<rect x="4" y="11" width="40" height="22" rx="10"/><path d="M15 17v10M10 22h10"/><circle cx="33" cy="22" r="3" class="fill"/>',
  },
  {
    id: 'groceries',
    name: 'La Spesa',
    text: 'Scontrini veri di supermercati italiani: si offre sul totale di tutta la spesa.',
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
    priceNote: 'Offerta più alta rilevata ad asta ancora aperta, convertita da dollari in euro.',
    glyph: '<path d="M4 29V12h24v17M28 18h9l7 7v4H4"/><circle cx="14" cy="32" r="4" class="fill"/><circle cx="35" cy="32" r="4" class="fill"/>',
  },
]);

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

function normalizeProduct(raw, source) {
  const priceCents = Math.round(Number(raw?.price) * 100);
  const images = Array.isArray(raw?.images) ? raw.images.filter(Boolean) : [];
  if (!raw?.id || !raw?.title || !images.length || !(priceCents > 0)) return null;
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
    priceCents,
  };
}

export function parseCatalog(data, source = data?.source ?? 'unknown') {
  const rawProducts = Array.isArray(data?.products) ? data.products : [];
  return {
    source,
    generatedAt: data?.generatedAt ?? null,
    products: rawProducts.map((raw) => normalizeProduct(raw, source)).filter(Boolean),
  };
}

async function loadSource(source) {
  try {
    const response = await fetch(source.file, { cache: 'no-cache' });
    if (!response.ok) return { generatedAt: null, products: [] };
    return parseCatalog(await response.json(), source.id);
  } catch {
    return { generatedAt: null, products: [] };
  }
}

export async function loadCatalog() {
  const loaded = await Promise.all(SOURCES.map(loadSource));
  return {
    sources: SOURCES.map((source, index) => ({
      ...source,
      count: loaded[index].products.length,
      generatedAt: loaded[index].generatedAt,
    })),
    products: loaded.flatMap(({ products }) => products),
  };
}
