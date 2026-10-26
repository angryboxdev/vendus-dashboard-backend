import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { BankMovement } from "../../domain/entities/bank-movement.js";
import type {
  BankMovementFilter,
  BankMovementRepositoryPort,
  RuleUsage,
} from "../../domain/ports/out/bank-movement-repository.port.js";

function key(organizationId: OrganizationId, id: string): string {
  return `${organizationId}:${id}`;
}

export class FakeBankMovementRepository implements BankMovementRepositoryPort {
  private store = new Map<string, BankMovement>();

  async saveBulk(organizationId: OrganizationId, movements: BankMovement[]): Promise<void> {
    for (const m of movements) {
      this.store.set(key(organizationId, m.id), m);
    }
  }

  async findByStatementId(
    organizationId: OrganizationId,
    statementImportId: string,
    filter?: BankMovementFilter
  ): Promise<BankMovement[]> {
    const prefix = `${organizationId}:`;
    let results = [...this.store.entries()]
      .filter(([k, m]) => k.startsWith(prefix) && m.statementImportId === statementImportId)
      .map(([, m]) => m);
    if (filter?.reconciliationStatus) {
      results = results.filter((m) => m.reconciliationStatus === filter.reconciliationStatus);
    }
    if (filter?.movementType) {
      results = results.filter((m) => m.movementType === filter.movementType);
    }
    if (filter?.riskLevel) {
      results = results.filter((m) => m.riskLevel === filter.riskLevel);
    }
    return results;
  }

  async findById(organizationId: OrganizationId, id: string): Promise<BankMovement | null> {
    return this.store.get(key(organizationId, id)) ?? null;
  }

  async findByIds(organizationId: OrganizationId, ids: string[]): Promise<BankMovement[]> {
    return ids.flatMap((id) => {
      const m = this.store.get(key(organizationId, id));
      return m ? [m] : [];
    });
  }

  async update(organizationId: OrganizationId, movement: BankMovement): Promise<void> {
    const k = key(organizationId, movement.id);
    if (!this.store.has(k)) {
      throw new Error(`Movement ${movement.id} not found`);
    }
    this.store.set(k, movement);
  }

  async findByAccountAndPeriod(
    organizationId: OrganizationId,
    bankAccountId: string,
    from: Date,
    to: Date
  ): Promise<BankMovement[]> {
    const prefix = `${organizationId}:`;
    return [...this.store.entries()]
      .filter(
        ([k, m]) =>
          k.startsWith(prefix) &&
          m.bankAccountId === bankAccountId &&
          m.bookingDate >= from &&
          m.bookingDate <= to
      )
      .map(([, m]) => m);
  }

  async detachRule(organizationId: OrganizationId, ruleId: string): Promise<void> {
    for (const [k, m] of this.store) {
      if (k.startsWith(`${organizationId}:`) && m.classifiedByRuleId === ruleId) this.store.set(k, m.detachRule());
    }
  }

  async ruleUsage(organizationId: OrganizationId): Promise<RuleUsage[]> {
    const byRule = new Map<string, RuleUsage>();
    for (const [k, m] of this.store) {
      if (!k.startsWith(`${organizationId}:`) || !m.classifiedByRuleId) continue;
      const day = m.bookingDate.toISOString().slice(0, 10);
      const u = byRule.get(m.classifiedByRuleId) ?? { ruleId: m.classifiedByRuleId, movementsCount: 0, lastBookingDate: null };
      u.movementsCount += 1;
      if (!u.lastBookingDate || day > u.lastBookingDate) u.lastBookingDate = day;
      byRule.set(u.ruleId, u);
    }
    return [...byRule.values()];
  }

  async existsByHash(organizationId: OrganizationId, deduplicationHash: string): Promise<boolean> {
    const prefix = `${organizationId}:`;
    return [...this.store.entries()].some(
      ([k, m]) => k.startsWith(prefix) && m.deduplicationHash === deduplicationHash
    );
  }
}
