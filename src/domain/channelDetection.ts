import type { Channel, VendusDetailedDocument } from "./types.js";

export function detectChannel(document: VendusDetailedDocument): Channel {
  const payments = document.payments;
  if (payments && payments.length > 0) {
    const payment = payments[0];
    if (payment?.title === "Transferência Bancária") return "delivery";
    if (payment?.title === "Dinheiro") return "restaurant";
    if (payment?.title === "Multibanco") return "restaurant";
  }
  return "unknown";
}
