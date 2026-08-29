import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { InvoiceLine } from "../../domain/entities/invoice-line.js";
import type { InvoiceLineRepositoryPort } from "../../domain/ports/out/invoice-line-repository.port.js";

/**
 * A organização é apenas mais um parâmetro (D2) — este fake modela uma única
 * organização de cada vez, tal como as suítes que o usam; a filtragem por
 * organização é responsabilidade do helper (`ScopedQuery`), coberta pelos
 * seus próprios testes, não deste fake.
 */
export class FakeInvoiceLineRepository implements InvoiceLineRepositoryPort {
  private store = new Map<string, InvoiceLine>();

  async saveAll(_organizationId: OrganizationId, lines: InvoiceLine[]): Promise<void> {
    for (const line of lines) {
      this.store.set(line.id, line);
    }
  }

  async findAll(_organizationId: OrganizationId): Promise<InvoiceLine[]> {
    return [...this.store.values()];
  }

  async findByInvoiceId(_organizationId: OrganizationId, invoiceId: string): Promise<InvoiceLine[]> {
    return [...this.store.values()].filter((l) => l.invoiceId === invoiceId);
  }

  async updateLine(_organizationId: OrganizationId, line: InvoiceLine): Promise<void> {
    this.store.set(line.id, line);
  }

  async deleteByInvoiceId(_organizationId: OrganizationId, invoiceId: string): Promise<void> {
    for (const [id, line] of this.store) {
      if (line.invoiceId === invoiceId) this.store.delete(id);
    }
  }

  async deleteLineById(_organizationId: OrganizationId, lineId: string): Promise<void> {
    this.store.delete(lineId);
  }

  async updateCostCenterCategoryForInvoice(
    _organizationId: OrganizationId,
    invoiceId: string,
    categoryId: string | null,
  ): Promise<void> {
    for (const [id, line] of this.store) {
      if (line.invoiceId === invoiceId) {
        // InvoiceLine is immutable — reconstitute with updated field
        this.store.set(id, line.classify({ costCenterCategoryId: categoryId }));
      }
    }
  }
}
