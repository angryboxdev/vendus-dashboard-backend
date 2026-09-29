import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Employee } from "../../domain/entities/employee.js";
import { WorkShift } from "../../domain/entities/work-shift.js";
import { PreviewRepeatCalendarWeekUseCase } from "../../application/use-cases/preview-repeat-calendar-week.use-case.js";
import { FakeWorkShiftRepository } from "../fakes/fake-work-shift-repository.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { FakeLeaveReadAdapter } from "../fakes/fake-leave-read.js";
import { FakeHolidayReadAdapter } from "../fakes/fake-holiday-read.js";

const ORG = mintOrganizationId("org-test");
const SOURCE_MONDAY = "2026-09-28";
const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

function setup() {
  const workShifts = new FakeWorkShiftRepository();
  const employees = new FakeEmployeeRepository();
  const leaveRead = new FakeLeaveReadAdapter();
  const holidayRead = new FakeHolidayReadAdapter();
  const useCase = new PreviewRepeatCalendarWeekUseCase(workShifts, employees, leaveRead, holidayRead);
  return { workShifts, employees, leaveRead, holidayRead, useCase };
}

/** Semana de origem (doc "Repetir escala pelo calendário", secção 14): Carlos Seg/Ter/Qui/Sex 09-17; Gabriel Seg/Qua/Qui 15-23 + Sáb 12-20. */
function seedExampleWeek(workShifts: FakeWorkShiftRepository, carlosId: string, gabrielId: string) {
  const carlosDates = ["2026-09-28", "2026-09-29", "2026-10-01", "2026-10-02"]; // Seg/Ter/Qui/Sex
  for (const workDate of carlosDates) {
    workShifts.seed(ORG, WorkShift.create({ employeeId: carlosId, workDate, startTime: "09:00", endTime: "17:00", locationId: "loc-1" }));
  }
  const gabrielWeekdayDates = ["2026-09-28", "2026-09-30", "2026-10-01"]; // Seg/Qua/Qui
  for (const workDate of gabrielWeekdayDates) {
    workShifts.seed(ORG, WorkShift.create({ employeeId: gabrielId, workDate, startTime: "15:00", endTime: "23:00", locationId: "loc-1" }));
  }
  workShifts.seed(ORG, WorkShift.create({ employeeId: gabrielId, workDate: "2026-10-03", startTime: "12:00", endTime: "20:00", locationId: "loc-1" })); // Sáb
}

describe("PreviewRepeatCalendarWeekUseCase", () => {
  it("cenário da task: semana inteira, 4 semanas, 2 colaboradores com padrões diferentes", async () => {
    const { workShifts, employees, useCase } = setup();
    const carlos = Employee.create({ fullName: "Carlos Andrés" });
    const gabriel = Employee.create({ fullName: "Gabriel Gomes" });
    employees.seed(ORG, carlos);
    employees.seed(ORG, gabriel);
    seedExampleWeek(workShifts, carlos.id, gabriel.id);

    const result = await useCase.execute({
      organizationId: ORG,
      sourceWeekStartDate: SOURCE_MONDAY,
      weekdays: [...ALL_WEEKDAYS],
      repeat: { kind: "weeks", weeks: 4 },
    });

    expect(result.targetStartDate).toBe("2026-10-05"); // segunda seguinte à semana de origem
    expect(result.employees).toHaveLength(2);

    const carlosResult = result.employees.find((e) => e.employeeId === carlos.id)!;
    const gabrielResult = result.employees.find((e) => e.employeeId === gabriel.id)!;
    expect(carlosResult.availableCount).toBe(16); // 4 dias/semana x 4 semanas
    expect(gabrielResult.availableCount).toBe(16); // (3 dias + 1 dia) x 4 semanas
    expect(result.totalAvailable).toBe(32);
    expect(result.totalConflicts).toBe(0);
  });

  it("'dias selecionados': só copia os dias escolhidos, mesmo havendo mais turnos na semana", async () => {
    const { workShifts, employees, useCase } = setup();
    const carlos = Employee.create({ fullName: "Carlos Andrés" });
    employees.seed(ORG, carlos);
    for (const workDate of ["2026-09-28", "2026-09-29", "2026-10-01", "2026-10-02"]) {
      workShifts.seed(ORG, WorkShift.create({ employeeId: carlos.id, workDate, startTime: "09:00", endTime: "17:00", locationId: "loc-1" }));
    }

    const result = await useCase.execute({
      organizationId: ORG,
      sourceWeekStartDate: SOURCE_MONDAY,
      weekdays: [0], // só segunda-feira
      repeat: { kind: "weeks", weeks: 2 },
    });

    expect(result.employees).toHaveLength(1);
    expect(result.employees[0]!.availableCount).toBe(2); // 1 dia/semana x 2 semanas
  });

  it("excluir um colaborador (desmarcado) tira-o do resultado", async () => {
    const { workShifts, employees, useCase } = setup();
    const carlos = Employee.create({ fullName: "Carlos Andrés" });
    const gabriel = Employee.create({ fullName: "Gabriel Gomes" });
    employees.seed(ORG, carlos);
    employees.seed(ORG, gabriel);
    seedExampleWeek(workShifts, carlos.id, gabriel.id);

    const result = await useCase.execute({
      organizationId: ORG,
      sourceWeekStartDate: SOURCE_MONDAY,
      weekdays: [...ALL_WEEKDAYS],
      employeeIds: [carlos.id],
      repeat: { kind: "weeks", weeks: 1 },
    });

    expect(result.employees).toHaveLength(1);
    expect(result.employees[0]!.employeeId).toBe(carlos.id);
  });

  it("deteta conflito quando já existe um turno do colaborador na data de destino", async () => {
    const { workShifts, employees, useCase } = setup();
    const carlos = Employee.create({ fullName: "Carlos Andrés" });
    employees.seed(ORG, carlos);
    seedExampleWeek(workShifts, carlos.id, "gabriel-nao-usado");
    // já existe um turno de Carlos na 1ª segunda-feira de destino (2026-10-05)
    workShifts.seed(ORG, WorkShift.create({ employeeId: carlos.id, workDate: "2026-10-05", startTime: "10:00", endTime: "18:00", locationId: "loc-1" }));

    const result = await useCase.execute({
      organizationId: ORG,
      sourceWeekStartDate: SOURCE_MONDAY,
      weekdays: [0], // só segunda
      employeeIds: [carlos.id],
      repeat: { kind: "weeks", weeks: 2 },
    });

    expect(result.employees[0]!.conflictCount).toBe(1);
    expect(result.employees[0]!.availableCount).toBe(1); // a 2ª segunda (2026-10-12) continua livre
  });

  it("salta (skipped) um dia de férias do colaborador na data de destino", async () => {
    const { workShifts, employees, leaveRead, useCase } = setup();
    const carlos = Employee.create({ fullName: "Carlos Andrés" });
    employees.seed(ORG, carlos);
    seedExampleWeek(workShifts, carlos.id, "gabriel-nao-usado");
    leaveRead.seed(ORG, "2026-10-05", "2026-10-05", { employeeId: carlos.id, type: "vacation" });

    const result = await useCase.execute({
      organizationId: ORG,
      sourceWeekStartDate: SOURCE_MONDAY,
      weekdays: [0],
      employeeIds: [carlos.id],
      repeat: { kind: "weeks", weeks: 1 },
    });

    expect(result.employees[0]!.skippedCount).toBe(1);
    expect(result.employees[0]!.availableCount).toBe(0);
  });

  it("rotateEmployees: com 2 colaboradores, cada um recebe o horário do outro (troca)", async () => {
    const { workShifts, employees, useCase } = setup();
    const carlos = Employee.create({ fullName: "Carlos Andrés" });
    const gabriel = Employee.create({ fullName: "Gabriel Gomes" });
    employees.seed(ORG, carlos);
    employees.seed(ORG, gabriel);
    seedExampleWeek(workShifts, carlos.id, gabriel.id);

    const result = await useCase.execute({
      organizationId: ORG,
      sourceWeekStartDate: SOURCE_MONDAY,
      weekdays: [...ALL_WEEKDAYS],
      employeeIds: [carlos.id, gabriel.id],
      rotateEmployees: true,
      repeat: { kind: "weeks", weeks: 1 },
    });

    const carlosResult = result.employees.find((e) => e.employeeId === carlos.id)!;
    const gabrielResult = result.employees.find((e) => e.employeeId === gabriel.id)!;
    // Carlos passa a ter o padrão do Gabriel (3 dias 15-23 + 1 dia 12-20 = 4)
    expect(carlosResult.availableCount).toBe(4);
    expect(carlosResult.locations[0]!.occurrences.some((o) => o.segments[0]!.startTime === "15:00")).toBe(true);
    // Gabriel passa a ter o padrão do Carlos (4 dias 09-17)
    expect(gabrielResult.availableCount).toBe(4);
    expect(gabrielResult.locations[0]!.occurrences.every((o) => o.segments[0]!.startTime === "09:00")).toBe(true);
  });

  it("rotateEmployees com só 1 colaborador selecionado lança erro", async () => {
    const { workShifts, employees, useCase } = setup();
    const carlos = Employee.create({ fullName: "Carlos Andrés" });
    employees.seed(ORG, carlos);
    workShifts.seed(ORG, WorkShift.create({ employeeId: carlos.id, workDate: "2026-09-28", startTime: "09:00", endTime: "17:00", locationId: "loc-1" }));

    await expect(
      useCase.execute({
        organizationId: ORG,
        sourceWeekStartDate: SOURCE_MONDAY,
        weekdays: [...ALL_WEEKDAYS],
        employeeIds: [carlos.id],
        rotateEmployees: true,
        repeat: { kind: "weeks", weeks: 1 },
      }),
    ).rejects.toThrow();
  });

  it("colaboradores com turnos em 2 locais diferentes na origem geram grupos por local", async () => {
    const { workShifts, employees, useCase } = setup();
    const carlos = Employee.create({ fullName: "Carlos Andrés" });
    employees.seed(ORG, carlos);
    workShifts.seed(ORG, WorkShift.create({ employeeId: carlos.id, workDate: "2026-09-28", startTime: "09:00", endTime: "17:00", locationId: "loc-1" }));
    workShifts.seed(ORG, WorkShift.create({ employeeId: carlos.id, workDate: "2026-09-30", startTime: "09:00", endTime: "17:00", locationId: "loc-2" }));

    const result = await useCase.execute({
      organizationId: ORG,
      sourceWeekStartDate: SOURCE_MONDAY,
      weekdays: [...ALL_WEEKDAYS],
      repeat: { kind: "weeks", weeks: 1 },
    });

    expect(result.employees).toHaveLength(1);
    expect(result.employees[0]!.locations).toHaveLength(2);
    expect(result.employees[0]!.locations.map((l) => l.locationId).sort()).toEqual(["loc-1", "loc-2"]);
  });
});
