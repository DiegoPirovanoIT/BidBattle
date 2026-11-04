// Loads the catalog and keeps only the products the game can actually show.

function normalizeProduct(raw) {
  const priceCents = Math.round(Number(raw?.price) * 100);
  const images = Array.isArray(raw?.images) ? raw.images.filter(Boolean) : [];
  if (!raw?.id || !raw?.title || !images.length || !(priceCents > 0)) return null;
  return {
    id: String(raw.id),
    title: String(raw.title),
    description: String(raw.description ?? ''),
    condition: String(raw.condition ?? ''),
    category: String(raw.category ?? ''),
    images,
    url: raw.url ?? null,
    priceCents,
  };
}

export function parseCatalog(data) {
  const rawProducts = Array.isArray(data?.products) ? data.products : [];
  return {
    source: data?.source ?? 'unknown',
    generatedAt: data?.generatedAt ?? null,
    products: rawProducts.map(normalizeProduct).filter(Boolean),
  };
}

export async function loadCatalog(url = 'data/products.json') {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Catalogo non disponibile (HTTP ${response.status}).`);
  return parseCatalog(await response.json());
}
