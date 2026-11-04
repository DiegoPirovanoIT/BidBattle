// Browser UI: renders the game state and turns user input into game actions.

import {
  AUCTION_MODES,
  HAMMER_COUNT,
  auctioneerBid,
  auctioneerTick,
  placeTurnBid,
  turnMinimumBid,
  withdrawFromTurn,
} from './auction.js';
import {
  DEFAULT_SETTINGS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  SETTING_LIMITS,
  createGame,
  currentProduct,
  gameHighlights,
  nextRound,
  parseEurosToCents,
  recordManualSale,
  revealPrice,
  standings,
  startAuction,
  updateAuction,
  validatePlayerNames,
} from './game.js';
import { loadCatalog } from './products.js';

const STORAGE_KEY = 'bidbattle.setup.v1';
const PLAYER_KEYS = ['q', 'z', 't', 'b', 'p', 'm'];

const MODE_INFO = {
  [AUCTION_MODES.TURNS]: {
    name: 'A turni',
    text: 'Un giocatore estratto a caso apre, gli altri rilanciano o si ritirano. Vince l\'ultimo rimasto.',
  },
  [AUCTION_MODES.AUCTIONEER]: {
    name: 'Battitore',
    text: 'Il gioco abbassa il prezzo finché qualcuno offre, poi lo alza. Vince chi resta in testa al tre.',
  },
  [AUCTION_MODES.MANUAL]: {
    name: 'Libera',
    text: 'Gestite l\'asta tra di voi, poi inserite chi ha comprato e a quale prezzo.',
  },
};

const euroFormat = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const dateFormat = new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' });

const root = document.querySelector('#app');

let catalog = null;
let setup = loadSetup();
let game = null;
let imageIndex = 0;
let errorMessage = '';
let tickTimer = null;

function loadSetup() {
  const defaults = { names: ['', ''], settings: { ...DEFAULT_SETTINGS } };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!Array.isArray(saved?.names)) return defaults;
    return {
      names: saved.names.slice(0, MAX_PLAYERS),
      settings: { ...DEFAULT_SETTINGS, ...saved.settings },
    };
  } catch {
    return defaults;
  }
}

function saveSetup() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(setup));
  } catch {
    // Saved setup is only a convenience: the game works without it.
  }
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

const money = (cents) => euroFormat.format(cents / 100);
const signedMoney = (cents) => `${cents > 0 ? '+' : ''}${money(cents)}`;
const playerById = (id) => game.players.find((player) => player.id === id);
const playerIndex = (id) => game.players.findIndex((player) => player.id === id);
const deltaClass = (cents) => {
  if (cents > 0) return 'gain';
  return cents < 0 ? 'loss' : '';
};

// Screens

function setupScreen() {
  const { names, settings } = setup;
  const maxRounds = Math.min(SETTING_LIMITS.rounds.max, catalog.products.length);
  const limits = SETTING_LIMITS;

  const playerRows = names.map((name, index) => `
    <div class="player-row">
      <span class="dot p${index}" aria-hidden="true"></span>
      <input name="player" value="${esc(name)}" maxlength="16" required
        aria-label="Nome giocatore ${index + 1}" placeholder="Giocatore ${index + 1}" autocomplete="off">
      ${names.length > MIN_PLAYERS
        ? `<button type="button" class="ghost" data-action="remove-player" data-index="${index}"
            aria-label="Rimuovi giocatore ${index + 1}">✕</button>`
        : ''}
    </div>`).join('');

  const modeCards = Object.entries(MODE_INFO).map(([mode, info]) => `
    <label class="mode-card">
      <input type="radio" name="mode" value="${mode}" ${settings.mode === mode ? 'checked' : ''}>
      <span><strong>${info.name}</strong>${info.text}</span>
    </label>`).join('');

  return `
    <section class="setup">
      <header class="masthead">
        <h1>BidBattle</h1>
        <p>Aggiudicato. Ma era davvero un affare?</p>
      </header>
      <form id="setup-form" class="sheet" novalidate>
        <fieldset>
          <legend>Giocatori</legend>
          ${playerRows}
          ${names.length < MAX_PLAYERS
            ? '<button type="button" class="ghost add" data-action="add-player">+ Aggiungi giocatore</button>'
            : ''}
        </fieldset>
        <fieldset>
          <legend>Tipo di asta</legend>
          <div class="mode-grid">${modeCards}</div>
        </fieldset>
        <fieldset>
          <legend>Impostazioni</legend>
          <div class="settings-grid">
            <label>Round
              <input type="number" name="rounds" value="${settings.rounds}" required
                min="${limits.rounds.min}" max="${maxRounds}">
            </label>
            <label>Rilancio minimo (%)
              <input type="number" name="minRaisePct" value="${settings.minRaisePct}" required
                min="${limits.minRaisePct.min}" max="${limits.minRaisePct.max}">
            </label>
            <label>Secondi tra gli annunci
              <input type="number" name="tickSeconds" value="${settings.tickSeconds}" required step="0.5"
                min="${limits.tickSeconds.min}" max="${limits.tickSeconds.max}">
            </label>
          </div>
        </fieldset>
        ${errorLine()}
        <button class="primary" type="submit">Apri l'asta</button>
      </form>
      ${catalogNote()}
    </section>`;
}

function catalogNote() {
  if (catalog.source === 'mock') {
    return '<p class="catalog-note">Prodotti e prezzi di prova, inventati.</p>';
  }
  if (!catalog.generatedAt) return '';
  return `<p class="catalog-note">Prezzi eBay aggiornati al ${esc(dateFormat.format(new Date(catalog.generatedAt)))}.</p>`;
}

function errorLine() {
  return `<p class="error" role="alert">${esc(errorMessage)}</p>`;
}

function scoreboard() {
  const auction = game.phase === 'auction' ? game.auction : null;
  const cards = game.players.map((player, index) => {
    const out = auction?.mode === AUCTION_MODES.TURNS && !auction.activeIds.includes(player.id);
    const classes = [
      'score',
      auction?.leaderId === player.id ? 'leading' : '',
      auction?.currentPlayerId === player.id ? 'turn' : '',
      out ? 'out' : '',
    ].join(' ');
    return `
      <li class="${classes}">
        <span class="dot p${index}" aria-hidden="true"></span>
        <span class="score-name">${esc(player.name)}</span>
        <span class="amount ${deltaClass(player.profitCents)}">${signedMoney(player.profitCents)}</span>
      </li>`;
  }).join('');
  return `<ol class="scoreboard" aria-label="Guadagni dei giocatori">${cards}</ol>`;
}

function productPanel(product) {
  const safeIndex = Math.min(imageIndex, product.images.length - 1);
  const thumbs = product.images.length < 2 ? '' : `
    <div class="thumbs">
      ${product.images.map((src, index) => `
        <button type="button" data-action="select-image" data-index="${index}"
          aria-label="Immagine ${index + 1}" aria-current="${index === safeIndex}">
          <img src="${esc(src)}" alt="">
        </button>`).join('')}
    </div>`;
  const tags = [product.category, product.condition].filter(Boolean)
    .map((tag) => `<span class="tag">${esc(tag)}</span>`).join('');

  return `
    <article class="lot">
      <img class="lot-image" src="${esc(product.images[safeIndex])}" alt="${esc(product.title)}">
      ${thumbs}
      <div class="lot-text">
        <div class="tags">${tags}</div>
        <h2>${esc(product.title)}</h2>
        <p>${esc(product.description)}</p>
      </div>
    </article>`;
}

function previewPanel() {
  const mode = MODE_INFO[game.settings.mode];
  return `
    <div class="panel">
      <p class="eyebrow">Lotto ${game.roundIndex + 1}</p>
      <h3>Guardate bene il prodotto</h3>
      <p>Sfogliate le immagini e leggete la descrizione. Il prezzo vero resta nascosto fino alla fine del round.</p>
      <p class="muted">Asta: ${mode.name}</p>
      <button class="primary" data-action="start-auction" data-autofocus>Inizia l'asta</button>
    </div>`;
}

function turnPanel(auction) {
  const player = playerById(auction.currentPlayerId);
  const minimum = turnMinimumBid(auction);
  const opening = auction.highBidCents === null;
  const leader = auction.leaderId ? playerById(auction.leaderId) : null;
  return `
    <div class="panel">
      <p class="eyebrow">${opening ? 'Offerta iniziale' : 'Tocca a'}</p>
      <h3 class="turn-name"><span class="dot p${playerIndex(player.id)}" aria-hidden="true"></span>${esc(player.name)}</h3>
      <p class="big-price">${opening ? 'Nessuna offerta' : money(auction.highBidCents)}</p>
      ${leader ? `<p class="muted">In testa: ${esc(leader.name)}</p>` : '<p class="muted">Sei stato estratto per aprire l\'asta.</p>'}
      <form id="bid-form" class="bid-form">
        <label>La tua offerta (minimo ${money(minimum)})
          <input name="amount" inputmode="decimal" autocomplete="off" required
            value="${(minimum / 100).toFixed(2).replace('.', ',')}">
        </label>
        ${errorLine()}
        <div class="actions">
          <button class="primary" type="submit">${opening ? 'Apri l\'asta' : 'Rilancia'}</button>
          ${opening ? '' : '<button class="secondary" type="button" data-action="withdraw">Mi ritiro</button>'}
        </div>
      </form>
    </div>`;
}

function auctioneerLine(auction) {
  if (auction.phase === 'descending') {
    return auction.announcedCents === auction.startCents
      ? 'Si parte da qui. Chi offre?'
      : 'Scendo ancora. Chi offre?';
  }
  const leader = esc(playerById(auction.leaderId).name);
  if (auction.hammerCount === 0) return `${money(auction.highBidCents)} da ${leader}. Chi rilancia?`;
  return `${money(auction.highBidCents)} a ${auction.hammerCount === 1 ? 'uno' : 'due'}…`;
}

function auctioneerPanel(auction) {
  const pips = Array.from({ length: HAMMER_COUNT }, (_, index) => (
    `<span class="pip ${index < auction.hammerCount ? 'on' : ''}"></span>`
  )).join('');
  const buttons = game.players.map((player, index) => {
    const leading = player.id === auction.leaderId;
    return `
      <button class="bid-button p${index}" data-bid-player="${player.id}" ${leading ? 'disabled' : ''}>
        <span>${esc(player.name)}</span>
        <small>${leading ? 'In testa' : `Offro · tasto ${PLAYER_KEYS[index].toUpperCase()}`}</small>
      </button>`;
  }).join('');
  return `
    <div class="panel auctioneer">
      <p class="eyebrow">${auction.phase === 'descending' ? 'Il prezzo scende' : 'Il prezzo sale'}</p>
      <p class="big-price" aria-live="polite">${money(auction.announcedCents)}</p>
      <p class="call">${auctioneerLine(auction)}</p>
      <div class="pips" aria-hidden="true">${pips}</div>
      <div class="bid-grid">${buttons}</div>
    </div>`;
}

function manualPanel() {
  const options = game.players.map((player, index) => `
    <label class="choice">
      <input type="radio" name="buyer" value="${player.id}">
      <span><span class="dot p${index}" aria-hidden="true"></span>${esc(player.name)}</span>
    </label>`).join('');
  return `
    <div class="panel">
      <p class="eyebrow">Asta libera</p>
      <h3>Chi ha comprato?</h3>
      <form id="manual-form" class="bid-form">
        <div class="choices">
          ${options}
          <label class="choice">
            <input type="radio" name="buyer" value="">
            <span>Nessuno, invenduto</span>
          </label>
        </div>
        <label>Prezzo di vendita (€)
          <input name="price" inputmode="decimal" autocomplete="off">
        </label>
        ${errorLine()}
        <button class="primary" type="submit">Conferma la vendita</button>
      </form>
    </div>`;
}

function hammerPanel() {
  const { buyerId, priceCents } = game.sale;
  const sold = buyerId !== null;
  return `
    <div class="panel hammer">
      <p class="eyebrow">${sold ? 'Aggiudicato' : 'Invenduto'}</p>
      ${sold
        ? `<h3>${esc(playerById(buyerId).name)}</h3><p class="big-price">${money(priceCents)}</p>`
        : '<h3>Nessuno ha comprato questo lotto</h3>'}
      <button class="primary" data-action="reveal" data-autofocus>Rivela il prezzo vero</button>
    </div>`;
}

function revealPanel() {
  const { product, buyerId, priceCents, deltaCents } = game.history.at(-1);
  const last = game.roundIndex + 1 >= game.settings.rounds;
  const verdict = deltaCents > 0 ? 'Affare!' : deltaCents < 0 ? 'Pagato troppo!' : 'Pari.';
  const outcome = buyerId === null
    ? '<p class="muted">Lotto invenduto: nessuno guadagna o perde.</p>'
    : `
      <dl class="ledger">
        <div><dt>Compratore</dt><dd>${esc(playerById(buyerId).name)}</dd></div>
        <div><dt>Pagato</dt><dd>${money(priceCents)}</dd></div>
        <div class="total ${deltaClass(deltaCents)}"><dt>${verdict}</dt><dd>${signedMoney(deltaCents)}</dd></div>
      </dl>`;
  const link = product.url
    ? `<p><a href="${esc(product.url)}" target="_blank" rel="noopener noreferrer">Vedi su eBay</a></p>`
    : '';
  return `
    <div class="panel reveal">
      <p class="eyebrow">Prezzo vero</p>
      <p class="big-price">${money(product.priceCents)}</p>
      ${outcome}
      ${link}
      <button class="primary" data-action="next-round" data-autofocus>${last ? 'Classifica finale' : 'Prossimo lotto'}</button>
    </div>`;
}

function highlightCard(label, lot) {
  if (!lot) return '';
  return `
    <div class="highlight">
      <p class="eyebrow">${label}</p>
      <h3>${esc(playerById(lot.buyerId).name)}</h3>
      <p>${esc(lot.product.title)}</p>
      <p class="amount ${deltaClass(lot.deltaCents)}">${signedMoney(lot.deltaCents)}</p>
    </div>`;
}

function highlightCards(bestDeal, worstBuy) {
  if (!bestDeal && !worstBuy) return '';
  return `
    <div class="highlights">
      ${highlightCard('Miglior affare', bestDeal)}
      ${highlightCard('Peggior acquisto', worstBuy)}
    </div>`;
}

function finishedScreen() {
  const ranking = standings(game);
  const winners = ranking.filter((player) => player.rank === 1);
  const rows = ranking.map((player) => `
    <li class="${player.rank === 1 ? 'winner' : ''}">
      <span class="rank">${player.rank}</span>
      <span class="dot p${playerIndex(player.id)}" aria-hidden="true"></span>
      <span class="score-name">${esc(player.name)}</span>
      <span class="amount ${deltaClass(player.profitCents)}">${signedMoney(player.profitCents)}</span>
    </li>`).join('');
  const { bestDeal, worstBuy } = gameHighlights(game);
  const lots = game.history.map(({ product, buyerId, priceCents, deltaCents }) => `
    <tr>
      <td>${esc(product.title)}</td>
      <td>${buyerId ? esc(playerById(buyerId).name) : '—'}</td>
      <td class="num">${priceCents === null ? '—' : money(priceCents)}</td>
      <td class="num">${money(product.priceCents)}</td>
      <td class="num ${deltaClass(deltaCents)}">${buyerId ? signedMoney(deltaCents) : '—'}</td>
    </tr>`).join('');

  return `
    <section class="final">
      <header class="masthead">
        <p class="eyebrow">Fine dell'asta</p>
        <h1>${winners.length > 1 ? 'Pareggio' : `Vince ${esc(winners[0].name)}`}</h1>
      </header>
      <ol class="ranking">${rows}</ol>
      ${highlightCards(bestDeal, worstBuy)}
      <div class="sheet table-wrap">
        <table>
          <thead><tr><th>Lotto</th><th>Compratore</th><th class="num">Pagato</th><th class="num">Valore</th><th class="num">Esito</th></tr></thead>
          <tbody>${lots}</tbody>
        </table>
      </div>
      <button class="primary" data-action="new-game" data-autofocus>Nuova partita</button>
    </section>`;
}

function actionPanel() {
  if (game.phase === 'preview') return previewPanel();
  if (game.phase === 'hammer') return hammerPanel();
  if (game.phase === 'reveal') return revealPanel();
  if (game.auction.mode === AUCTION_MODES.TURNS) return turnPanel(game.auction);
  if (game.auction.mode === AUCTION_MODES.AUCTIONEER) return auctioneerPanel(game.auction);
  return manualPanel();
}

function gameScreen() {
  if (game.phase === 'finished') return finishedScreen();
  return `
    <header class="topbar">
      <span class="brand">BidBattle</span>
      <span class="round">Round ${game.roundIndex + 1} di ${game.settings.rounds}</span>
      <button class="ghost" data-action="quit">Esci</button>
    </header>
    ${scoreboard()}
    <div class="stage ${game.phase === 'preview' ? '' : 'action-first'}">
      ${productPanel(currentProduct(game))}
      ${actionPanel()}
    </div>`;
}

function render() {
  root.innerHTML = game ? gameScreen() : setupScreen();
  const focusTarget = root.querySelector('#bid-form input[name="amount"]')
    ?? root.querySelector('[data-autofocus]');
  focusTarget?.focus({ preventScroll: true });
  focusTarget?.select?.();
  scheduleTick();
}

// Game actions

function setGame(nextGame) {
  const phaseChanged = nextGame.phase !== game?.phase;
  const roundChanged = nextGame.roundIndex !== game?.roundIndex;
  game = nextGame;
  errorMessage = '';
  if (roundChanged) imageIndex = 0;
  render();
  if (phaseChanged) window.scrollTo(0, 0);
}

function showError(message) {
  errorMessage = message;
  const line = root.querySelector('.error');
  if (line) line.textContent = message;
}

function clearTick() {
  clearTimeout(tickTimer);
  tickTimer = null;
}

function scheduleTick() {
  clearTick();
  if (game?.phase !== 'auction' || game.auction.mode !== AUCTION_MODES.AUCTIONEER) return;
  tickTimer = setTimeout(() => {
    setGame(updateAuction(game, auctioneerTick(game.auction)));
  }, game.settings.tickSeconds * 1000);
}

function bidAsAuctioneerPlayer(playerId) {
  const { auction } = game;
  if (game.phase !== 'auction' || auction.mode !== AUCTION_MODES.AUCTIONEER) return;
  if (auction.leaderId === playerId) return;
  setGame(updateAuction(game, auctioneerBid(auction, playerId)));
}

function readSetupForm() {
  const form = root.querySelector('#setup-form');
  if (!form) return;
  const data = new FormData(form);
  setup = {
    names: data.getAll('player').map(String),
    settings: {
      mode: data.get('mode'),
      rounds: Number(data.get('rounds')),
      minRaisePct: Number(data.get('minRaisePct')),
      tickSeconds: Number(data.get('tickSeconds')),
    },
  };
}

function settingsError(settings) {
  const labels = {
    rounds: 'I round',
    minRaisePct: 'Il rilancio minimo',
    tickSeconds: 'I secondi tra gli annunci',
  };
  const maxRounds = Math.min(SETTING_LIMITS.rounds.max, catalog.products.length);
  for (const [key, label] of Object.entries(labels)) {
    const { min } = SETTING_LIMITS[key];
    const max = key === 'rounds' ? maxRounds : SETTING_LIMITS[key].max;
    const value = settings[key];
    if (!Number.isFinite(value) || value < min || value > max) {
      return `${label}: inserisci un valore da ${min} a ${max}.`;
    }
  }
  return Number.isInteger(settings.rounds) ? null : 'I round devono essere un numero intero.';
}

function startGame() {
  readSetupForm();
  const problem = validatePlayerNames(setup.names) ?? settingsError(setup.settings);
  if (problem) {
    showError(problem);
    return;
  }
  saveSetup();
  setGame(createGame({
    playerNames: setup.names,
    settings: setup.settings,
    products: catalog.products,
  }));
}

function submitBid(form) {
  const amount = parseEurosToCents(new FormData(form).get('amount'));
  const { auction } = game;
  if (amount === null) {
    showError('Inserisci un importo valido, ad esempio 25,50.');
  } else if (amount < turnMinimumBid(auction)) {
    showError(`L'offerta minima è ${money(turnMinimumBid(auction))}.`);
  } else {
    setGame(updateAuction(game, placeTurnBid(auction, auction.currentPlayerId, amount)));
  }
}

function submitManualSale(form) {
  const data = new FormData(form);
  const buyer = data.get('buyer');
  if (buyer === null) {
    showError('Scegli chi ha comprato.');
  } else if (buyer === '') {
    setGame(recordManualSale(game, null, null));
  } else {
    const price = parseEurosToCents(data.get('price'));
    if (!price) showError('Inserisci il prezzo di vendita, ad esempio 25,50.');
    else setGame(recordManualSale(game, buyer, price));
  }
}

const actions = {
  'add-player': () => {
    readSetupForm();
    setup.names.push('');
    render();
  },
  'remove-player': (element) => {
    readSetupForm();
    setup.names.splice(Number(element.dataset.index), 1);
    render();
  },
  'select-image': (element) => {
    imageIndex = Number(element.dataset.index);
    const { images } = currentProduct(game);
    root.querySelector('.lot-image').src = images[imageIndex];
    root.querySelectorAll('.thumbs button').forEach((button, index) => {
      button.setAttribute('aria-current', String(index === imageIndex));
    });
  },
  'start-auction': () => setGame(startAuction(game)),
  withdraw: () => {
    const { auction } = game;
    setGame(updateAuction(game, withdrawFromTurn(auction, auction.currentPlayerId)));
  },
  reveal: () => setGame(revealPrice(game)),
  'next-round': () => setGame(nextRound(game)),
  'new-game': () => leaveGame(),
  quit: () => {
    if (window.confirm('Uscire dalla partita? I progressi andranno persi.')) leaveGame();
  },
};

function leaveGame() {
  clearTick();
  game = null;
  errorMessage = '';
  imageIndex = 0;
  render();
  window.scrollTo(0, 0);
}

root.addEventListener('click', (event) => {
  const element = event.target.closest('[data-action]');
  if (element) {
    actions[element.dataset.action](element);
    return;
  }
  // Keyboard activation of a bid button: pointer presses are handled on pointerdown.
  const bidButton = event.target.closest('[data-bid-player]');
  if (bidButton && event.detail === 0) bidAsAuctioneerPlayer(bidButton.dataset.bidPlayer);
});

// Bids register on press, not on release: in a live auction every moment counts.
root.addEventListener('pointerdown', (event) => {
  const bidButton = event.target.closest('[data-bid-player]');
  if (bidButton && !bidButton.disabled) bidAsAuctioneerPlayer(bidButton.dataset.bidPlayer);
});

root.addEventListener('submit', (event) => {
  event.preventDefault();
  if (event.target.id === 'setup-form') startGame();
  if (event.target.id === 'bid-form') submitBid(event.target);
  if (event.target.id === 'manual-form') submitManualSale(event.target);
});

document.addEventListener('keydown', (event) => {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
  const player = game?.players[PLAYER_KEYS.indexOf(event.key.toLowerCase())];
  if (player) bidAsAuctioneerPlayer(player.id);
});

try {
  catalog = await loadCatalog();
  if (catalog.products.length === 0) throw new Error('Il catalogo è vuoto.');
  render();
} catch (error) {
  root.innerHTML = `
    <section class="sheet fatal">
      <h1>La sala d'aste è chiusa</h1>
      <p>Non è stato possibile caricare i prodotti: ${esc(error.message)}</p>
    </section>`;
}
