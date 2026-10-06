import { randomUUID } from "crypto";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Location } from "../../../locations/domain/entities/location.js";
import { Employee } from "../../domain/entities/employee.js";
import { WorkShift } from "../../domain/entities/work-shift.js";
import { PortalNotLinkedError, PunchRefusedError } from "../../domain/errors.js";
import { GetPortalHomeUseCase, RegisterPunchUseCase, type ServerNow } from "../../application/use-cases/portal-me.use-cases.js";
import type { ClientLocation } from "../../domain/services/punch-geofence.service.js";
import { FakeAttendanceRulesRepository } from "../fakes/fake-attendance-rules-repository.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { FakeHrAuditLog } from "../fakes/fake-hr-audit-log.js";
import { FakeLocationRepository } from "../fakes/fake-location-repository.js";
import { FakePortalAccount } from "../fakes/fake-portal-account.js";
import { FakePunchRepository } from "../fakes/fake-punch-repository.js";
import { FakeWorkShiftRepository } from "../fakes/fake-work-shift-repository.js";

const ORG = mintOrganizationId("org-test");
const TODAY = "2026-10-07";
// Coordenadas fictícias.
const SHOP = { latitude: 41.1, longitude: -8.6 };
const metersNorth = (m: number) => SHOP.latitude + m / 111_195;

function setup(policy: "off" | "warn" | "block" = "off") {
  const accounts = new FakePortalAccount();
  const employees = new FakeEmployeeRepository();
  const workShifts = new FakeWorkShiftRepository();
  const punches = new FakePunchRepository();
  const rules = new FakeAttendanceRulesRepository();
  const locations = new FakeLocationRepository();
  const auditLog = new FakeHrAuditLog();

  const employee = Employee.create({ fullName: "CARLA DEMO TESTE", email: "carla@example.com" });
  employees.seed(ORG, employee);
  accounts.seedAccount({ userId: "user-carla", email: "carla@example.com", role: "employee" });
  accounts.links.set(employee.id, "user-carla");

  const shop = Location.reconstitute({ id: "loc-1", name: "Loja Teste", code: null, timezone: "Europe/Lisbon", isActive: true }).setGeofence(
    { ...SHOP, radiusM: 100, policy },
    new Date(),
  );
  locations.seed(ORG, [shop]);

  let now: ServerNow = { date: TODAY, time: "08:58", iso: `${TODAY}T07:58:00.000Z` };
  const clock = () => now;
  const setNow = (time: string) => {
    now = { date: TODAY, time, iso: `${TODAY}T${time}:00.000Z` };
  };

  const shift = WorkShift.create({ employeeId: employee.id, workDate: TODAY, startTime: "09:00", endTime: "17:00", locationId: "loc-1", status: "published" });
  workShifts.seed(ORG, shift);

  const home = new GetPortalHomeUseCase(accounts, employees, workShifts, punches, rules, locations, clock);
  const punch = new RegisterPunchUseCase(accounts, workShifts, punches, rules, locations, auditLog, clock);
  const who = { organizationId: ORG, userId: "user-carla", actor: "carla@example.com" };
  const reading = (m: number, accuracyM = 10): ClientLocation => ({ kind: "reading", latitude: metersNorth(m), longitude: SHOP.longitude, accuracyM });

  return { home, punch, who, punches, workShifts, auditLog, employee, setNow, reading, accounts };
}

describe("Portal — Início", () => {
  it("mostra o próximo turno, 'ainda não entrou' e a ação Registar entrada", async () => {
    const { home, who } = setup("warn");
    const dto = await home.execute(who);
    expect(dto.employee.shortName).toBe("Carla");
    expect(dto.nextShift).toMatchObject({ workDate: TODAY, startTime: "09:00", endTime: "17:00", locationName: "Loja Teste" });
    expect(dto.punch).toEqual({ state: "not_in", since: null, action: "in", blockedReason: null, geofencePolicy: "warn" });
  });

  it("depois da entrada: estado 'in' desde 08:58 e a ação passa a Registar saída", async () => {
    const { home, punch, who } = setup();
    await punch.execute({ ...who, kind: "in", idempotencyKey: randomUUID(), location: null });
    expect((await home.execute(who)).punch).toMatchObject({ state: "in", since: "08:58", action: "out" });
  });

  it("turno em rascunho não conta (só publicados)", async () => {
    const { home, who, workShifts, employee } = setup();
    for (const s of await workShifts.findInRange(ORG, { from: TODAY, to: TODAY })) await workShifts.delete(ORG, s.id);
    workShifts.seed(ORG, WorkShift.create({ employeeId: employee.id, workDate: TODAY, startTime: "09:00", endTime: "17:00", locationId: "loc-1", status: "draft" }));
    const dto = await home.execute(who);
    expect(dto.nextShift).toBeNull();
    expect(dto.punch.state).toBe("no_shift");
  });

  it("conta sem ficha ligada → PortalNotLinkedError", async () => {
    const { home } = setup();
    await expect(home.execute({ organizationId: ORG, userId: "outro", actor: "x" })).rejects.toBeInstanceOf(PortalNotLinkedError);
  });
});

describe("Portal — picagem", () => {
  it("duplo toque / retry com a mesma chave: UMA só picagem, a segunda devolve a mesma (replay)", async () => {
    const { punch, who, punches } = setup();
    const key = randomUUID();
    const first = await punch.execute({ ...who, kind: "in", idempotencyKey: key, location: null });
    const second = await punch.execute({ ...who, kind: "in", idempotencyKey: key, location: null });
    expect(first.replay).toBe(false);
    expect(second).toMatchObject({ kind: "in", replay: true, serverAt: first.serverAt });
    expect(punches.events).toHaveLength(1);
    expect(punches.attendance).toHaveLength(1);
  });

  it("Entrada → Entrada com outra chave é recusada (estado real da Assiduidade)", async () => {
    const { punch, who } = setup();
    await punch.execute({ ...who, kind: "in", idempotencyKey: randomUUID(), location: null });
    await expect(punch.execute({ ...who, kind: "in", idempotencyKey: randomUUID(), location: null })).rejects.toMatchObject({ code: "ALREADY_IN" });
  });

  it("a hora gravada é a do servidor; entrada e saída completam a linha de assiduidade", async () => {
    const { punch, who, punches, setNow } = setup();
    setNow("09:04");
    expect(await punch.execute({ ...who, kind: "in", idempotencyKey: randomUUID(), location: null })).toMatchObject({ time: "09:04" });
    setNow("17:01");
    await punch.execute({ ...who, kind: "out", idempotencyKey: randomUUID(), location: null });
    expect(punches.attendance[0]).toMatchObject({ actualStartTime: "09:04", actualEndTime: "17:01", status: "late" });
  });

  it("política off: não guarda localização mesmo que o telemóvel a envie", async () => {
    const { punch, who, punches, reading } = setup("off");
    const r = await punch.execute({ ...who, kind: "in", idempotencyKey: randomUUID(), location: reading(10) });
    expect(r.geofence.status).toBe("not_required");
    expect(punches.events[0]).toMatchObject({ latitude: null, accuracyM: null });
  });

  it("warn: dentro passa limpo; fora passa sinalizado", async () => {
    const inside = setup("warn");
    expect(await inside.punch.execute({ ...inside.who, kind: "in", idempotencyKey: randomUUID(), location: inside.reading(30) })).toMatchObject({
      geofence: { status: "inside" },
      flagged: false,
    });
    const outside = setup("warn");
    expect(await outside.punch.execute({ ...outside.who, kind: "in", idempotencyKey: randomUUID(), location: outside.reading(400) })).toMatchObject({
      geofence: { status: "outside" },
      flagged: true,
    });
  });

  it("block: fora da zona é recusado e fica no histórico; GPS impreciso ou negado passa sinalizado", async () => {
    const out = setup("block");
    await expect(out.punch.execute({ ...out.who, kind: "in", idempotencyKey: randomUUID(), location: out.reading(400) })).rejects.toBeInstanceOf(PunchRefusedError);
    expect(out.punches.attendance).toHaveLength(0);
    expect(out.auditLog.entries[0]).toMatchObject({ entityType: "attendance_punch", action: "refused_in" });

    const imprecise = setup("block");
    expect(await imprecise.punch.execute({ ...imprecise.who, kind: "in", idempotencyKey: randomUUID(), location: imprecise.reading(120, 200) })).toMatchObject({
      geofence: { status: "unverified", reason: "low_accuracy" },
      flagged: true,
    });

    const denied = setup("block");
    expect(
      await denied.punch.execute({ ...denied.who, kind: "in", idempotencyKey: randomUUID(), location: { kind: "error", reason: "permission_denied" } }),
    ).toMatchObject({ geofence: { status: "unverified", reason: "permission_denied" }, flagged: true });
  });

  it("uma chave usada por outro colaborador nunca é aceite como replay", async () => {
    const { punch, who, accounts, punches } = setup();
    const key = randomUUID();
    await punch.execute({ ...who, kind: "in", idempotencyKey: key, location: null });
    accounts.seedAccount({ userId: "user-outro", email: "outro@example.com", role: "employee" });
    accounts.links.set("outro-colaborador", "user-outro");
    await expect(punch.execute({ organizationId: ORG, userId: "user-outro", actor: "o", kind: "in", idempotencyKey: key, location: null })).rejects.toMatchObject({
      code: "INVALID_KEY",
    });
    expect(punches.events).toHaveLength(1);
  });
});
