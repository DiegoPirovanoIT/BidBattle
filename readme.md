# BidBattle

BidBattle è un gioco d'aste da salotto per 2-6 giocatori, tutti davanti allo stesso schermo. A ogni round i giocatori si contendono un prodotto e poi scoprono il suo prezzo reale: chi ha comprato sotto quel prezzo guadagna la differenza, chi ha pagato di più la perde. Il budget è illimitato e vince chi chiude con il guadagno più alto.

**[Gioca ora](https://diegopirovanoit.github.io/BidBattle/)**

All'inizio della partita si scelgono le fonti dei lotti:

| Fonte | Da dove arriva | Che prezzo è |
|---|---|---|
| Capolavori | Lista di Wikipedia dei dipinti più costosi, solo con immagini libere | Prezzo di vendita, in dollari |
| LEGO | Brickset, serve una chiave gratuita | Listino tedesco, in euro |
| Videogiochi | CheapShark, solo Steam | Prezzo pieno, in dollari |
| La Spesa | Scontrini di Open Prices, italiani e stranieri, con il Paese indicato sul lotto | Somma dello scontrino, nella sua valuta |
| Surplus USA | Aste del governo USA (GSA Auctions) | Offerta più alta ad asta aperta, in dollari |

La fonte eBay è pronta e provata in locale, ma non è online: si accende quando il keyset di produzione è nei GitHub Secrets. Prima serve il via libera scritto di eBay.

Le aste si fanno sempre in euro, con i prezzi convertiti al cambio BCE. Nelle impostazioni si può scegliere invece la valuta locale di ogni lotto.

Il punteggio può essere in euro oppure in percentuale sul valore del lotto. In percentuale ogni lotto pesa uguale: comprare a metà del valore dà +50%, pagare il doppio dà −100%.

Fasi, regole e decisioni aperte sono in [PLANNING.md](PLANNING.md).

## Avviare il gioco

Serve Python 3 per il server locale.

```bash
npm start
```

Poi apri http://localhost:8000. Il gioco non funziona aprendo direttamente `index.html`, perché il browser blocca il caricamento dei moduli e dei prodotti.

## Comandi

| Comando | Cosa fa |
|---|---|
| `npm start` | Avvia il gioco in locale |
| `npm test` | Esegue i test (richiede Node 20 o successivo) |
| `npm run mock:products` | Rigenera `data/products.json`, il vecchio catalogo inventato che il gioco non usa più |
| `npm run sources:update` | Rigenera i cataloghi delle fonti in `data/sources` |
| `npm run sources:update -- games lego` | Rigenera solo le fonti indicate |
| `npm run sources:update -- ebay` | Rigenera il catalogo eBay: parte solo se lo si chiede per nome e il file resta fuori da Git |

## Struttura

| Percorso | Contenuto |
|---|---|
| `js/auction.js` | Regole delle aste |
| `js/game.js` | Round, guadagni e classifica |
| `js/products.js` | Caricamento del catalogo |
| `js/reveal.js` | Animazione della rivelazione del prezzo |
| `js/podium.js` | Animazione del podio finale |
| `js/app.js` | Interfaccia |
| `data/products.json` | Vecchio catalogo inventato, non usato dal gioco |
| `data/sources/` | Cataloghi delle fonti reali |
| `scripts/` | Generatori dei cataloghi, uno per fonte in `scripts/sources` |
| `test/` | Test automatici |

## Configurazione

Le credenziali della API di eBay non vanno mai nel codice. Per le prove in locale stanno nel file `.env`, escluso dal repository, come `EBAY_CLIENT_ID` e `EBAY_CLIENT_SECRET`. Online si usano gli stessi nomi nei GitHub Secrets. Lo script riconosce un keyset sandbox dalla sigla `SBX` e chiama la sandbox, dove i pochi articoli finti non bastano a generare un catalogo. Nei GitHub Secrets va solo il keyset di produzione.

Lo stesso file `.env` contiene le chiavi usate da `npm run sources:update`: `BRICKSET_API_KEY` (obbligatoria per LEGO) e `GSA_API_KEY` (facoltativa: senza si usa la chiave dimostrativa di api.data.gov). La chiave Brickset si chiede su https://brickset.com/tools/webservices/requestkey.

Online i cataloghi si aggiornano da soli con la GitHub Action `update-sources.yml`, che legge le stesse due chiavi dai GitHub Secrets: Surplus USA ogni giorno, tassi di cambio, Videogiochi, La Spesa e LEGO ogni lunedì, Capolavori il primo del mese. Dalla pagina Actions si può lanciare a mano: senza indicare fonti le aggiorna tutte, tranne eBay.

Il catalogo eBay si rigenera ogni 6 ore dentro `deploy-pages.yml` e finisce solo nel sito pubblicato. Gli altri deploy riusano quello già online.
