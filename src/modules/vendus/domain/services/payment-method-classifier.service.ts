import type { VendusDocumentPayment } from "../entities/vendus-document.js";
import type { VendusPaymentKind } from "../entities/vendus-analytics.js";

/** IDs dos métodos Eatz e Apps na Vendus (config por organização/location). */
export interface VendusPaymentIds {
  eatz: number;
  apps: number;
}

const CASH = /\b(numer[aá]rio|dinheiro|cash|efetivo|efectivo)\b/i;
const CARD = /\b(multibanco|mb|tpa|cart[aã]o|cart[oõ]es|visa|mastercard|maestro|amex|d[eé]bito|cr[eé]dito|card|tarjeta)\b/i;

/**
 * Classe do método de pagamento de um documento Vendus, para conferir com o banco:
 *  1. ID do método Eatz / Apps → 'eatz' / 'apps'
 *  2. título de numerário («Numerário», «Dinheiro») → 'cash'
 *  3. título de cartão («Multibanco», «TPA», «Cartão», «Visa»…) → 'card'
 *  4. caso contrário (MB Way — não liquida pelo TPA —, transferência, vale…) → 'other'
 *
 * Por título e não por ID porque os métodos de numerário/cartão não estão configurados por location
 * (só Eatz e Apps estão). O título original segue no `byPaymentMethod` para se ver o que caiu em 'other'.
 */
export function classifyPayment(payment: Pick<VendusDocumentPayment, "id" | "title">, ids?: VendusPaymentIds): VendusPaymentKind {
  if (ids && payment.id === ids.eatz) return "eatz";
  if (ids && payment.id === ids.apps) return "apps";
  const title = payment.title ?? "";
  if (/\beatz\b/i.test(title)) return "eatz";
  if (CASH.test(title)) return "cash";
  if (/\bmb\s*way\b/i.test(title)) return "other";
  if (CARD.test(title)) return "card";
  return "other";
}
