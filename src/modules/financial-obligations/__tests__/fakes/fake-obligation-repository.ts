import type { FinancialObligation } from "../../domain/entities/financial-obligation.js";
import type {
  FinancialObligationRepositoryPort,
  ObligationFilter,
} from "../../domain/ports/out/obligation-repository.port.js";

export class FakeObligationRepository implements FinancialObligationRepositoryPort {
  private store = new Map<string, FinancialObligation>();

  async save(obligation: FinancialObligation): Promise<void> {
    this.store.set(obligation.id, obligation);
  }

  async findById(id: string): Promise<FinancialObligation | null> {
    return this.store.get(id) ?? null;
  }

  async findAll(filter?: ObligationFilter): Promise<FinancialObligation[]> {
    let result = [...this.store.values()];

    // The repository always returns only recurrence/manual entries (filter by source if specified)
    if (filter?.source) {
      result = result.filter((o) => o.source === filter.source);
    } else {
      result = result.filter((o) => o.source === "recurrence" || o.source === "manual");
    }

    if (filter?.supplierId) result = result.filter((o) => o.supplierId === filter.supplierId);
    if (filter?.status) result = result.filter((o) => o.status === filter.status);
    if (filter?.from) {
      const from = filter.from;
      result = result.filter((o) => o.dueDate >= from);
    }
    if (filter?.to) {
      const to = filter.to;
      result = result.filter((o) => o.dueDate <= to);
    }

    return result.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  }

  async update(obligation: FinancialObligation): Promise<void> {
    this.store.set(obligation.id, obligation);
  }
}
