// Exchange rates: what one unit of each currency is worth in euros, from the
// European Central Bank through Frankfurter. Prices stay in their own currency,
// so a new rate changes the euro figures without rebuilding any catalog.

import { readFile, writeFile } from 'node:fs/promises';
import { fetchJson } from './common.mjs';

const API = 'https://api.frankfurter.dev/v1/latest?base=EUR';
const FILE = new URL('../../data/rates.json', import.meta.url);

export function eurosPerUnit(perEuro) {
  const rates = { EUR: 1 };
  for (const [currency, rate] of Object.entries(perEuro)) {
    rates[currency] = Number((1 / rate).toPrecision(6));
  }
  return rates;
}

export async function updateRates() {
  const { date, rates } = await fetchJson(API);
  const catalog = { base: 'EUR', date, generatedAt: new Date().toISOString(), rates: eurosPerUnit(rates) };
  await writeFile(FILE, `${JSON.stringify(catalog, null, 2)}\n`);
  return Object.keys(catalog.rates).length;
}

export async function readRates() {
  return JSON.parse(await readFile(FILE, 'utf8')).rates;
}
