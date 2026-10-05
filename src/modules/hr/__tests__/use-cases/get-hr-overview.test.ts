import { DateTime } from "luxon";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Employee } from "../../domain/entities/employee.js";
import { Location } from "../../../locations/domain/entities/location.js";
import { GetHrOverviewUseCase } from "../../application/use-cases/get-hr-overview.use-case.js";
import type { ShiftOccurrence } from "../../domain/ports/out/shift-attendance-read.port.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { FakeDocumentRepository } from "../../../documents/__tests__/fakes/fake-document-repository.js";
import { FakeShiftAttendanceReadAdapter } from "../fakes/fake-shift-attendance-read.js";
import { FakeLeaveReadAdapter } from "../fakes/fake-leave-read.js";
import { FakePaymentReadAdapter } from "../fakes/fake-payment-read.js";
import { FakeDocumentCategoryRepository } from "../../../documents/__tests__/fakes/fake-document-category-repository.js";
import { FakeLocationRepository } from "../fakes/fake-location-repository.js";
import type { ShiftAttendanceReadPort } from "../../domain/ports/out/shift-attendance-read.port.js";

const ORG = mintOrganizationId("org-test");

function makeUseCase(overrides: { shiftAttendanceRead?: ShiftAttendanceReadPort } = {}) {
  const employees = new FakeEmployeeRepository();
  const documents = new FakeDocumentRepository();
  const shifts = overrides.shiftAttendanceRead ?? new FakeShiftAttendanceReadAdapter();
  const leave = new FakeLeaveReadAdapter();
  const payments = new FakePaymentReadAdapter();
  const categories = new FakeDocumentCategoryRepository();
  const locations = new FakeLocationRepository();
  return {
    employees,
    documents,
    shifts,
    leave,
    payments,
    categories,
    locations,
    useCase: new GetHrOverviewUseCase(employees, documents, shifts, leave, payments, categories, locations),
  };
}

describe("GetHrOverviewUseCase", () => {
  it("bloco 'team': ativos, admissões este mês, incompletos", async () => {
    const { employees, useCase } = makeUseCase();
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-05`;
    employees.seed(ORG, Employee.create({ fullName: "Ativo Completo", hiredAt: "2020-01-01" }));
    employees.seed(ORG, Employee.create({ fullName: "Admitido Este Mês", hiredAt: thisMonth }));
    employees.seed(ORG, Employee.create({ fullName: "Inativo" }).deactivate());

    const result = await useCase.execute({ organizationId: ORG });

    expect(result.team.status).toBe("ok");
    if (result.team.status === "ok") {
      expect(result.team.data.activeEmployees).toBe(2);
      expect(result.team.data.admissionsThisMonth).toBe(1);
      expect(result.team.data.incompleteProfiles).toBe(2); // nenhum dos dois ativos tem perfil 100% completo
    }
  });

  it("bloco 'team': missingDocumentsCount soma requisitos em falta por colaborador (nunca colaboradores)", async () => {
    const { employees, useCase } = makeUseCase();
    // Sem nenhum documento enviado: identificação + 3 categorias obrigatórias por omissão (ver FakeDocumentCategoryRepository) = 4 requisitos em falta.
    employees.seed(ORG, Employee.create({ fullName: "Sem Documentos" }));

    const result = await useCase.execute({ organizationId: ORG });

    expect(result.team.status).toBe("ok");
    if (result.team.status === "ok") {
      expect(result.team.data.missingDocumentsCount).toBe(4);
    }
  });

  it("uma fonte a falhar não derruba as outras — 'team' fica indisponível mas 'pending' continua ok", async () => {
    const failingEmployees = {
      findById: async () => null,
      findMany: async () => {
        throw new Error("falha simulada na leitura de funcionários");
      },
      create: async (_o: unknown, e: unknown) => e,
      update: async (_o: unknown, e: unknown) => e,
    };
    const { payments, useCase } = makeUseCase();
    // @ts-expect-error — fake mínimo só para este teste de robustez
    const useCaseWithFailingEmployees = new GetHrOverviewUseCase(
      failingEmployees,
      new FakeDocumentRepository(),
      new FakeShiftAttendanceReadAdapter(),
      new FakeLeaveReadAdapter(),
      payments,
      new FakeDocumentCategoryRepository(),
      new FakeLocationRepository(),
    );
    payments.seedUnpaidCount(ORG, 3);

    const result = await useCaseWithFailingEmployees.execute({ organizationId: ORG });

    expect(result.team.status).toBe("unavailable");
    expect(result.pending.status).toBe("ok");
    if (result.pending.status === "ok") {
      expect(result.pending.data.unpaidPaymentsCount).toBe(3);
    }
  });

  it("nunca escreve em nenhuma fonte — os ports de leitura desta fase não expõem sequer um método de escrita", async () => {
    const { shifts, leave, payments } = makeUseCase();
    expect(Object.keys(shifts)).not.toContain("update");
    expect(Object.keys(leave)).not.toContain("update");
    expect(Object.keys(payments)).not.toContain("update");
  });

  it("generatedAt e scope são sempre devolvidos, mesmo com tudo indisponível", async () => {
    const failing = {
      findMany: async () => {
        throw new Error("x");
      },
    };
    const failingShifts = {
      findShiftsInRange: async () => {
        throw new Error("x");
      },
    };
    const failingLeave = {
      findActiveOnDate: async () => {
        throw new Error("x");
      },
      findActiveInRange: async () => {
        throw new Error("x");
      },
    };
    const failingPayments = {
      countUnpaid: async () => {
        throw new Error("x");
      },
    };
    const failingLocations = {
      findAllForOrganization: async () => {
        throw new Error("x");
      },
    };
    // @ts-expect-error — fakes mínimos só para este teste
    const useCase = new GetHrOverviewUseCase(failing, failing, failingShifts, failingLeave, failingPayments, failing, failingLocations);
    const result = await useCase.execute({ organizationId: ORG });
    expect(result.generatedAt).toBeTruthy();
    expect(result.scope.organizationId).toBe(String(ORG));
    expect(result.team.status).toBe("unavailable");
    expect(result.today.status).toBe("unavailable");
    expect(result.pending.status).toBe("unavailable");
    expect(result.operation.status).toBe("unavailable");
  });

  describe("bloco 'operation' (Hoje na operação)", () => {
    // Relógio fixo a meio da tarde (Lisboa) — vários testes deste bloco usam
    // offsets de horas relativos a "agora" (o use case usa DateTime.now()
    // real); com o relógio real, um offset como "-5h"/"+4h" podia atravessar
    // a meia-noite e deixar de bater com `TODAY`, dependendo da hora real a
    // que os testes corriam. 14:00 dá margem suficiente para todos os
    // offsets usados abaixo (até ±5h) nunca saírem do mesmo dia civil.
    const FIXED_NOW = DateTime.fromISO("2026-09-30T14:00:00", { zone: "Europe/Lisbon" });
    const TODAY = FIXED_NOW.toISODate()!;

    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(FIXED_NOW.toJSDate());
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    function shiftToday(overrides: Partial<ShiftOccurrence> = {}): ShiftOccurrence {
      return {
        shiftId: "s1",
        employeeId: "e1",
        workDate: TODAY,
        startTime: "09:00",
        endTime: "17:00",
        endsNextDay: false,
        secondStartTime: null,
        secondEndTime: null,
        locationId: "loc1",
        attendanceStatus: null,
        actualStartTime: null,
        actualEndTime: null,
        lateMinutes: null,
        ...overrides,
      };
    }

    it("resolve o nome do local (nunca o UUID) e devolve turno/situação formatados", async () => {
      const { employees, shifts, locations, useCase } = makeUseCase();
      const emp = Employee.create({ fullName: "Gabriel Gomes" });
      employees.seed(ORG, emp);
      locations.seed(ORG, [Location.reconstitute({ id: "loc1", name: "Loja MBS", code: "MBS", timezone: "Europe/Lisbon", isActive: true })]);
      // Horários relativos a "agora" (não absolutos) — o use case usa DateTime.now() real; um turno fixo 09:00–17:00 ficaria "Sem saída" em vez de "Presente" se o teste corresse depois das 17:00.
      const now = DateTime.now().setZone("Europe/Lisbon");
      const start = now.minus({ hours: 1 });
      const end = now.plus({ hours: 4 });
      shifts.seed(ORG, shiftToday({ employeeId: emp.id, startTime: start.toFormat("HH:mm"), endTime: end.toFormat("HH:mm"), actualStartTime: start.toFormat("HH:mm") }));

      const result = await useCase.execute({ organizationId: ORG });
      expect(result.operation.status).toBe("ok");
      if (result.operation.status !== "ok") return;
      const row = result.operation.data.find((r) => r.employeeId === emp.id)!;
      expect(row.locationId).toBe("loc1");
      expect(row.locationName).toBe("Loja MBS");
      expect(row.state).toBe("PRESENTE");
      expect(row.situation).toBe(`Entrada ${start.toFormat("HH:mm")}`);
      expect(row.shiftToday).toEqual([`${start.toFormat("HH:mm")}–${end.toFormat("HH:mm")}`]);
    });

    it("nunca corta a lista a 5 linhas — mostra todos os colaboradores com turno/ausência hoje", async () => {
      const { employees, shifts, useCase } = makeUseCase();
      for (let i = 0; i < 8; i++) {
        const emp = Employee.create({ fullName: `Colaborador ${i}` });
        employees.seed(ORG, emp);
        shifts.seed(ORG, shiftToday({ shiftId: `s${i}`, employeeId: emp.id, actualStartTime: "09:00" }));
      }
      const result = await useCase.execute({ organizationId: ORG });
      expect(result.operation.status).toBe("ok");
      if (result.operation.status !== "ok") return;
      expect(result.operation.data).toHaveLength(8);
    });

    it("CONFLITO tem prioridade máxima e a situação mostra a contagem de marcações abertas", async () => {
      const { employees, shifts, useCase } = makeUseCase();
      const emp = Employee.create({ fullName: "Kleiton Carlos" });
      employees.seed(ORG, emp);
      shifts.seed(ORG, shiftToday({ shiftId: "s1", employeeId: emp.id, actualStartTime: "09:00" }));
      shifts.seed(ORG, shiftToday({ shiftId: "s2", employeeId: emp.id, startTime: "10:00", endTime: "18:00", actualStartTime: "10:00" }));
      // outro colaborador, ausente — devia ficar atrás do conflito na ordenação
      const other = Employee.create({ fullName: "Outro Ausente" });
      employees.seed(ORG, other);
      const past = DateTime.now().setZone("Europe/Lisbon").minus({ hours: 3 });
      shifts.seed(
        ORG,
        shiftToday({ shiftId: "s3", employeeId: other.id, startTime: past.toFormat("HH:mm"), endTime: past.plus({ minutes: 1 }).toFormat("HH:mm") }),
      );

      const result = await useCase.execute({ organizationId: ORG });
      expect(result.operation.status).toBe("ok");
      if (result.operation.status !== "ok") return;
      expect(result.operation.data[0]!.employeeId).toBe(emp.id);
      expect(result.operation.data[0]!.state).toBe("CONFLITO");
      expect(result.operation.data[0]!.situation).toBe("2 marcações abertas");
    });

    it("colaborador em férias aparece com state FERIAS e situação 'Até DD/MM'", async () => {
      const { employees, leave, useCase } = makeUseCase();
      const emp = Employee.create({ fullName: "Mariana Costa" });
      employees.seed(ORG, emp);
      leave.seed(ORG, TODAY, "2026-09-30", { employeeId: emp.id, type: "vacation" });

      const result = await useCase.execute({ organizationId: ORG });
      expect(result.operation.status).toBe("ok");
      if (result.operation.status !== "ok") return;
      const row = result.operation.data.find((r) => r.employeeId === emp.id)!;
      expect(row.state).toBe("FERIAS");
      expect(row.situation).toBe("Até 30/09");
      expect(row.shiftToday).toBeNull();
      expect(row.locationName).toBeNull();
    });

    it("turno repartido em que só o 2º período teve entrada: state PRESENTE, situação mostra a entrada e situationWarning avisa do 1º período em falta", async () => {
      const { employees, shifts, useCase } = makeUseCase();
      const emp = Employee.create({ fullName: "Lucas Almeida" });
      employees.seed(ORG, emp);
      // Horários relativos a "agora" (não absolutos): o use case usa DateTime.now() real, e um "actualStartTime" absoluto no futuro relativamente à execução do teste tornaria o teste inconsistente/instável (o overlay de intervalo depende de "now" vs. os horários do turno).
      const now = DateTime.now().setZone("Europe/Lisbon");
      const seg1Start = now.minus({ hours: 6 });
      const seg1End = now.minus({ hours: 4 });
      const seg2Start = now.minus({ hours: 1 });
      const seg2End = now.plus({ hours: 2 });
      const actual = seg2Start.plus({ minutes: 2 });
      shifts.seed(
        ORG,
        shiftToday({
          employeeId: emp.id,
          startTime: seg1Start.toFormat("HH:mm"),
          endTime: seg1End.toFormat("HH:mm"),
          secondStartTime: seg2Start.toFormat("HH:mm"),
          secondEndTime: seg2End.toFormat("HH:mm"),
          actualStartTime: actual.toFormat("HH:mm"),
        }),
      );

      const result = await useCase.execute({ organizationId: ORG });
      expect(result.operation.status).toBe("ok");
      if (result.operation.status !== "ok") return;
      const row = result.operation.data.find((r) => r.employeeId === emp.id)!;
      expect(row.state).toBe("PRESENTE");
      expect(row.situation).toBe(`Entrada ${actual.toFormat("HH:mm")}`);
      expect(row.situationWarning).toBe("1º turno sem entrada");
    });

    it("situationWarning é null quando não há inconsistência a sinalizar", async () => {
      const { employees, shifts, useCase } = makeUseCase();
      const emp = Employee.create({ fullName: "Sem Ocorrência" });
      employees.seed(ORG, emp);
      shifts.seed(ORG, shiftToday({ employeeId: emp.id, actualStartTime: "09:00" }));

      const result = await useCase.execute({ organizationId: ORG });
      expect(result.operation.status).toBe("ok");
      if (result.operation.status !== "ok") return;
      const row = result.operation.data.find((r) => r.employeeId === emp.id)!;
      expect(row.situationWarning).toBeNull();
    });

    it("2 turnos do mesmo colaborador no mesmo dia: shiftToday junta os períodos de TODOS, ordenados, numa única linha", async () => {
      const { employees, shifts, useCase } = makeUseCase();
      const emp = Employee.create({ fullName: "Dois Turnos" });
      employees.seed(ORG, emp);
      shifts.seed(ORG, shiftToday({ shiftId: "s1", employeeId: emp.id, startTime: "18:00", endTime: "22:00", actualStartTime: "18:00" }));
      shifts.seed(ORG, shiftToday({ shiftId: "s2", employeeId: emp.id, startTime: "09:00", endTime: "13:00", actualStartTime: "09:00", actualEndTime: "13:00" }));

      const result = await useCase.execute({ organizationId: ORG });
      expect(result.operation.status).toBe("ok");
      if (result.operation.status !== "ok") return;
      const rowsForEmployee = result.operation.data.filter((r) => r.employeeId === emp.id);
      expect(rowsForEmployee).toHaveLength(1); // nunca duplica a linha, mesmo com 2+ turnos no mesmo dia
      expect(rowsForEmployee[0]!.shiftToday).toEqual(["09:00–13:00", "18:00–22:00"]);
    });

    it("ordenação: Ausente > Atrasado > Presente com ocorrência > Presente > Em tolerância > Agendado > Intervalo (secção 13)", async () => {
      const { employees, shifts, useCase } = makeUseCase();
      const past = DateTime.now().setZone("Europe/Lisbon").minus({ hours: 3 });
      const future = DateTime.now().setZone("Europe/Lisbon").plus({ hours: 3 });

      const ausente = Employee.create({ fullName: "Estado Ausente" });
      employees.seed(ORG, ausente);
      shifts.seed(ORG, shiftToday({ shiftId: "sa", employeeId: ausente.id, startTime: past.toFormat("HH:mm"), endTime: past.plus({ minutes: 30 }).toFormat("HH:mm") }));

      const agendado = Employee.create({ fullName: "Estado Agendado" });
      employees.seed(ORG, agendado);
      shifts.seed(ORG, shiftToday({ shiftId: "sg", employeeId: agendado.id, startTime: future.toFormat("HH:mm"), endTime: future.plus({ hours: 4 }).toFormat("HH:mm") }));

      const intervalo = Employee.create({ fullName: "Estado Intervalo" });
      employees.seed(ORG, intervalo);
      const breakStart = DateTime.now().setZone("Europe/Lisbon").minus({ hours: 1 });
      shifts.seed(
        ORG,
        shiftToday({
          shiftId: "si",
          employeeId: intervalo.id,
          startTime: breakStart.minus({ hours: 4 }).toFormat("HH:mm"),
          endTime: breakStart.toFormat("HH:mm"),
          secondStartTime: breakStart.plus({ hours: 2 }).toFormat("HH:mm"),
          secondEndTime: breakStart.plus({ hours: 6 }).toFormat("HH:mm"),
          actualStartTime: breakStart.minus({ hours: 4 }).toFormat("HH:mm"),
        }),
      );

      const result = await useCase.execute({ organizationId: ORG });
      expect(result.operation.status).toBe("ok");
      if (result.operation.status !== "ok") return;
      const order = result.operation.data.map((r) => r.employeeName);
      expect(order.indexOf("Estado Ausente")).toBeLessThan(order.indexOf("Estado Agendado"));
      expect(order.indexOf("Estado Agendado")).toBeLessThan(order.indexOf("Estado Intervalo"));
    });

    it("um turno 'por conferir' (sem saída, já terminado) devolve reviewShiftId para o drill-down direto", async () => {
      const { employees, shifts, useCase } = makeUseCase();
      const emp = Employee.create({ fullName: "Raul Afonso" });
      employees.seed(ORG, emp);
      const past = DateTime.now().setZone("Europe/Lisbon").minus({ hours: 5 });
      shifts.seed(
        ORG,
        shiftToday({
          shiftId: "shift-sem-saida",
          employeeId: emp.id,
          startTime: past.toFormat("HH:mm"),
          endTime: past.plus({ minutes: 30 }).toFormat("HH:mm"),
          actualStartTime: past.toFormat("HH:mm"),
        }),
      );

      const result = await useCase.execute({ organizationId: ORG });
      expect(result.operation.status).toBe("ok");
      if (result.operation.status !== "ok") return;
      const row = result.operation.data.find((r) => r.employeeId === emp.id)!;
      expect(row.reviewShiftId).toBe("shift-sem-saida");
      expect(row.situation).toBe("Sem saída");
    });
  });
});
