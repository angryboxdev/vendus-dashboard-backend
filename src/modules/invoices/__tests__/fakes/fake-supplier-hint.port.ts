import type { SupplierHintPort } from "../../domain/ports/out/supplier-hint.port.js";
import type { SupplierSummary } from "../../domain/ports/out/supplier-lookup.port.js";

export class FakeSupplierHintPort implements SupplierHintPort {
  /** Hints guardados: normalizedName → supplierId */
  private hints = new Map<string, string>();
  /** Fornecedores disponíveis para resolução ao fazer findByNormalizedName */
  private suppliers: SupplierSummary[] = [];

  /** Regista fornecedores que podem ser devolvidos por findByNormalizedName. */
  seedSuppliers(suppliers: SupplierSummary[]): void {
    this.suppliers = suppliers;
  }

  /** Pré-popula hints (para testar o caminho de hit em ImportInvoice). */
  seedHint(normalizedName: string, supplierId: string): void {
    this.hints.set(normalizedName, supplierId);
  }

  /** Expõe os hints guardados pelo use case para assertions nos testes. */
  get saved(): ReadonlyMap<string, string> {
    return this.hints;
  }

  async findByNormalizedName(normalizedName: string): Promise<SupplierSummary | null> {
    const supplierId = this.hints.get(normalizedName);
    if (!supplierId) return null;
    return this.suppliers.find((s) => s.id === supplierId) ?? null;
  }

  async save(normalizedName: string, supplierId: string): Promise<void> {
    this.hints.set(normalizedName, supplierId);
  }
}
