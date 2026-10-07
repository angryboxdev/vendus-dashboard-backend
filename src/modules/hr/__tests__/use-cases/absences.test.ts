import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Location } from "../../../locations/domain/entities/location.js";
import { FakeDocumentRepository } from "../../../documents/__tests__/fakes/fake-document-repository.js";
import { Absence, InvalidAbsenceError } from "../../domain/entities/absence.js";
import { Employee } from "../../domain/entities/employee.js";
import { PortalRequest } from "../../domain/entities/portal-request.js";
import { Position } from "../../domain/entities/position.js";
import { WorkShift } from "../../domain/entities/work-shift.js";
import { CancelAbsenceUseCase, GetAbsenceBoardUseCase, PreviewAbsenceUseCase, RegisterAbsenceUseCase } from "../../application/use-cases/absences.use-cases.js";
import { durationLabel, workingDaysBetween } from "../../domain/services/absence-impact.service.js";
import { FakeAbsenceRepository } from "../fakes/fake-absence-repository.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { FakeHolidayReadAdapter } from "../fakes/fake-holiday-read.js";
import { FakeHrAuditLog } from "../fakes/fake-hr-audit-log.js";
import { FakeLocationRepository } from "../fakes/fake-location-repository.js";
import { FakePortalRequestRepository } from "../fakes/fake-portal-request-repository.js";
import { FakePositionRepository } from "../fakes/fake-position-repository.js";
import { FakeWorkShiftRepository } from "../fakes/fake-work-shift-repository.js";

const ORG = mintOrganizationId("org-test");

function setup() {
  const absences = new FakeAbsenceRepository();
  const employees = new FakeEmployeeRepository();
  const positions = new FakePositionRepository();
  const locations = new FakeLocationRepository();
  const workShifts = new FakeWorkShiftRepository();
  const holidays = new FakeHolidayReadAdapter();
  const requests = new FakePortalRequestRepository();
  const audit = new FakeHrAuditLog();
  positions.seed(ORG, Position.create("pos-1", { name: "Preparador", description: null }, new Date()));
  locations.seed(ORG, [Location.reconstitute({ id: "loc-1", name: "Loja Teste", code: null, timezone: "Europe/Lisbon", isActive: true })]);
  const carla = Employee.create({ fullName: "CARLA DEMO", positionId: "pos-1", primaryLocationId: "loc-1" });
  const outro = Employee.create({ fullName: "OUTRO DEMO" });
  employees.seed(ORG, carla);
  employees.seed(ORG, outro);
  const shift = (employeeId: string, workDate: string) =>
    workShifts.seed(ORG, WorkShift.create({ employeeId, workDate, startTime: "10:00", endTime: "18:00", locationId: "loc-1", status: "published" }));
  const base = { organizationId: ORG, actor: "rh@example.com", employeeId: carla.id, duration: "day" as const };
  return {
    absences,
    requests,
    holidays,
    carla,
    outro,
    shift,
    base,
    board: new GetAbsenceBoardUseCase(absences, requests, new FakeDocumentRepository(), employees, positions, locations, workShifts),
    preview: new PreviewAbsenceUseCase(absences, workShifts, holidays, employees),
    register: new RegisterAbsenceUseCase(absences, holidays, audit),
    cancel: new CancelAbsenceUseCase(absences, audit),
  };
}

describe("regras puras", () => {
  it("dias úteis: segunda a sexta sem feriados", () => {
    expect(workingDaysBetween("2026-10-12", "2026-10-18", new Set())).toBe(5);
    expect(workingDaysBetween("2026-10-12", "2026-10-16", new Set(["2026-10-13"]))).toBe(4);
  });
  it("duração legível", () => {
    expect(durationLabel({ workingDays: 1, minutes: null, startTime: null })).toBe("1 dia útil");
    expect(durationLabel({ workingDays: 0, minutes: 240, startTime: null })).toBe("Meio dia");
    expect(durationLabel({ workingDays: 0, minutes: 150, startTime: "10:00" })).toBe("2h30");
  });
  it("férias só em dias inteiros; horas num só dia com fim depois do início", () => {
    const b = { employeeId: "e", workingDays: 0, createdBy: "x" };
    expect(() => Absence.register({ ...b, type: "vacation", duration: "half_day", startDate: "2026-10-12", endDate: "2026-10-12" })).toThrow(InvalidAbsenceError);
    expect(() => Absence.register({ ...b, type: "justified", duration: "hours", startDate: "2026-10-12", endDate: "2026-10-13", startTime: "10:00", endTime: "12:00" })).toThrow(InvalidAbsenceError);
    expect(() => Absence.register({ ...b, type: "justified", duration: "hours", startDate: "2026-10-12", endDate: "2026-10-12", startTime: "12:00", endTime: "10:00" })).toThrow(InvalidAbsenceError);
  });
});

describe("Registar ausência — impacto", () => {
  it("férias: dias úteis, saldo antes/depois, turnos afetados e quem mais está ausente", async () => {
    const t = setup();
    t.absences.balances.set(`${t.carla.id}:2026`, { daysEntitled: 22, daysCarriedOver: 0 });
    t.absences.seed(Absence.register({ employeeId: t.carla.id, type: "vacation", duration: "day", startDate: "2026-08-03", endDate: "2026-08-14", workingDays: 8, createdBy: "x" }));
    t.absences.seed(Absence.register({ employeeId: t.outro.id, type: "sick_leave", duration: "day", startDate: "2026-10-14", endDate: "2026-10-15", workingDays: 2, createdBy: "x" }));
    ["2026-10-12", "2026-10-13", "2026-10-14"].forEach((d) => t.shift(t.carla.id, d));

    const impact = await t.preview.execute({ ...t.base, type: "vacation", startDate: "2026-10-12", endDate: "2026-10-16" });
    expect(impact).toMatchObject({ workingDays: 5, duration: "5 dias úteis", balance: { defined: true, available: 14, after: 9 }, othersAbsent: ["OUTRO DEMO"], overlapsExisting: false });
    expect(impact.affectedShifts).toHaveLength(3);
  });

  it("sem saldo definido → indica que não está definido; outros tipos não mostram saldo", async () => {
    const t = setup();
    expect((await t.preview.execute({ ...t.base, type: "vacation", startDate: "2026-10-12", endDate: "2026-10-12" })).balance).toEqual({ defined: false, available: null, after: null });
    expect((await t.preview.execute({ ...t.base, type: "sick_leave", startDate: "2026-10-12", endDate: "2026-10-12" })).balance).toBeNull();
  });
});

describe("Registar / cancelar", () => {
  it("regista; não deixa sobrepor; cancelar exige motivo e mantém no histórico", async () => {
    const t = setup();
    const { id } = await t.register.execute({ ...t.base, type: "justified", startDate: "2026-10-12", endDate: "2026-10-13" });
    expect((await t.absences.findById(ORG, id))!.toProps()).toMatchObject({ workingDays: 2, status: "active", source: "hr" });
    await expect(t.register.execute({ ...t.base, type: "sick_leave", startDate: "2026-10-13", endDate: "2026-10-13" })).rejects.toBeInstanceOf(InvalidAbsenceError);

    await expect(t.cancel.execute({ organizationId: ORG, actor: "rh@example.com", id, reason: " " })).rejects.toBeInstanceOf(InvalidAbsenceError);
    await t.cancel.execute({ organizationId: ORG, actor: "rh@example.com", id, reason: "Registo errado" });
    expect((await t.absences.findById(ORG, id))!.toProps()).toMatchObject({ status: "cancelled", cancelReason: "Registo errado" });
    // Depois de cancelada já se pode registar de novo.
    await expect(t.register.execute({ ...t.base, type: "sick_leave", startDate: "2026-10-13", endDate: "2026-10-13" })).resolves.toHaveProperty("id");
  });
});

describe("Quadro (Calendário / Registos)", () => {
  it("junta ausências e pedidos do Portal, com turnos afetados e 'Requer atenção'", async () => {
    const t = setup();
    t.shift(t.carla.id, "2026-10-12");
    await t.register.execute({ ...t.base, type: "vacation", startDate: "2026-10-12", endDate: "2026-10-16" });
    await t.requests.create(ORG, PortalRequest.dayOff({ employeeId: t.outro.id, startDate: "2026-10-20", endDate: "2026-10-20", reasonCode: "personal", reasonText: null, today: "2026-10-07" }));

    const board = await t.board.execute({ organizationId: ORG, from: "2026-10-01", to: "2026-10-31" });
    expect(board.records.map((r) => [r.employeeName, r.source, r.status, r.affectedShifts])).toEqual([
      ["CARLA DEMO", "absence", "approved", 1],
      ["OUTRO DEMO", "request", "pending", 0],
    ]);
    expect(board.records[0]).toMatchObject({ positionName: "Preparador", locationName: "Loja Teste", duration: "5 dias úteis" });
    expect(board.attention).toEqual({ pendingRequests: 1, pendingDocuments: 0, shiftConflicts: 1 });
  });
});
