# BidBattle

BidBattle è un gioco d'aste da salotto per 2-6 giocatori, tutti davanti allo stesso schermo. A ogni round i giocatori si contendono un prodotto e poi scoprono il suo prezzo reale: chi ha comprato sotto quel prezzo guadagna la differenza, chi ha pagato di più la perde. Il budget è illimitato e vince chi chiude con il guadagno più alto.

**[Gioca ora](https://diegopirovanoit.github.io/BidBattle/)**

Per ora il gioco usa prodotti inventati. I prodotti reali arriveranno dalla API di eBay.

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
| `npm run mock:products` | Rigenera `data/products.json` con i prodotti inventati |

## Struttura

| Percorso | Contenuto |
|---|---|
| `js/auction.js` | Regole delle aste |
| `js/game.js` | Round, guadagni e classifica |
| `js/products.js` | Caricamento del catalogo |
| `js/app.js` | Interfaccia |
| `data/products.json` | Catalogo dei prodotti |
| `scripts/` | Generatore dei prodotti inventati |
| `test/` | Test automatici |

## Configurazione

Le credenziali della API di eBay non vanno mai nel codice: saranno salvate nei GitHub Secrets. Per le prove in locale si usa un file `.env`, che è escluso dal repository.
