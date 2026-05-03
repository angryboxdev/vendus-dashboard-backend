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

function hasTakeAwayPackaging(items: VendusDetailedDocument["items"]): boolean {
  return items.some((item) =>
    String(item?.title ?? "").toLowerCase().includes("embalagem")
  );
}

function detectChannelByPrice(items: VendusDetailedDocument["items"]): Channel {
  // 1. Pizza items first — almost always present in delivery and always have different prices
  const pizzaItems = items.filter((item) => {
    const info = findProductInfo(item);
    if (!info) return false;
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

  return "unknown";
}

export function detectChannel(document: VendusDetailedDocument): Channel {
  const items = document.items ?? [];
  const priceChannel = detectChannelByPrice(items);

  // Restaurant order with delivery packaging → take away
  if (priceChannel === "restaurant" && hasTakeAwayPackaging(items)) {
    return "take_away";
  }

  return priceChannel;
}
