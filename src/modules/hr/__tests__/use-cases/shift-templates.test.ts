import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Location } from "../../../locations/domain/entities/location.js";
import { ShiftTemplate, type ShiftTemplateDetails } from "../../domain/entities/shift-template.js";
import { WorkShift } from "../../domain/entities/work-shift.js";
import { DuplicateShiftTemplateNameError, InvalidShiftTemplateError } from "../../domain/errors.js";
import {
  CreateShiftTemplateUseCase,
  ListShiftTemplatesUseCase,
  SetShiftTemplateActiveUseCase,
  UpdateShiftTemplateUseCase,
} from "../../application/use-cases/shift-templates.use-cases.js";
import { FakeShiftTemplateRepository } from "../fakes/fake-shift-template-repository.js";
import { FakeLocationRepository } from "../fakes/fake-location-repository.js";
import { FakeHrAuditLog } from "../fakes/fake-hr-audit-log.js";
import { FakeWorkShiftRepository } from "../fakes/fake-work-shift-repository.js";

const ORG = mintOrganizationId("org-test");
const ACTOR = "gestor@exemplo.pt";
const NOW = new Date("2026-10-05T10:00:00Z");

const MANHA: ShiftTemplateDetails = {
  name: "Manhã 1",
  description: "Horário padrão da manhã",
  color: null,
  startTime: "08:00",
  endTime: "16:00",
  endsNextDay: false,
  secondStartTime: null,
  secondEndTime: null,
  breakMinutes: 0,
  locationId: null,
};

function setup() {
  const templates = new FakeShiftTemplateRepository();
  const locations = new FakeLocationRepository();
  locations.seed(ORG, [
    Location.reconstitute({ id: "loc-mbs", name: "MBS", code: "MBS", timezone: "Europe/Lisbon", isActive: true }),
    Location.reconstitute({ id: "loc-old", name: "Antigo", code: null, timezone: "Europe/Lisbon", isActive: false }),
  ]);
  const auditLog = new FakeHrAuditLog();
  const clock = () => NOW;
  return {
    templates,
    auditLog,
    list: new ListShiftTemplatesUseCase(templates),
    create: new CreateShiftTemplateUseCase(templates, locations, auditLog, clock),
    update: new UpdateShiftTemplateUseCase(templates, locations, auditLog, clock),
    setActive: new SetShiftTemplateActiveUseCase(templates, auditLog, clock),
  };
}

describe("ShiftTemplate (entidade)", () => {
  it("direto, repartido e noturno: duração de trabalho e amplitude", () => {
    const direto = ShiftTemplate.create("t1", MANHA, ACTOR, NOW);
    expect([direto.kind, direto.workMinutes(), direto.spanMinutes()]).toEqual(["direct", 480, 480]);

    const repartido = ShiftTemplate.create(
      "t2",
      { ...MANHA, name: "Repartido", startTime: "12:00", endTime: "16:00", secondStartTime: "18:00", secondEndTime: "23:00" },
      ACTOR,
      NOW,
    );
    expect([repartido.kind, repartido.workMinutes(), repartido.spanMinutes()]).toEqual(["split", 540, 660]);

    const noite = ShiftTemplate.create("t3", { ...MANHA, name: "Noite", startTime: "16:00", endTime: "00:00", endsNextDay: true }, ACTOR, NOW);
    expect(noite.workMinutes()).toBe(480);
  });

  it("recusa horários inválidos com a mesma regra dos turnos", () => {
    expect(() => ShiftTemplate.create("x", { ...MANHA, startTime: "16:00", endTime: "08:00" }, ACTOR, NOW)).toThrow(InvalidShiftTemplateError);
    expect(() =>
      ShiftTemplate.create("x", { ...MANHA, startTime: "12:00", endTime: "16:00", secondStartTime: "15:00", secondEndTime: "18:00" }, ACTOR, NOW),
    ).toThrow(InvalidShiftTemplateError);
    expect(() => ShiftTemplate.create("x", { ...MANHA, name: "  " }, ACTOR, NOW)).toThrow(InvalidShiftTemplateError);
    expect(() => ShiftTemplate.create("x", { ...MANHA, startTime: "8h" }, ACTOR, NOW)).toThrow(InvalidShiftTemplateError);
  });
});

describe("Modelos de turno (use cases)", () => {
  it("cria, lista (ativos primeiro) e audita", async () => {
    const { create, setActive, list, auditLog } = setup();
    const tarde = await create.execute({ organizationId: ORG, actor: ACTOR, ...MANHA, name: "Tarde", startTime: "14:00", endTime: "22:00" });
    await create.execute({ organizationId: ORG, actor: ACTOR, ...MANHA });
    await setActive.execute({ organizationId: ORG, actor: ACTOR, id: tarde.id, active: false });

    expect((await list.execute(ORG)).map((t) => [t.name, t.active])).toEqual([
      ["Manhã 1", true],
      ["Tarde", false],
    ]);
    expect(auditLog.entries.map((e) => [e.entityType, e.action])).toEqual([
      ["shift_template", "created"],
      ["shift_template", "created"],
      ["shift_template", "deactivated"],
    ]);
  });

  it("nome duplicado (sem distinguir maiúsculas/espaços) é recusado", async () => {
    const { create } = setup();
    await create.execute({ organizationId: ORG, actor: ACTOR, ...MANHA });
    await expect(create.execute({ organizationId: ORG, actor: ACTOR, ...MANHA, name: "  manhã   1 " })).rejects.toThrow(DuplicateShiftTemplateNameError);
  });

  it("local padrão tem de ser um local ativo", async () => {
    const { create } = setup();
    await expect(create.execute({ organizationId: ORG, actor: ACTOR, ...MANHA, locationId: "loc-old" })).rejects.toThrow(InvalidShiftTemplateError);
    await expect(create.execute({ organizationId: ORG, actor: ACTOR, ...MANHA, locationId: "loc-mbs" })).resolves.toMatchObject({ locationId: "loc-mbs" });
  });

  it("teste crítico 1: alterar o modelo não modifica turnos já criados com ele", async () => {
    const { create, update } = setup();
    const shifts = new FakeWorkShiftRepository();
    const template = await create.execute({ organizationId: ORG, actor: ACTOR, ...MANHA, locationId: "loc-mbs" });
    const shift = WorkShift.create({
      employeeId: "e1",
      workDate: "2026-11-02",
      startTime: template.startTime,
      endTime: template.endTime,
      locationId: "loc-mbs",
      source: "template",
      templateId: template.id,
    });
    shifts.seed(ORG, shift);

    const changed = await update.execute({ organizationId: ORG, actor: ACTOR, id: template.id, startTime: "09:00", endTime: "17:00" });

    expect(changed).toMatchObject({ startTime: "09:00", endTime: "17:00" });
    const stored = await shifts.findById(ORG, shift.id);
    expect(stored).toMatchObject({ startTime: "08:00", endTime: "16:00", templateId: template.id });
  });
});
