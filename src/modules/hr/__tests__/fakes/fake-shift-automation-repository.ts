import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ShiftAutomation } from "../../domain/entities/shift-automation.js";
import type {
  AutomationIssue,
  AutomationIssueRepositoryPort,
  ShiftAutomationRepositoryPort,
} from "../../domain/ports/out/shift-automation-repository.port.js";

export class FakeShiftAutomationRepository implements ShiftAutomationRepositoryPort {
  private readonly byOrg = new Map<string, Map<string, ShiftAutomation>>();

  private store(organizationId: OrganizationId): Map<string, ShiftAutomation> {
    const key = String(organizationId);
    if (!this.byOrg.has(key)) this.byOrg.set(key, new Map());
    return this.byOrg.get(key)!;
  }

  async findAll(organizationId: OrganizationId): Promise<ShiftAutomation[]> {
    return [...this.store(organizationId).values()];
  }

  async findById(organizationId: OrganizationId, id: string): Promise<ShiftAutomation | null> {
    return this.store(organizationId).get(id) ?? null;
  }

  async insert(organizationId: OrganizationId, automation: ShiftAutomation): Promise<void> {
    this.store(organizationId).set(automation.id, automation);
  }

  async update(organizationId: OrganizationId, automation: ShiftAutomation): Promise<void> {
    this.store(organizationId).set(automation.id, automation);
  }
}

/** Reproduz a chave única (org, automatização, colaborador, dia) e a reabertura no upsert. */
export class FakeAutomationIssueRepository implements AutomationIssueRepositoryPort {
  readonly rows: (AutomationIssue & { org: string })[] = [];
  private seq = 0;

  async upsertMany(organizationId: OrganizationId, issues: Omit<AutomationIssue, "id" | "dismissedAt">[]): Promise<void> {
    for (const i of issues) {
      const existing = this.rows.find(
        (r) => r.org === String(organizationId) && r.automationId === i.automationId && r.employeeId === i.employeeId && r.workDate === i.workDate,
      );
      if (existing) Object.assign(existing, { status: i.status, dismissedAt: null });
      else this.rows.push({ ...i, id: `issue-${++this.seq}`, dismissedAt: null, org: String(organizationId) });
    }
  }

  async findOpenInRange(organizationId: OrganizationId, from: string, to: string): Promise<AutomationIssue[]> {
    return this.rows.filter((r) => r.org === String(organizationId) && r.dismissedAt === null && r.workDate >= from && r.workDate <= to);
  }

  async countOpenByAutomation(organizationId: OrganizationId): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    for (const r of this.rows) if (r.org === String(organizationId) && r.dismissedAt === null) counts.set(r.automationId, (counts.get(r.automationId) ?? 0) + 1);
    return counts;
  }

  async findById(organizationId: OrganizationId, id: string): Promise<AutomationIssue | null> {
    return this.rows.find((r) => r.org === String(organizationId) && r.id === id) ?? null;
  }

  async dismiss(organizationId: OrganizationId, id: string, _actor: string, at: Date): Promise<void> {
    const row = this.rows.find((r) => r.org === String(organizationId) && r.id === id);
    if (row) row.dismissedAt = at.toISOString();
  }
}
