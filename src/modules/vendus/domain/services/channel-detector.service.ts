import type { VendusDetailedDocumentRaw, VendusChannel } from "../entities/vendus-document.js";

/**
 * Determina o canal de venda de um documento Vendus.
 *
 * Regras (aplicadas por ordem):
 *  1. Se payments[] contém o método Eatz (eatzPaymentId) → 'eatz'
 *  2. Se items[] contém um item com "embalagem" no título → 'take_away'
 *  3. Caso contrário → 'salao'
 *
 * @param doc           Documento detalhado raw (payments[] e items[] obrigatórios)
 * @param eatzPaymentId ID do método de pagamento "Eatz" na Vendus (env VENDUS_EATZ_PAYMENT_ID)
 */
export function detectChannel(
  doc: VendusDetailedDocumentRaw,
  eatzPaymentId: number,
): VendusChannel {
  if (doc.payments.some((p) => p.id === eatzPaymentId)) return "eatz";
  if (doc.items.some((i) => i.title.toLowerCase().includes("embalagem"))) return "take_away";
  return "salao";
}
