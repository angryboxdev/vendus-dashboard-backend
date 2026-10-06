import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Location } from "../../../locations/domain/entities/location.js";
import { Employee } from "../../domain/entities/employee.js";
import { ShiftAutomation } from "../../domain/entities/shift-automation.js";
import { ShiftTemplate } from "../../domain/entities/shift-template.js";
import { WorkShift } from "../../domain/entities/work-shift.js";
import { InvalidShiftAutomationError } from "../../domain/errors.js";
import type { ShiftAutomationInput } from "../../domain/ports/in/shift-automation.ports.js";
import {
  CreateShiftAutomationUseCase,
  DismissAutomationIssueUseCase,
  GenerateAllAutomationsUseCase,
  GenerateAutomationUseCase,
  SetShiftAutomationStatusUseCase,
  UpdateShiftAutomationUseCase,
} from "../../application/use-cases/shift-automations.use-cases.js";
import { GetScheduleAlertsUseCase } from "../../application/use-cases/get-schedule-alerts.use-case.js";
import { FakeShiftAutomationRepository, FakeAutomationIssueRepository } from "../fakes/fake-shift-automation-repository.js";
import { FakeShiftTemplateRepository } from "../fakes/fake-shift-template-repository.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { FakeWorkShiftRepository } from "../fakes/fake-work-shift-repository.js";
import { FakeLocationRepository } from "../fakes/fake-location-repository.js";
import { FakeLeaveReadAdapter } from "../fakes/fake-leave-read.js";
import { FakeHolidayReadAdapter } from "../fakes/fake-holiday-read.js";
import { FakeHrAuditLog } from "../fakes/fake-hr-audit-log.js";
import { FakeBaseScheduleRepository } from "../fakes/fake-base-schedule-repository.js";

const ORG = mintOrganizationId("org-test");
// Segunda-feira, 2026-11-02.
let now = new Date("2026-11-02T08:00:00Z");
const clock = () => now;

function setup() {
  now = new Date("2026-11-02T08:00:00Z");
  const templates = new FakeShiftTemplateRepository();
  const employees = new FakeEmployeeRepository();
  const workShifts = new FakeWorkShiftRepository();
  const locations = new FakeLocationRepository();
  const leaveRead = new FakeLeaveReadAdapter();
  const holidayRead = new FakeHolidayReadAdapter();
  const automations = new FakeShiftAutomationRepository();
  const issues = new FakeAutomationIssueRepository();
  const auditLog = new FakeHrAuditLog();
  locations.seed(ORG, [Location.reconstitute({ id: "loc-mbs", name: "MBS", code: "MBS", timezone: "Europe/Lisbon", isActive: true })]);
  templates.seed(
    ORG,
    ShiftTemplate.create(
      "tpl-1",
      { name: "Manhã 1", description: null, color: null, startTime: "08:00", endTime: "16:00", endsNextDay: false, secondStartTime: null, secondEndTime: null, breakMinutes: 0, locationId: "loc-mbs" },
      "gestor",
      now,
    ),
  );
  // Dados fictícios (RGPD).
  const carlos = Employee.create({ fullName: "Carlos Andrés", positionId: "pos-prep", primaryLocationId: "loc-mbs" });
  const gabriel = Employee.create({ fullName: "Gabriel Silva", positionId: "pos-prep", primaryLocationId: "loc-mbs" });
  employees.seed(ORG, carlos);
  employees.seed(ORG, gabriel);
  const deps = { templates, employees, workShifts, locations, leaveRead, holidayRead, automations, issues, auditLog, clock };
  return {
    ...deps,
    carlos,
    gabriel,
    create: new CreateShiftAutomationUseCase(deps),
    update: new UpdateShiftAutomationUseCase(deps),
    setStatus: new SetShiftAutomationStatusUseCase(deps),
    generate: new GenerateAutomationUseCase(deps),
    generateAll: new GenerateAllAutomationsUseCase(deps),
    dismiss: new DismissAutomationIssueUseCase(deps),
    alerts: new GetScheduleAlertsUseCase(workShifts, new FakeBaseScheduleRepository(), employees, leaveRead, holidayRead, { issues, automations }),
  };
}

/** Fins de semana, cargo Preparador, horizonte 2 semanas. */
const WEEKENDS: ShiftAutomationInput = {
  name: "Fim de semana — Preparadores",
  description: null,
  templateId: "tpl-1",
  audience: { kind: "position", positionId: "pos-prep" },
  locationId: null,
  weekdays: [5, 6],
  startDate: "2026-11-01",
  endDate: null,
  horizonWeeks: 2,
};

const allShifts = (ws: FakeWorkShiftRepository) => ws.findInRange(ORG, { from: "2026-01-01", to: "2027-12-31" });

describe("ShiftAutomation — janela de geração", () => {
  const base = () => ShiftAutomation.create("a1", WEEKENDS, "gestor", now);

  it("vai de hoje até hoje + horizonte; nunca antes do início nem depois do fim", () => {
    expect(base().nextWindow("2026-11-02")).toEqual({ from: "2026-11-02", to: "2026-11-15" });
    expect(base().update({ startDate: "2026-11-10" }, now).nextWindow("2026-11-02")).toEqual({ from: "2026-11-10", to: "2026-11-15" });
    expect(base().update({ endDate: "2026-11-08" }, now).nextWindow("2026-11-02")).toEqual({ from: "2026-11-02", to: "2026-11-08" });
    expect(base().nextWindow("2026-11-02", 4)).toEqual({ from: "2026-11-02", to: "2026-11-29" });
  });

  it("depois de gerar, só cobre datas novas; terminada → nada", () => {
    const generated = base().recordRun("2026-11-15", now);
    expect(generated.nextWindow("2026-11-02")).toBeNull();
    expect(generated.nextWindow("2026-11-03")).toEqual({ from: "2026-11-16", to: "2026-11-16" });
    expect(base().update({ endDate: "2026-11-05" }, now).recordRun("2026-11-05", now).nextWindow("2026-11-20")).toBeNull();
  });

  it("valida regra (dias, datas, horizonte)", () => {
    expect(() => base().update({ weekdays: [] }, now)).toThrow(InvalidShiftAutomationError);
    expect(() => base().update({ endDate: "2026-10-01" }, now)).toThrow(InvalidShiftAutomationError);
    expect(() => base().update({ horizonWeeks: 20 }, now)).toThrow(InvalidShiftAutomationError);
  });
});

describe("Automatizações de turnos", () => {
  it("criar com 'gerar já' cria turnos em rascunho só no horizonte, com origem na automatização", async () => {
    const { create, workShifts } = setup();
    const { automation, generation } = await create.execute({ organizationId: ORG, actor: "gestor", ...WEEKENDS, generateNow: true });

    // 2 fins de semana (07/08 e 14/15 nov) × 2 preparadores.
    expect(generation).toMatchObject({ window: { from: "2026-11-02", to: "2026-11-15" }, created: 8, issues: 0 });
    expect(automation.generatedUntil).toBe("2026-11-15");
    const shifts = await allShifts(workShifts);
    expect(shifts).toHaveLength(8);
    expect(shifts.every((s) => s.status === "draft" && s.source === "automation" && s.automationId === automation.id && s.templateId === "tpl-1")).toBe(true);
    expect(shifts.every((s) => s.workDate <= "2026-11-15")).toBe(true); // nunca para lá do horizonte
  });

  it("gerar de novo não duplica; um turno apagado à mão no período já gerado não volta", async () => {
    const { create, generate, workShifts } = setup();
    const { automation } = await create.execute({ organizationId: ORG, actor: "gestor", ...WEEKENDS, generateNow: true });
    const [first] = await allShifts(workShifts);
    await workShifts.delete(ORG, first!.id);

    const again = await generate.execute({ organizationId: ORG, actor: "gestor", id: automation.id });
    expect(again).toMatchObject({ window: null, created: 0 });
    expect(await allShifts(workShifts)).toHaveLength(7);
  });

  it("o cron do dia seguinte só acrescenta as datas novas e reavalia o público", async () => {
    const { create, generateAll, workShifts, employees } = setup();
    await create.execute({ organizationId: ORG, actor: "gestor", ...WEEKENDS, generateNow: true });
    const ana = Employee.create({ fullName: "Ana Martins", positionId: "pos-prep", primaryLocationId: "loc-mbs" });
    employees.seed(ORG, ana);

    now = new Date("2026-11-08T03:00:00Z"); // 6 dias depois: janela nova 16–21 nov (sábado 21)
    const { results, failed } = await generateAll.execute({ organizationId: ORG, actor: "sistema (cron)" });

    expect(failed).toEqual([]);
    expect(results[0]).toMatchObject({ window: { from: "2026-11-16", to: "2026-11-21" }, created: 3 });
    const shifts = await allShifts(workShifts);
    expect(shifts.filter((s) => s.employeeId === ana.id).map((s) => s.workDate)).toEqual(["2026-11-21"]);
  });

  it("conflitos e ausências nunca são forçados: vão para Alertas e ações e podem ser dispensados", async () => {
    const { create, workShifts, leaveRead, alerts, dismiss, carlos, gabriel } = setup();
    workShifts.seed(ORG, WorkShift.create({ employeeId: carlos.id, workDate: "2026-11-07", startTime: "09:00", endTime: "17:00", locationId: "loc-mbs" }));
    leaveRead.seed(ORG, "2026-11-08", "2026-11-08", { employeeId: gabriel.id, type: "vacation" });

    const { generation } = await create.execute({ organizationId: ORG, actor: "gestor", ...WEEKENDS, generateNow: true });
    expect(generation).toMatchObject({ created: 6, issues: 2 });

    const result = await alerts.execute({ organizationId: ORG, from: "2026-11-02", to: "2026-11-15" });
    expect(result.automationIssues.map((i) => [i.employeeName, i.workDate, i.status, i.automationName])).toEqual([
      ["Carlos Andrés", "2026-11-07", "overlap", "Fim de semana — Preparadores"],
      ["Gabriel Silva", "2026-11-08", "leave", "Fim de semana — Preparadores"],
    ]);

    await dismiss.execute({ organizationId: ORG, actor: "gestor", id: result.automationIssues[0]!.id });
    expect((await alerts.execute({ organizationId: ORG, from: "2026-11-02", to: "2026-11-15" })).automationIssues).toHaveLength(1);
  });

  it("pausada não gera (nem no cron); alterar não toca turnos já gerados", async () => {
    const { create, setStatus, update, generate, generateAll, workShifts } = setup();
    const { automation } = await create.execute({ organizationId: ORG, actor: "gestor", ...WEEKENDS, generateNow: false });
    await setStatus.execute({ organizationId: ORG, actor: "gestor", id: automation.id, status: "paused" });

    await expect(generate.execute({ organizationId: ORG, actor: "gestor", id: automation.id })).rejects.toThrow(InvalidShiftAutomationError);
    expect((await generateAll.execute({ organizationId: ORG, actor: "cron" })).results).toEqual([]);

    await setStatus.execute({ organizationId: ORG, actor: "gestor", id: automation.id, status: "active" });
    await generate.execute({ organizationId: ORG, actor: "gestor", id: automation.id });
    await update.execute({ organizationId: ORG, actor: "gestor", id: automation.id, weekdays: [0], name: "Segundas" });
    expect((await allShifts(workShifts)).every((s) => ["2026-11-07", "2026-11-08", "2026-11-14", "2026-11-15"].includes(s.workDate))).toBe(true);
  });

  it("cron: uma automatização com modelo inativo falha sozinha, as outras geram", async () => {
    const { create, generateAll, templates } = setup();
    const ok = await create.execute({ organizationId: ORG, actor: "gestor", ...WEEKENDS, generateNow: false });
    templates.seed(
      ORG,
      ShiftTemplate.create(
        "tpl-old",
        { name: "Antigo", description: null, color: null, startTime: "10:00", endTime: "14:00", endsNextDay: false, secondStartTime: null, secondEndTime: null, breakMinutes: 0, locationId: null },
        "gestor",
        now,
      ),
    );
    const broken = await create.execute({ organizationId: ORG, actor: "gestor", ...WEEKENDS, name: "Com modelo antigo", templateId: "tpl-old", generateNow: false });
    const old = await templates.findById(ORG, "tpl-old");
    await templates.update(ORG, old!.setActive(false, now));

    const { results, failed } = await generateAll.execute({ organizationId: ORG, actor: "cron" });
    expect(results.map((r) => r.automationId)).toEqual([ok.automation.id]);
    expect(failed).toEqual([{ automationId: broken.automation.id, error: 'O modelo "Antigo" está inativo' }]);
  });
});
