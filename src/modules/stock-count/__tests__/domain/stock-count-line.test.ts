import { StockCountLine } from "../../domain/entities/stock-count-line.js";
import { LineAlreadyResolvedError, ManualResolutionReasonRequiredError } from "../../domain/errors.js";

function baseProps() {
  return { organizationId: "org-1", sessionId: "session-1", itemId: "item-1" };
}

describe("StockCountLine.create", () => {
  it("começa sempre not_counted, sem tentativa selecionada", () => {
    const line = StockCountLine.create(baseProps());
    expect(line.status).toBe("not_counted");
    expect(line.toProps().finalCountedQuantity).toBeNull();
  });

  it("isUnscoped por defeito é false — 'item não previsto' marca explicitamente true", () => {
    const line = StockCountLine.create(baseProps());
    expect(line.isUnscoped).toBe(false);
    const unscoped = StockCountLine.create({ ...baseProps(), isUnscoped: true });
    expect(unscoped.isUnscoped).toBe(true);
  });
});

describe("StockCountLine.recordAttemptOutcome", () => {
  const input = {
    selectedAttemptId: "attempt-1",
    finalCountedQuantity: 10,
    finalSystemQuantity: 12,
    finalVariance: -2,
    variancePercent: 0.1667,
    varianceValue: null,
    toleranceSnapshot: null,
    movementsDuringCount: false,
    breachesTolerance: false,
  };

  it("sem movimento durante a contagem e dentro da tolerância → counted", () => {
    const line = StockCountLine.create(baseProps()).recordAttemptOutcome(input);
    expect(line.status).toBe("counted");
    expect(line.version).toBe(2);
  });

  it("movimento durante a contagem força recount_required incondicionalmente, mesmo dentro da tolerância", () => {
    const line = StockCountLine.create(baseProps()).recordAttemptOutcome({ ...input, movementsDuringCount: true, breachesTolerance: false });
    expect(line.status).toBe("recount_required");
  });

  it("fora da tolerância (sem movimento) também força recount_required", () => {
    const line = StockCountLine.create(baseProps()).recordAttemptOutcome({ ...input, movementsDuringCount: false, breachesTolerance: true });
    expect(line.status).toBe("recount_required");
  });

  it("nunca sobrescreve uma linha já resolvida", () => {
    const resolved = StockCountLine.create(baseProps()).resolveManually({
      manualAttemptId: "manual-1",
      value: 5,
      reason: "Contagem física confirmada com o gerente",
      finalVariance: 0,
      variancePercent: null,
      varianceValue: null,
    });
    expect(() => resolved.recordAttemptOutcome(input)).toThrow(LineAlreadyResolvedError);
  });
});

describe("StockCountLine.resolveManually", () => {
  it("exige motivo não vazio", () => {
    const line = StockCountLine.create(baseProps());
    expect(() =>
      line.resolveManually({ manualAttemptId: "m-1", value: 5, reason: "", finalVariance: 0, variancePercent: null, varianceValue: null }),
    ).toThrow(ManualResolutionReasonRequiredError);
  });

  it("com motivo, resolve a linha e nunca mais aceita outra resolução", () => {
    const line = StockCountLine.create(baseProps()).resolveManually({
      manualAttemptId: "m-1",
      value: 8,
      reason: "Valor acordado com o gerente após dupla verificação",
      finalVariance: -1,
      variancePercent: null,
      varianceValue: null,
    });
    expect(line.status).toBe("resolved");
    expect(line.toProps().finalCountedQuantity).toBe(8);
  });
});

describe("StockCountLine — lease (secção 51)", () => {
  it("isLockedByAnother é false para o mesmo ator, mesmo com lease ativo", () => {
    const line = StockCountLine.create(baseProps()).claimLease("ana@fonsat.pt", new Date("2026-09-30T10:00:00Z"));
    expect(line.isLockedByAnother("ana@fonsat.pt", new Date("2026-09-30T10:02:00Z"))).toBe(false);
  });

  it("isLockedByAnother é true para outro ator dentro da janela de 5 minutos", () => {
    const line = StockCountLine.create(baseProps()).claimLease("ana@fonsat.pt", new Date("2026-09-30T10:00:00Z"));
    expect(line.isLockedByAnother("bruno@fonsat.pt", new Date("2026-09-30T10:02:00Z"))).toBe(true);
  });

  it("lease expirado (> 5 min) é tratado como livre, sem limpeza explícita", () => {
    const line = StockCountLine.create(baseProps()).claimLease("ana@fonsat.pt", new Date("2026-09-30T10:00:00Z"));
    expect(line.isLockedByAnother("bruno@fonsat.pt", new Date("2026-09-30T10:06:00Z"))).toBe(false);
  });
});
