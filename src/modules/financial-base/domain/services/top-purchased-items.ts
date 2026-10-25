import type { SupplierPurchasedLine } from "../ports/out/supplier-invoice-stats.port.js";

export interface TopPurchasedItem {
  /** Artigo de stock, ou a descrição normalizada quando a linha não está ligada a stock. */
  key: string;
  name: string;
  code: string | null;
  stockItemId: string | null;
  lastPurchaseDate: Date;
  /** Preço unitário sem IVA da compra mais recente (euros). */
  lastUnitPrice: number;
  /** Soma com IVA de todas as compras do artigo (euros). */
  totalSpent: number;
  purchaseCount: number;
}

const normalize = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Agrupa as linhas compradas por artigo (artigo de stock; senão código do
 * fornecedor; senão descrição) e devolve os `limit` artigos onde mais se
 * gastou. Nome, código e preço vêm da compra mais recente de cada artigo.
 */
export function rankTopPurchasedItems(lines: SupplierPurchasedLine[], limit: number): TopPurchasedItem[] {
  const groups = new Map<string, TopPurchasedItem>();

  for (const line of lines) {
    const key = line.stockItemId
      ? `stock:${line.stockItemId}`
      : line.supplierItemCode?.trim()
        ? `code:${normalize(line.supplierItemCode)}`
        : `desc:${normalize(line.description)}`;
    const name = line.stockItemName ?? line.description.trim();
    const current = groups.get(key);

    if (!current) {
      groups.set(key, {
        key,
        name,
        code: line.supplierItemCode?.trim() || null,
        stockItemId: line.stockItemId,
        lastPurchaseDate: line.invoiceDate,
        lastUnitPrice: line.unitCostWithoutVat,
        totalSpent: line.totalWithVat,
        purchaseCount: 1,
      });
      continue;
    }

    current.totalSpent += line.totalWithVat;
    current.purchaseCount++;
    if (line.invoiceDate > current.lastPurchaseDate) {
      current.lastPurchaseDate = line.invoiceDate;
      current.lastUnitPrice = line.unitCostWithoutVat;
      current.name = name;
      current.code = line.supplierItemCode?.trim() || current.code;
    }
  }

  return [...groups.values()]
    .sort((a, b) => b.totalSpent - a.totalSpent || b.lastPurchaseDate.getTime() - a.lastPurchaseDate.getTime())
    .slice(0, limit)
    .map((item) => ({ ...item, totalSpent: Math.round(item.totalSpent * 100) / 100 }));
}
