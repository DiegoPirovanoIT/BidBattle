// Rebuilds the catalogs in data/sources. Run with: npm run sources:update
// Pass names to rebuild only some of them: npm run sources:update -- games lego
// A source that fails keeps its previous file, so one bad API never empties the game.
// eBay runs only when named: its catalog is rebuilt by the deploy and stays out of Git.

import { writeSource } from './sources/common.mjs';
import { buildEbay } from './sources/ebay.mjs';
import { buildGames } from './sources/games.mjs';
import { buildGroceries } from './sources/groceries.mjs';
import { buildLego } from './sources/lego.mjs';
import { buildPaintings } from './sources/paintings.mjs';
import { updateRates } from './sources/rates.mjs';
import { buildSurplus } from './sources/surplus.mjs';

const BUILDERS = {
  rates: null,
  paintings: buildPaintings,
  lego: buildLego,
  games: buildGames,
  groceries: buildGroceries,
  surplus: buildSurplus,
};
const ON_REQUEST = { ebay: buildEbay };

const requested = process.argv.slice(2);
const builders = { ...BUILDERS, ...ON_REQUEST };
for (const id of requested.length ? requested : Object.keys(BUILDERS)) {
  try {
    if (id === 'rates') {
      console.log(`rates: ${await updateRates()} valute`);
      continue;
    }
    const products = await builders[id]();
    if (products.length === 0) throw new Error('nessun lotto utilizzabile');
    await writeSource(id, products);
    console.log(`${id}: ${products.length} lotti`);
  } catch (error) {
    console.error(`${id}: non aggiornato (${error.message})`);
    process.exitCode = 1;
  }
}
