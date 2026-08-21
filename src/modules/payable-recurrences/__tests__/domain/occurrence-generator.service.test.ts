import { Recurrence } from "../../domain/entities/recurrence.js";
import { OccurrenceGeneratorService } from "../../domain/services/occurrence-generator.service.js";

const generator = new OccurrenceGeneratorService();

const BASE_REC = {
  name: "Energia - Gold Energy",
  supplierName: "Gold Energy",
  type: "variable_invoice" as const,
  estimatedAmountCents: 26175,
  dayOfMonth: 20,
  startDate: new Date("2026-01-01"),
  paymentMethod: "transfer" as const,
};

describe("OccurrenceGeneratorService.generateForMonth", () => {
  it("gera ocorrência para recorrência activa no mês correcto", () => {
    const rec = Recurrence.create(BASE_REC);
    const occ = generator.generateForMonth(rec, 2026, 9);

    expect(occ).not.toBeNull();
    expect(occ!.period).toBe("2026-09");
    expect(occ!.recurrenceId).toBe(rec.id);
    expect(occ!.estimatedAmountCents).toBe(26175);
  });

  it("define dueDate como dia 20 de Setembro 2026", () => {
    const rec = Recurrence.create(BASE_REC);
    const occ = generator.generateForMonth(rec, 2026, 9);

    expect(occ!.dueDate).toEqual(new Date(2026, 8, 20)); // month 8 = September (0-indexed)
  });

  it("cria status awaiting_invoice para variable_invoice (requireInvoice=true)", () => {
    const rec = Recurrence.create(BASE_REC);
    const occ = generator.generateForMonth(rec, 2026, 9);
    expect(occ!.status).toBe("awaiting_invoice");
  });

  it("cria status forecast para fixed_contract (requireInvoice=false)", () => {
    const rec = Recurrence.create({
      ...BASE_REC,
      type: "fixed_contract",
      requireInvoice: false,
    });
    const occ = generator.generateForMonth(rec, 2026, 9);
    expect(occ!.status).toBe("forecast");
  });

  it("retorna null para recorrência pausada", () => {
    const rec = Recurrence.create(BASE_REC).pause();
    expect(generator.generateForMonth(rec, 2026, 9)).toBeNull();
  });

  it("retorna null para recorrência encerrada", () => {
    const rec = Recurrence.create(BASE_REC).close();
    expect(generator.generateForMonth(rec, 2026, 9)).toBeNull();
  });

  describe("quarterly frequency", () => {
    it("gera ocorrência no mês de início (Jan)", () => {
      const rec = Recurrence.create({ ...BASE_REC, frequency: "quarterly", startDate: new Date("2026-01-01") });
      expect(generator.generateForMonth(rec, 2026, 1)).not.toBeNull();
    });

    it("gera ocorrência 3 meses depois (Abr)", () => {
      const rec = Recurrence.create({ ...BASE_REC, frequency: "quarterly", startDate: new Date("2026-01-01") });
      expect(generator.generateForMonth(rec, 2026, 4)).not.toBeNull();
    });

    it("retorna null para mês fora do ciclo (Fev)", () => {
      const rec = Recurrence.create({ ...BASE_REC, frequency: "quarterly", startDate: new Date("2026-01-01") });
      expect(generator.generateForMonth(rec, 2026, 2)).toBeNull();
    });

    it("gera em Jan 2027 (12 meses depois)", () => {
      const rec = Recurrence.create({ ...BASE_REC, frequency: "quarterly", startDate: new Date("2026-01-01") });
      expect(generator.generateForMonth(rec, 2027, 1)).not.toBeNull();
    });

    it("respeita startDate em Março → ciclo em Mar, Jun, Set, Dez", () => {
      const rec = Recurrence.create({ ...BASE_REC, frequency: "quarterly", startDate: new Date("2026-03-01") });
      expect(generator.generateForMonth(rec, 2026, 3)).not.toBeNull(); // Mar
      expect(generator.generateForMonth(rec, 2026, 6)).not.toBeNull(); // Jun
      expect(generator.generateForMonth(rec, 2026, 9)).not.toBeNull(); // Set
      expect(generator.generateForMonth(rec, 2026, 12)).not.toBeNull(); // Dez
      expect(generator.generateForMonth(rec, 2026, 4)).toBeNull();      // Abr — fora
    });
  });

  describe("annual frequency", () => {
    it("gera ocorrência no mês de início (Jan 2026)", () => {
      const rec = Recurrence.create({ ...BASE_REC, frequency: "annual", startDate: new Date("2026-01-01") });
      expect(generator.generateForMonth(rec, 2026, 1)).not.toBeNull();
    });

    it("gera ocorrência no mesmo mês no ano seguinte (Jan 2027)", () => {
      const rec = Recurrence.create({ ...BASE_REC, frequency: "annual", startDate: new Date("2026-01-01") });
      expect(generator.generateForMonth(rec, 2027, 1)).not.toBeNull();
    });

    it("retorna null para mês diferente do mês de início", () => {
      const rec = Recurrence.create({ ...BASE_REC, frequency: "annual", startDate: new Date("2026-01-01") });
      expect(generator.generateForMonth(rec, 2026, 2)).toBeNull();
      expect(generator.generateForMonth(rec, 2026, 6)).toBeNull();
    });

    it("respeita startDate em Setembro", () => {
      const rec = Recurrence.create({ ...BASE_REC, frequency: "annual", startDate: new Date("2026-09-01") });
      expect(generator.generateForMonth(rec, 2026, 9)).not.toBeNull();
      expect(generator.generateForMonth(rec, 2027, 9)).not.toBeNull();
      expect(generator.generateForMonth(rec, 2026, 8)).toBeNull();
    });
  });

  it("retorna null se startDate é depois do último dia do mês", () => {
    const rec = Recurrence.create({ ...BASE_REC, startDate: new Date("2026-10-01") });
    expect(generator.generateForMonth(rec, 2026, 9)).toBeNull();
  });

  it("gera ocorrência se startDate é no próprio mês", () => {
    const rec = Recurrence.create({ ...BASE_REC, startDate: new Date("2026-09-15") });
    expect(generator.generateForMonth(rec, 2026, 9)).not.toBeNull();
  });

  it("retorna null se endDate é antes do primeiro dia do mês", () => {
    const rec = Recurrence.create({ ...BASE_REC, endDate: new Date("2026-08-31") });
    expect(generator.generateForMonth(rec, 2026, 9)).toBeNull();
  });

  it("gera ocorrência se endDate é no próprio mês", () => {
    const rec = Recurrence.create({ ...BASE_REC, endDate: new Date("2026-09-10") });
    expect(generator.generateForMonth(rec, 2026, 9)).not.toBeNull();
  });

  describe("capping de dayOfMonth ao último dia do mês", () => {
    it("dia 31 em Fevereiro 2026 → dia 28", () => {
      const rec = Recurrence.create({ ...BASE_REC, dayOfMonth: 31 });
      const occ = generator.generateForMonth(rec, 2026, 2);
      expect(occ!.dueDate).toEqual(new Date(2026, 1, 28));
    });

    it("dia 31 em Abril → dia 30", () => {
      const rec = Recurrence.create({ ...BASE_REC, dayOfMonth: 31 });
      const occ = generator.generateForMonth(rec, 2026, 4);
      expect(occ!.dueDate).toEqual(new Date(2026, 3, 30));
    });

    it("dia 31 em Janeiro → dia 31", () => {
      const rec = Recurrence.create({ ...BASE_REC, dayOfMonth: 31 });
      const occ = generator.generateForMonth(rec, 2026, 1);
      expect(occ!.dueDate).toEqual(new Date(2026, 0, 31));
    });
  });

  it("toPeriod formata correctamente meses com zero à esquerda", () => {
    expect(generator.toPeriod(2026, 1)).toBe("2026-01");
    expect(generator.toPeriod(2026, 12)).toBe("2026-12");
  });
});
