/**
 * Identity keys: case-, accent-, punctuation- and whitespace-insensitive, so
 * "Café Molido 1kg" and "CAFE  MOLIDO 1 KG" resolve to the same product.
 */
export function normalizeKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .replace(/(\d)\s+(?=[a-z])/g, '$1')
    .trim()
    .replace(/\s+/g, ' ');
}

const LEGAL_SUFFIXES = /\b(s ?l ?u?|s ?a ?u?|sl|sa|slu|sau|ltd|limited|llc|inc|gmbh|bv|plc|corp|co)\b/g;

/** A vendor is identified by its tax id when present, otherwise by its name without legal suffixes. */
export function normalizeVendorKey(name: string, taxId: string | null): string {
  if (taxId) return `tax:${taxId.replace(/[^a-z0-9]/gi, '').toUpperCase()}`;
  const base = normalizeKey(name).replace(LEGAL_SUFFIXES, '').replace(/\s+/g, ' ').trim();
  return `name:${base || normalizeKey(name)}`;
}

/** A product is identified by its SKU when present, otherwise by its normalized description. */
export function normalizeProductKey(description: string, sku: string | null): string {
  if (sku) return `sku:${normalizeKey(sku)}`;
  return `name:${normalizeKey(description)}`;
}
