import type { VendusDetailedDocumentRaw, VendusChannel } from "../entities/vendus-document.js";

/**
 * Determina o canal de venda de um documento Vendus.
 *
 * Regras (aplicadas por ordem):
 *  1. Se payments[] contém o método Apps (appsPaymentId) → 'apps'
 *  2. Se payments[] contém o método Eatz (eatzPaymentId) → 'eatz'
 *  3. Se items[] contém um item com "embalagem" no título → 'take_away'
 *  4. Caso contrário → 'salao'
 *
 * @param doc           Documento detalhado raw (payments[] e items[] obrigatórios)
 * @param eatzPaymentId ID do método de pagamento "Eatz" na Vendus (config por organização/location — ver `VendusLocationConfigPort`)
 * @param appsPaymentId ID do método de pagamento "Apps" na Vendus (idem)
 */
export function detectChannel(
  doc: VendusDetailedDocumentRaw,
  eatzPaymentId: number,
  appsPaymentId: number,
): VendusChannel {
  if (doc.payments.some((p) => p.id === appsPaymentId)) return "apps";
  if (doc.payments.some((p) => p.id === eatzPaymentId)) return "eatz";
  if (doc.items.some((i) => i.title.toLowerCase().includes("embalagem"))) return "take_away";
  return "salao";
}
