import type {
  VendusDetailedDocument,
  VendusDocumentItem,
} from "../domain/types.js";

import { toNumber } from "../utils/numbers.js";

export function isFreeItem(
  doc: VendusDetailedDocument,
  item: VendusDocumentItem
): boolean {
  const hasDiscount = toNumber(doc?.discounts?.total) > 0;
  if (!hasDiscount) return false;

  const title = String(item?.title ?? "").toLowerCase();
  const reference = String(item?.reference ?? "").toLowerCase();

  return title.includes("brigadeiro") || reference.includes("brigadeiro");
}
