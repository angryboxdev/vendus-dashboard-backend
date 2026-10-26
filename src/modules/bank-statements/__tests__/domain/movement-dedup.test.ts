import { describe, it, expect } from "@jest/globals";
import { selectNewMovements } from "../../domain/services/movement-dedup.service.js";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const m = (date: string, amount: number, balanceAfter: number, description = "CREDITO TPA") => ({ bookingDate: d(date), amount, movementType: "credit" as const, balanceAfter, description });

describe("selectNewMovements", () => {
  it("um-para-um: dois movimentos iguais no mesmo dia, um já gravado → só o outro é novo", () => {
    const r = selectNewMovements([m("2026-09-01", 100, 1_100), m("2026-09-01", 100, 1_200)], [m("2026-09-01", 100, 1_100)], true);
    expect(r.duplicates).toBe(1);
    expect(r.fresh.map((x) => x.balanceAfter)).toEqual([1_200]);
  });

  it("primeiro pelo saldo, só depois pela descrição (um movimento sem par pelo saldo não «rouba» o de outro)", () => {
    const existing = [m("2026-09-01", 100, 1_100, "TPA")];
    const r = selectNewMovements([m("2026-09-01", 100, 1_200, "TPA"), m("2026-09-01", 100, 1_100, "TPA")], existing, true);
    expect(r.fresh.map((x) => x.balanceAfter)).toEqual([1_200]);
  });

  it("sem saldos fiáveis compara pela descrição normalizada (espaços e maiúsculas)", () => {
    const r = selectNewMovements([m("2026-09-01", 100, 0, "trf  p/ fornecedor")], [m("2026-09-01", 100, 999, "TRF P/ FORNECEDOR")], false);
    expect(r.duplicates).toBe(1);
  });

  it("valor, tipo ou data diferentes nunca são duplicados", () => {
    const r = selectNewMovements([m("2026-09-02", 100, 1_100), m("2026-09-01", 101, 1_100)], [m("2026-09-01", 100, 1_100)], true);
    expect(r.fresh).toHaveLength(2);
  });
});
