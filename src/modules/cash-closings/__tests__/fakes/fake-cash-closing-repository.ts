import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { CashClosing } from "../../domain/entities/cash-closing.js";
import type {
  CashClosingRepositoryPort,
  ClosingListFilter,
} from "../../domain/ports/out/cash-closing-repository.port.js";

function key(organizationId: OrganizationId, id: string): string {
  return `${organizationId}:${id}`;
}

export class FakeCashClosingRepository implements CashClosingRepositoryPort {
  private readonly store = new Map<string, CashClosing>();

  async save(organizationId: OrganizationId, closing: CashClosing): Promise<void> {
    this.store.set(key(organizationId, closing.id), closing);
  }

  async findById(organizationId: OrganizationId, id: string): Promise<CashClosing | null> {
    return this.store.get(key(organizationId, id)) ?? null;
  }

  async list(
    organizationId: OrganizationId,
    filter: ClosingListFilter,
  ): Promise<{ closings: CashClosing[]; total: number }> {
    const prefix = `${organizationId}:`;
    let items = Array.from(this.store.entries())
      .filter(([k]) => k.startsWith(prefix))
      .map(([, c]) => c);

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

  async update(organizationId: OrganizationId, closing: CashClosing): Promise<void> {
    this.store.set(key(organizationId, closing.id), closing);
  }

  async existsForEmployeeOnDate(
    organizationId: OrganizationId,
    employeeId: string,
    closingDate: string,
  ): Promise<boolean> {
    const prefix = `${organizationId}:`;
    return Array.from(this.store.entries()).some(
      ([k, c]) => k.startsWith(prefix) && c.employeeId === employeeId && c.closingDate === closingDate,
    );
  }

  async existsForSession(organizationId: OrganizationId, sessionOpenedAt: string): Promise<boolean> {
    const prefix = `${organizationId}:`;
    return Array.from(this.store.entries()).some(
      ([k, c]) => k.startsWith(prefix) && c.sessionOpenedAt === sessionOpenedAt,
    );
  }

  /** Utilitário de teste: devolve todos os fechos (de todas as organizações). */
  findAll(): CashClosing[] {
    return Array.from(this.store.values());
  }
}
