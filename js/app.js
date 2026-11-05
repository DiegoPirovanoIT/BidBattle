// Browser UI: renders the game state and turns user input into game actions.

import {
  AUCTION_MODES,
  HAMMER_COUNT,
  auctioneerBid,
  auctioneerTick,
  expireTurn,
  placeTurnBid,
  turnMinimumBid,
  withdrawFromTurn,
} from './auction.js';
import {
  EXPERT_HINTS,
  AUCTION_CURRENCIES,
  DEFAULT_SETTINGS,
  GROCERY_SCOPES,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PADDLE_COLORS,
  REVEAL_PACES,
  REVEAL_TIMINGS,
  SCORE_MODES,
  SETTING_LIMITS,
  TURN_TIMER_OPTIONS,
  availableProducts,
  createGame,
  currentProduct,
  defaultPaddles,
  gameHighlights,
  isLastRound,
  nextPaddle,
  nextRound,
  parseAmountToCents,
  recordManualSale,
  revealPrice,
  revealsAtEnd,
  setLotAside,
  spentCents,
  toEuroCents,
  standings,
  startAuction,
  updateAuction,
  validatePaddles,
  validatePlayerNames,
} from './game.js';
import { playPodium, podiumSlots } from './podium.js';
import { auctionSummary, loadCatalog } from './products.js';
import { boardMarkup, playReveal, revealVerdict } from './reveal.js';

const STORAGE_KEY = 'bidbattle.setup.v1';
const PLAYER_KEYS = ['q', 'z', 't', 'b', 'p', 'm'];
const URGENT_SECONDS = 5;
const SKIP_KEYS = ['Enter', ' ', 'Escape'];
const WHOLE_EURO_CENTS = 100000000;
const MISSING_IMAGE = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 450"><rect width="600" height="450" fill="#d9dde6"/>'
  + '<text x="300" y="235" font-family="sans-serif" font-size="30" text-anchor="middle" fill="#55607a">Foto non disponibile</text></svg>',
)}`;

// Each glyph sketches how the price moves during that kind of auction.
const MODE_INFO = {
  [AUCTION_MODES.TURNS]: {
    name: 'A turni',
    text: 'Un giocatore estratto a caso apre, gli altri rilanciano o si ritirano. Vince l\'ultimo rimasto.',
    glyph: '<path d="M4 34h10V24h10V14h10V6h10"/>',
  },
  [AUCTION_MODES.AUCTIONEER]: {
    name: 'Battitore',
    text: 'Il gioco abbassa il prezzo finché qualcuno offre, poi lo alza. Vince chi resta in testa al tre.',
    glyph: '<path d="M4 6l18 26L44 10"/><circle cx="22" cy="32" r="4" class="fill"/>',
  },
  [AUCTION_MODES.MANUAL]: {
    name: 'Libera',
    text: 'Gestite l\'asta tra di voi, poi inserite chi ha comprato e a quale prezzo.',
    glyph: '<path d="M4 28c6-20 10-20 14-8s8 12 12 0 8-12 14 2"/>',
  },
};

const BIDDING_MODES = [AUCTION_MODES.TURNS, AUCTION_MODES.AUCTIONEER];

const SETTING_INFO = {
  rounds: { label: 'Round', step: 1, format: String, modes: Object.values(AUCTION_MODES) },
  minRaisePct: { label: 'Rilancio minimo', step: 1, format: (value) => `${value}%`, modes: BIDDING_MODES },
  tickSeconds: {
    label: 'Secondi tra gli annunci',
    step: 0.5,
    format: (value) => `${String(value).replace('.', ',')} s`,
    modes: [AUCTION_MODES.AUCTIONEER],
  },
  startMinPct: {
    label: 'Partenza minima, sul valore',
    step: 5,
    format: (value) => `${value}%`,
    modes: [AUCTION_MODES.AUCTIONEER],
  },
  startMaxPct: {
    label: 'Partenza massima, sul valore',
    step: 5,
    format: (value) => `${value}%`,
    modes: [AUCTION_MODES.AUCTIONEER],
  },
};

const TURN_TIMER_CHOICES = TURN_TIMER_OPTIONS.map((seconds) => ({
  value: seconds,
  label: seconds === 0 ? 'Nessuno' : `${seconds} s`,
}));

const EXPERT_HINT_CHOICES = [
  { value: EXPERT_HINTS.OFF, label: 'No' },
  { value: EXPERT_HINTS.ON, label: 'Sì' },
];

const REVEAL_PACE_CHOICES = [
  { value: REVEAL_PACES.FULL, label: 'Con suspense' },
  { value: REVEAL_PACES.QUICK, label: 'Rapida' },
];

const REVEAL_TIMING_CHOICES = [
  { value: REVEAL_TIMINGS.EACH_ROUND, label: 'Subito' },
  { value: REVEAL_TIMINGS.AT_END, label: 'Alla fine' },
];

const SCORE_MODE_CHOICES = [
  { value: SCORE_MODES.EUROS, label: 'In euro' },
  { value: SCORE_MODES.PERCENT, label: 'In percentuale' },
];

const AUCTION_CURRENCY_CHOICES = [
  { value: AUCTION_CURRENCIES.EUROS, label: 'Sempre in euro' },
  { value: AUCTION_CURRENCIES.LOCAL, label: 'Valuta locale' },
];

const GROCERY_SCOPE_CHOICES = [
  { value: GROCERY_SCOPES.ALL, label: 'Tutti i paesi' },
  { value: GROCERY_SCOPES.ITALY, label: 'Solo Italia' },
];

const countryNames = new Intl.DisplayNames('it', { type: 'region' });

const currencyNames = new Intl.DisplayNames('it', { type: 'currency' });
const rateFormat = new Intl.NumberFormat('it-IT', { maximumSignificantDigits: 3 });
const shortDateFormat = new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeZone: 'UTC' });
const percentFormat = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 });
const dateFormat = new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' });

const root = document.querySelector('#app');

let catalog = null;
let setup = loadSetup();
let game = null;
let imageIndex = 0;
let errorMessage = '';
let tickTimer = null;
let introPlayed = false;
let newPaddleIndex = null;
let extrasOpen = hasCustomExtras(setup.settings);
// The reveal or podium on screen, and whether it can still be skipped.
let show = null;
let showRunning = false;
// True while the reveal plays: the board starts blank and the buyer's old score stays up.
let revealStaged = false;

function withPaddles(names) {
  return defaultPaddles(names.length).map((paddle, index) => ({ name: names[index], ...paddle }));
}

function loadSetup() {
  const defaults = { players: withPaddles(['', '']), settings: { ...DEFAULT_SETTINGS } };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    // Setups saved before paddles could be customised hold only the names.
    const players = saved?.players ?? (Array.isArray(saved?.names) ? withPaddles(saved.names) : null);
    if (!Array.isArray(players)) return defaults;
    return {
      players: players.slice(0, MAX_PLAYERS),
      settings: { ...DEFAULT_SETTINGS, ...saved.settings },
    };
  } catch {
    return defaults;
  }
}

// The extra options start open when they are in use, so nothing active stays out of sight.
function hasCustomExtras(settings) {
  return settings.excludedCategories.length > 0
    || settings.turnSeconds !== DEFAULT_SETTINGS.turnSeconds
    || settings.revealPace !== DEFAULT_SETTINGS.revealPace
    || settings.revealTiming !== DEFAULT_SETTINGS.revealTiming;
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

const moneyFormats = new Map();

function moneyFormat(currency, whole) {
  const key = `${currency}${whole}`;
  if (!moneyFormats.has(key)) {
    moneyFormats.set(key, new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      ...(whole ? { maximumFractionDigits: 0 } : {}),
    }));
  }
  return moneyFormats.get(key);
}

// Cents mean nothing on a painting, and they would not fit on a phone.
const money = (cents, currency = 'EUR') => (
  moneyFormat(currency, Math.abs(cents) >= WHOLE_EURO_CENTS).format(cents / 100)
);

const currencyMark = (currency) => (
  moneyFormat(currency, false).formatToParts(0).find(({ type }) => type === 'currency').value
);

// What a lot's amount reads on screen, and its estimate in euros when it needs one.
const lotMoney = (cents, product) => money(cents, product.currency);
const euroEstimate = (cents, product) => (
  product.currency === 'EUR' ? '' : `≈ ${money(toEuroCents(cents, product))}`
);
const euroHint = (cents, product) => {
  const estimate = euroEstimate(cents, product);
  return estimate ? `<small class="euro-hint">${estimate}</small>` : '';
};

function currencyTag({ currency, eurRate }) {
  if (currency === 'EUR') return '';
  const name = currencyNames.of(currency);
  const label = name[0].toUpperCase() + name.slice(1);
  return `${label}: 1 ${currencyMark(currency)} ≈ ${rateFormat.format(eurRate)} €`;
}
const signedMoney = (cents) => `${cents > 0 ? '+' : ''}${money(cents)}`;
const signedPercent = (points) => `${points > 0 ? '+' : ''}${percentFormat.format(points / 100)}%`;
const signedScore = (score) => (
  game.settings.scoreMode === SCORE_MODES.PERCENT ? signedPercent(score) : signedMoney(score)
);
const playerById = (id) => game.players.find((player) => player.id === id);
const deltaClass = (cents) => {
  if (cents > 0) return 'gain';
  return cents < 0 ? 'loss' : '';
};

const sourceById = (id) => catalog.sources.find((source) => source.id === id);

// Only the categories of the chosen sources are on offer.
const catalogCategories = (excludedSources) => [
  ...new Set(availableProducts(catalog.products, [], excludedSources)
    .map((product) => product.category).filter(Boolean)),
].sort((a, b) => a.localeCompare(b, 'it'));

const productCount = ({ excludedCategories, excludedSources, groceryScope }) => (
  availableProducts(catalog.products, excludedCategories, excludedSources, groceryScope).length
);

const maxRoundsFor = (settings) => Math.min(SETTING_LIMITS.rounds.max, productCount(settings));

const poolText = (count) => (count === 1 ? '1 prodotto disponibile' : `${count} prodotti disponibili`);

// Screens

function disc({ number, color }) {
  return `<span class="disc p${color}" aria-hidden="true">${esc(number)}</span>`;
}

function paddleInput({ name, number, color }, index, canRemove) {
  const isNew = index === newPaddleIndex;
  return `
    <div class="paddle p${color} ${isNew ? 'rising' : ''}" style="--i: ${index}">
      <div class="paddle-head">
        <button type="button" class="paddle-color" data-action="open-colors" data-index="${index}"
          aria-label="Cambia colore giocatore ${index + 1}: ${PADDLE_COLORS[color]}"></button>
        <input class="paddle-number" name="paddleNumber" value="${esc(number)}" maxlength="3" inputmode="numeric"
          aria-label="Numero palette giocatore ${index + 1}" autocomplete="off">
        <input name="player" value="${esc(name)}" maxlength="16" required ${isNew ? 'data-autofocus' : ''}
          aria-label="Nome giocatore ${index + 1}" placeholder="Nome" autocomplete="off">
        ${canRemove
          ? `<button type="button" class="paddle-remove" data-action="remove-player" data-index="${index}"
              aria-label="Rimuovi giocatore ${index + 1}">✕</button>`
          : ''}
      </div>
      <span class="paddle-handle" aria-hidden="true"></span>
    </div>`;
}

function addPaddle(index) {
  return `
    <button type="button" class="paddle paddle-add" style="--i: ${index}" data-action="add-player">
      <span class="paddle-head"><span class="paddle-plus" aria-hidden="true">+</span>Aggiungi giocatore</span>
      <span class="paddle-handle" aria-hidden="true"></span>
    </button>`;
}

// A colour taken by another player shows that player's number and cannot be picked.
function colorDialog(index) {
  const swatches = PADDLE_COLORS.map((label, color) => {
    const owner = setup.players.find((player) => player.color === color);
    const mine = owner === setup.players[index];
    const taken = owner && !mine;
    return `
      <button type="button" class="swatch p${color}" data-action="pick-color" data-index="${index}" data-color="${color}"
        aria-label="${label}${taken ? ', già scelto' : ''}" aria-pressed="${mine}" ${taken ? 'disabled' : ''} ${mine ? 'autofocus' : ''}>
        ${mine ? '✓' : esc(owner?.number ?? '')}
      </button>`;
  }).join('');
  const name = setup.players[index].name.trim();
  return `
    <dialog class="color-dialog" aria-labelledby="color-title">
      <div class="color-sheet">
        <h2 id="color-title">${name ? `Il colore di ${esc(name)}` : 'Il colore della palette'}</h2>
        <div class="swatches">${swatches}</div>
        <button type="button" class="secondary" data-action="close-colors">Annulla</button>
      </div>
    </dialog>`;
}

function settingSlider(key, value, max, mode) {
  const { label, step, format, modes } = SETTING_INFO[key];
  const { min } = SETTING_LIMITS[key];
  const shown = Math.min(Math.max(value, min), max);
  return `
    <label class="setting" data-modes="${modes.join(' ')}" ${modes.includes(mode) ? '' : 'hidden'}>
      <span class="setting-label">${label}</span>
      <output class="setting-value">${format(shown)}</output>
      <input type="range" name="${key}" value="${shown}" min="${min}" max="${max}" step="${step}"
        style="--fill: ${sliderFill(shown, min, max)}">
    </label>`;
}

function sliderFill(value, min, max) {
  return `${max === min ? 100 : ((value - min) / (max - min)) * 100}%`;
}

function settingChoice(name, label, choices, selected, modes = Object.values(AUCTION_MODES), mode = null) {
  const options = choices.map(({ value, label: text }) => `
    <label class="choice">
      <input type="radio" name="${name}" value="${value}" ${value === selected ? 'checked' : ''}>
      <span>${text}</span>
    </label>`).join('');
  return `
    <div class="setting" role="radiogroup" aria-label="${label}" data-modes="${modes.join(' ')}"
      ${mode === null || modes.includes(mode) ? '' : 'hidden'}>
      <span class="setting-label">${label}</span>
      <div class="segments">${options}</div>
    </div>`;
}

function sourceMeta({ count, generatedAt }) {
  if (count === 0) return 'Non ancora disponibile';
  const lots = count === 1 ? '1 lotto' : `${count} lotti`;
  return generatedAt ? `${lots}, aggiornati al ${dateFormat.format(new Date(generatedAt))}` : lots;
}

function sourceCard(source, excludedSources) {
  const available = source.count > 0;
  return `
    <label class="mode-card source-card ${available ? '' : 'unavailable'}">
      <input type="checkbox" name="source" value="${source.id}"
        ${available && !excludedSources.includes(source.id) ? 'checked' : ''} ${available ? '' : 'disabled'}>
      <span class="mode-body">
        <svg viewBox="0 0 48 40" aria-hidden="true">${source.glyph}</svg>
        <span>
          <strong>${source.name}</strong>${source.text}
          <small class="source-meta">${esc(sourceMeta(source))}</small>
        </span>
      </span>
    </label>`;
}

// The choice only means something while La Spesa is in the game.
function groceryScopeField({ excludedSources, groceryScope }) {
  if (excludedSources.includes('groceries') || !sourceById('groceries')?.count) return '';
  return settingChoice('groceryScope', 'Scontrini de La Spesa', GROCERY_SCOPE_CHOICES, groceryScope);
}

function categoryField(settings) {
  const { excludedCategories, excludedSources } = settings;
  const categories = catalogCategories(excludedSources);
  if (categories.length < 2) return '';
  const chips = categories.map((category) => `
    <label class="choice">
      <input type="checkbox" name="category" value="${esc(category)}"
        ${excludedCategories.includes(category) ? '' : 'checked'}>
      <span>${esc(category)}</span>
    </label>`).join('');
  return `
    <div class="setting" role="group" aria-label="Categorie">
      <span class="setting-label">Categorie</span>
      <div class="segments">${chips}</div>
    </div>`;
}

function setupScreen() {
  const { players, settings } = setup;
  const maxRounds = Math.max(SETTING_LIMITS.rounds.min, maxRoundsFor(settings));
  const canAdd = players.length < MAX_PLAYERS;
  const slots = players.length + (canAdd ? 1 : 0);
  const paddles = players.map((player, index) => paddleInput(player, index, players.length > MIN_PLAYERS)).join('');

  const modeCards = Object.entries(MODE_INFO).map(([mode, info]) => `
    <label class="mode-card">
      <input type="radio" name="mode" value="${mode}" ${settings.mode === mode ? 'checked' : ''}>
      <span class="mode-body">
        <svg viewBox="0 0 48 40" aria-hidden="true">${info.glyph}</svg>
        <span><strong>${info.name}</strong>${info.text}</span>
      </span>
    </label>`).join('');

  return `
    <form id="setup-form" class="setup ${introPlayed ? '' : 'intro'}" novalidate>
      <div class="hall">
        <header class="masthead">
          <h1>BidBattle</h1>
          <p>Sviluppato da Diego Pirovano</p>
        </header>
        <fieldset class="crowd-field">
          <legend>Personalizzate le vostre palette</legend>
          <div class="crowd" style="--slots: ${slots}; --spread: ${slots > 3 ? 1.32 : 0.84}; --stagger: ${slots > 3 ? 0.84 : 0.16}">
            ${paddles}
            ${canAdd ? addPaddle(players.length) : ''}
          </div>
        </fieldset>
      </div>
      <div class="setup-sheet">
        <fieldset>
          <legend>Tipo di asta</legend>
          <div class="mode-list">${modeCards}</div>
        </fieldset>
        <fieldset>
          <legend>Fonti dei lotti</legend>
          <div class="source-list">
            ${catalog.sources.map((source) => sourceCard(source, settings.excludedSources)).join('')}
          </div>
          ${groceryScopeField(settings)}
          <p class="muted pool-note" data-pool-note>${poolText(productCount(settings))}</p>
        </fieldset>
        <fieldset>
          <legend>Impostazioni</legend>
          <div class="settings">
            ${settingSlider('rounds', settings.rounds, maxRounds, settings.mode)}
            ${settingSlider('minRaisePct', settings.minRaisePct, SETTING_LIMITS.minRaisePct.max, settings.mode)}
            ${settingSlider('tickSeconds', settings.tickSeconds, SETTING_LIMITS.tickSeconds.max, settings.mode)}
            ${settingSlider('startMinPct', settings.startMinPct, SETTING_LIMITS.startMinPct.max, settings.mode)}
            ${settingSlider('startMaxPct', settings.startMaxPct, SETTING_LIMITS.startMaxPct.max, settings.mode)}
            ${settingChoice('expertHint', 'Stima di un esperto prima dell\'asta', EXPERT_HINT_CHOICES, settings.expertHint)}
            ${settingChoice('auctionCurrency', 'Valuta delle aste', AUCTION_CURRENCY_CHOICES, settings.auctionCurrency)}
            ${settingChoice('scoreMode', 'Punteggio', SCORE_MODE_CHOICES, settings.scoreMode)}
            <p class="muted pool-note">In percentuale ogni lotto pesa uguale, quadro o scontrino: a metà del valore fai +50%, al doppio fai −100%.</p>
          </div>
          <details class="extras" ${extrasOpen ? 'open' : ''}>
            <summary>Altre opzioni</summary>
            <div class="settings">
              ${categoryField(settings)}
              ${settingChoice('turnSeconds', 'Tempo per ogni offerta', TURN_TIMER_CHOICES, settings.turnSeconds, [AUCTION_MODES.TURNS], settings.mode)}
              ${settingChoice('revealTiming', 'Quando rivelare i prezzi', REVEAL_TIMING_CHOICES, settings.revealTiming)}
              ${settingChoice('revealPace', 'Rivelazione del prezzo', REVEAL_PACE_CHOICES, settings.revealPace)}
            </div>
          </details>
        </fieldset>
        <div class="setup-end">
          ${errorLine()}
          <button class="primary open-auction" type="submit">Apri l'asta</button>
        </div>
      </div>
    </form>`;
}

function errorLine() {
  return `<p class="error" role="alert">${esc(errorMessage)}</p>`;
}

function scoreboard() {
  const auction = game.phase === 'auction' ? game.auction : null;
  const stagedLot = revealStaged ? game.history.at(-1) : null;
  // Until the first price is out there is no profit to show, only what each player has spent.
  const showSpending = revealsAtEnd(game) && game.phase !== 'reveal';
  const cards = game.players.map((player) => {
    const buying = stagedLot?.buyerId === player.id;
    const shownScore = buying ? player.score - stagedLot.scoreDelta : player.score;
    const out = auction?.mode === AUCTION_MODES.TURNS && !auction.activeIds.includes(player.id);
    const leading = auction?.leaderId === player.id;
    const turn = auction?.currentPlayerId === player.id;
    const state = (out && 'Ritirato') || (turn && 'Di turno') || (leading && 'In testa') || '';
    const classes = [
      'score',
      `p${player.color}`,
      leading ? 'leading' : '',
      turn ? 'turn' : '',
      out ? 'out' : '',
      buying ? 'lit' : '',
    ].join(' ');
    return `
      <li class="${classes}" data-player="${player.id}">
        ${disc(player)}
        <span class="score-name">${esc(player.name)}</span>
        ${showSpending
          ? `<span class="amount">Speso ${money(spentCents(game, player.id))}</span>`
          : `<span class="amount ${deltaClass(shownScore)}">${signedScore(shownScore)}</span>`}
        ${state ? `<span class="score-state">${state}</span>` : ''}
      </li>`;
  }).join('');
  return `<ol class="scoreboard" aria-label="${showSpending ? 'Spese' : 'Guadagni'} dei giocatori">${cards}</ol>`;
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
  const country = product.country ? countryNames.of(product.country) : '';
  const tags = [sourceById(product.source)?.name, country, product.category, product.condition, currencyTag(product)]
    .filter(Boolean)
    .map((tag) => `<span class="tag">${esc(tag)}</span>`).join('');

  return `
    <article class="lot">
      <p class="lot-number">Lotto ${game.roundIndex + 1}</p>
      <img class="lot-image" src="${esc(product.images[safeIndex])}" alt="${esc(product.title)}">
      ${thumbs}
      <div class="lot-text">
        <div class="tags">${tags}</div>
        <h2>${esc(product.title)}</h2>
        <p>${esc(product.description)}</p>
        ${auctionLine(product)}
        ${creditLine(product)}
      </div>
    </article>`;
}

function auctionLine({ auction }) {
  const summary = auctionSummary(auction);
  return summary ? `<p class="lot-auction">${esc(summary)}</p>` : '';
}

function creditLine({ credit, creditUrl }) {
  if (!credit) return '';
  const text = esc(credit);
  return `<p class="lot-credit">${creditUrl
    ? `<a href="${esc(creditUrl)}" target="_blank" rel="noopener noreferrer">${text}</a>`
    : text}</p>`;
}

function expertLine(product) {
  if (!product.estimate) return '';
  const { lowCents, highCents } = product.estimate;
  return `<p class="expert-hint">L'esperto stima tra <strong>${lotMoney(lowCents, product)}</strong> e <strong>${lotMoney(highCents, product)}</strong>.</p>`;
}

function previewPanel() {
  const mode = MODE_INFO[game.settings.mode];
  return `
    <div class="panel">
      <h3>Guardate bene il prodotto</h3>
      <p>Sfogliate le immagini e leggete la descrizione. Il prezzo vero resta nascosto fino alla fine ${revealsAtEnd(game) ? 'della partita' : 'del round'}.</p>
      ${expertLine(currentProduct(game))}
      <p class="muted">Asta: ${mode.name}</p>
      <button class="primary" data-action="start-auction" data-autofocus>Inizia l'asta</button>
    </div>`;
}

function turnClock(seconds) {
  if (!seconds) return '';
  return `
    <div class="turn-clock" role="timer" style="--clock: ${seconds}s">
      <span class="turn-clock-track"><span class="turn-clock-bar"></span></span>
      <span class="turn-clock-time"><span data-clock>${seconds}</span> s</span>
    </div>`;
}

function turnPanel(auction) {
  const product = currentProduct(game);
  const player = playerById(auction.currentPlayerId);
  const minimum = turnMinimumBid(auction);
  const opening = auction.highBidCents === null;
  const leader = auction.leaderId ? playerById(auction.leaderId) : null;
  return `
    <div class="panel flood p${player.color}">
      <p class="eyebrow">${opening ? 'Offerta iniziale' : 'Tocca a'}</p>
      <h3 class="turn-name">${disc(player)}${esc(player.name)}</h3>
      ${turnClock(game.settings.turnSeconds)}
      <p class="big-price">${opening ? 'Nessuna offerta' : lotMoney(auction.highBidCents, product)}</p>
      ${opening ? '' : euroHint(auction.highBidCents, product)}
      ${leader ? `<p class="muted">In testa: ${esc(leader.name)}</p>` : '<p class="muted">Sei stato estratto per aprire l\'asta.</p>'}
      <form id="bid-form" class="bid-form">
        <label>La tua offerta (minimo ${lotMoney(minimum, product)}) ${euroHint(minimum, product)}
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
  const bid = lotMoney(auction.highBidCents, currentProduct(game));
  if (auction.hammerCount === 0) return `${bid} da ${leader}. Chi rilancia?`;
  return `${bid} a ${auction.hammerCount === 1 ? 'uno' : 'due'}…`;
}

function auctioneerPanel(auction) {
  const product = currentProduct(game);
  const pips = Array.from({ length: HAMMER_COUNT }, (_, index) => (
    `<span class="pip ${index < auction.hammerCount ? 'on' : ''}"></span>`
  )).join('');
  const buttons = game.players.map((player, index) => {
    const leading = player.id === auction.leaderId;
    return `
      <button class="bid-button p${player.color}" data-bid-player="${player.id}" ${leading ? 'disabled' : ''}>
        <span class="bid-name">${esc(player.name)}</span>
        <small>${leading ? 'In testa' : 'Offro'}</small>
        <kbd aria-label="Tasto ${PLAYER_KEYS[index].toUpperCase()}">${PLAYER_KEYS[index].toUpperCase()}</kbd>
      </button>`;
  }).join('');
  return `
    <div class="panel auctioneer ${auction.phase}">
      <p class="eyebrow">${auction.phase === 'descending' ? 'Il prezzo scende' : 'Il prezzo sale'}</p>
      <p class="big-price" aria-live="polite">${lotMoney(auction.announcedCents, product)}</p>
      ${euroHint(auction.announcedCents, product)}
      <p class="call">${auctioneerLine(auction)}</p>
      <div class="pips" aria-hidden="true">${pips}</div>
      <div class="bid-grid">${buttons}</div>
    </div>`;
}

function manualPanel() {
  const options = game.players.map((player) => `
    <label class="choice">
      <input type="radio" name="buyer" value="${player.id}">
      <span>${disc(player)}${esc(player.name)}</span>
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
        <label>Prezzo di vendita (${currencyMark(currentProduct(game).currency)})
          <input name="price" inputmode="decimal" autocomplete="off">
        </label>
        ${errorLine()}
        <button class="primary" type="submit">Conferma la vendita</button>
      </form>
    </div>`;
}

function hammerAction() {
  if (!revealsAtEnd(game)) {
    return '<button class="primary" data-action="reveal" data-autofocus>Rivela il prezzo vero</button>';
  }
  return isLastRound(game)
    ? '<button class="primary" data-action="set-lot-aside" data-autofocus>Rivela i prezzi</button>'
    : `<p class="muted">Il prezzo resta nascosto fino alla fine della partita.</p>
       <button class="primary" data-action="set-lot-aside" data-autofocus>Prossimo lotto</button>`;
}

function hammerPanel() {
  const { buyerId, priceCents } = game.sale;
  const buyer = playerById(buyerId);
  const product = currentProduct(game);
  return `
    <div class="panel hammer ${buyer ? `flood p${buyer.color}` : ''}">
      <h3 class="stamp">${buyer ? 'Aggiudicato!' : 'Invenduto'}</h3>
      ${buyer
        ? `<p class="turn-name">${disc(buyer)}${esc(buyer.name)}</p>
           <p class="big-price">${lotMoney(priceCents, product)}</p>
           ${euroHint(priceCents, product)}`
        : '<p>Nessuno ha comprato questo lotto.</p>'}
      ${hammerAction()}
    </div>`;
}

function deltaLabel(cents) {
  if (cents > 0) return 'Guadagno';
  return cents < 0 ? 'Perdita' : 'Saldo';
}

function verdictClass({ buyerId, deltaCents }) {
  return buyerId === null ? '' : `verdict-${deltaClass(deltaCents) || 'even'}`;
}

function rateNote({ currency, original }) {
  if (!catalog.ratesDate || (currency === 'EUR' && !original)) return '';
  const date = shortDateFormat.format(new Date(catalog.ratesDate));
  return original
    ? `In origine ${money(original.priceCents, original.currency)}, convertito al cambio del ${date}.`
    : `Euro stimati al cambio del ${date}.`;
}

function revealPanel() {
  const lot = game.history.at(-1);
  const { product, buyerId, priceCents, deltaCents, scoreDelta } = lot;
  const nextLabel = revealsAtEnd(game) ? 'Prossimo prezzo' : 'Prossimo lotto';
  const verdict = revealVerdict(lot);
  const paid = buyerId === null ? '' : `
    <p class="paid">
      ${disc(playerById(buyerId))}
      <span class="paid-who">${esc(playerById(buyerId).name)} ha pagato</span>
      <strong class="paid-amount">${lotMoney(priceCents, product)} ${euroHint(priceCents, product)}</strong>
    </p>`;
  const outcome = buyerId === null
    ? '<p class="muted">Lotto invenduto: nessuno guadagna o perde.</p>'
    : `
      <dl class="ledger">
        <div class="total ${deltaClass(deltaCents)}"><dt>${deltaLabel(deltaCents)}</dt><dd data-delta>${signedScore(scoreDelta)}</dd></div>
      </dl>`;
  const source = sourceById(product.source);
  const link = product.url
    ? `<a href="${esc(product.url)}" target="_blank" rel="noopener noreferrer">Vedi su ${esc(source.linkLabel)}</a>`
    : '';
  return `
    <div class="panel reveal ${revealStaged ? 'staged' : verdictClass(lot)}">
      <p class="eyebrow">Prezzo vero</p>
      <p class="verdict-stamp">${verdict.label}</p>
      ${boardMarkup(product.priceCents, { staged: revealStaged, mark: currencyMark(product.currency) })}
      <small class="euro-hint" data-value-estimate>${revealStaged ? '' : euroEstimate(product.priceCents, product)}</small>
      ${paid}
      <p class="sr-only" aria-live="polite">${revealStaged ? '' : lotMoney(product.priceCents, product)}</p>
      ${outcome}
      <p class="reveal-link">${esc(source.priceNote)} ${rateNote(product)} ${link}</p>
      <div class="reveal-foot">
        <button class="primary" data-action="next-round" data-autofocus>${isLastRound(game) ? 'Classifica finale' : nextLabel}</button>
        <p class="skip-hint">Tocca lo schermo per saltare</p>
      </div>
    </div>`;
}

function highlightCard(label, lot) {
  if (!lot) return '';
  return `
    <div class="highlight">
      <p class="eyebrow">${label}</p>
      <h3>${esc(playerById(lot.buyerId).name)}</h3>
      <p>${esc(lot.product.title)}</p>
      <p class="amount ${deltaClass(lot.scoreDelta)}">${signedScore(lot.scoreDelta)}</p>
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

function podiumSlot(player) {
  return `
    <li class="podium-slot rank-${player.rank} p${player.color}" data-rank="${player.rank}">
      <div class="paddle p${player.color}">
        <div class="paddle-head">
          <span class="paddle-name">${esc(player.name)}</span>
        </div>
        <span class="paddle-handle" aria-hidden="true"></span>
      </div>
      <div class="podium-step">
        <span class="podium-rank">${player.rank}</span>
        <span class="amount ${deltaClass(player.score)}" data-score="${player.score}">${signedScore(0)}</span>
      </div>
    </li>`;
}

function finishedScreen() {
  const ranking = standings(game);
  const winners = ranking.filter((player) => player.rank === 1);
  const slots = podiumSlots(ranking);
  const rows = ranking.slice(slots.length).map((player) => `
    <li class="${player.rank === 1 ? 'winner' : ''}">
      <span class="rank">${player.rank}</span>
      ${disc(player)}
      <span class="score-name">${esc(player.name)}</span>
      <span class="amount ${deltaClass(player.score)}">${signedScore(player.score)}</span>
    </li>`).join('');
  const { bestDeal, worstBuy } = gameHighlights(game);
  const lots = game.history.map(({ product, buyerId, priceCents, scoreDelta }) => `
    <tr>
      <td>${esc(product.title)}</td>
      <td>${buyerId ? esc(playerById(buyerId).name) : '—'}</td>
      <td class="num">${priceCents === null ? '—' : `${lotMoney(priceCents, product)} ${euroHint(priceCents, product)}`}</td>
      <td class="num">${lotMoney(product.priceCents, product)} ${euroHint(product.priceCents, product)}</td>
      <td class="num ${deltaClass(scoreDelta)}">${buyerId ? signedScore(scoreDelta) : '—'}</td>
    </tr>`).join('');

  return `
    <section class="final staged">
      <header class="final-head">
        <p>Fine dell'asta</p>
        <h1 class="final-title">${winners.length > 1 ? 'Pareggio' : `Vince ${esc(winners[0].name)}`}</h1>
      </header>
      <ol class="podium" style="--slots: ${slots.length}" aria-label="Podio">${slots.map(podiumSlot).join('')}</ol>
      <p class="podium-hint">Tocca lo schermo per saltare</p>
      <div class="final-rest">
        ${rows ? `<ol class="ranking" start="${slots.length + 1}">${rows}</ol>` : ''}
        ${highlightCards(bestDeal, worstBuy)}
        <div class="sheet table-wrap">
          <table>
            <thead><tr><th>Lotto</th><th>Compratore</th><th class="num">Pagato</th><th class="num">Valore</th><th class="num">Esito</th></tr></thead>
            <tbody>${lots}</tbody>
          </table>
        </div>
        <button class="primary" data-action="new-game" data-autofocus>Nuova partita</button>
      </div>
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

function roundProgress() {
  const { rounds } = game.settings;
  const steps = Array.from({ length: rounds }, (_, index) => (
    `<span class="${index <= game.roundIndex ? 'done' : ''}"></span>`
  )).join('');
  return `<span class="progress" aria-hidden="true">${steps}</span>`;
}

function gameScreen() {
  if (game.phase === 'finished') return finishedScreen();
  const roundWord = revealsAtEnd(game) && game.phase === 'reveal' ? 'Prezzo' : 'Round';
  return `
    <div class="game">
      <header class="topbar">
        <span class="brand">BidBattle</span>
        <span class="round">${roundWord} ${game.roundIndex + 1} di ${game.settings.rounds}</span>
        ${roundProgress()}
        <button class="ghost" data-action="quit">Esci</button>
      </header>
      ${scoreboard()}
      <div class="stage ${game.phase === 'preview' ? '' : 'action-first'}">
        ${productPanel(currentProduct(game))}
        ${actionPanel()}
      </div>
    </div>`;
}

function render() {
  // The sheet scrolls on its own, so drawing it again must not send it back to the top.
  const sheetScroll = root.querySelector('.setup-sheet')?.scrollTop ?? 0;
  root.innerHTML = game ? gameScreen() : setupScreen();
  if (!game) {
    introPlayed = true;
    root.querySelector('.setup-sheet').scrollTop = sheetScroll;
  }
  const focusTarget = root.querySelector('#bid-form input[name="amount"]')
    ?? root.querySelector('[data-autofocus]');
  focusTarget?.focus({ preventScroll: true });
  focusTarget?.select?.();
  scheduleTick();
}

// Game actions

function setGame(nextGame) {
  const phaseChanged = nextGame.phase !== game?.phase;
  // At the end of the game one reveal follows another, so the phase alone is not enough.
  const newReveal = nextGame.history.length > (game?.history.length ?? 0);
  const roundChanged = nextGame.roundIndex !== game?.roundIndex;
  game = nextGame;
  errorMessage = '';
  if (roundChanged) imageIndex = 0;
  stopShow();
  revealStaged = newReveal;
  render();
  if (phaseChanged || newReveal) window.scrollTo(0, 0);
  if (revealStaged) startReveal();
  else if (phaseChanged && game.phase === 'finished') startPodium();
}

function stopShow() {
  show?.cancel();
  show = null;
  showRunning = false;
  revealStaged = false;
}

function startPodium() {
  showRunning = true;
  show = playPodium({
    section: root.querySelector('.final'),
    format: signedScore,
    onDone: () => {
      showRunning = false;
      root.querySelector('[data-autofocus]').focus({ preventScroll: true });
    },
  });
}

function startReveal() {
  const lot = game.history.at(-1);
  const panel = root.querySelector('.reveal');
  const buyer = lot.buyerId === null ? null : playerById(lot.buyerId);
  showRunning = true;
  show = playReveal({
    panel,
    valueCents: lot.product.priceCents,
    delta: lot.scoreDelta,
    verdict: revealVerdict(lot),
    verdictClass: verdictClass(lot),
    pace: game.settings.revealPace,
    score: buyer && {
      card: root.querySelector(`[data-player="${buyer.id}"]`),
      from: buyer.score - lot.scoreDelta,
      to: buyer.score,
    },
    formatSigned: signedScore,
    toneClass: deltaClass,
    onDone: () => {
      showRunning = false;
      revealStaged = false;
      panel.querySelector('.sr-only').textContent = lotMoney(lot.product.priceCents, lot.product);
      panel.querySelector('[data-value-estimate]').textContent = euroEstimate(lot.product.priceCents, lot.product);
      panel.querySelector('[data-autofocus]').focus({ preventScroll: true });
    },
  });
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
  if (game?.phase !== 'auction') return;
  if (game.auction.mode === AUCTION_MODES.AUCTIONEER) {
    tickTimer = setTimeout(() => {
      setGame(updateAuction(game, auctioneerTick(game.auction)));
    }, game.settings.tickSeconds * 1000);
  } else if (game.auction.mode === AUCTION_MODES.TURNS && game.settings.turnSeconds > 0) {
    runTurnClock(game.settings.turnSeconds);
  }
}

// Only the clock's own text changes, so a half-typed bid is never redrawn.
function runTurnClock(seconds) {
  let left = seconds;
  const tick = () => {
    left -= 1;
    if (left <= 0) {
      expireCurrentTurn();
      return;
    }
    root.querySelector('[data-clock]').textContent = left;
    root.querySelector('.turn-clock').classList.toggle('urgent', left <= URGENT_SECONDS);
    tickTimer = setTimeout(tick, 1000);
  };
  tickTimer = setTimeout(tick, 1000);
}

function expireCurrentTurn() {
  const { auction } = game;
  const { name } = playerById(auction.currentPlayerId);
  const opening = auction.highBidCents === null;
  setGame(updateAuction(game, expireTurn(auction)));
  showError(`Tempo scaduto: ${name} ${opening ? 'apre con il minimo' : 'si ritira'}.`);
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
  extrasOpen = form.querySelector('.extras').open;
  const names = data.getAll('player').map(String);
  const numbers = data.getAll('paddleNumber').map((number) => number.trim());
  setup = {
    players: setup.players.map((player, index) => ({ ...player, name: names[index], number: numbers[index] })),
    settings: {
      mode: data.get('mode'),
      rounds: Number(data.get('rounds')),
      minRaisePct: Number(data.get('minRaisePct')),
      tickSeconds: Number(data.get('tickSeconds')),
      startMinPct: Number(data.get('startMinPct')),
      startMaxPct: Number(data.get('startMaxPct')),
      expertHint: data.get('expertHint'),
      turnSeconds: Number(data.get('turnSeconds')),
      revealPace: data.get('revealPace'),
      revealTiming: data.get('revealTiming'),
      scoreMode: data.get('scoreMode'),
      auctionCurrency: data.get('auctionCurrency'),
      excludedCategories: excludedCategoriesFrom(data),
      excludedSources: excludedSourcesFrom(data),
      // Hidden with La Spesa, the choice waits for the source to come back.
      groceryScope: data.get('groceryScope') ?? setup.settings.groceryScope,
    },
  };
}

function excludedSourcesFrom(data) {
  const chosen = data.getAll('source');
  return catalog.sources.map(({ id }) => id).filter((id) => !chosen.includes(id));
}

// Categories hidden with their source keep their state for when the source returns.
function excludedCategoriesFrom(data) {
  const chosen = data.getAll('category');
  const shown = [...root.querySelectorAll('input[name="category"]')].map((input) => input.value);
  const hidden = setup.settings.excludedCategories.filter((category) => !shown.includes(category));
  return [...hidden, ...shown.filter((category) => !chosen.includes(category))];
}

// The rounds slider cannot go past the products left in the chosen categories.
function syncCategories(form) {
  const data = new FormData(form);
  const settings = {
    excludedCategories: excludedCategoriesFrom(data),
    excludedSources: excludedSourcesFrom(data),
    groceryScope: data.get('groceryScope') ?? setup.settings.groceryScope,
  };
  form.querySelector('[data-pool-note]').textContent = poolText(productCount(settings));
  const slider = form.elements.rounds;
  slider.max = Math.max(SETTING_LIMITS.rounds.min, maxRoundsFor(settings));
  syncSlider(slider);
}

// Changing a source changes the categories on offer, so the form is drawn again.
function changeSources(input) {
  readSetupForm();
  render();
  root.querySelector(`input[name="source"][value="${input.value}"]`).focus({ preventScroll: true });
}

// The two ends of the range cannot cross: the one being moved pushes the other.
function syncStartRange(input) {
  const { startMinPct, startMaxPct } = input.form.elements;
  if (Number(startMinPct.value) <= Number(startMaxPct.value)) return;
  const other = input === startMinPct ? startMaxPct : startMinPct;
  other.value = input.value;
  syncSlider(other);
}

function settingsError(settings) {
  if (productCount({ ...settings, excludedCategories: [] }) === 0) return 'Scegli almeno una fonte.';
  if (productCount(settings) === 0) return 'Scegli almeno una categoria.';
  const labels = {
    rounds: 'I round',
    minRaisePct: 'Il rilancio minimo',
    tickSeconds: 'I secondi tra gli annunci',
    startMinPct: 'La partenza minima',
    startMaxPct: 'La partenza massima',
  };
  const maxRounds = maxRoundsFor(settings);
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
  const { players } = setup;
  const problem = validatePlayerNames(players.map(({ name }) => name))
    ?? validatePaddles(players)
    ?? settingsError(setup.settings);
  if (problem) {
    showError(problem);
    return;
  }
  saveSetup();
  setGame(createGame({
    playerNames: players.map(({ name }) => name),
    paddles: players.map(({ number, color }) => ({ number, color })),
    settings: setup.settings,
    products: catalog.products,
  }));
}

function submitBid(form) {
  const amount = parseAmountToCents(new FormData(form).get('amount'));
  const { auction } = game;
  if (amount === null) {
    showError('Inserisci un importo valido, ad esempio 25,50.');
  } else if (amount < turnMinimumBid(auction)) {
    showError(`L'offerta minima è ${lotMoney(turnMinimumBid(auction), currentProduct(game))}.`);
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
    const price = parseAmountToCents(data.get('price'));
    if (!price) showError('Inserisci il prezzo di vendita, ad esempio 25,50.');
    else setGame(recordManualSale(game, buyer, price));
  }
}

const actions = {
  'add-player': () => {
    readSetupForm();
    setup.players.push({ name: '', ...nextPaddle(setup.players) });
    newPaddleIndex = setup.players.length - 1;
    render();
    newPaddleIndex = null;
  },
  'remove-player': (element) => {
    readSetupForm();
    setup.players.splice(Number(element.dataset.index), 1);
    render();
  },
  'open-colors': (element) => {
    readSetupForm();
    root.insertAdjacentHTML('beforeend', colorDialog(Number(element.dataset.index)));
    const dialog = root.querySelector('.color-dialog');
    dialog.addEventListener('close', () => dialog.remove());
    dialog.showModal();
  },
  'pick-color': (element) => {
    const { index, color } = element.dataset;
    setup.players[index].color = Number(color);
    render();
    root.querySelector(`.paddle-color[data-index="${index}"]`).focus({ preventScroll: true });
  },
  'close-colors': () => root.querySelector('.color-dialog').close(),
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
  'set-lot-aside': () => setGame(setLotAside(game)),
  'next-round': () => setGame(nextRound(game)),
  'new-game': () => leaveGame(),
  quit: () => {
    if (window.confirm('Uscire dalla partita? I progressi andranno persi.')) leaveGame();
  },
};

function leaveGame() {
  clearTick();
  stopShow();
  game = null;
  errorMessage = '';
  imageIndex = 0;
  render();
  window.scrollTo(0, 0);
}

root.addEventListener('click', (event) => {
  // Only a click on the backdrop lands on the dialog itself: its content covers the rest.
  if (event.target.matches('.color-dialog')) {
    event.target.close();
    return;
  }
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

// Lot photos live on other sites, and a closed auction can take its photo away.
root.addEventListener('error', (event) => {
  const image = event.target;
  if (image.tagName === 'IMG' && image.src !== MISSING_IMAGE) image.src = MISSING_IMAGE;
}, true);

function syncSlider(slider) {
  const value = Number(slider.value);
  slider.style.setProperty('--fill', sliderFill(value, Number(slider.min), Number(slider.max)));
  slider.closest('.setting').querySelector('output').textContent = SETTING_INFO[slider.name].format(value);
}

root.addEventListener('input', (event) => {
  if (event.target.type === 'range') syncSlider(event.target);
  if (event.target.name === 'startMinPct' || event.target.name === 'startMaxPct') syncStartRange(event.target);
});

// Only the settings that affect the chosen auction stay on screen.
root.addEventListener('change', (event) => {
  if (event.target.name === 'category' || event.target.name === 'groceryScope') syncCategories(event.target.form);
  if (event.target.name === 'source') changeSources(event.target);
  if (event.target.name !== 'mode') return;
  root.querySelectorAll('.setting[data-modes]').forEach((setting) => {
    setting.hidden = !setting.dataset.modes.split(' ').includes(event.target.value);
  });
});

root.addEventListener('submit', (event) => {
  event.preventDefault();
  if (event.target.id === 'setup-form') startGame();
  if (event.target.id === 'bid-form') submitBid(event.target);
  if (event.target.id === 'manual-form') submitManualSale(event.target);
});

// While a show plays, a click anywhere skips it instead of reaching the page.
document.addEventListener('click', (event) => {
  if (!showRunning || event.target.closest('[data-action="quit"]')) return;
  event.preventDefault();
  event.stopPropagation();
  show.skip();
}, true);

document.addEventListener('keydown', (event) => {
  if (showRunning && SKIP_KEYS.includes(event.key)) {
    event.preventDefault();
    show.skip();
    return;
  }
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
