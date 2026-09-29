import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { MonthlyClosure } from "../../domain/entities/monthly-closure.js";
import type { MonthlyClosureRepositoryPort } from "../../domain/ports/out/monthly-closure-repository.port.js";

export class FakeMonthlyClosureRepository implements MonthlyClosureRepositoryPort {
  private readonly byKey = new Map<string, MonthlyClosure>();
  private nextId = 1;

  async findByPeriod(organizationId: OrganizationId, year: number, month: number): Promise<MonthlyClosure | null> {
    return this.byKey.get(`${String(organizationId)}:${year}:${month}`) ?? null;
  }

  async save(organizationId: OrganizationId, closure: MonthlyClosure): Promise<MonthlyClosure> {
    const props = closure.toProps();
    const saved = props.id
      ? closure
      : MonthlyClosure.reconstitute({ ...props, id: `closure-${this.nextId++}` });
    this.byKey.set(`${String(organizationId)}:${props.year}:${props.month}`, saved);
    return saved;
  }
}
