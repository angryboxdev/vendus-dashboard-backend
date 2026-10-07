import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { WorkShift } from "../../domain/entities/work-shift.js";
import { UndoNotAvailableError } from "../../domain/errors.js";
import { ClearWorkShiftsUseCase } from "../../application/use-cases/clear-work-shifts.use-case.js";
import { DeleteWorkShiftUseCase } from "../../application/use-cases/delete-work-shift.use-case.js";
import { UNDO_WINDOW_MINUTES, UndoDeleteWorkShiftsUseCase } from "../../application/use-cases/undo-delete-work-shifts.use-case.js";
import { FakeHrAuditLog } from "../fakes/fake-hr-audit-log.js";
import { FakeWorkShiftRepository } from "../fakes/fake-work-shift-repository.js";

const ORG = mintOrganizationId("org-test");
const ME = "gestor@example.com";

function setup() {
  const workShifts = new FakeWorkShiftRepository();
  const auditLog = new FakeHrAuditLog();
  let now = new Date("2026-10-07T01:07:00Z");
  auditLog.now = () => now;
  const advance = (minutes: number) => {
    now = new Date(now.getTime() + minutes * 60_000);
  };
  const seed = (employeeId: string, workDate: string) => {
    const s = WorkShift.create({ employeeId, workDate, startTime: "10:00", endTime: "18:00", locationId: "loc-1", status: "published" });
    workShifts.seed(ORG, s);
    return s;
  };
  const undo = new UndoDeleteWorkShiftsUseCase(workShifts, auditLog, () => now);
  return { workShifts, auditLog, advance, seed, undo };
}

const week = async (workShifts: FakeWorkShiftRepository) => workShifts.findInRange(ORG, { from: "2026-10-05", to: "2026-10-11" });

describe("Desfazer — apagar / limpar turnos", () => {
  it("limpar a semana de todos e desfazer repõe os mesmos turnos (id e estado)", async () => {
    const { workShifts, auditLog, seed, undo } = setup();
    const before = [seed("e1", "2026-10-05"), seed("e1", "2026-10-06"), seed("e2", "2026-10-07")];
    const result = await new ClearWorkShiftsUseCase(workShifts, auditLog).execute({ organizationId: ORG, actor: ME, scope: { kind: "week_all", weekStartDate: "2026-10-05" } });
    expect(result.deletedCount).toBe(3);
    expect(await week(workShifts)).toHaveLength(0);

    expect(await undo.execute({ organizationId: ORG, actor: ME, undoToken: result.undoToken! })).toEqual({ restoredCount: 3 });
    const after = await week(workShifts);
    expect(after.map((s) => [s.id, s.status]).sort()).toEqual(before.map((s) => [s.id, "published"]).sort());
  });

  it("desfazer duas vezes não duplica", async () => {
    const { workShifts, auditLog, seed, undo } = setup();
    const s = seed("e1", "2026-10-05");
    const { undoToken } = await new DeleteWorkShiftUseCase(workShifts, auditLog).execute({ organizationId: ORG, actor: ME, id: s.id });
    expect((await undo.execute({ organizationId: ORG, actor: ME, undoToken })).restoredCount).toBe(1);
    expect((await undo.execute({ organizationId: ORG, actor: ME, undoToken })).restoredCount).toBe(0);
    expect(await week(workShifts)).toHaveLength(1);
  });

  it("só quem apagou, e só dentro da janela", async () => {
    const { workShifts, auditLog, seed, undo, advance } = setup();
    const s = seed("e1", "2026-10-05");
    const { undoToken } = await new DeleteWorkShiftUseCase(workShifts, auditLog).execute({ organizationId: ORG, actor: ME, id: s.id });
    await expect(undo.execute({ organizationId: ORG, actor: "outro@example.com", undoToken })).rejects.toBeInstanceOf(UndoNotAvailableError);
    advance(UNDO_WINDOW_MINUTES + 1);
    await expect(undo.execute({ organizationId: ORG, actor: ME, undoToken })).rejects.toBeInstanceOf(UndoNotAvailableError);
    await expect(undo.execute({ organizationId: ORG, actor: ME, undoToken: "inexistente" })).rejects.toBeInstanceOf(UndoNotAvailableError);
  });

  it("limpar sem nada para apagar não dá código de desfazer", async () => {
    const { workShifts, auditLog } = setup();
    const result = await new ClearWorkShiftsUseCase(workShifts, auditLog).execute({ organizationId: ORG, actor: ME, scope: { kind: "week_all", weekStartDate: "2026-10-05" } });
    expect(result).toMatchObject({ deletedCount: 0, undoToken: null });
  });
});
