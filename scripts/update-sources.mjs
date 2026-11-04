// Rebuilds the catalogs in data/sources. Run with: npm run sources:update
// Pass names to rebuild only some of them: npm run sources:update -- games lego
// A source that fails keeps its previous file, so one bad API never empties the game.

import { writeSource } from './sources/common.mjs';
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

const requested = process.argv.slice(2);
for (const id of requested.length ? requested : Object.keys(BUILDERS)) {
  try {
    if (id === 'rates') {
      console.log(`rates: ${await updateRates()} valute`);
      continue;
    }
    const products = await BUILDERS[id]();
    if (products.length === 0) throw new Error('nessun lotto utilizzabile');
    await writeSource(id, products);
    console.log(`${id}: ${products.length} lotti`);
  } catch (error) {
    console.error(`${id}: non aggiornato (${error.message})`);
    process.exitCode = 1;
  }
}
