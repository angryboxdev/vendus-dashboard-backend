import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Absence, InvalidAbsenceError } from "../../domain/entities/absence.js";
import { PortalRequest } from "../../domain/entities/portal-request.js";
import { WorkShift } from "../../domain/entities/work-shift.js";
import { ConfirmAbsenceChoiceRequiredError, PendingAbsenceRequestError } from "../../domain/errors.js";
import { ConfirmAbsenceUseCase, PreviewConfirmAbsenceUseCase } from "../../application/use-cases/confirm-absence.use-cases.js";
import type { CorrectShiftAttendanceCommand, CorrectShiftAttendancePort } from "../../domain/ports/in/attendance-conference.ports.js";
import { isCompatibleAbsence } from "../../domain/services/absence-match.service.js";
import { FakeAbsenceRepository } from "../fakes/fake-absence-repository.js";
import { FakeHolidayReadAdapter } from "../fakes/fake-holiday-read.js";
import { FakePortalRequestRepository } from "../fakes/fake-portal-request-repository.js";
import { FakeWorkShiftRepository } from "../fakes/fake-work-shift-repository.js";

const ORG = mintOrganizationId("org-test");
const DAY = "2026-10-06";

function setup() {
  const absences = new FakeAbsenceRepository();
  const requests = new FakePortalRequestRepository();
  const workShifts = new FakeWorkShiftRepository();
  const corrections: CorrectShiftAttendanceCommand[] = [];
  const correct: CorrectShiftAttendancePort = { execute: async (c) => (corrections.push(c), null) };
  const shift = WorkShift.create({ employeeId: "e1", workDate: DAY, startTime: "10:00", endTime: "18:00", locationId: "loc-1", status: "published" });
  workShifts.seed(ORG, shift);
  const ref = { organizationId: ORG, workShiftId: shift.id, attendanceId: null, employeeId: "e1", workDate: DAY, locationId: "loc-1" };
  const absence = (o: Partial<Parameters<typeof Absence.register>[0]> = {}) => {
    const a = Absence.register({ employeeId: "e1", type: "sick_leave", duration: "day", startDate: DAY, endDate: DAY, workingDays: 1, createdBy: "x", ...o });
    absences.seed(a);
    return a;
  };
  return {
    absences,
    requests,
    corrections,
    ref,
    absence,
    preview: new PreviewConfirmAbsenceUseCase(absences, requests, workShifts),
    confirm: new ConfirmAbsenceUseCase(absences, requests, workShifts, new FakeHolidayReadAdapter(), correct),
  };
}

describe("compatibilidade ausência ↔ ocorrência", () => {
  const w = { workDate: DAY, startTime: "10:00", endTime: "18:00", endsNextDay: false };
  const a = (o: Partial<{ startDate: string; endDate: string; startTime: string | null; endTime: string | null; status: string }> = {}) => ({
    id: "a",
    status: "active",
    startDate: DAY,
    endDate: DAY,
    startTime: null,
    endTime: null,
    minutes: null,
    ...o,
  });
  it("dia inteiro que cobre o dia; parcial com horário sobreposto", () => {
    expect(isCompatibleAbsence(a({ startDate: "2026-10-05", endDate: "2026-10-09" }), w)).toBe(true);
    expect(isCompatibleAbsence(a({ startTime: "10:00", endTime: "14:00" }), w)).toBe(true);
    expect(isCompatibleAbsence(a({ startTime: "19:00", endTime: "20:00" }), w)).toBe(false);
    expect(isCompatibleAbsence(a({ startDate: "2026-10-07", endDate: "2026-10-07" }), w)).toBe(false);
    expect(isCompatibleAbsence(a({ status: "cancelled" }), w)).toBe(false);
  });
});

describe("Confirmar ausência", () => {
  it("1 compatível → vincula sem criar e resolve a ocorrência com a ligação", async () => {
    const t = setup();
    const existing = t.absence({ type: "justified", duration: "hours", startTime: "10:00", endTime: "14:00" });
    expect((await t.preview.execute(t.ref)).match).toBe("single");
    const r = await t.confirm.execute({ ...t.ref, actor: "rh@example.com" });
    expect(r).toMatchObject({ outcome: "linked", fullDay: false, absence: { id: existing.id } });
    expect(t.absences.items.size).toBe(1);
    expect(t.corrections[0]).toMatchObject({ correctionType: "justify_no_impact", absenceId: existing.id });
  });

  it("nenhuma → cria UM registo (dia inteiro) e vincula; falta injustificada fecha como ausência", async () => {
    const t = setup();
    expect((await t.preview.execute(t.ref)).match).toBe("none");
    await expect(t.confirm.execute({ ...t.ref, actor: "x" })).rejects.toBeInstanceOf(InvalidAbsenceError);
    const r = await t.confirm.execute({ ...t.ref, actor: "x", newAbsence: { type: "unjustified", startTime: "10:00", endTime: "18:00" } });
    expect(r).toMatchObject({ outcome: "created", fullDay: true });
    expect(t.absences.items.size).toBe(1);
    expect(t.corrections[0]).toMatchObject({ correctionType: "mark_absence", absenceId: r.absence.id });
  });

  it("nenhuma com horas diferentes do turno → cria parcial", async () => {
    const t = setup();
    const r = await t.confirm.execute({ ...t.ref, actor: "x", newAbsence: { type: "justified", startTime: "10:00", endTime: "12:00" } });
    expect(r.absence).toMatchObject({ startTime: "10:00", endTime: "12:00", duration: "2 horas" });
  });

  it("várias compatíveis → não escolhe; o gestor indica qual", async () => {
    const t = setup();
    t.absence({ type: "justified", duration: "hours", startTime: "10:00", endTime: "12:00" });
    const b = t.absence({ type: "sick_leave", duration: "hours", startTime: "14:00", endTime: "16:00" });
    expect((await t.preview.execute(t.ref)).match).toBe("multiple");
    await expect(t.confirm.execute({ ...t.ref, actor: "x" })).rejects.toBeInstanceOf(ConfirmAbsenceChoiceRequiredError);
    const r = await t.confirm.execute({ ...t.ref, actor: "x", absenceId: b.id });
    expect(r.absence.id).toBe(b.id);
  });

  it("pedido pendente → não cria nem aprova; depois de aprovado vincula a ausência criada", async () => {
    const t = setup();
    const req = PortalRequest.justifyAbsence({ employeeId: "e1", workShiftId: t.ref.workShiftId, workDate: DAY, reasonCode: "sick", reasonText: null, attachment: null, today: DAY });
    await t.requests.create(ORG, req);
    const p = await t.preview.execute(t.ref);
    expect(p).toMatchObject({ match: "pending_request", pendingRequest: { id: req.id, reasonLabel: "Doença" } });
    await expect(t.confirm.execute({ ...t.ref, actor: "x", newAbsence: { type: "justified" } })).rejects.toBeInstanceOf(PendingAbsenceRequestError);
    expect(t.absences.items.size).toBe(0);

    // Aprovação (Caixa de pedidos) cria a ausência e fecha o pedido → passa a "single".
    const created = t.absence({ type: "justified" });
    await t.requests.update(ORG, req.approve("rh", created.id, null));
    expect((await t.preview.execute(t.ref)).match).toBe("single");
    expect((await t.confirm.execute({ ...t.ref, actor: "x" })).outcome).toBe("linked");
  });
});
