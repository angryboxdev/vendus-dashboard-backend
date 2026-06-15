import type { CashClosing } from "../../domain/entities/cash-closing.js";
import type {
  CashClosingRepositoryPort,
  ClosingListFilter,
} from "../../domain/ports/out/cash-closing-repository.port.js";

export class FakeCashClosingRepository implements CashClosingRepositoryPort {
  private readonly store = new Map<string, CashClosing>();

  async save(closing: CashClosing): Promise<void> {
    this.store.set(closing.id, closing);
  }

  async findById(id: string): Promise<CashClosing | null> {
    return this.store.get(id) ?? null;
  }

  async list(filter: ClosingListFilter): Promise<{ closings: CashClosing[]; total: number }> {
    let items = Array.from(this.store.values());

    if (filter.from) {
      items = items.filter((c) => c.closingDate >= filter.from!);
    }
    if (filter.to) {
      items = items.filter((c) => c.closingDate <= filter.to!);
    }
    if (filter.status) {
      items = items.filter((c) => c.status === filter.status);
    }
    if (filter.employeeId) {
      items = items.filter((c) => c.employeeId === filter.employeeId);
    }

    items.sort((a, b) => b.closingDate.localeCompare(a.closingDate));
    const total = items.length;

    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? items.length;
    return { closings: items.slice(offset, offset + limit), total };
  }

  async update(closing: CashClosing): Promise<void> {
    this.store.set(closing.id, closing);
  }

  async existsForEmployeeOnDate(employeeId: string, closingDate: string): Promise<boolean> {
    return Array.from(this.store.values()).some(
      (c) => c.employeeId === employeeId && c.closingDate === closingDate,
    );
  }

  async existsForSession(sessionOpenedAt: string): Promise<boolean> {
    return Array.from(this.store.values()).some(
      (c) => c.sessionOpenedAt === sessionOpenedAt,
    );
  }

  /** Utilitário de teste: devolve todos os fechos. */
  findAll(): CashClosing[] {
    return Array.from(this.store.values());
  }
}
