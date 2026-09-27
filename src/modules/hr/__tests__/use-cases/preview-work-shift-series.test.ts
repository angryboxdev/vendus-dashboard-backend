import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { PreviewWorkShiftSeriesUseCase } from "../../application/use-cases/preview-work-shift-series.use-case.js";
import { WorkShift } from "../../domain/entities/work-shift.js";
import { InvalidRecurrenceSpecError } from "../../domain/errors.js";
import { FakeWorkShiftRepository } from "../fakes/fake-work-shift-repository.js";
import { FakeLeaveReadAdapter } from "../fakes/fake-leave-read.js";
import { FakeHolidayReadAdapter } from "../fakes/fake-holiday-read.js";

const ORG = mintOrganizationId("org-test");
const MORNING = [{ startTime: "09:00", endTime: "17:00" }];

function setup() {
  const workShifts = new FakeWorkShiftRepository();
  const leaveRead = new FakeLeaveReadAdapter();
  const holidayRead = new FakeHolidayReadAdapter();
  const useCase = new PreviewWorkShiftSeriesUseCase(workShifts, leaveRead, holidayRead);
  return { workShifts, leaveRead, holidayRead, useCase };
}

describe("PreviewWorkShiftSeriesUseCase", () => {
  it("cenário B: 3x/semana durante 4 semanas → 12 disponíveis, sem conflitos", async () => {
    const { useCase } = setup();
    const result = await useCase.execute({
      organizationId: ORG,
      employeeId: "emp-1",
      locationId: "loc-1",
      startDate: "2026-09-28",
      rules: [{ weekdays: [0, 2, 4], segments: MORNING }],
      repeat: { kind: "weeks", weeks: 4 },
    });
    expect(result.availableCount).toBe(12);
    expect(result.conflictCount).toBe(0);
    expect(result.skippedCount).toBe(0);
    expect(result.occurrences).toHaveLength(12);
    expect(result.occurrences.every((o) => o.status === "available")).toBe(true);
  });

  it("reporta conflito sem bloquear o preview quando já existe um turno sobreposto", async () => {
    const { useCase, workShifts } = setup();
    workShifts.seed(
      ORG,
      WorkShift.create({ employeeId: "emp-1", workDate: "2026-09-28", startTime: "09:00", endTime: "17:00", locationId: "loc-1" }),
    );

    const result = await useCase.execute({
      organizationId: ORG,
      employeeId: "emp-1",
      locationId: "loc-1",
      startDate: "2026-09-28",
      rules: [{ weekdays: [0], segments: MORNING }],
      repeat: { kind: "none" },
    });
    expect(result.availableCount).toBe(0);
    expect(result.conflictCount).toBe(1);
    expect(result.occurrences[0]!.status).toBe("conflict");
  });

  it("dia de ausência/férias aparece como skipped_leave, nunca como conflict", async () => {
    const { useCase, leaveRead } = setup();
    leaveRead.seed(ORG, "2026-09-28", "2026-09-28", { employeeId: "emp-1", type: "vacation" });

    const result = await useCase.execute({
      organizationId: ORG,
      employeeId: "emp-1",
      locationId: "loc-1",
      startDate: "2026-09-28",
      rules: [{ weekdays: [0], segments: MORNING }],
      repeat: { kind: "none" },
    });
    expect(result.skippedCount).toBe(1);
    expect(result.occurrences[0]!.status).toBe("skipped_leave");
  });

  it("feriado aparece como skipped_holiday", async () => {
    const { useCase, holidayRead } = setup();
    holidayRead.seed(ORG, { date: "2026-09-28", name: "Feriado de teste" });

    const result = await useCase.execute({
      organizationId: ORG,
      employeeId: "emp-1",
      locationId: "loc-1",
      startDate: "2026-09-28",
      rules: [{ weekdays: [0], segments: MORNING }],
      repeat: { kind: "none" },
    });
    expect(result.skippedCount).toBe(1);
    expect(result.occurrences[0]!.status).toBe("skipped_holiday");
  });

  it("rejeita regras vazias", async () => {
    const { useCase } = setup();
    await expect(
      useCase.execute({
        organizationId: ORG,
        employeeId: "emp-1",
        locationId: "loc-1",
        startDate: "2026-09-28",
        rules: [],
        repeat: { kind: "none" },
      }),
    ).rejects.toThrow(InvalidRecurrenceSpecError);
  });

  it("rejeita duas regras a reclamar o mesmo dia da semana", async () => {
    const { useCase } = setup();
    await expect(
      useCase.execute({
        organizationId: ORG,
        employeeId: "emp-1",
        locationId: "loc-1",
        startDate: "2026-09-28",
        rules: [
          { weekdays: [0], segments: MORNING },
          { weekdays: [0, 1], segments: [{ startTime: "12:00", endTime: "20:00" }] },
        ],
        repeat: { kind: "none" },
      }),
    ).rejects.toThrow(InvalidRecurrenceSpecError);
  });

  it("o preview usa exatamente o mesmo cálculo de partição que a criação (computeSeriesPartition partilhado)", async () => {
    const { useCase, workShifts } = setup();
    workShifts.seed(
      ORG,
      WorkShift.create({ employeeId: "emp-1", workDate: "2026-10-05", startTime: "09:00", endTime: "17:00", locationId: "loc-1" }),
    );

    const result = await useCase.execute({
      organizationId: ORG,
      employeeId: "emp-1",
      locationId: "loc-1",
      startDate: "2026-09-28",
      rules: [{ weekdays: [0], segments: MORNING }],
      repeat: { kind: "weeks", weeks: 2 },
    });
    // 2026-09-28 disponível, 2026-10-05 em conflito com o turno semeado
    expect(result.availableCount).toBe(1);
    expect(result.conflictCount).toBe(1);
    const byDate = new Map(result.occurrences.map((o) => [o.workDate, o.status]));
    expect(byDate.get("2026-09-28")).toBe("available");
    expect(byDate.get("2026-10-05")).toBe("conflict");
  });
});
