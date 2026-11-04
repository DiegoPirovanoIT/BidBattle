// Shared helpers for the scripts that rebuild data/sources/*.json.

import { writeFile } from 'node:fs/promises';

// Some APIs refuse anonymous clients. The public repository identifies this one.
export const USER_AGENT = 'BidBattle/0.1 (+https://github.com/DiegoPirovanoIT/BidBattle)';

export async function fetchJson(url) {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`HTTP ${response.status} da ${new URL(url).host}`);
  return response.json();
}

export function stripHtml(html) {
  return String(html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function writeSource(id, products) {
  const file = new URL(`../../data/sources/${id}.json`, import.meta.url);
  const catalog = { source: id, generatedAt: new Date().toISOString(), products };
  await writeFile(file, `${JSON.stringify(catalog, null, 2)}\n`);
}
