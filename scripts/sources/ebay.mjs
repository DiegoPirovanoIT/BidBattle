// eBay: listings located in Italy, from the Browse API. The price is the listing
// price without shipping. A search returns 200 listings for one call, so every
// playable one is kept; only the first few of each search also cost a detail call,
// which is what brings the description. The catalog must never reach the repository:
// data/sources/ebay.json is ignored by Git and only goes into the published site.
// Seller names are read to limit each seller, and are never saved.

import { stripHtml, USER_AGENT } from './common.mjs';

const MARKETPLACE = 'EBAY_IT';
const SCOPE = 'https://api.ebay.com/oauth/api_scope';
const PAGE_SIZE = 200;
const SLOT_MS = 6 * 3600 * 1000;
const CATEGORIES_PER_FAMILY = 5;
const POOR_CATEGORY_LOTS = 12;
const DETAILS_PER_SEARCH = 12;
const SPARE_SEARCHES = 10;
const LOTS_PER_SELLER = 25;
const MIN_LOTS = 300;
const MIN_CALLS_LEFT = 1000;
const MAX_BROWSE_CALLS = 1000;
const MAX_RETRIES = 2;
const PARALLEL_FAMILIES = 5;
const MAX_IMAGES = 6;
const MAX_DESCRIPTION = 600;
const PARTS_CONDITION_ID = '7000';

// Level 1 categories of EBAY_IT behind each family. Whatever is not listed stays
// out: vehicles, car parts, tickets, food, health, "Altre categorie" and so on.
const FAMILIES = {
  Musica: ['11233', '619'],
  Casa: ['11700', '20710', '159912'],
  Elettronica: ['58058', '15032', '293', '625'],
  Collezionismo: ['1', '11116', '260', '63'],
  Sport: ['888'],
  Moda: ['11450', '281'],
  Giochi: ['220', '1249'],
  'Arte e libri': ['353', '267', '11232'],
};

// Precious collecting has its own searches, with no ceiling on the price. Classic
// cars are mostly classified ads on eBay: their price is what the seller asks.
const LUXURY_WATCHES = '(rolex,omega,cartier,patek,audemars,breitling,"tag heuer",panerai)';
const SPECIAL_FAMILIES = {
  'Carte Pokémon': [{ category: '2536', q: 'pokemon', minPrice: 50, pages: 3 }],
  'Carte rare': [
    { category: '2536', q: '(magic,yu-gi-oh,yugioh,"one piece",lorcana)', minPrice: 50, pages: 2 },
    { category: '212', minPrice: 50, pages: 2 },
  ],
  'Monete e lingotti': [
    { category: '4733', minPrice: 100, pages: 2 },
    { category: '11116', q: 'oro', minPrice: 200, pages: 2 },
    { category: '39482', minPrice: 100, pages: 2 },
  ],
  'Lusso': [
    { category: '4196', minPrice: 500, pages: 2 },
    { category: '260324', q: LUXURY_WATCHES, minPrice: 500, pages: 2 },
  ],
  "Auto e moto d'epoca": [
    { category: '9801', q: '(epoca,storica,asi)', minPrice: 1000, classifieds: true },
    { category: '9804', q: '(epoca,storica,asi)', minPrice: 500, classifieds: true },
  ],
  Antiquariato: [
    { category: '7491', minPrice: 200, pages: 2 },
    { category: '553', minPrice: 200 },
    { category: '20096', minPrice: 200 },
    { category: '14429', minPrice: 100 },
  ],
};

const UNWANTED_CATEGORY = /ricambi|\blott[io]\b|\bstock\b|erotic|per adulti/i;
const UNWANTED_LISTING = /\blott[io]\b|\bstock\b|ricambi|ricambio|non funzionante|leggere descrizione/i;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const PHONE = /(?:\+|\b00)?\d(?:[ ./-]?\d){7,}/g;
const LINK = /\b(?:https?:\/\/|www\.)\S+/gi;
const AMOUNT = /(?:€|\beur[oi]?\b)\s?\d[\d.,]*|\d[\d.,]*\s?(?:€|\beur[oi]?\b)|\b(?:prezzo|stima|valore)\b[^\d\n]{0,15}\d[\d.,]*(?:\s?€)?/gi;

const MOBILE = /\b3\d{2}[ ./-]?\d{3}[ ./-]?\d{3,4}\b/g;
const ASKING_PRICE = /\d[\d.]*,\d{2}\s?(?:€|\beur[oi]?\b)/gi;

const ENTITIES = {
  nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', euro: '€', deg: '°', hellip: '…',
  agrave: 'à', egrave: 'è', eacute: 'é', igrave: 'ì', ograve: 'ò', ugrave: 'ù',
  Agrave: 'À', Egrave: 'È', Eacute: 'É', Igrave: 'Ì', Ograve: 'Ò', Ugrave: 'Ù',
  laquo: '«', raquo: '»', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
};

function decodeEntity(match, code) {
  if (code[0] !== '#') return ENTITIES[code] ?? ' ';
  const point = /^#x/i.test(code) ? parseInt(code.slice(2), 16) : Number(code.slice(1));
  return point <= 0x10FFFF ? String.fromCodePoint(point) : ' ';
}

const pause = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

// Calls that fail for good stop the whole update: after a 429 eBay must not get another one.
export function ebayClient({ id, secret, retryDelayMs = 1000 }) {
  const host = id.includes('-SBX-') ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com';
  let token = null;
  let browseCalls = 0;
  let failure = null;

  async function requestToken() {
    const response = await fetch(`${host}/identity/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
      },
      body: new URLSearchParams({ grant_type: 'client_credentials', scope: SCOPE }),
    });
    if (!response.ok) throw new Error(`token rifiutato da eBay (HTTP ${response.status})`);
    return (await response.json()).access_token;
  }

  async function attempt(path) {
    if (path.startsWith('/buy/browse/')) {
      browseCalls += 1;
      if (browseCalls > MAX_BROWSE_CALLS) throw new Error(`superate ${MAX_BROWSE_CALLS} chiamate Browse`);
    }
    return fetch(`${host}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': MARKETPLACE,
        'Accept-Encoding': 'gzip',
        'User-Agent': USER_AGENT,
      },
    });
  }

  async function getWithRetries(path) {
    token ??= await requestToken();
    for (let retry = 0; ; retry += 1) {
      const last = retry === MAX_RETRIES;
      let response = null;
      try {
        response = await attempt(path);
      } catch (error) {
        if (last || error.message.startsWith('superate')) throw error;
      }
      if (response?.status === 404) return null;
      if (response?.ok) return response.status === 204 ? null : response.json();
      if (response && (response.status < 500 || last)) {
        throw new Error(`HTTP ${response.status} da eBay su ${path.split('?')[0]}`);
      }
      await pause(retryDelayMs * 2 ** retry);
    }
  }

  return {
    async get(path) {
      if (failure) throw failure;
      try {
        return await getWithRetries(path);
      } catch (error) {
        failure = error;
        throw error;
      }
    },
  };
}

// eBay answers with one entry per resource: the tightest one is the real limit.
export function browseCallsLeft(limits) {
  const left = (limits?.rateLimits ?? [])
    .flatMap(({ resources }) => resources ?? [])
    .flatMap(({ rates }) => rates ?? [])
    .map(({ remaining }) => remaining)
    .filter(Number.isFinite);
  return left.length ? Math.min(...left) : null;
}

// Level 3 categories, or level 2 where the tree stops earlier. A level 1 category
// cannot be searched without a keyword.
export function familyCategories(root, topIds) {
  const found = [];
  const visit = (node, path) => {
    const name = `${path} > ${node.category.categoryName}`;
    if (UNWANTED_CATEGORY.test(name)) return;
    if (node.categoryTreeNodeLevel === 3 || node.leafCategoryTreeNode) found.push(node.category.categoryId);
    else (node.childCategoryTreeNodes ?? []).forEach((child) => visit(child, name));
  };
  (root.childCategoryTreeNodes ?? [])
    .filter(({ category }) => topIds.includes(category.categoryId))
    .forEach((node) => visit(node, ''));
  return found;
}

function seededRandom(text) {
  let state = 2166136261;
  for (const char of text) state = Math.imul(state ^ char.codePointAt(0), 16777619);
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(list, random) {
  const result = [...list];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

// The catalog keeps no memory between updates, so the turn comes from the clock.
// The first five are this update's categories, the others are spares for poor ones.
export function categoryRotation(ids, family, now) {
  const slot = Math.floor(now / SLOT_MS);
  const batches = Math.ceil(ids.length / CATEGORIES_PER_FAMILY);
  const order = shuffled(ids, seededRandom(`${family}:${Math.floor(slot / batches)}`));
  const start = (slot % batches) * CATEGORIES_PER_FAMILY;
  return [...order.slice(start), ...order.slice(0, start)];
}

export function searchParams({ category, q, minPrice = 10, maxPrice = 1500, classifieds = false }, page = 0) {
  const options = classifieds ? 'FIXED_PRICE|CLASSIFIED_AD' : 'FIXED_PRICE';
  const ceiling = q || classifieds || minPrice > 10 ? '' : maxPrice;
  return new URLSearchParams({
    category_ids: category,
    ...(q ? { q } : {}),
    filter: `buyingOptions:{${options}},itemLocationCountry:IT,price:[${minPrice}..${ceiling}],priceCurrency:EUR`,
    sort: 'newlyListed',
    limit: String(PAGE_SIZE),
    offset: String(page * PAGE_SIZE),
  });
}

// Works on search results and on full items. An auction without a fixed price has
// no price to reveal, and the search leaves some fields out.
export function isPlayableListing(item) {
  const options = item.buyingOptions ?? [];
  return (options.includes('FIXED_PRICE') || options.includes('CLASSIFIED_AD'))
    && Number(item.price?.value) > 0
    && !item.itemGroupType
    && !item.adultOnly
    && !(item.lotSize > 0)
    && item.conditionId !== PARTS_CONDITION_ID
    && !UNWANTED_LISTING.test(`${item.title} ${item.condition ?? ''}`);
}

function listingImages(item) {
  return [item.image, ...(item.additionalImages ?? [])]
    .map((image) => image?.imageUrl)
    .filter(Boolean)
    .slice(0, MAX_IMAGES);
}

// Sellers often write their contacts in the description: those are personal data.
// They also write prices, which players must not read while the price is hidden.
export function cleanDescription(html) {
  const text = stripHtml(String(html ?? '').replace(/<(style|script)\b[\s\S]*?<\/\1>|<!--[\s\S]*?-->/gi, ' '))
    .replace(/&(#x?[\da-f]+|[a-z]+);/gi, decodeEntity);
  return text.replace(EMAIL, '').replace(LINK, '').replace(AMOUNT, '…').replace(PHONE, '')
    .replace(/\s+/g, ' ').trim().slice(0, MAX_DESCRIPTION).trim();
}

// Titles are full of card numbers and face values ("Moneta oro 100€"), so only
// what is clearly a contact or an asking price with its cents goes away.
export function cleanTitle(title) {
  return title.replace(EMAIL, '').replace(LINK, '').replace(MOBILE, '').replace(ASKING_PRICE, '')
    .replace(/\s+/g, ' ').trim();
}

export function listingProduct(item, family) {
  return {
    id: item.itemId,
    title: cleanTitle(item.title),
    description: cleanDescription(item.description) || cleanDescription(item.shortDescription),
    condition: item.condition ?? '',
    category: family,
    price: Number(item.price.value),
    currency: item.price.currency,
    images: listingImages(item),
    url: item.itemWebUrl,
    credit: 'Dati e foto: eBay',
    creditUrl: 'https://www.ebay.it',
  };
}

function takeSellerSlot(sellers, item) {
  const seller = item.seller?.username;
  if (!seller) return true;
  const used = sellers.get(seller) ?? 0;
  if (used >= LOTS_PER_SELLER) return false;
  sellers.set(seller, used + 1);
  return true;
}

async function searchListings(api, search) {
  const listings = [];
  for (let page = 0; page < (search.pages ?? 1); page += 1) {
    const results = await api.get(`/buy/browse/v1/item_summary/search?${searchParams(search, page)}`);
    listings.push(...(results?.itemSummaries ?? []));
    if (!results?.next) break;
  }
  return listings;
}

function newListings(listings, shared) {
  return shuffled(listings.filter(isPlayableListing), Math.random).filter((listing) => {
    if (shared.seen.has(listing.itemId) || !listingImages(listing).length) return false;
    if (!takeSellerSlot(shared.sellers, listing)) return false;
    shared.seen.add(listing.itemId);
    return true;
  });
}

async function searchLots(api, search, family, shared) {
  const lots = [];
  for (const [index, listing] of newListings(await searchListings(api, search), shared).entries()) {
    const item = index < DETAILS_PER_SEARCH
      ? await api.get(`/buy/browse/v1/item/${encodeURIComponent(listing.itemId)}`)
      : listing;
    if (item && isPlayableListing(item)) lots.push(listingProduct(item, family));
  }
  return lots;
}

async function familyLots(api, family, categories, shared) {
  const lots = [];
  let searches = 0;
  for (const categoryId of categories) {
    if (searches >= CATEGORIES_PER_FAMILY) {
      if (lots.length >= CATEGORIES_PER_FAMILY * POOR_CATEGORY_LOTS || shared.spareSearches === 0) break;
      shared.spareSearches -= 1;
    }
    searches += 1;
    lots.push(...await searchLots(api, { category: categoryId }, family, shared));
  }
  return lots;
}

async function specialLots(api, family, searches, shared) {
  const lots = [];
  for (const search of searches) lots.push(...await searchLots(api, search, family, shared));
  return lots;
}

async function inParallel(items, limit, work) {
  const results = [];
  const queue = [...items.entries()];
  const worker = async () => {
    while (queue.length) {
      const [index, item] = queue.shift();
      results[index] = await work(item);
    }
  };
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

export async function buildEbay({ now = Date.now(), minLots = MIN_LOTS } = {}) {
  const { EBAY_CLIENT_ID: id, EBAY_CLIENT_SECRET: secret } = process.env;
  if (!id || !secret) throw new Error('servono EBAY_CLIENT_ID e EBAY_CLIENT_SECRET');
  const api = ebayClient({ id, secret });

  const left = browseCallsLeft(await api.get('/developer/analytics/v1_beta/rate_limit/?api_name=browse&api_context=buy'));
  if (left !== null && left < MIN_CALLS_LEFT) throw new Error(`restano solo ${left} chiamate Browse`);

  const { categoryTreeId } = await api.get(`/commerce/taxonomy/v1/get_default_category_tree_id?marketplace_id=${MARKETPLACE}`);
  const { rootCategoryNode } = await api.get(`/commerce/taxonomy/v1/category_tree/${categoryTreeId}`);

  const shared = { spareSearches: SPARE_SEARCHES, sellers: new Map(), seen: new Set() };
  const rotating = Object.entries(FAMILIES).map(([family, topIds]) => () => {
    const categories = familyCategories(rootCategoryNode, topIds);
    if (!categories.length) throw new Error(`nessuna categoria per ${family}`);
    return familyLots(api, family, categoryRotation(categories, family, now), shared);
  });
  const special = Object.entries(SPECIAL_FAMILIES).map(([family, searches]) => () => specialLots(api, family, searches, shared));
  const lots = await inParallel([...special, ...rotating], PARALLEL_FAMILIES, (work) => work());

  const products = lots.flat();
  if (products.length < minLots) throw new Error(`solo ${products.length} lotti validi, ne servono ${minLots}`);
  return products;
}
