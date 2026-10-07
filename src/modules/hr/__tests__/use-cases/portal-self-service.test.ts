import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Location } from "../../../locations/domain/entities/location.js";
import { Document } from "../../../documents/domain/entities/document.js";
import { FakeDocumentRepository } from "../../../documents/__tests__/fakes/fake-document-repository.js";
import { FakeDocumentCategoryRepository } from "../../../documents/__tests__/fakes/fake-document-category-repository.js";
import { Employee } from "../../domain/entities/employee.js";
import { Position } from "../../domain/entities/position.js";
import { WorkShift } from "../../domain/entities/work-shift.js";
import { EmployeeDocumentNotFoundError, PortalBadRequestError, PortalNotLinkedError, PortalResourceNotFoundError } from "../../domain/errors.js";
import {
  coworkerShortName,
  GetMyDocumentUrlUseCase,
  GetMyLeaveUseCase,
  ListMyCoworkersUseCase,
  ListMyDocumentsUseCase,
  ListMyShiftsUseCase,
} from "../../application/use-cases/portal-self-service.use-cases.js";
import type { GetEmployeeDocumentDownloadUrlPort } from "../../domain/ports/in/employee-document.ports.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { FakeLeaveReadAdapter } from "../fakes/fake-leave-read.js";
import { FakeLocationRepository } from "../fakes/fake-location-repository.js";
import { FakePortalAccount } from "../fakes/fake-portal-account.js";
import { FakePositionRepository } from "../fakes/fake-position-repository.js";
import { FakeWorkShiftRepository } from "../fakes/fake-work-shift-repository.js";

const ORG = mintOrganizationId("org-test");
const DAY = "2026-10-07";

function setup() {
  const accounts = new FakePortalAccount();
  const employees = new FakeEmployeeRepository();
  const positions = new FakePositionRepository();
  const workShifts = new FakeWorkShiftRepository();
  const locations = new FakeLocationRepository();

  const cook = Position.create("pos-cook", { name: "Cozinheiro", description: null }, new Date());
  positions.seed(ORG, cook);
  const carla = Employee.create({ fullName: "CARLA MARIA DEMO", email: "carla@example.com" });
  const gabriel = Employee.create({ fullName: "gabriel souza teste", email: "gabriel@example.com", phone: "910000000", positionId: "pos-cook" });
  employees.seed(ORG, carla);
  employees.seed(ORG, gabriel);
  accounts.seedAccount({ userId: "user-carla", email: "carla@example.com", role: "employee" });
  accounts.links.set(carla.id, "user-carla");
  locations.seed(ORG, [
    Location.reconstitute({ id: "loc-1", name: "Loja Teste", code: null, timezone: "Europe/Lisbon", isActive: true }),
    Location.reconstitute({ id: "loc-2", name: "Outra Loja", code: null, timezone: "Europe/Lisbon", isActive: true }),
  ]);

  const who = { organizationId: ORG, userId: "user-carla", actor: "carla@example.com" };
  const shift = (employeeId: string, props: Partial<{ workDate: string; startTime: string; endTime: string; locationId: string; status: "draft" | "published" }> = {}) => {
    const s = WorkShift.create({ employeeId, workDate: DAY, startTime: "09:00", endTime: "17:00", locationId: "loc-1", status: "published", ...props });
    workShifts.seed(ORG, s);
    return s;
  };
  return { accounts, employees, positions, workShifts, locations, carla, gabriel, who, shift };
}

describe("coworkerShortName", () => {
  it("primeiro + último nome, capitalizados", () => {
    expect(coworkerShortName("GABRIEL SOUZA TESTE")).toBe("Gabriel Teste");
    expect(coworkerShortName("ana")).toBe("Ana");
  });
});

describe("Portal — Minha escala", () => {
  it("só os turnos publicados do próprio, ordenados, com o nome do Local", async () => {
    const { workShifts, locations, accounts, carla, gabriel, who, shift } = setup();
    shift(carla.id, { workDate: "2026-10-08", locationId: "loc-2" });
    shift(carla.id);
    shift(carla.id, { workDate: "2026-10-09", status: "draft" });
    shift(gabriel.id);
    const list = await new ListMyShiftsUseCase(accounts, workShifts, locations).execute(who, "2026-10-01", "2026-10-31");
    expect(list.map((s) => [s.workDate, s.locationName])).toEqual([
      [DAY, "Loja Teste"],
      ["2026-10-08", "Outra Loja"],
    ]);
  });

  it("período inválido ou demasiado longo → erro 400", async () => {
    const { workShifts, locations, accounts, who } = setup();
    const uc = new ListMyShiftsUseCase(accounts, workShifts, locations);
    await expect(uc.execute(who, "2026-10-31", "2026-10-01")).rejects.toBeInstanceOf(PortalBadRequestError);
    await expect(uc.execute(who, "2026-01-01", "2026-12-31")).rejects.toBeInstanceOf(PortalBadRequestError);
    await expect(uc.execute(who, "ontem", "2026-12-31")).rejects.toBeInstanceOf(PortalBadRequestError);
  });

  it("conta sem ficha ligada → PortalNotLinkedError", async () => {
    const { workShifts, locations, accounts } = setup();
    const uc = new ListMyShiftsUseCase(accounts, workShifts, locations);
    await expect(uc.execute({ organizationId: ORG, userId: "user-x", actor: "x" }, DAY, DAY)).rejects.toBeInstanceOf(PortalNotLinkedError);
  });
});

describe("Portal — Quem trabalha comigo", () => {
  it("mesmo Local e horário sobreposto, só nome curto + cargo + horário", async () => {
    const { workShifts, employees, positions, accounts, carla, gabriel, who, shift } = setup();
    const mine = shift(carla.id);
    shift(gabriel.id, { startTime: "16:00", endTime: "23:00" });
    const list = await new ListMyCoworkersUseCase(accounts, workShifts, employees, positions).execute(who, mine.id);
    expect(list).toEqual([{ shortName: "Gabriel Teste", positionName: "Cozinheiro", hours: "16:00–23:00" }]);
    // Nada de contactos, ids ou e-mails.
    expect(Object.keys(list[0]!).sort()).toEqual(["hours", "positionName", "shortName"]);
  });

  it("ignora outro Local, horário sem sobreposição e rascunhos", async () => {
    const { workShifts, employees, positions, accounts, carla, gabriel, who, shift } = setup();
    const mine = shift(carla.id);
    shift(gabriel.id, { locationId: "loc-2" });
    shift(gabriel.id, { startTime: "18:00", endTime: "23:00" });
    shift(gabriel.id, { status: "draft" });
    expect(await new ListMyCoworkersUseCase(accounts, workShifts, employees, positions).execute(who, mine.id)).toEqual([]);
  });

  it("turno de outro colaborador ou em rascunho → 404", async () => {
    const { workShifts, employees, positions, accounts, carla, gabriel, who, shift } = setup();
    const uc = new ListMyCoworkersUseCase(accounts, workShifts, employees, positions);
    const other = shift(gabriel.id);
    const draft = shift(carla.id, { status: "draft" });
    await expect(uc.execute(who, other.id)).rejects.toBeInstanceOf(PortalResourceNotFoundError);
    await expect(uc.execute(who, draft.id)).rejects.toBeInstanceOf(PortalResourceNotFoundError);
  });
});

describe("Portal — Documentos", () => {
  const doc = (ownerId: string, category: string, extra: Partial<{ period: string; expiresAt: string }> = {}) =>
    Document.createFirstVersion({
      owner: { type: "employee", id: ownerId },
      category,
      mandatory: false,
      fileName: `${category}.pdf`,
      storagePath: `x/${category}.pdf`,
      mimeType: "application/pdf",
      fileSizeBytes: 10,
      origin: "rh",
      expiresAt: extra.expiresAt ?? null,
      period: extra.period ?? null,
      uploadedBy: "rh@example.com",
    });

  it("lista os atuais do próprio, sem removidos, recibos marcados e por período desc", async () => {
    const { accounts, carla, gabriel, who } = setup();
    const documents = new FakeDocumentRepository();
    documents.seed(ORG, doc(carla.id, "recibo_vencimento", { period: "2026-08" }));
    documents.seed(ORG, doc(carla.id, "recibo_vencimento", { period: "2026-09" }));
    documents.seed(ORG, doc(carla.id, "nif"));
    documents.seed(ORG, doc(carla.id, "atestado_saude").remove());
    documents.seed(ORG, doc(gabriel.id, "nif"));
    const list = await new ListMyDocumentsUseCase(accounts, documents, new FakeDocumentCategoryRepository()).execute(who);
    expect(list.map((d) => [d.categoryLabel, d.period, d.isPayslip])).toEqual([
      ["Recibo de vencimento", "2026-09", true],
      ["Recibo de vencimento", "2026-08", true],
      ["NIF", null, false],
    ]);
  });

  it("download de documento de outro colaborador → 404 (nunca o URL)", async () => {
    const { accounts, carla, who } = setup();
    const calls: unknown[] = [];
    const download: GetEmployeeDocumentDownloadUrlPort = {
      async execute(cmd) {
        calls.push(cmd);
        if (cmd.documentId !== "doc-carla") throw new EmployeeDocumentNotFoundError(cmd.documentId);
        return { url: "https://signed/doc-carla" };
      },
    };
    const uc = new GetMyDocumentUrlUseCase(accounts, download);
    await expect(uc.execute(who, "doc-carla")).resolves.toEqual({ url: "https://signed/doc-carla" });
    await expect(uc.execute(who, "doc-gabriel")).rejects.toBeInstanceOf(PortalResourceNotFoundError);
    // O colaborador vem sempre da sessão.
    expect(calls).toEqual([
      { organizationId: ORG, employeeId: carla.id, documentId: "doc-carla" },
      { organizationId: ORG, employeeId: carla.id, documentId: "doc-gabriel" },
    ]);
  });
});

describe("Portal — Ausências", () => {
  it("só as do próprio que tocam o ano; sem saldo", async () => {
    const { accounts, carla, gabriel, who } = setup();
    const leaves = new FakeLeaveReadAdapter();
    const e = (employeeId: string, id: string, startDate: string, endDate: string) =>
      leaves.entries.push({ organizationId: String(ORG), employeeId, entry: { id, type: "vacation", startDate, endDate, workingDays: 3 } });
    e(carla.id, "l1", "2026-08-03", "2026-08-05");
    e(carla.id, "l2", "2025-12-30", "2026-01-02");
    e(carla.id, "l3", "2025-06-01", "2025-06-03");
    e(gabriel.id, "l4", "2026-08-03", "2026-08-05");
    const dto = await new GetMyLeaveUseCase(accounts, leaves).execute(who, 2026);
    expect(dto.entries.map((x) => x.id).sort()).toEqual(["l1", "l2"]);
    expect(dto).not.toHaveProperty("balance");
  });

  it("ano inválido → 400", async () => {
    const { accounts, who } = setup();
    await expect(new GetMyLeaveUseCase(accounts, new FakeLeaveReadAdapter()).execute(who, 1999)).rejects.toBeInstanceOf(PortalBadRequestError);
  });
});
