import type { Channel, VendusDetailedDocument, VendusDocumentItem } from "./types.js";
import { findProductInfo, getUnitGross, priceMapConfig } from "./priceMap.js";

function detectChannelFromItem(item: VendusDocumentItem): Channel {
  const info = findProductInfo(item);
  if (!info) return "unknown";

  const unitGross = getUnitGross(item);
  if (unitGross <= 0) return "unknown";

  const tol = priceMapConfig.tolerance;
  const matchesRestaurant = info.restaurantPrices.some(
    (p) => Math.abs(p - unitGross) <= tol
  );
  const matchesDelivery = info.deliveryPrices.some(
    (p) => Math.abs(p - unitGross) <= tol
  );

  if (matchesRestaurant && !matchesDelivery) return "restaurant";
  if (matchesDelivery && !matchesRestaurant) return "delivery";
  return "unknown"; // same price in both channels, or no match
}

export function detectChannel(document: VendusDetailedDocument): Channel {
  const items = document.items ?? [];

  // 1. Pizza items first — almost always present in delivery and always have different prices
  const pizzaItems = items.filter((item) => {
    const info = findProductInfo(item);
    if (!info) return false;
    // A pizza item has a delivery price distinct from restaurant — use catalog category
    // but we can't call getCategoryFromCatalog here without import cycle risk.
    // Instead, rely on the title heuristic: "(Individual)" or "(Grande)"
    const title = String(item?.title ?? "").toLowerCase();
    return title.includes("(individual)") || title.includes("(grande)");
  });

  for (const item of pizzaItems) {
    const ch = detectChannelFromItem(item);
    if (ch !== "unknown") return ch;
  }

  // 2. All remaining items
  for (const item of items) {
    const title = String(item?.title ?? "").toLowerCase();
    if (title.includes("(individual)") || title.includes("(grande)")) continue;
    const ch = detectChannelFromItem(item);
    if (ch !== "unknown") return ch;
  }

  // 3. All items ambiguous (same price in both channels) → delivery
  return "delivery";
}
