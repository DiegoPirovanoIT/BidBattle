# BidBattle

BidBattle è un gioco d'aste da salotto per 2-6 giocatori, tutti davanti allo stesso schermo. A ogni round i giocatori si contendono un prodotto e poi scoprono il suo prezzo reale: chi ha comprato sotto quel prezzo guadagna la differenza, chi ha pagato di più la perde. Il budget è illimitato e vince chi chiude con il guadagno più alto.

**[Gioca ora](https://diegopirovanoit.github.io/BidBattle/)**

All'inizio della partita si scelgono le fonti dei lotti:

| Fonte | Da dove arriva | Che prezzo è |
|---|---|---|
| Capolavori | Lista di Wikipedia dei dipinti più costosi, solo con immagini libere | Prezzo di vendita, da dollari a euro |
| LEGO | Brickset, serve una chiave gratuita | Listino tedesco, in euro |
| Videogiochi | CheapShark, solo Steam | Prezzo pieno, da dollari a euro |
| La Spesa | Scontrini italiani di Open Prices | Somma dello scontrino |
| Surplus USA | Aste del governo USA (GSA Auctions) | Offerta più alta ad asta aperta, da dollari a euro |

I prodotti di eBay arriveranno quando ci saranno le credenziali.

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

Le credenziali della API di eBay non vanno mai nel codice: saranno salvate nei GitHub Secrets. Per le prove in locale si usa un file `.env`, che è escluso dal repository.

Lo stesso file `.env` contiene le chiavi usate da `npm run sources:update`: `BRICKSET_API_KEY` (obbligatoria per LEGO) e `GSA_API_KEY` (facoltativa: senza si usa la chiave dimostrativa di api.data.gov). La chiave Brickset si chiede su https://brickset.com/tools/webservices/requestkey.

Online i cataloghi si aggiornano da soli con la GitHub Action `update-sources.yml`, che legge le stesse due chiavi dai GitHub Secrets: Surplus USA ogni giorno, Videogiochi, La Spesa e LEGO ogni lunedì, Capolavori il primo del mese. Dalla pagina Actions si può lanciare a mano: senza indicare fonti le aggiorna tutte.
