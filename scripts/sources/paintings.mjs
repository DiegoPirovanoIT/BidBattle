// Capolavori: Wikipedia's list of the most expensive paintings. Only paintings
// whose image is freely licensed on Wikimedia Commons make it into the game.

import { fetchJson, stripHtml, toEuros, usdToEurRate } from './common.mjs';

const API = 'https://en.wikipedia.org/w/api.php';
const PAGE = 'List_of_most_expensive_paintings';
const IMAGE_WIDTH = 900;
const PRICE_STEP_EUR = 100000;
const TITLES_PER_REQUEST = 50;
const FREE_LICENSE = /public domain|^pd|^cc/i;

// Removes {{name ...}} templates even when they contain other templates.
function dropTemplates(text, names) {
  const pattern = new RegExp(`\\{\\{\\s*(${names.join('|')})\\b`, 'i');
  let result = text;
  for (let match = pattern.exec(result); match; match = pattern.exec(result)) {
    let depth = 0;
    let end = match.index;
    do {
      if (result.startsWith('{{', end)) { depth += 1; end += 2; }
      else if (result.startsWith('}}', end)) { depth -= 1; end += 2; }
      else end += 1;
    } while (depth > 0 && end < result.length);
    result = result.slice(0, match.index) + result.slice(end);
  }
  return result;
}

function cleanMarkup(wikitext) {
  const withoutNotes = wikitext
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<ref\b[^>]*\/>/g, '')
    .replace(/<ref\b[\s\S]*?<\/ref>/g, '');
  return dropTemplates(withoutNotes, ['refn', 'efn', 'sfn', 'citation needed', 'cn']);
}

function plainText(cell) {
  return cell
    .replace(/\{\{sort\|[^|{}]*\|([^{}]*)\}\}/gi, '$1')
    .replace(/\{\{(?:circa|c\.)\|([^{}|]*)[^{}]*\}\}/gi, 'c. $1')
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/'{2,}/g, '')
    .split(/<br\s*\/?>/i)[0]
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

// A cell is "attributes | value": the value is what follows the last single pipe
// outside links and templates.
function cellValue(cell) {
  const masked = cell.replace(/\[\[.*?\]\]|\{\{.*?\}\}/g, (part) => '\0'.repeat(part.length));
  const pipe = masked.lastIndexOf('|');
  return cell.slice(pipe + 1).trim();
}

function rowCells(row) {
  return row.split('\n').filter((line) => /^[|!]/.test(line))
    .flatMap((line) => line.slice(1).split(/\|\||!!/));
}

export function parsePaintings(wikitext) {
  const text = cleanMarkup(wikitext);
  const start = text.indexOf('{|');
  const table = text.slice(start, text.indexOf('\n|}', start));
  const paintings = new Map();
  for (const row of table.split(/\n\|-[^\n]*/).slice(1)) {
    const cells = rowCells(row);
    const priceUsd = Number(/\$\s*([\d.,]+)/.exec(cellValue(cells[1] ?? ''))?.[1]?.replace(/,/g, '')) * 1e6;
    const file = /\[\[(?:File|Image):([^|\]]+)/i.exec(row)?.[1]?.trim();
    const title = plainText(cellValue(cells[2] ?? ''));
    const saleYear = /\b(1[89]\d\d|20\d\d)\b/.exec(cells[6] ?? '')?.[1] ?? null;
    if (priceUsd > 0 && file && title) {
      const painting = {
        title,
        file,
        priceUsd,
        saleYear,
        artist: plainText(cellValue(cells[4] ?? '')),
        year: plainText(cellValue(cells[5] ?? '')),
      };
      if (!(paintings.get(title)?.priceUsd >= priceUsd)) paintings.set(title, painting);
    }
  }
  return [...paintings.values()];
}

export function paintingProduct(painting, image, rate) {
  const author = stripHtml(image.artist).slice(0, 60);
  const sold = painting.saleYear ? ` Venduto nel ${painting.saleYear}.` : '';
  return {
    id: `painting-${painting.file.replace(/\W+/g, '-').toLowerCase()}`,
    title: painting.title,
    description: `Dipinto di ${painting.artist}${painting.year ? `, ${painting.year}` : ''}.${sold}`,
    condition: '',
    category: '',
    // Sale prices are known to a fraction of a million: anything finer would be invented.
    price: Math.round(toEuros(painting.priceUsd, rate) / PRICE_STEP_EUR) * PRICE_STEP_EUR,
    currency: 'EUR',
    images: [image.url],
    url: `https://en.wikipedia.org/wiki/${PAGE}`,
    credit: `Immagine: ${author ? `${author}, ` : ''}${image.license}, da Wikimedia Commons`,
    creditUrl: image.pageUrl,
  };
}

async function freeImages(files) {
  const images = new Map();
  for (let index = 0; index < files.length; index += TITLES_PER_REQUEST) {
    const query = new URLSearchParams({
      action: 'query',
      format: 'json',
      formatversion: '2',
      prop: 'imageinfo',
      iiprop: 'url|extmetadata',
      iiextmetadatafilter: 'LicenseShortName|Artist',
      iiurlwidth: String(IMAGE_WIDTH),
      titles: files.slice(index, index + TITLES_PER_REQUEST).map((file) => `File:${file}`).join('|'),
    });
    const { query: result } = await fetchJson(`${API}?${query}`);
    const original = new Map((result.normalized ?? []).map(({ from, to }) => [to, from]));
    for (const page of result.pages) {
      const info = page.imageinfo?.[0];
      const license = info?.extmetadata?.LicenseShortName?.value ?? '';
      if (page.imagerepository === 'shared' && FREE_LICENSE.test(license)) {
        images.set((original.get(page.title) ?? page.title).replace(/^File:/, ''), {
          url: info.thumburl,
          pageUrl: info.descriptionurl,
          license,
          artist: info.extmetadata.Artist?.value ?? '',
        });
      }
    }
  }
  return images;
}

export async function buildPaintings() {
  const query = new URLSearchParams({
    action: 'parse', page: PAGE, prop: 'wikitext', format: 'json', formatversion: '2',
  });
  const { parse } = await fetchJson(`${API}?${query}`);
  const paintings = parsePaintings(parse.wikitext);
  const images = await freeImages(paintings.map(({ file }) => file));
  const rate = await usdToEurRate();
  return paintings.filter(({ file }) => images.has(file))
    .map((painting) => paintingProduct(painting, images.get(painting.file), rate));
}
