import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { HolidayReadPort, PublicHoliday } from "../../domain/ports/out/holiday-read.port.js";

export class FakeHolidayReadAdapter implements HolidayReadPort {
  private readonly holidays: Array<{ organizationId: string; holiday: PublicHoliday }> = [];

  seed(organizationId: OrganizationId, holiday: PublicHoliday): void {
    this.holidays.push({ organizationId: String(organizationId), holiday });
  }

  async findInRange(organizationId: OrganizationId, from: string, to: string): Promise<PublicHoliday[]> {
    return this.holidays
      .filter((h) => h.organizationId === String(organizationId) && h.holiday.date >= from && h.holiday.date <= to)
      .map((h) => h.holiday);
  }
}
