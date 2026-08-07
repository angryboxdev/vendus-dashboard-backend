import type { RawOrderItemInstance } from '../ports/out/air-menu-gateway.port.js';
import type { AirMenuOrderItem } from '../entities/air-menu-order.js';

/**
 * Family titles that represent pizza categories.
 * Items found inside these families default to size "S" when no complement
 * size indicator is present in the payload.
 */
const PIZZA_FAMILY_RE = /classics|specials|sweeties/i;

/** Complement groups with a classic size selector (e.g. "Escolha o Tamanho"). */
const SIZE_COMPLEMENT_RE = /tamanho|size/i;

/**
 * Complement groups representing a pizza upgrade option ("Dobre a sua pizza").
 * If the upgrade complementItem is selected → L; if absent → S.
 */
const UPGRADE_COMPLEMENT_RE = /dobre|dobrar/i;

/** Identifies "Upgrade para L" complementItem titles. */
const UPGRADE_TO_L_RE = /upgrade.*\bl\b/i;

/** Legacy size suffixes: "- Grande" → L, "- Individual" → S. */
const LEGACY_SIZE_RE = /\s*[-–]\s*(grande|individual)\s*$/i;

const LEGACY_SIZE_MAP: Record<string, string> = {
  grande: 'L',
  individual: 'S',
};

/**
 * Strips a legacy size suffix from a title.
 * Returns the base title (without suffix) and the derived size label, or null
 * when no suffix is present.
 *
 * "4 Formaggios - Grande"   → { baseTitle: "4 Formaggios", size: "L" }
 * "Tomate e Pesto - Individual" → { baseTitle: "Tomate e Pesto", size: "S" }
 * "Honey Pepperoni"          → { baseTitle: "Honey Pepperoni", size: null }
 */
function normalizeLegacyTitle(title: string): { baseTitle: string; size: string | null } {
  const match = LEGACY_SIZE_RE.exec(title);
  if (!match) return { baseTitle: title.trim(), size: null };
  const captured = match[1] ?? '';
  const size = LEGACY_SIZE_MAP[captured.toLowerCase()] ?? null;
  return { baseTitle: title.slice(0, match.index).trim(), size };
}

/**
 * Converts a legacy-suffixed title to a clean title with a size label.
 * Used for flat simplifiedItems where we have no complement tree to inspect.
 *
 * "4 Formaggios - Grande" → "4 Formaggios L"
 * "Coca-Cola"             → "Coca-Cola"  (unchanged)
 */
export function applyLegacyNormalization(title: string): string {
  const { baseTitle, size } = normalizeLegacyTitle(title);
  return size ? `${baseTitle} ${size}` : title;
}

/**
 * Finds size information from an item's complement children.
 *
 * Two patterns are handled:
 * - SIZE_COMPLEMENT_RE ("Escolha o Tamanho"): returns the selected option's
 *   title and price (merged into the parent item).
 * - UPGRADE_COMPLEMENT_RE ("Dobre a sua pizza"): returns "L" + upgrade price
 *   when the upgrade complementItem is present, or "S" + 0 when absent.
 *
 * Returns null when no size complement is found (item has no size concept).
 */
function findSizeInfo(
  childs: RawOrderItemInstance[],
): { label: string; price: number } | null {
  for (const child of childs) {
    if (child.menuRelation === 'complement') {
      if (SIZE_COMPLEMENT_RE.test(child.title ?? '')) {
        const cc = (child.childs ?? []).find((c) => c.menuRelation === 'complementItem');
        if (cc) return { label: cc.title, price: cc.price ?? 0 };
      }

      if (UPGRADE_COMPLEMENT_RE.test(child.title ?? '')) {
        const upgradeItem = (child.childs ?? []).find(
          (c) => c.menuRelation === 'complementItem' && UPGRADE_TO_L_RE.test(c.title ?? ''),
        );
        return upgradeItem
          ? { label: 'L', price: upgradeItem.price ?? 0 }
          : { label: 'S', price: 0 };
      }
    }

    const found = findSizeInfo(child.childs ?? []);
    if (found) return found;
  }
  return null;
}

/**
 * Collects paid add-ons that are NOT part of a size/upgrade complement group.
 * Size and upgrade groups are skipped entirely — they're merged into the item.
 */
function collectPaidNonSizeComplements(
  childs: RawOrderItemInstance[],
): AirMenuOrderItem[] {
  const items: AirMenuOrderItem[] = [];
  for (const child of childs) {
    if (child.menuRelation === 'complement') {
      if (SIZE_COMPLEMENT_RE.test(child.title ?? '')) continue;
      if (UPGRADE_COMPLEMENT_RE.test(child.title ?? '')) continue;
      for (const cc of child.childs ?? []) {
        if (cc.menuRelation === 'complementItem' && (cc.price ?? 0) > 0) {
          items.push({
            title: `+ ${cc.title}`,
            plu: cc.plu ?? '',
            price: cc.price!,
            count: cc.count ?? 1,
          });
        }
      }
    } else {
      items.push(...collectPaidNonSizeComplements(child.childs ?? []));
    }
  }
  return items;
}

/**
 * Internal recursive implementation that tracks whether the current node is
 * inside a pizza family (Classics, Specials, Sweeties).
 *
 * Size resolution priority (highest wins):
 * 1. Complement-based size ("Dobre a sua pizza" → L/S; "Escolha o Tamanho" → value)
 * 2. Legacy title suffix ("- Grande" → L; "- Individual" → S)
 * 3. Inside a pizza family with no other size indicator → S
 * 4. No size concept (e.g. Coca-Cola) → no suffix
 *
 * The "Dobre" / "Tamanho" complement groups are consumed and NOT emitted as
 * separate "+ Title" lines. Only paid non-size add-ons appear as extra lines.
 */
function extractItemsWithContext(
  childs: RawOrderItemInstance[],
  isInPizzaFamily: boolean,
): AirMenuOrderItem[] {
  const items: AirMenuOrderItem[] = [];

  for (const child of childs) {
    if (child.menuRelation === 'item') {
      const { baseTitle, size: legacySize } = normalizeLegacyTitle(child.title ?? '');
      const sizeFromComplement = findSizeInfo(child.childs ?? []);

      // Priority: complement > legacy suffix > pizza-family default (S)
      const finalSize =
        sizeFromComplement ??
        (legacySize
          ? { label: legacySize, price: 0 }
          : isInPizzaFamily
            ? { label: 'S', price: 0 }
            : null);

      items.push({
        title: finalSize ? `${baseTitle} ${finalSize.label}` : baseTitle,
        plu: child.plu ?? '',
        price: (child.price ?? 0) + (finalSize?.price ?? 0),
        count: child.count ?? 1,
      });

      items.push(...collectPaidNonSizeComplements(child.childs ?? []));
    } else if (child.childs?.length) {
      // Activate pizza context when entering a matching family; propagate it
      // to all descendants once active.
      const nextIsPizzaFamily =
        isInPizzaFamily ||
        (child.menuRelation === 'family' && PIZZA_FAMILY_RE.test(child.title ?? ''));

      items.push(...extractItemsWithContext(child.childs, nextIsPizzaFamily));
    }
  }

  return items;
}

/**
 * Recursively extracts AirMenuOrderItems from a raw AirMenu order node tree.
 * See `extractItemsWithContext` for size resolution rules.
 */
export function extractItems(childs: RawOrderItemInstance[]): AirMenuOrderItem[] {
  return extractItemsWithContext(childs, false);
}
