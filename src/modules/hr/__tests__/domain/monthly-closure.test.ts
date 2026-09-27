import { MonthlyClosure } from "../../domain/entities/monthly-closure.js";

describe("MonthlyClosure", () => {
  it("openDefault representa um período nunca fechado", () => {
    const closure = MonthlyClosure.openDefault("org-1", 2026, 9);
    expect(closure.isClosed).toBe(false);
    expect(closure.status).toBe("open");
  });

  it("close() regista quem fechou e quando, sem alterar year/month", () => {
    const closure = MonthlyClosure.openDefault("org-1", 2026, 9).close("gestor@angrybox.com", "2026-10-01T10:00:00Z");
    expect(closure.isClosed).toBe(true);
    expect(closure.closedBy).toBe("gestor@angrybox.com");
    expect(closure.closedAt).toBe("2026-10-01T10:00:00Z");
    expect(closure.year).toBe(2026);
    expect(closure.month).toBe(9);
  });

  it("reopen() volta a 'open' e preserva o motivo", () => {
    const closed = MonthlyClosure.openDefault("org-1", 2026, 9).close("gestor@angrybox.com", "2026-10-01T10:00:00Z");
    const reopened = closed.reopen("admin@angrybox.com", "Falta corrigir um turno", "2026-10-05T10:00:00Z");
    expect(reopened.isClosed).toBe(false);
    expect(reopened.reopenedBy).toBe("admin@angrybox.com");
    expect(reopened.reopenReason).toBe("Falta corrigir um turno");
    // O histórico de quem fechou anteriormente não é apagado.
    expect(reopened.closedBy).toBe("gestor@angrybox.com");
  });
});
