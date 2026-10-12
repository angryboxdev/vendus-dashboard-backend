import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { OverviewAbsence, OverviewDay, PendingCounts } from "../../domain/entities/overview.js";
import type { OverviewSourcesPort } from "../../domain/ports/out/overview.ports.js";

export const blankDay = (workDate: string, over: Partial<OverviewDay> = {}): OverviewDay => ({
  workDate,
  workedSeconds: 0,
  theoreticalSeconds: 8 * 3600,
  plannedStart: "09:00",
  plannedEnd: "17:00",
  excused: false,
  firstInAt: null,
  lateMinutes: 0,
  startPassed: true,
  openType: null,
  segments: [],
  ...over,
});

export class FakeOverviewSources implements OverviewSourcesPort {
  todayValue = "2026-10-12";
  employeesList = [
    { id: "e-ana", name: "Ana Demo", locationId: "loc-porto" },
    { id: "e-rui", name: "Rui Demo", locationId: "loc-porto" },
    { id: "e-eva", name: "Eva Demo", locationId: "loc-braga" },
    { id: "e-joao", name: "João Demo", locationId: "loc-braga" },
  ];
  /** Por colaborador: sobreposições do dia escolhido; os outros dias são "trabalhou a horas". */
  todayOf: Record<string, Partial<OverviewDay>> = {};
  absencesList: OverviewAbsence[] = [];
  /** Sobreposições aplicadas a todos os dias (horários planeados). */
  daysPlan: Record<string, Partial<OverviewDay>> = {};
  daysCalls = 0;

  async today() {
    return this.todayValue;
  }
  async employees() {
    return this.employeesList;
  }
  async locations() {
    return [
      { id: "loc-porto", name: "Porto" },
      { id: "loc-braga", name: "Braga" },
    ];
  }
  async days(_o: OrganizationId, employeeId: string, from: string, to: string) {
    this.daysCalls++;
    const out: OverviewDay[] = [];
    for (let d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
      const date = d.toISOString().slice(0, 10);
      out.push(date === to ? blankDay(date, { ...(this.daysPlan[employeeId] ?? {}), ...(this.todayOf[employeeId] ?? {}) }) : blankDay(date, { firstInAt: `${date}T08:00:00Z`, workedSeconds: 8 * 3600, ...(this.daysPlan[employeeId] ?? {}) }));
    }
    return { timeZone: "Europe/Lisbon", days: out };
  }
  async absences() {
    return this.absencesList;
  }
  async pending(): Promise<PendingCounts> {
    return { absenceRequests: 2, corrections: 1, incidents: 3, customRequests: 0, alerts: 1 };
  }
  async holidays() {
    return [{ date: "2026-11-01", name: "Dia de Todos os Santos" }];
  }
}
