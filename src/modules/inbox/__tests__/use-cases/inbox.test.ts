import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { InboxUseCases, type InboxViewer } from "../../application/use-cases/inbox.use-cases.js";
import { directory, FakeConflictError, FakeSource, item } from "../fakes/fake-inbox.js";

const ORG = mintOrganizationId("org-a");
const NOW = Date.parse("2026-10-12T09:00:00Z");

function setup(perms: Record<string, "READ" | "MANAGE"> = { "hr.leave": "MANAGE", "hr.attendance": "MANAGE" }, scope?: string[]) {
  const leave = new FakeSource("leave", "hr.leave", [
    item("leave", "l1", "e-ana", { level: { current: 1, total: 2 } }),
    item("leave", "l2", "e-me", { blockedReason: "own", requestedAt: "2026-09-01T09:00:00.000Z" }),
    item("leave", "l3", "e-rui", { blockedReason: "not_current_level" }),
  ]);
  const clock = new FakeSource("clock", "hr.attendance", [item("clock", "c1", "e-rui", { requestedAt: "2026-10-11T09:00:00.000Z" })]);
  const viewer: InboxViewer = {
    actor: { userId: "u-me", email: "gestor@demo.invalid" },
    can: (p, level) => perms[p] === "MANAGE" || (perms[p] === "READ" && level === "READ"),
    canSee: async (id) => !scope || scope.includes(id),
    canPrivate: false,
  };
  const uc = new InboxUseCases([leave, clock], directory, () => NOW);
  return { uc, viewer, leave, clock };
}

describe("Caixa de pedidos (FE-050)", () => {
  test("contadores por tipo, segmento 'a minha decisão', mais antigos primeiro, idade em dias", async () => {
    const { uc, viewer } = setup();
    const mine = await uc.list(ORG, viewer, { type: null, segment: "mine" });
    expect(mine.types).toEqual(["leave", "clock"]);
    expect(mine.counters).toEqual({ leave: { mine: 1, others: 2 }, clock: { mine: 1, others: 0 } });
    expect(mine.items.map((i) => i.key)).toEqual(["leave:l1", "clock:c1"]);
    expect(mine.items[0]).toMatchObject({ employeeName: "Ana Demo", locationName: "Porto", ageDays: 11, canDecide: true });
    const others = await uc.list(ORG, viewer, { type: "leave", segment: "others" });
    expect(others.items.map((i) => [i.key, i.blockedReason])).toEqual([
      ["leave:l2", "own"],
      ["leave:l3", "not_current_level"],
    ]);
  });

  test("RE-34 e permissões: fora do âmbito não aparece; sem MANAGE vê mas não decide; sem READ o tipo some", async () => {
    const scoped = setup(undefined, ["e-ana"]);
    expect((await scoped.uc.list(ORG, scoped.viewer, { type: null, segment: "all" })).items.map((i) => i.key)).toEqual(["leave:l1"]);
    const readOnly = setup({ "hr.leave": "READ" });
    const r = await readOnly.uc.list(ORG, readOnly.viewer, { type: null, segment: "all" });
    expect(r.types).toEqual(["leave"]);
    expect(r.items.every((i) => !i.canDecide)).toBe(true);
    expect(r.items.find((i) => i.key === "leave:l1")!.blockedReason).toBe("no_permission");
  });

  test("lote: decide os elegíveis e devolve o motivo dos excluídos por pedido (RE-22)", async () => {
    const { uc, viewer, leave, clock } = setup();
    const res = await uc.decide(ORG, viewer, ["leave:l1", "leave:l2", "clock:c1", "leave:zz"], "approve", null);
    expect(res).toEqual([
      { key: "leave:l1", ok: true },
      { key: "leave:l2", ok: false, code: "own", message: expect.stringContaining("Pedido seu") },
      { key: "clock:c1", ok: true },
      { key: "leave:zz", ok: false, code: "not_found", message: expect.any(String) },
    ]);
    expect(leave.decided).toEqual([{ id: "l1", decision: "approve", comment: null }]);
    expect(clock.decided).toHaveLength(1);
  });

  test("recusa exige motivo; erro de regra do módulo dono vem na linha; erro interno propaga", async () => {
    const { uc, viewer, leave } = setup();
    await expect(uc.decide(ORG, viewer, ["leave:l1"], "reject", "  ")).rejects.toThrow("motivo");
    await expect(uc.decide(ORG, viewer, [], "approve", null)).rejects.toThrow("pelo menos um");
    leave.failWith = new FakeConflictError("O dia 2026-10-05 está num período fechado.", "period_closed");
    expect(await uc.decide(ORG, viewer, ["leave:l1"], "reject", "Sem cobertura no centro")).toEqual([{ key: "leave:l1", ok: false, code: "period_closed", message: "O dia 2026-10-05 está num período fechado." }]);
    leave.failWith = new Error("db down");
    await expect(uc.decide(ORG, viewer, ["leave:l1"], "approve", null)).rejects.toThrow("db down");
  });
});
