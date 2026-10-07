import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Employee } from "../../domain/entities/employee.js";
import { InvalidPortalRequestError, PortalRequestNotPendingError } from "../../domain/entities/portal-request.js";
import { WorkShift } from "../../domain/entities/work-shift.js";
import { PortalBadRequestError, PortalResourceNotFoundError, RequestNotAllowedError } from "../../domain/errors.js";
import {
  CancelMyRequestUseCase,
  CreateMyRequestUseCase,
  DecidePortalRequestUseCase,
  GetRequestAttachmentUrlUseCase,
  ListInboxRequestsUseCase,
  ListMyRequestsUseCase,
} from "../../application/use-cases/portal-requests.use-cases.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { FakeHrAuditLog } from "../fakes/fake-hr-audit-log.js";
import { FakeHrFileStorage } from "../fakes/fake-hr-file-storage.js";
import { FakeLeaveWrite } from "../fakes/fake-leave-write.js";
import { FakePortalAccount } from "../fakes/fake-portal-account.js";
import { FakePortalRequestRepository } from "../fakes/fake-portal-request-repository.js";
import { FakeWorkShiftRepository } from "../fakes/fake-work-shift-repository.js";

const ORG = mintOrganizationId("org-test");
const TODAY = "2026-10-07";

function setup() {
  const accounts = new FakePortalAccount();
  const employees = new FakeEmployeeRepository();
  const workShifts = new FakeWorkShiftRepository();
  const requests = new FakePortalRequestRepository();
  const storage = new FakeHrFileStorage();
  const audit = new FakeHrAuditLog();
  const leaveWrite = new FakeLeaveWrite();
  const carla = Employee.create({ fullName: "CARLA DEMO", email: "carla@example.com" });
  const outro = Employee.create({ fullName: "OUTRO DEMO" });
  employees.seed(ORG, carla);
  employees.seed(ORG, outro);
  accounts.seedAccount({ userId: "u-carla", email: "carla@example.com", role: "employee" });
  accounts.links.set(carla.id, "u-carla");
  const who = { organizationId: ORG, userId: "u-carla", actor: "carla@example.com" };
  const shift = (employeeId: string, workDate: string, status: "draft" | "published" = "published") => {
    const s = WorkShift.create({ employeeId, workDate, startTime: "10:00", endTime: "18:00", locationId: "loc-1", status });
    workShifts.seed(ORG, s);
    return s;
  };
  return {
    carla,
    outro,
    who,
    shift,
    leaveWrite,
    storage,
    create: new CreateMyRequestUseCase(accounts, workShifts, requests, storage, audit, () => TODAY),
    listMine: new ListMyRequestsUseCase(accounts, requests),
    cancel: new CancelMyRequestUseCase(accounts, requests, audit),
    inbox: new ListInboxRequestsUseCase(requests, employees, workShifts),
    decide: new DecidePortalRequestUseCase(requests, leaveWrite, employees, workShifts, audit),
    attachmentUrl: new GetRequestAttachmentUrlUseCase(requests, storage),
  };
}

const RH = { organizationId: ORG, actor: "rh@example.com" };

describe("Portal — justificar falta", () => {
  it("cria o pedido com anexo; o RH aprova e fica uma ausência 'justificada' nesse dia", async () => {
    const t = setup();
    const s = t.shift(t.carla.id, "2026-10-05");
    const req = await t.create.execute({
      ...t.who,
      kind: "justify_absence",
      workShiftId: s.id,
      reasonCode: "medical",
      reasonText: null,
      attachment: { buffer: Buffer.from("pdf"), filename: "atestado.pdf", mimeType: "application/pdf" },
    });
    expect(req).toMatchObject({ status: "pending", startDate: "2026-10-05", reasonLabel: "Consulta ou atestado médico", attachmentName: "atestado.pdf" });

    const inbox = await t.inbox.execute({ organizationId: ORG, kinds: ["justify_absence"] });
    expect(inbox).toEqual([expect.objectContaining({ employeeName: "CARLA DEMO", shiftHours: "10:00–18:00" })]);
    await expect(t.attachmentUrl.execute({ organizationId: ORG, requestId: req.id, allowedKinds: ["justify_absence"] })).resolves.toHaveProperty("url");

    const decided = await t.decide.execute({ ...RH, requestId: req.id, decision: "approve", note: null, allowedKinds: ["justify_absence"] });
    expect(decided.status).toBe("approved");
    expect(t.leaveWrite.created).toEqual([expect.objectContaining({ employeeId: t.carla.id, type: "justified", startDate: "2026-10-05", endDate: "2026-10-05", source: "portal", portalRequestId: req.id })]);
  });

  it("só turnos próprios, publicados e já começados; não pede duas vezes o mesmo turno", async () => {
    const t = setup();
    const base = { ...t.who, kind: "justify_absence" as const, reasonCode: "sick", reasonText: null, attachment: null };
    await expect(t.create.execute({ ...base, workShiftId: t.shift(t.outro.id, "2026-10-05").id })).rejects.toBeInstanceOf(PortalResourceNotFoundError);
    await expect(t.create.execute({ ...base, workShiftId: t.shift(t.carla.id, "2026-10-05", "draft").id })).rejects.toBeInstanceOf(PortalResourceNotFoundError);
    await expect(t.create.execute({ ...base, workShiftId: t.shift(t.carla.id, "2026-10-09").id })).rejects.toBeInstanceOf(InvalidPortalRequestError);
    const s = t.shift(t.carla.id, "2026-10-04");
    await t.create.execute({ ...base, workShiftId: s.id });
    await expect(t.create.execute({ ...base, workShiftId: s.id })).rejects.toBeInstanceOf(PortalBadRequestError);
  });

  it("motivo 'Outro' exige texto; anexo só PDF/foto", async () => {
    const t = setup();
    const s = t.shift(t.carla.id, "2026-10-05");
    await expect(t.create.execute({ ...t.who, kind: "justify_absence", workShiftId: s.id, reasonCode: "other", reasonText: " ", attachment: null })).rejects.toBeInstanceOf(InvalidPortalRequestError);
    await expect(
      t.create.execute({ ...t.who, kind: "justify_absence", workShiftId: s.id, reasonCode: "sick", reasonText: null, attachment: { buffer: Buffer.from("x"), filename: "a.gif", mimeType: "image/gif" } }),
    ).rejects.toBeInstanceOf(PortalBadRequestError);
  });
});

describe("Portal — pedir folga", () => {
  it("o gerente aprova → ausência autorizada no período; a escala não é mexida", async () => {
    const t = setup();
    const req = await t.create.execute({ ...t.who, kind: "day_off", startDate: "2026-10-12", endDate: "2026-10-13", reasonCode: "personal", reasonText: null });
    await t.decide.execute({ ...RH, requestId: req.id, decision: "approve", note: "Ok, ajusto a escala", allowedKinds: ["day_off"] });
    expect(t.leaveWrite.created[0]).toMatchObject({ type: "authorized_absence", startDate: "2026-10-12", endDate: "2026-10-13", workingDays: 2 });
  });

  it("datas no passado, mais de 7 dias ou sobrepostas a outro pedido são recusadas", async () => {
    const t = setup();
    const base = { ...t.who, kind: "day_off" as const, reasonCode: "personal", reasonText: null };
    await expect(t.create.execute({ ...base, startDate: "2026-10-06", endDate: "2026-10-06" })).rejects.toBeInstanceOf(InvalidPortalRequestError);
    await expect(t.create.execute({ ...base, startDate: "2026-10-10", endDate: "2026-10-17" })).rejects.toBeInstanceOf(InvalidPortalRequestError);
    await t.create.execute({ ...base, startDate: "2026-10-10", endDate: "2026-10-11" });
    await expect(t.create.execute({ ...base, startDate: "2026-10-11", endDate: "2026-10-12" })).rejects.toBeInstanceOf(PortalBadRequestError);
  });

  it("rejeitar exige motivo; o colaborador vê o motivo e pode cancelar só enquanto pendente", async () => {
    const t = setup();
    const req = await t.create.execute({ ...t.who, kind: "day_off", startDate: "2026-10-12", endDate: "2026-10-12", reasonCode: "personal", reasonText: null });
    await expect(t.decide.execute({ ...RH, requestId: req.id, decision: "reject", note: "", allowedKinds: ["day_off"] })).rejects.toBeInstanceOf(InvalidPortalRequestError);
    await t.decide.execute({ ...RH, requestId: req.id, decision: "reject", note: "Fim de semana de evento", allowedKinds: ["day_off"] });
    expect((await t.listMine.execute(t.who))[0]).toMatchObject({ status: "rejected", decisionNote: "Fim de semana de evento" });
    await expect(t.cancel.execute(t.who, req.id)).rejects.toBeInstanceOf(PortalRequestNotPendingError);

    const other = await t.create.execute({ ...t.who, kind: "day_off", startDate: "2026-10-14", endDate: "2026-10-14", reasonCode: "personal", reasonText: null });
    expect((await t.cancel.execute(t.who, other.id)).status).toBe("cancelled");
    expect(await t.inbox.execute({ organizationId: ORG, kinds: ["day_off"] })).toEqual([]);
  });
});

describe("Caixa de pedidos — permissões por tipo", () => {
  it("quem só tem Assiduidade não vê nem decide folgas (e vice-versa)", async () => {
    const t = setup();
    const folga = await t.create.execute({ ...t.who, kind: "day_off", startDate: "2026-10-12", endDate: "2026-10-12", reasonCode: "personal", reasonText: null });
    expect(await t.inbox.execute({ organizationId: ORG, kinds: ["justify_absence"] })).toEqual([]);
    await expect(t.decide.execute({ ...RH, requestId: folga.id, decision: "approve", note: null, allowedKinds: ["justify_absence"] })).rejects.toBeInstanceOf(RequestNotAllowedError);
    expect(await t.inbox.execute({ organizationId: ORG, kinds: [] })).toEqual([]);
  });
});
