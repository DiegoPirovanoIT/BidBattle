# Planning di BidBattle

BidBattle è un gioco d'aste da salotto per 2-6 giocatori, tutti davanti allo stesso schermo. I giocatori si contendono lotti presi dalle fonti scelte a inizio partita e, a fine round, scoprono se hanno fatto un affare.

## Architettura

Il progetto è interamente su GitHub e non ha un backend (opzione A).

| Parte | Soluzione |
|---|---|
| Gioco | HTML, CSS e JavaScript senza build, pubblicati su GitHub Pages |
| Prodotti | Un file per fonte in `data/sources`, letti dal gioco all'avvio. I prodotti inventati di `data/products.json` non sono più usati |
| Aggiornamento fonti | GitHub Action `update-sources.yml`: Surplus USA ogni giorno, tassi di cambio, Videogiochi, La Spesa e LEGO ogni lunedì, Capolavori il primo del mese. I file generati vanno nel repository. A mano: `npm run sources:update` |
| Aggiornamento prodotti | `deploy-pages.yml`, ogni 6 ore, chiama la Browse API di eBay e pubblica il catalogo senza salvarlo nel repository. Si accende con i GitHub Secrets |
| Valute | Impostazione `auctionCurrency`. Di base ogni lotto è convertito in euro all'inizio della partita e la rivelazione mostra il prezzo originale. Con "Valuta locale" offerte e prezzi restano nella valuta del lotto, con la stima in euro accanto. Il punteggio è comunque in euro, perché somma lotti in valute diverse. I tassi stanno in `data/rates.json` (BCE, tramite Frankfurter) e il gioco li applica al caricamento. Un lotto senza tasso resta fuori |
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
| Partenza del battitore, sul valore | Dal 10% al 150% | Dal 5 al 300%, a passi di 5 |
| Stima di un esperto prima dell'asta | No | Sì o no |
| Categorie | Tutte | Almeno una; i round non superano i prodotti rimasti |
| Tempo per ogni offerta (a turni) | Nessuno | Nessuno, 15, 30 o 60 secondi |
| Quando rivelare i prezzi | Subito | Subito o alla fine |
| Rivelazione del prezzo | Con suspense | Con suspense o rapida |

### Scelte di progetto

Queste regole non erano nella descrizione iniziale. Sono state decise per far funzionare il gioco e si possono cambiare.

- **Rilancio minimo:** è arrotondato per eccesso all'euro intero e vale almeno 1 €.
- **Offerta iniziale nella modalità a turni:** è di almeno 1 €.
- **Prezzo di partenza del battitore:** è un valore casuale tra il 10% e il 150% del valore del lotto, arrotondato a una cifra tonda e di almeno 1 €. Può quindi partire sopra il valore: chi offre subito rischia di pagare troppo.
- **Stima dell'esperto:** un intervallo largo dal 50% al 90% del valore, arrotondato verso l'esterno. Contiene sempre il valore, in un punto casuale: se fosse al centro, basterebbe fare la media. Si vede prima dell'asta.
- **Discesa del battitore:** ogni annuncio abbassa il prezzo dell'8% circa di quello di partenza. Sotto il 10% il lotto resta invenduto.
- **Lotti invenduti:** nessuno guadagna o perde.
- **Estrazione dei lotti:** le categorie escono a turno, con lo stesso peso qualunque sia il numero di lotti. Una categoria si ripete solo quando sono uscite tutte. Le fonti senza categorie contano come una categoria sola, quindi eBay, che ne ha 25, dà circa il 73% dei lotti.
- **Premi finali:** la classifica mostra il miglior affare e il peggior acquisto della partita.
- **Prezzi rivelati alla fine:** si giocano tutte le aste senza scoprire i prezzi, poi i lotti si rivedono nell'ordine di gioco, uno per volta, invenduti compresi. Durante le aste le schede dei giocatori mostrano quanto ha speso ognuno, poi passano ai guadagni con la prima rivelazione.
- **Podio finale:** salgono i primi tre, dal terzo al primo, e i pari merito salgono insieme. Gli altri restano nell'elenco sotto il podio.
- **Tempo scaduto nella modalità a turni:** chi deve rilanciare si ritira, chi deve aprire offre il minimo perché non può ritirarsi.
- **Verdetti della rivelazione:** "Affarone!" da un guadagno del 50% sul prezzo pagato, "Bidone!" se si è pagato almeno il 50% più del valore.
- **Impostazioni scartate:** il budget limitato cambierebbe la regola del budget illimitato. Si può rivalutare dopo le prime partite vere.
- **Palette personalizzabili:** ogni giocatore sceglie il numero (da 0 a 999) e uno dei 12 colori della propria palette. Numeri e colori non si ripetono: i colori presi da un altro giocatore non si possono scegliere.
- **Pulsanti del battitore:** ogni giocatore ha un pulsante a schermo e un tasto (Q, Z, T, B, P, M).

## Fonti dei lotti

La scelta delle fonti è un'impostazione della schermata iniziale. Le fonti sono salvate come esclusioni (`excludedSources`), quindi una fonte nuova parte attiva. Una fonte senza file o senza lotti appare come non disponibile. Le categorie mostrate sono solo quelle delle fonti scelte.

| Fonte | Script | Regole | Da tenere d'occhio |
|---|---|---|---|
| Capolavori | `paintings.mjs` | Prezzo originale, non quello rivalutato. Solo immagini con licenza libera su Commons, con il credito sul lotto. Prezzo in dollari, arrotondato a 100.000 $. | Le opere moderne protette restano fuori: entrano 54 opere su 127. |
| LEGO | `lego.mjs` | Listino tedesco, perché è in euro. | Serve `BRICKSET_API_KEY`. Lo script non è ancora stato provato sulla API vera. |
| Videogiochi | `games.mjs` | Solo Steam, a prezzo pieno, con almeno 2.000 recensioni. | Prezzo in dollari convertito, non il listino italiano. Termini di CheapShark non trovati. |
| La Spesa | `groceries.mjs` | Un lotto è uno scontrino intero, con almeno 5 prodotti e 10 €: un prodotto solo costa meno del rilancio minimo. Restano fuori i prodotti a peso. | Ogni scontrino resta nella sua valuta. Al massimo 10 negozi e 40 lotti per Paese straniero, 80 lotti per l'Italia. Nelle impostazioni si può scegliere "Solo Italia". I filtri per Paese della API lasciano passare negozi stranieri, quindi lo script controlla ogni negozio. Dati ODbL: va citata la fonte. |
| eBay | `ebay.mjs` | Prezzo fisso, venditori in Italia, spedizione esclusa. Oggetti comuni tra 10 e 1.500 €, collezionismo prezioso senza tetto. Il catalogo non entra mai in Git. | Circa 12.500 lotti, di cui solo circa 500 con descrizione. Vedi "Piano API eBay". |
| Surplus USA | `surplus.mjs` | Almeno 3 offerenti, prima le aste che chiudono prima. Prezzo: offerta più alta al momento della rilevazione, non quella finale. Il lotto mostra date dell'asta e offerenti. | Le note dei lotti hanno nomi e telefoni di funzionari: non vanno mai copiate. Le foto sono link esterni e potrebbero sparire dopo l'asta: il gioco mostra un'immagine sostitutiva. Licenza dei dati non chiara. |

I prezzi in dollari sono convertiti con il cambio del giorno in cui si genera il catalogo (frankfurter.dev). La schermata di rivelazione spiega sempre che tipo di prezzo è.

**Scala dei punteggi.** Il punteggio è un'impostazione (`scoreMode`), con l'euro come valore predefinito. In euro un solo quadro può decidere la partita. In percentuale il risultato di ogni lotto è `(valore - pagato) / valore`, quindi ogni lotto pesa uguale: il guadagno arriva al massimo a +100%, mentre la perdita non ha limite. I verdetti della rivelazione restano calcolati sul prezzo pagato, in entrambe le modalità.

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
      "url": "https://www.ebay.it/itm/123456789",
      "credit": "Credito dell'immagine, se serve",
      "creditUrl": "https://..."
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

### Fase 3: prodotti reali da eBay (provata in locale, eBay ha approvato la pubblicazione)

Prima di scrivere codice:

- [x] Creare l'account sviluppatore e il keyset sandbox
- [x] Creare il keyset di produzione
- [x] Dichiarare l'esenzione dalle notifiche di cancellazione account: senza questo passo il keyset resta disattivato e il token dà 401
- [ ] Leggere per intero la licenza attuale, aggiornata il 24 giugno 2025
- [x] Chiedere a eBay per iscritto se il gioco è un uso consentito e se serve l'approvazione per le Buy API

Prova sulla sandbox, fatta il 5 novembre 2026:

- [x] Scaricare l'albero delle categorie e fissare le 8 famiglie con i loro ID
- [x] Controllare che i campi siano quelli previsti, con il catalogo generato per intero su una categoria

Prova con il keyset di produzione, in locale con `npm run sources:update -- ebay`, fatta il 5 novembre 2026:

- [x] Leggere i limiti reali con `getRateLimits`
- [x] Controllare che risultati e prodotti validi siano quelli previsti

Con l'autorizzazione di eBay:

- [ ] Salvare le credenziali nei GitHub Secrets
- [x] Scrivere lo script `scripts/sources/ebay.mjs` secondo il piano qui sotto, con i test
- [x] Aggiornare la GitHub Action: programmazione, catalogo fuori dal repository, riuso del catalogo pubblicato
- [x] Verificare i dati su un catalogo reale, compresi i prodotti con una sola foto

### Fase 4: rifinitura

- [x] Nuova grafica: sala d'aste blu, palette dei giocatori, font ospitati in `css/fonts`
- [x] Rivelazione del prezzo con tabellone a palette, timbro del verdetto e nuove impostazioni di partita
- [x] Numero e colore della palette scelti da ogni giocatore
- [x] Podio animato nella schermata finale
- [ ] Suoni per battitore e aggiudicazione
- [ ] Ripresa della partita dopo un ricaricamento della pagina
- [ ] Vista per TV con testi più grandi
- [ ] Bilanciamento di regole e impostazioni dopo le prime partite vere

## Piano API eBay

### Accesso

- **Credenziali:** servono Client ID e Client Secret del keyset di produzione. Stanno nei GitHub Secrets `EBAY_CLIENT_ID` e `EBAY_CLIENT_SECRET`.
- **Token:** `POST https://api.ebay.com/identity/v1/oauth2/token` con autenticazione Basic, `grant_type=client_credentials` e scope `https://api.ebay.com/oauth/api_scope`. Non serve il login di un utente. Ogni aggiornamento chiede un token nuovo.
- **Sandbox:** i dati sono finti e pochi: nella prova solo la categoria 9355 (telefoni) aveva articoli, 6 in tutto. Serve a provare token, campi e flusso, non a generare un catalogo. Il limite resta di 300 prodotti, quindi un keyset sandbox non può pubblicare nulla. Lo script riconosce il keyset dalla sigla `SBX` nel Client ID.

### Cosa fa ogni aggiornamento

| Passo | Chiamata | Quante |
|---|---|---|
| 1. Token | `oauth2/token` | 1 |
| 2. Controllo del limite residuo | `getRateLimits` | 1 |
| 3. Albero delle categorie | `get_default_category_tree_id` e `category_tree/{id}` con gzip | 2 |
| 4. Ricerca | `item_summary/search`, una per categoria, più le ricerche del collezionismo prezioso | 40 più al massimo 10 di riserva, più circa 50 pagine |
| 5. Dettaglio | `item/{item_id}`, per i primi 6 prodotti di ogni ricerca | Al massimo circa 570 |

La ricerca usa questi parametri, con l'intestazione `X-EBAY-C-MARKETPLACE-ID: EBAY_IT`:

```text
GET https://api.ebay.com/buy/browse/v1/item_summary/search
  ?category_ids=<id>
  &filter=buyingOptions:{FIXED_PRICE},itemLocationCountry:IT,price:[10..1500],priceCurrency:EUR
  &sort=newlyListed
  &limit=200
```

`getItems`, la versione a lotti, non è utilizzabile: è riservata ai partner selezionati e la specifica non elenca descrizione e foto tra i campi restituiti.

### Budget giornaliero

Gli aggiornamenti sono 4 al giorno, ogni 6 ore.

| API | Limite al giorno | Per aggiornamento | Al giorno | Uso del limite |
|---|---|---|---|---|
| Browse (ricerca e dettaglio) | 5.000 | Circa 570, al massimo circa 680 | Circa 2.280, al massimo circa 2.720 | 46% |
| Taxonomy | 5.000 | 2 | 8 | Meno dell'1% |
| Analytics | 5.000 | 1 | 4 | Meno dell'1% |

**Tetto di sicurezza.** Con i nuovi tentativi un aggiornamento potrebbe superare il limite giornaliero. Per questo ogni aggiornamento si ferma a **1.000 chiamate Browse**. Il massimo diventa 4.000 al giorno e ne restano 1.000 per le prove manuali.

**Errori.** La Growth Check di eBay valuta anche questo comportamento.

- Rete e errori 5xx: al massimo 2 nuovi tentativi, con attesa crescente.
- Prodotto non più disponibile (404): si scarta senza riprovare.
- Altri errori 4xx: nessun nuovo tentativo.
- Errore 429: l'aggiornamento si ferma subito.
- Limite residuo sotto 1.000: l'aggiornamento non parte.
- Meno di 300 prodotti validi: l'aggiornamento fallisce e resta online il catalogo precedente.

Le richieste partono al massimo 5 alla volta.

### Categorie sempre nuove

**Etichette stabili, categorie che cambiano.** I giocatori vedono sempre 8 famiglie: Musica, Casa, Elettronica, Collezionismo, Sport, Moda, Giochi, Arte e libri. Sotto ogni famiglia ruotano le sottocategorie eBay di livello 3. Così i filtri nella schermata iniziale non cambiano, ma i prodotti sì.

**Numeri.** Ogni aggiornamento prende 5 sottocategorie per famiglia: 8 × 5 = 40 ricerche. Una ricerca restituisce fino a 200 inserzioni con una sola chiamata, quindi si tengono tutte quelle valide. Il dettaglio costa una chiamata per prodotto e serve solo per la descrizione: lo hanno i primi 6 di ogni ricerca, gli altri lotti mostrano titolo e foto.

**Rotazione senza memoria.** Il catalogo non viene salvato nel repository, quindi la rotazione non può leggere uno stato. La calcola dall'orario:

```text
n          = floor(ora Unix / 21600)         // numero della fascia di 6 ore
lotti      = ceil(sottocategorie della famiglia / 5)
ciclo      = floor(n / lotti)
posizione  = n % lotti
ordine     = mescola(sottocategorie, seme = famiglia + ciclo)
scelte     = ordine[posizione * 5 ... posizione * 5 + 4]
```

Una sottocategoria torna solo quando la famiglia le ha usate tutte, poi l'ordine cambia. Fa eccezione il passaggio tra due cicli, dove può capitare una ripetizione. Con 60 sottocategorie in una famiglia il ciclo dura 12 aggiornamenti, cioè 3 giorni.

**Prodotti diversi anche nella stessa categoria.** `sort=newlyListed` restituisce le inserzioni più recenti, quindi cambiano da sole a ogni passaggio.

**Categorie povere.** Se una famiglia ha meno di 60 prodotti dopo le 5 ricerche, si passa alla sottocategoria successiva nell'ordine, fino a 10 ricerche di riserva per aggiornamento.

**Famiglie speciali.** Altre 17 famiglie non ruotano: usano ricerche fisse, anche su più pagine, con un prezzo minimo e senza tetto. Un'inserzione trovata da due ricerche conta una volta sola.

| Famiglia | Ricerche | Prezzo minimo |
|---|---|---|
| Carte Pokémon | Giochi di carte collezionabili con "pokemon" | 50 € |
| Carte rare | Magic, Yu-Gi-Oh, One Piece, Lorcana; carte sportive | 50 € |
| Monete e lingotti | Monete antiche; monete con "oro"; lingotti | 100-200 € |
| Lusso | Gioielli di lusso; orologi delle grandi marche; penne stilografiche | 100-500 € |
| Auto e moto d'epoca | Auto e moto con "epoca", "storica" o "asi", annunci compresi | 1.000 € auto, 500 € moto |
| Antiquariato | Arredamento antico, sculture, argento, autografi | 100-200 € |
| Meteoriti e fossili | Meteoriti, fossili, minerali e cristalli | 20-50 € |
| Barche | Barche a motore, barche a vela, gommoni, annunci compresi | 500 € |
| Mezzi insoliti | Go-kart, camper, acquascooter, mini moto, annunci compresi | 100-1.000 € |
| Sala giochi | Flipper, arcade, jukebox, calcio balilla | 50-100 € |
| Retrogaming | Videogiochi e console con i nomi delle console storiche | 50 € |
| Vinili da collezione | Vinili | 50 € |
| Set LEGO | LEGO | 100 € |
| Robot e cult | Robot, Star Wars, action figure di anime e manga | 30-50 € |
| Tecnologia vintage | Macchine da scrivere, computer vintage, radio d'epoca, telefoni fissi vintage | 30-50 € |
| Cimeli sportivi | Collezionismo di calcio, maglie da calcio | 50 € |
| Scienza | Telescopi, microscopi, strumenti scientifici | 50-100 € |

Sulle auto eBay ha pochi prodotti a prezzo fisso: quasi tutte sono annunci, e il prezzo è quello chiesto dal venditore.

**Categorie ammesse.** Ogni famiglia elenca per ID le sue categorie di livello 1. Tutto il resto resta fuori: veicoli, ricambi auto, nautica, biglietti, cibo, salute, infanzia, attrezzatura da ufficio, hobby creativi e "Altre categorie". Dentro le famiglie si scartano per nome le sottocategorie di ricambi, lotti, stock e contenuti per adulti. Le categorie di livello 1 non si possono cercare senza parola chiave, quindi la rotazione usa solo sottocategorie.

| Famiglia | Categorie di livello 1 | Sottocategorie prima dello scarto |
|---|---|---|
| Musica | Musica, CD e vinili; Strumenti musicali | 127 |
| Casa | Casa, arredamento e bricolage; Elettrodomestici; Giardino e arredamento esterni | 670 |
| Elettronica | Informatica; Telefonia fissa e mobile; TV, audio e video; Fotografia e video | 442 |
| Collezionismo | Collezionismo; Monete e banconote; Francobolli; Fumetti e memorabilia | 563 |
| Sport | Sport e viaggi | 118 |
| Moda | Abbigliamento e accessori; Orologi e gioielli | 178 |
| Giochi | Giocattoli e modellismo; Videogiochi e console | 230 |
| Arte e libri | Arte e antiquariato; Libri e riviste; Film e DVD | 200 |

### Filtri sui prodotti

Un prodotto entra nel catalogo solo se:

- ha `FIXED_PRICE` tra le opzioni di acquisto, o `CLASSIFIED_AD` per auto e moto d'epoca;
- non ha `itemGroupType`, perché le inserzioni con varianti hanno più prezzi;
- ha almeno una foto;
- non ha `adultOnly` né `lotSize` maggiore di zero;
- non è venduto "per ricambi o non funzionante";
- il titolo non contiene parole da lotto o da ricambio, come "lotto", "stock", "per ricambi", "leggere descrizione";
- il venditore non ha già 25 prodotti nel catalogo, perché un solo negozio non riempia una categoria;
- ha un prezzo: un'asta senza prezzo fisso non ha nulla da rivelare.

### Conversione nel formato del gioco

| Campo del gioco | Origine |
|---|---|
| `id` | `itemId` |
| `title` | `title`, senza email, link, cellulari e prezzi con i centesimi |
| `description` | `description` senza HTML, stili, script, email, telefoni e link, tagliata a 600 caratteri; se è vuota, `shortDescription` |
| `condition` | `condition` |
| `category` | Nome della famiglia |
| `price` | `Number(price.value)`, spedizione esclusa |
| `images` | `image.imageUrl` e `additionalImages`, massimo 6, sempre come link a eBay |
| `url` | `itemWebUrl` |

Il file pesa circa 10 MB, circa 1,4 MB compresso. **Nome del venditore e altri dati personali non vengono mai salvati:** è ciò che giustifica l'esenzione dalle notifiche di cancellazione account.

### Pubblicazione

| Evento | Chiamate eBay | Catalogo pubblicato |
|---|---|---|
| Programmato, `17 */6 * * *` | Circa 530 | Nuovo |
| Push su `main` | 0 | Scaricato dal sito pubblicato |
| Deploy chiesto da `update-sources.yml` | 0 | Scaricato dal sito pubblicato |
| Avvio manuale | Circa 530 | Nuovo, o riuso se si toglie la spunta |

Se la rigenerazione fallisce resta il catalogo pubblicato. Senza GitHub Secrets il passo non chiama eBay e la fonte appare non disponibile.

- **Niente commit del catalogo.** `products.json` reale va solo nel pacchetto di GitHub Pages. Se finisse nel repository, la cronologia di Git conserverebbe per sempre inserzioni che la licenza chiede di cancellare.
- **Minuto 17.** GitHub segnala i picchi di carico all'inizio di ogni ora e le esecuzioni possono ritardare.
- **Sospensione dopo 60 giorni.** Nei repository pubblici GitHub disattiva le esecuzioni programmate dopo 60 giorni senza attività. Il catalogo non produce commit, quindi serve una nota in agenda per riattivarle o un commit periodico.
- **Niente mescolanza.** Un catalogo è tutto eBay o tutto inventato: la licenza vieta di unire contenuti eBay e non eBay. **Da decidere:** il file eBay è separato, ma nella stessa partita i lotti eBay possono comparire accanto a quelli delle altre fonti. Se eBay non lo ammette, la fonte dovrà giocarsi da sola.

### Confermato sulla sandbox

- La Browse API risponde con un token applicativo e lo scope di base. Il token dura 7.200 secondi.
- La ricerca accetta `category_ids` senza `q` e il filtro del piano.
- `getItem` restituisce la descrizione in HTML. Un articolo inesistente dà 404.
- L'albero di `EBAY_IT` è il numero 101, con 31 categorie di livello 1 e 3.354 di livello 3.

### Confermato in produzione

- Il keyset standard chiama la Browse API senza altre approvazioni tecniche. Il limite di Browse è 5.000 chiamate al giorno.
- Gli ID delle categorie e l'albero 101 sono gli stessi della sandbox.
- Un aggiornamento reale ha dato 12.527 lotti con circa 570 chiamate Browse, cioè circa 2.280 al giorno, il 46% del limite. Dura poco più di un minuto.
- `additionalImages` e `seller.username` arrivano già dalla ricerca: solo la descrizione richiede `getItem`.
- Alcune inserzioni in asta non hanno `price`: vengono scartate.
- Il dettaglio contiene `seller.sellerLegalInfo`, con dati personali: non viene mai copiato.
- I venditori scrivono prezzi e stime nelle descrizioni: lo script li sostituisce con "…", perché altrimenti svelerebbero la risposta durante l'asta.

### Da tenere d'occhio

- `conditionId` 7000 indica "per ricambi o non funzionante". Non è stato verificato sulla documentazione, che non era leggibile: il filtro controlla anche il testo della condizione.
- Circa il 7% delle descrizioni inizia con testo di servizio del negozio, come spedizioni e garanzie. Non è un errore, ma si legge male.
- Con il punteggio in euro un'auto o un gioiello da decine di migliaia di euro può decidere la partita, come un quadro.
- Una descrizione può contenere il nome di un venditore scritto a mano: email, telefoni e link sono tolti, i nomi no.

### Licenza: cosa dice

Il testo completo letto è la versione del 2018. Di quella attuale sono stati letti solo estratti, che confermano i limiti di età e il divieto di mescolanza. Va riletta per intero.

| Clausola | Conseguenza per BidBattle |
|---|---|
| Uso autorizzato "solely for the purpose of facilitating your own or Your Users' use of eBay Services" | **Punto critico:** un gioco non aiuta a comprare o vendere su eBay |
| Public Display ammesso "to promote eBay and enable Your Users to search and browse listings" | **Punto critico:** il link "Vedi su eBay" aiuta, ma il fine resta il gioco |
| Copie solo intermedie, da cancellare quando non servono più | Catalogo mai nel repository e rigenerato ogni 6 ore |
| Dati non più pubblici da cancellare | La rigenerazione sostituisce tutto il catalogo |
| Inserzioni non più vecchie di 6 ore, altrimenti va dichiarata l'età | Il gioco mostra già la data del catalogo |
| Vietato usare i contenuti "to suggest or model prices" | Il gioco non suggerisce prezzi di vendita, ma è da citare nella domanda a eBay |
| Sublicenza agli utenti con un accordo vincolante | Da chiarire: il sito pubblico non ha condizioni d'uso |

Il supporto eBay, citato in una discussione del forum, afferma: "We typically do not permit other uses of eBay data". Una risposta scritta di eBay è quindi necessaria prima della pubblicazione.

## Rischi

| Rischio | Conseguenza | Risposta |
|---|---|---|
| La licenza eBay non consente questo uso dei dati | Il catalogo eBay non è pubblicabile | Chiedere a eBay per iscritto prima di scrivere lo script; il formato di `products.json` permette di cambiare fonte |
| Le Buy API richiedono l'approvazione di eBay | Tempi lunghi o accesso negato | Provare il keyset standard, poi seguire la procedura eBay Partner Network |
| Le esecuzioni programmate si fermano dopo 60 giorni | Il catalogo invecchia | Riattivarle o fare un commit periodico; la data resta visibile |
| Il prezzo di partenza del battitore suggerisce il valore | Il gioco diventa più facile | L'intervallo arriva al 150% e si cambia nelle impostazioni |
| I prezzi sono leggibili nel file pubblico | Un giocatore può barare | Accettato: è un gioco tra amici |
| Le esecuzioni programmate di GitHub partono in ritardo | I dati superano le 6 ore | La data del catalogo resta visibile |
