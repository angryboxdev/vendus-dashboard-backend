import { Recurrence } from "../../domain/entities/recurrence.js";
import {
  RecurrenceClosedError,
  RecurrenceAlreadyPausedError,
  RecurrenceNotPausedError,
} from "../../domain/errors.js";

const BASE = {
  name: "Renda da loja",
  supplierName: "Proprietário Lda",
  type: "fixed_contract" as const,
  estimatedAmountCents: 120000,
  dayOfMonth: 5,
  startDate: new Date("2026-01-01"),
  paymentMethod: "transfer" as const,
};

describe("Recurrence.create", () => {
  it("cria recorrência activa com defaults correctos", () => {
    const r = Recurrence.create(BASE);

    expect(r.status).toBe("active");
    expect(r.frequency).toBe("monthly");
    expect(r.requireInvoice).toBe(false);
    expect(r.autoCreatePayable).toBe(false);
    expect(r.supplierId).toBeNull();
    expect(r.endDate).toBeNull();
    expect(r.id).toBeDefined();
  });

  it("força requireInvoice=true para variable_invoice", () => {
    const r = Recurrence.create({ ...BASE, type: "variable_invoice", requireInvoice: false });
    expect(r.requireInvoice).toBe(true);
    expect(r.autoCreatePayable).toBe(false);
  });

  it("força requireInvoice=true para fiscal", () => {
    const r = Recurrence.create({ ...BASE, type: "fiscal", requireInvoice: false });
    expect(r.requireInvoice).toBe(true);
  });

  it("força autoCreatePayable=false quando requireInvoice=true", () => {
    const r = Recurrence.create({ ...BASE, type: "variable_invoice", autoCreatePayable: true });
    expect(r.autoCreatePayable).toBe(false);
  });

  it("aceita autoCreatePayable=true para fixed_contract", () => {
    const r = Recurrence.create({ ...BASE, autoCreatePayable: true });
    expect(r.autoCreatePayable).toBe(true);
  });

  it("lança erro se nome estiver vazio", () => {
    expect(() => Recurrence.create({ ...BASE, name: "  " })).toThrow("Recurrence name is required");
  });

  it("lança erro se supplierName estiver vazio", () => {
    expect(() => Recurrence.create({ ...BASE, supplierName: "" })).toThrow("Supplier name is required");
  });

  it("lança erro se estimatedAmountCents <= 0", () => {
    expect(() => Recurrence.create({ ...BASE, estimatedAmountCents: 0 })).toThrow("estimatedAmountCents must be greater than zero");
  });

  it("lança erro se dayOfMonth fora de 1-31", () => {
    expect(() => Recurrence.create({ ...BASE, dayOfMonth: 0 })).toThrow("dayOfMonth must be between 1 and 31");
    expect(() => Recurrence.create({ ...BASE, dayOfMonth: 32 })).toThrow("dayOfMonth must be between 1 and 31");
  });

  it("lança erro se endDate anterior a startDate", () => {
    expect(() =>
      Recurrence.create({ ...BASE, endDate: new Date("2025-12-31") }),
    ).toThrow("endDate must be after startDate");
  });

  it("normaliza name e supplierName com trim", () => {
    const r = Recurrence.create({ ...BASE, name: "  Renda  ", supplierName: "  Prop  " });
    expect(r.name).toBe("Renda");
    expect(r.supplierName).toBe("Prop");
  });
});

describe("Recurrence.pause / resume / close", () => {
  it("pausa uma recorrência activa", () => {
    const r = Recurrence.create(BASE).pause();
    expect(r.status).toBe("paused");
  });

  it("retoma uma recorrência pausada", () => {
    const r = Recurrence.create(BASE).pause().resume();
    expect(r.status).toBe("active");
  });

  it("fecha uma recorrência activa", () => {
    const r = Recurrence.create(BASE).close();
    expect(r.status).toBe("closed");
  });

  it("fecha uma recorrência pausada", () => {
    const r = Recurrence.create(BASE).pause().close();
    expect(r.status).toBe("closed");
  });

  it("lança RecurrenceAlreadyPausedError ao pausar de novo", () => {
    const r = Recurrence.create(BASE).pause();
    expect(() => r.pause()).toThrow(RecurrenceAlreadyPausedError);
  });

  it("lança RecurrenceNotPausedError ao retomar activa", () => {
    expect(() => Recurrence.create(BASE).resume()).toThrow(RecurrenceNotPausedError);
  });

  it("lança RecurrenceClosedError ao pausar encerrada", () => {
    const r = Recurrence.create(BASE).close();
    expect(() => r.pause()).toThrow(RecurrenceClosedError);
  });

  it("lança RecurrenceClosedError ao fechar já encerrada", () => {
    const r = Recurrence.create(BASE).close();
    expect(() => r.close()).toThrow(RecurrenceClosedError);
  });
});

describe("Recurrence.update", () => {
  it("actualiza campos sem alterar outros", () => {
    const r = Recurrence.create(BASE).update({ estimatedAmountCents: 150000 });
    expect(r.estimatedAmountCents).toBe(150000);
    expect(r.name).toBe("Renda da loja");
  });

  it("lança erro ao editar recorrência encerrada", () => {
    const r = Recurrence.create(BASE).close();
    expect(() => r.update({ estimatedAmountCents: 150000 })).toThrow(RecurrenceClosedError);
  });

  it("lança erro se estimatedAmountCents <= 0 no update", () => {
    expect(() => Recurrence.create(BASE).update({ estimatedAmountCents: -1 })).toThrow("estimatedAmountCents must be greater than zero");
  });

  it("mantém requireInvoice=true para variable_invoice mesmo ao editar", () => {
    const r = Recurrence.create({ ...BASE, type: "variable_invoice" });
    const updated = r.update({ requireInvoice: false });
    expect(updated.requireInvoice).toBe(true);
  });
});

describe("Recurrence.isActiveAt", () => {
  it("retorna true quando recorrência está activa e dentro do período", () => {
    const r = Recurrence.create({ ...BASE, startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31") });
    expect(r.isActiveAt(new Date("2026-06-01"))).toBe(true);
  });

  it("retorna false quando pausada", () => {
    const r = Recurrence.create(BASE).pause();
    expect(r.isActiveAt(new Date("2026-06-01"))).toBe(false);
  });

  it("retorna false antes de startDate", () => {
    const r = Recurrence.create({ ...BASE, startDate: new Date("2026-06-01") });
    expect(r.isActiveAt(new Date("2026-05-31"))).toBe(false);
  });

  it("retorna false após endDate", () => {
    const r = Recurrence.create({ ...BASE, endDate: new Date("2026-06-30") });
    expect(r.isActiveAt(new Date("2026-07-01"))).toBe(false);
  });
});
