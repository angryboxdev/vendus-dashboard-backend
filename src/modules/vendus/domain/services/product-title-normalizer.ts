/**
 * Matches Vendus pizza size suffixes:  "(Grande)" → L,  "(Individual)" → S
 * The suffix may have trailing whitespace and appears at the end of the title.
 */
const VENDUS_PIZZA_SIZE_RE = /\s*\((Grande|Individual)\)\s*$/i;

const SIZE_LABEL: Record<string, string> = {
  grande: 'L',
  individual: 'S',
};

/**
 * Normalises Vendus pizza product titles for display.
 * Strips the "(Grande)" / "(Individual)" suffix and replaces it with "L" / "S".
 *
 * "Honey Peperoni (Individual)"  → "Honey Peperoni S"
 * "Chicken & Cheese (Grande)"    → "Chicken & Cheese L"
 * "4 Formaggios+ (Individual)"   → "4 Formaggios+ S"
 * "Coca Cola 33cl"               → "Coca Cola 33cl"   (unchanged)
 */
export function normalizeProductTitle(title: string): string {
  const match = VENDUS_PIZZA_SIZE_RE.exec(title);
  if (!match) return title;
  const captured = match[1] ?? "";
  const size = SIZE_LABEL[captured.toLowerCase()] ?? captured;
  return `${title.slice(0, match.index).trim()} ${size}`;
}
