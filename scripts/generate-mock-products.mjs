// Writes data/products.json with invented products, using the same format
// the eBay script will produce. Run with: npm run mock:products

import { writeFile } from 'node:fs/promises';

const OUTPUT = new URL('../data/products.json', import.meta.url);

const CATEGORY_COLORS = {
  Musica: ['#7a3b2e', '#e9c9a8'],
  Casa: ['#3f5f58', '#d5e3d3'],
  Elettronica: ['#2c3e5c', '#c6d4e8'],
  Collezionismo: ['#5a3e70', '#e0d0ea'],
  Sport: ['#2f6b4f', '#cfe8d3'],
  Moda: ['#8a3a55', '#f0cfd9'],
  Giochi: ['#a0612a', '#f3dcae'],
};

const PRODUCTS = [
  ['🎸', 'Musica', 'Usato', 145.0, 'Chitarra acustica in abete con custodia morbida', 'Top in abete e fasce in mogano. Qualche segno d\'uso sul retro, corde cambiate da poco. Suona bene e tiene l\'accordatura.'],
  ['🎹', 'Musica', 'Usato', 289.9, 'Tastiera digitale 88 tasti pesati', 'Tasti pesati, 12 timbri, uscita cuffie e USB. Alimentatore e leggio inclusi, manca il pedale.'],
  ['🎺', 'Musica', 'Ricondizionato', 412.0, 'Tromba in Sib laccata con astuccio', 'Revisionata da un liutaio: pistoni nuovi e pulizia completa. Astuccio rigido con bocchino 7C.'],
  ['🥁', 'Musica', 'Usato', 74.5, 'Rullante in acero 14 pollici', 'Fusto in acero a 8 strati. Pelle superiore da sostituire, cordiera in buono stato.'],
  ['📻', 'Musica', 'Usato', 58.0, 'Radio a valvole anni Cinquanta da restaurare', 'Mobile in legno originale con piccole crepe. Si accende, ma riceve solo in onde medie.'],
  ['🪑', 'Casa', 'Usato', 95.0, 'Coppia di sedie in faggio curvato', 'Seduta in paglia di Vienna integra, struttura solida. Una delle due ha un graffio sullo schienale.'],
  ['🛋️', 'Casa', 'Usato', 320.0, 'Divano due posti in velluto verde', 'Tessuto in velluto a coste, gambe in ottone. Da ritirare a mano, nessun animale in casa.'],
  ['🕰️', 'Casa', 'Usato', 180.0, 'Orologio da parete a pendolo in noce', 'Meccanismo a carica di 8 giorni, suona le ore. Funzionante, con chiave originale.'],
  ['🍳', 'Casa', 'Nuovo', 38.9, 'Padella in ghisa da 28 cm pre-stagionata', 'Adatta a tutti i piani cottura, induzione compresa. Mai usata, ancora nell\'imballo.'],
  ['☕', 'Casa', 'Ricondizionato', 129.0, 'Macchina da caffè a leva per casa', 'Guarnizioni nuove e caldaia decalcificata. Portafiltro doppio e pressino inclusi.'],
  ['🧺', 'Casa', 'Nuovo', 22.5, 'Set di tre cesti in vimini intrecciati', 'Fatti a mano, con manici e fodera lavabile in cotone. Misure 25, 30 e 35 cm.'],
  ['💡', 'Casa', 'Usato', 68.0, 'Lampada da tavolo in ottone con paralume in vetro', 'Paralume verde intatto, impianto elettrico rifatto. Patina dell\'ottone originale.'],
  ['📷', 'Elettronica', 'Usato', 245.0, 'Fotocamera mirrorless con obiettivo 15-45 mm', 'Circa 8.000 scatti, sensore pulito. Due batterie, caricatore e tracolla inclusi.'],
  ['🎧', 'Elettronica', 'Ricondizionato', 89.0, 'Cuffie wireless con cancellazione del rumore', 'Cuscinetti nuovi e batteria testata: circa 25 ore di autonomia. Custodia rigida inclusa.'],
  ['💻', 'Elettronica', 'Ricondizionato', 430.0, 'Portatile 14 pollici 16 GB RAM 512 GB SSD', 'Ricondizionato di grado A, tastiera italiana, batteria all\'88%. Garanzia di 12 mesi.'],
  ['🖨️', 'Elettronica', 'Usato', 49.9, 'Stampante laser monocromatica Wi-Fi', 'Circa 3.000 pagine stampate, toner al 60%. Cavo di alimentazione incluso.'],
  ['📺', 'Elettronica', 'Usato', 199.0, 'Televisore 43 pollici 4K smart', 'Nessun pixel difettoso, telecomando originale. Piedini inclusi, senza scatola.'],
  ['🕹️', 'Elettronica', 'Usato', 118.0, 'Mini cabinato arcade da tavolo', 'Joystick e pulsanti da sala giochi, schermo da 10 pollici. Funziona, adesivi un po\' consumati.'],
  ['🪙', 'Collezionismo', 'Usato', 62.0, 'Lotto di 40 monete italiane in lire', 'Monete dal 1951 al 2001, stato misto. Nessuna in argento, raccolte in un album.'],
  ['📚', 'Collezionismo', 'Usato', 155.0, 'Enciclopedia illustrata in 12 volumi del 1962', 'Rilegatura in tela con titoli dorati. Dorsi leggermente scoloriti, pagine integre.'],
  ['🗺️', 'Collezionismo', 'Usato', 88.0, 'Carta geografica d\'Italia stampata nel 1890', 'Stampa su carta telata, 70 x 100 cm. Qualche piega, colori ancora vivi.'],
  ['🎞️', 'Collezionismo', 'Usato', 34.0, 'Proiettore Super 8 con tre pellicole', 'Lampada funzionante, cinghia da sostituire. Le pellicole sono filmini di famiglia anni Settanta.'],
  ['🧸', 'Collezionismo', 'Usato', 240.0, 'Orsetto di peluche in mohair anni Trenta', 'Articolato su braccia e gambe, occhi in vetro. Pelo consumato sul muso.'],
  ['🖋️', 'Collezionismo', 'Usato', 76.0, 'Penna stilografica in celluloide con pennino in oro', 'Pennino 14 carati, caricamento a stantuffo. Revisionata e pronta all\'uso.'],
  ['🚲', 'Sport', 'Usato', 360.0, 'Bicicletta da corsa in acciaio anni Ottanta', 'Telaio taglia 56, cambio a 12 velocità. Copertoni nuovi, freni regolati.'],
  ['🎿', 'Sport', 'Usato', 110.0, 'Sci all-mountain 170 cm con attacchi', 'Lamine affilate e soletta sciolinata a fine stagione. Attacchi regolabili.'],
  ['🏓', 'Sport', 'Nuovo', 149.0, 'Tavolo da ping pong pieghevole da interno', 'Piano da 16 mm, ruote con freno. Rete e due racchette incluse, da montare.'],
  ['🥊', 'Sport', 'Usato', 45.0, 'Sacco da boxe da 25 kg con catene', 'Rivestimento in similpelle senza strappi. Catene e gancio da soffitto inclusi.'],
  ['⛺', 'Sport', 'Usato', 79.9, 'Tenda da campeggio per tre persone', 'Doppio telo impermeabile, usata in due vacanze. Picchetti completi e sacca.'],
  ['🎣', 'Sport', 'Nuovo', 54.0, 'Canna da pesca telescopica con mulinello', 'Fibra di carbonio, lunghezza 3 metri. Mulinello a 5 cuscinetti già montato.'],
  ['👟', 'Moda', 'Nuovo', 72.0, 'Sneakers in pelle bianca taglia 42', 'Mai indossate, con scatola. Suola in gomma e soletta estraibile.'],
  ['🧥', 'Moda', 'Usato', 135.0, 'Cappotto in lana taglia 48', 'Taglio dritto, fodera integra, appena lavato a secco. Mancano solo due bottoni di ricambio.'],
  ['⌚', 'Moda', 'Usato', 215.0, 'Orologio automatico da uomo con cinturino in pelle', 'Movimento automatico revisionato due anni fa. Vetro zaffiro con un piccolo graffio.'],
  ['👜', 'Moda', 'Usato', 98.0, 'Borsa a mano in cuoio fatta a mano', 'Cuoio conciato al vegetale, tracolla regolabile. Angoli appena consumati.'],
  ['🎲', 'Giochi', 'Nuovo', 41.9, 'Gioco da tavolo di strategia per 2-5 giocatori', 'Confezione sigillata, regolamento in italiano. Durata di circa 90 minuti a partita.'],
  ['♟️', 'Giochi', 'Usato', 66.0, 'Scacchiera in legno intarsiato con pezzi pesati', 'Scacchiera pieghevole da 45 cm, set completo. Re alto 9 cm.'],
];

function svgImage(emoji, [dark, light], view) {
  const views = [
    { background: light, size: 280, x: 300, y: 310, rotate: 0 },
    { background: dark, size: 460, x: 300, y: 370, rotate: 0 },
    { background: light, size: 220, x: 300, y: 290, rotate: -14 },
  ];
  const { background, size, x, y, rotate } = views[view];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 450">`
    + `<rect width="600" height="450" fill="${background}"/>`
    + `<text x="${x}" y="${y}" font-size="${size}" text-anchor="middle" `
    + `transform="rotate(${rotate} 300 225)">${emoji}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const products = PRODUCTS.map(
  ([emoji, category, condition, price, title, description], index) => ({
    id: `mock-${String(index + 1).padStart(3, '0')}`,
    title,
    description,
    condition,
    category,
    price,
    currency: 'EUR',
    images: [0, 1, 2].map((view) => svgImage(emoji, CATEGORY_COLORS[category], view)),
    url: null,
  }),
);

const catalog = { source: 'mock', generatedAt: null, products };
await writeFile(OUTPUT, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Scritti ${products.length} prodotti di prova.`);
