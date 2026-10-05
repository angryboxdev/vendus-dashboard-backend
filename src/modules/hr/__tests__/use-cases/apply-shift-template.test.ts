import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Location } from "../../../locations/domain/entities/location.js";
import { Employee } from "../../domain/entities/employee.js";
import { ShiftTemplate, type ShiftTemplateDetails } from "../../domain/entities/shift-template.js";
import { WorkShift } from "../../domain/entities/work-shift.js";
import { InvalidTemplateApplicationError } from "../../domain/errors.js";
import type { ApplyTemplateCommand, TemplateApplicationPreviewDTO } from "../../domain/ports/in/shift-template.ports.js";
import type { OccurrenceDecision } from "../../domain/services/template-application.service.js";
import { ApplyTemplateUseCase, PreviewTemplateApplicationUseCase } from "../../application/use-cases/apply-shift-template.use-cases.js";
import { FakeShiftTemplateRepository } from "../fakes/fake-shift-template-repository.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { FakeWorkShiftRepository } from "../fakes/fake-work-shift-repository.js";
import { FakeLocationRepository } from "../fakes/fake-location-repository.js";
import { FakeLeaveReadAdapter } from "../fakes/fake-leave-read.js";
import { FakeHolidayReadAdapter } from "../fakes/fake-holiday-read.js";
import { FakeHrAuditLog } from "../fakes/fake-hr-audit-log.js";

const ORG = mintOrganizationId("org-test");
const NOW = new Date("2026-10-05T10:00:00Z");
// 2026-11-07 é sábado, 2026-11-08 domingo.
const WEEKEND = { kind: "range" as const, from: "2026-11-07", to: "2026-11-08", weekdays: [5, 6] as (5 | 6)[] };

const BASE: ShiftTemplateDetails = {
  name: "Manhã 1",
  description: null,
  color: null,
  startTime: "08:00",
  endTime: "16:00",
  endsNextDay: false,
  secondStartTime: null,
  secondEndTime: null,
  breakMinutes: 0,
  locationId: "loc-mbs",
};

function setup(details: Partial<ShiftTemplateDetails> = {}) {
  const templates = new FakeShiftTemplateRepository();
  const employees = new FakeEmployeeRepository();
  const workShifts = new FakeWorkShiftRepository();
  const locations = new FakeLocationRepository();
  const leaveRead = new FakeLeaveReadAdapter();
  const holidayRead = new FakeHolidayReadAdapter();
  const auditLog = new FakeHrAuditLog();
  locations.seed(ORG, [
    Location.reconstitute({ id: "loc-mbs", name: "MBS", code: "MBS", timezone: "Europe/Lisbon", isActive: true }),
    Location.reconstitute({ id: "loc-2", name: "Loja 2", code: null, timezone: "Europe/Lisbon", isActive: true }),
  ]);
  const template = ShiftTemplate.create("tpl-1", { ...BASE, ...details }, "gestor", NOW);
  templates.seed(ORG, template);
  // Dados fictícios (RGPD).
  const carlos = Employee.create({ fullName: "Carlos Andrés", positionId: "pos-prep", primaryLocationId: "loc-2" });
  const gabriel = Employee.create({ fullName: "Gabriel Silva", positionId: "pos-prep", primaryLocationId: "loc-mbs" });
  const ana = Employee.create({ fullName: "Ana Martins", positionId: "pos-serv", primaryLocationId: "loc-mbs" });
  for (const e of [carlos, gabriel, ana]) employees.seed(ORG, e);
  const deps = { templates, employees, workShifts, locations, leaveRead, holidayRead };
  return {
    workShifts,
    leaveRead,
    holidayRead,
    templates,
    auditLog,
    carlos,
    gabriel,
    ana,
    preview: new PreviewTemplateApplicationUseCase(deps),
    apply: new ApplyTemplateUseCase(deps, auditLog),
  };
}

/** Decide "criar" para todas as válidas da pré-visualização (o que o ecrã envia por omissão). */
function createAllValid(preview: TemplateApplicationPreviewDTO): Record<string, OccurrenceDecision> {
  return Object.fromEntries(preview.occurrences.filter((o) => o.status === "valid").map((o) => [o.key, { action: "create" as const }]));
}

const config = { templateId: "tpl-1", audience: { kind: "position" as const, positionId: "pos-prep" }, days: WEEKEND, locationId: null };

describe("Aplicar modelo de turno", () => {
  it("público por cargo, dias de fim de semana e local pela precedência (aplicação → modelo → colaborador)", async () => {
    const { preview } = setup();
    const result = await preview.execute({ organizationId: ORG, ...config });
    expect(result.summary).toMatchObject({ employees: 2, valid: 4 });
    expect(new Set(result.occurrences.map((o) => o.locationId))).toEqual(new Set(["loc-mbs"])); // local padrão do modelo

    const comLocal = await preview.execute({ organizationId: ORG, ...config, locationId: "loc-2" });
    expect(new Set(comLocal.occurrences.map((o) => o.locationId))).toEqual(new Set(["loc-2"]));

    const { preview: semLocalNoModelo, carlos } = setup({ locationId: null });
    const porColaborador = await semLocalNoModelo.execute({ organizationId: ORG, ...config });
    expect(porColaborador.occurrences.find((o) => o.employeeId === carlos.id)!.locationId).toBe("loc-2");
  });

  it("cria turnos em rascunho com cópia do horário e referência ao modelo", async () => {
    const { preview, apply, workShifts, auditLog } = setup();
    const p = await preview.execute({ organizationId: ORG, ...config });
    const result = await apply.execute({ organizationId: ORG, actor: "gestor", ...config, decisions: createAllValid(p) });

    expect(result).toMatchObject({ created: 4, replaced: 0, changed: [] });
    const shifts = await workShifts.findInRange(ORG, { from: "2026-11-01", to: "2026-11-30" });
    expect(shifts.every((s) => s.status === "draft" && s.source === "template" && s.templateId === "tpl-1" && s.startTime === "08:00")).toBe(true);
    expect(auditLog.entries.at(-1)).toMatchObject({ entityType: "shift_template", action: "applied" });
  });

  it("teste crítico 2: aplicar de novo não duplica (duplicados ficam 'Turno já existente')", async () => {
    const { preview, apply, workShifts } = setup();
    const p = await preview.execute({ organizationId: ORG, ...config });
    await apply.execute({ organizationId: ORG, actor: "gestor", ...config, decisions: createAllValid(p) });
    // Duplo clique / reenvio com as mesmas decisões:
    const again = await apply.execute({ organizationId: ORG, actor: "gestor", ...config, decisions: createAllValid(p) });

    expect(again.created).toBe(0);
    expect(await workShifts.findInRange(ORG, { from: "2026-11-01", to: "2026-11-30" })).toHaveLength(4);
    const p2 = await preview.execute({ organizationId: ORG, ...config });
    expect(p2.summary).toMatchObject({ valid: 0, duplicate: 4 });
  });

  it("teste crítico 3: ausência criada entre a pré-visualização e a confirmação é revalidada", async () => {
    const { preview, apply, leaveRead, gabriel } = setup();
    const p = await preview.execute({ organizationId: ORG, ...config });
    leaveRead.seed(ORG, "2026-11-08", "2026-11-08", { employeeId: gabriel.id, type: "vacation" });

    const result = await apply.execute({ organizationId: ORG, actor: "gestor", ...config, decisions: createAllValid(p) });
    expect(result.created).toBe(3);
    expect(result.changed).toEqual([{ key: `${gabriel.id}|2026-11-08`, employeeName: "Gabriel Silva", workDate: "2026-11-08", status: "leave" }]);
  });

  it("sobreposição: Manter por omissão; Substituir só sem presença registada", async () => {
    const { preview, apply, workShifts, carlos, gabriel } = setup();
    const existing = WorkShift.create({ employeeId: carlos.id, workDate: "2026-11-07", startTime: "09:00", endTime: "17:00", locationId: "loc-mbs" });
    const withAttendance = WorkShift.create({ employeeId: gabriel.id, workDate: "2026-11-07", startTime: "09:00", endTime: "17:00", locationId: "loc-mbs" });
    workShifts.seed(ORG, existing);
    workShifts.seed(ORG, withAttendance);
    workShifts.seedAttendance(withAttendance.id, "worked_as_planned");

    const p = await preview.execute({ organizationId: ORG, ...config });
    const overlaps = p.occurrences.filter((o) => o.status === "overlap");
    expect(overlaps.map((o) => [o.employeeName, o.existingHasAttendance])).toEqual([
      ["Carlos Andrés", false],
      ["Gabriel Silva", true],
    ]);

    const decisions: ApplyTemplateCommand["decisions"] = {
      ...createAllValid(p),
      [`${carlos.id}|2026-11-07`]: { action: "replace", existingShiftId: existing.id },
      [`${gabriel.id}|2026-11-07`]: { action: "replace", existingShiftId: withAttendance.id }, // R3: recusado
    };
    const result = await apply.execute({ organizationId: ORG, actor: "gestor", ...config, decisions });

    expect(result).toMatchObject({ created: 2, replaced: 1 });
    expect(result.changed.map((c) => c.employeeName)).toEqual(["Gabriel Silva"]);
    expect(await workShifts.findById(ORG, existing.id)).toBeNull();
    expect(await workShifts.findById(ORG, withAttendance.id)).not.toBeNull();
  });

  it("teste crítico 4: turno noturno do dia anterior e turno repartido contam como sobreposição", async () => {
    const { preview, workShifts, carlos } = setup({ startTime: "12:00", endTime: "16:00", secondStartTime: "18:00", secondEndTime: "23:00" });
    // Noturno de sexta 22:00 → sábado 13:00 sobrepõe o 1.º período de sábado (12:00–16:00).
    workShifts.seed(
      ORG,
      WorkShift.create({ employeeId: carlos.id, workDate: "2026-11-06", startTime: "22:00", endTime: "13:00", endsNextDay: true, locationId: "loc-mbs" }),
    );
    // Domingo 16:30–17:30 fica no intervalo do repartido — não sobrepõe.
    workShifts.seed(ORG, WorkShift.create({ employeeId: carlos.id, workDate: "2026-11-08", startTime: "16:30", endTime: "17:30", locationId: "loc-mbs" }));

    const p = await preview.execute({ organizationId: ORG, ...config, audience: { kind: "employees", employeeIds: [carlos.id] } });
    expect(p.occurrences.map((o) => [o.workDate, o.status])).toEqual([
      ["2026-11-07", "overlap"],
      ["2026-11-08", "valid"],
    ]);
  });

  it("feriado é assinalado mas o turno cria-se (R4); colaborador em férias fica indisponível", async () => {
    const { preview, holidayRead, leaveRead, carlos } = setup();
    holidayRead.seed(ORG, { date: "2026-11-07", name: "Feriado de teste" });
    leaveRead.seed(ORG, "2026-11-08", "2026-11-08", { employeeId: carlos.id, type: "sick_leave" });

    const p = await preview.execute({ organizationId: ORG, ...config });
    const carlosRows = p.occurrences.filter((o) => o.employeeId === carlos.id);
    expect(carlosRows.map((o) => [o.workDate, o.status, o.holidayName])).toEqual([
      ["2026-11-07", "valid", "Feriado de teste"],
      ["2026-11-08", "leave", null],
    ]);
    expect(p.summary).toMatchObject({ unavailable: 1, holidays: 2 });
  });

  it("ocorrência que não estava na pré-visualização nunca é criada às cegas", async () => {
    const { preview, apply, ana } = setup();
    const p = await preview.execute({ organizationId: ORG, ...config });
    const result = await apply.execute({
      organizationId: ORG,
      actor: "gestor",
      ...config,
      audience: { kind: "all" }, // público mais largo do que o pré-visualizado
      decisions: createAllValid(p),
    });
    expect(result.created).toBe(4);
    expect(result.changed.filter((c) => c.key.startsWith(ana.id))).toHaveLength(2);
  });

  it("recusa modelo inativo e períodos inválidos", async () => {
    const { preview, templates } = setup();
    await expect(preview.execute({ organizationId: ORG, ...config, days: { kind: "range", from: "2026-11-08", to: "2026-11-01", weekdays: [0] } })).rejects.toThrow(
      InvalidTemplateApplicationError,
    );
    const t = await templates.findById(ORG, "tpl-1");
    await templates.update(ORG, t!.setActive(false, NOW));
    await expect(preview.execute({ organizationId: ORG, ...config })).rejects.toThrow(InvalidTemplateApplicationError);
  });
});
