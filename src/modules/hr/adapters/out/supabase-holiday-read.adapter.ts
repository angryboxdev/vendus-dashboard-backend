import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { HolidayReadPort, PublicHoliday } from "../../domain/ports/out/holiday-read.port.js";

interface HolidayRow {
  date: string;
  name: string;
}

export class SupabaseHolidayReadAdapter implements HolidayReadPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async findInRange(organizationId: OrganizationId, from: string, to: string): Promise<PublicHoliday[]> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_public_holidays")
      .select("date, name")
      // D6 (Base Organizacional): feriados de um Local específico ainda não
      // afetam as Escalas — só os da empresa inteira, como até aqui.
      .is("location_id", null)
      .gte("date", from)
      .lte("date", to);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as HolidayRow[];
  }
}
