# Planning di BidBattle

BidBattle è un gioco d'aste da salotto per 2-6 giocatori, tutti davanti allo stesso schermo. I giocatori si contendono prodotti presi da eBay e, a fine round, scoprono se hanno fatto un affare.

## Architettura

Il progetto è interamente su GitHub e non ha un backend (opzione A).

| Parte | Soluzione |
|---|---|
| Gioco | HTML, CSS e JavaScript senza build, pubblicati su GitHub Pages |
| Prodotti | File `data/products.json`, letto dal gioco all'avvio |
| Aggiornamento prodotti | GitHub Action programmata che chiama la Browse API di eBay |
| Chiave eBay | GitHub Secrets, usata solo dalla Action e mai inviata al browser |

## Regole del gioco

### Svolgimento di un round

1. **Presentazione:** i giocatori vedono immagini, titolo e descrizione del prodotto. Il prezzo resta nascosto.
2. **Asta:** si svolge nella modalità scelta prima della partita.
3. **Aggiudicazione:** il gioco mostra chi ha comprato e a quanto.
4. **Rivelazione:** il gioco mostra il prezzo eBay e aggiorna il guadagno del compratore.

I giocatori hanno budget illimitato: possono offrire qualsiasi cifra. Il punteggio è il guadagno totale, che parte da zero. A ogni acquisto cambia di `prezzo eBay - prezzo pagato`, quindi può diventare negativo. Vince chi ha il guadagno più alto dopo l'ultimo round.

### Modalità d'asta

**A turni.** Il gioco estrae un giocatore, che deve fare l'offerta iniziale. Gli altri, a turno, rilanciano o si ritirano. Chi si ritira è fuori per tutto il round. L'ultimo rimasto compra al prezzo della propria offerta.

**Battitore.** Il gioco sceglie un prezzo di partenza e lo abbassa a ogni annuncio. La prima offerta ferma la discesa e il prezzo inizia a salire. A ogni annuncio i giocatori possono offrire il prezzo proposto. Se nessuno rilancia per tre annunci, vince chi è in testa.

**Libera.** I giocatori gestiscono l'asta tra loro e inseriscono solo il compratore e il prezzo.

### Impostazioni

| Impostazione | Predefinito | Intervallo |
|---|---|---|
| Round | 8 | Da 1 a 30, senza superare i prodotti disponibili |
| Rilancio minimo | 5% | Da 1 a 50% |
| Secondi tra gli annunci | 2,5 | Da 1 a 10 |

### Scelte di progetto

Queste regole non erano nella descrizione iniziale. Sono state decise per far funzionare il gioco e si possono cambiare.

- **Rilancio minimo:** è arrotondato per eccesso all'euro intero e vale almeno 1 €.
- **Offerta iniziale nella modalità a turni:** è di almeno 1 €.
- **Prezzo di partenza del battitore:** è un valore casuale tra 0,8 e 3 volte il prezzo eBay, e almeno 5 €. L'intervallo è ampio per non suggerire il valore reale.
- **Discesa del battitore:** ogni annuncio abbassa il prezzo dell'8% circa di quello di partenza. Sotto il 10% il lotto resta invenduto.
- **Lotti invenduti:** nessuno guadagna o perde.
- **Premi finali:** la classifica mostra il miglior affare e il peggior acquisto della partita.
- **Pulsanti del battitore:** ogni giocatore ha un pulsante a schermo e un tasto (Q, Z, T, B, P, M).

## Formato dei prodotti

Il gioco legge lo stesso formato con i prodotti falsi e con quelli reali.

```json
{
  "source": "ebay",
  "generatedAt": "2026-11-04T06:00:00Z",
  "products": [
    {
      "id": "v1|123456789|0",
      "title": "Titolo dell'inserzione",
      "description": "Descrizione in testo semplice",
      "condition": "Usato",
      "category": "Musica",
      "price": 129.9,
      "currency": "EUR",
      "images": ["https://i.ebayimg.com/images/..."],
      "url": "https://www.ebay.it/itm/123456789"
    }
  ]
}
```

## Fasi

### Fase 1: gioco con prodotti falsi (completata)

- [x] Logica di aste, round, guadagni e classifica, con test automatici
- [x] Tre modalità d'asta
- [x] Schermate di configurazione, presentazione, asta, rivelazione e classifica
- [x] Catalogo di 36 prodotti inventati
- [x] Layout per computer e telefono

### Fase 2: pubblicazione su GitHub Pages

- [x] Rendere pubblico il repository
- [x] Aggiungere la GitHub Action che esegue i test e pubblica il sito
- [x] Provare il gioco dall'indirizzo pubblico

### Fase 3: prodotti reali da eBay (bloccata dall'approvazione delle credenziali)

- [ ] Leggere la licenza delle API eBay e confermare che il gioco possa salvare e mostrare questi dati
- [ ] Salvare le credenziali nei GitHub Secrets
- [ ] Scrivere lo script che ottiene il token e cerca i prodotti sul marketplace `EBAY_IT`
- [ ] Recuperare foto e descrizione di ogni prodotto con `getItem`
- [ ] Convertire le descrizioni da HTML a testo semplice e accorciarle
- [ ] Filtrare i risultati: solo prezzo fisso, con foto, senza prezzi anomali
- [ ] Aggiungere la GitHub Action programmata che rigenera `products.json`
- [ ] Verificare i dati su un catalogo reale, compresi i prodotti con una sola foto

### Fase 4: rifinitura

- [ ] Suoni per battitore e aggiudicazione
- [ ] Ripresa della partita dopo un ricaricamento della pagina
- [ ] Vista per TV con testi più grandi
- [ ] Bilanciamento di regole e impostazioni dopo le prime partite vere

## Dati eBay: vincoli da rispettare

**Numero di chiamate.** La ricerca da sola non basta, perché il gioco vuole tutte le foto e la descrizione: serve una chiamata `getItem` per ogni prodotto, da confermare quando le credenziali saranno attive. Il limite predefinito della Browse API è di 5.000 chiamate al giorno.

| Prodotti | Chiamate per aggiornamento | Aggiornamenti al giorno | Chiamate al giorno |
|---|---|---|---|
| 500 | Circa 520 | 4 | Circa 2.100 |
| 1.000 | Circa 1.020 | 4 | Circa 4.100 |

L'obiettivo è **500 prodotti ogni 6 ore**, che lascia margine per errori e nuovi tentativi. Il file peserà intorno a 1 MB.

**Freschezza dei dati.** La licenza eBay chiede che i dati delle inserzioni mostrati non siano più vecchi di 6 ore, oppure che ne venga indicata l'età. Il gioco mostra già la data di aggiornamento del catalogo nella schermata iniziale.

**Aste in corso.** Il catalogo include solo inserzioni a prezzo fisso, perché il prezzo di un'asta aperta non è quello finale.

## Rischi

| Rischio | Conseguenza | Risposta |
|---|---|---|
| La licenza eBay non consente questo uso dei dati | L'opzione A potrebbe non essere utilizzabile | Verificare prima di iniziare la fase 3 |
| Il prezzo di partenza del battitore suggerisce il valore | Il gioco diventa più facile | Rivedere l'intervallo dopo le prime partite |
| I prezzi sono leggibili nel file pubblico | Un giocatore può barare | Accettato: è un gioco tra amici |
| Le esecuzioni programmate di GitHub partono in ritardo | I dati superano le 6 ore | La data del catalogo resta visibile |
