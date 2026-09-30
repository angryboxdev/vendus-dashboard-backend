import { StockCountSession } from "../../domain/entities/stock-count-session.js";
import {
  CancellationReasonRequiredError,
  SessionAlreadyCompletedError,
  SessionHasPendingLinesError,
  SessionNotInDraftError,
} from "../../domain/errors.js";

function baseProps() {
  return {
    organizationId: "org-1",
    locationId: "loc-1",
    type: "general" as const,
    scopeDefinition: {},
    blindCount: true,
    businessDate: "2026-09-30",
  };
}

describe("StockCountSession.create", () => {
  it("começa sempre em draft, versão 1, sem materializar linhas", () => {
    const session = StockCountSession.create(baseProps());
    expect(session.status).toBe("draft");
    expect(session.version).toBe(1);
  });
});

describe("StockCountSession — transições de estado", () => {
  it("start() muda para counting e incrementa a versão", () => {
    const session = StockCountSession.create(baseProps());
    const started = session.start("manager@fonsat.pt");
    expect(started.status).toBe("counting");
    expect(started.version).toBe(2);
  });

  it("start() a partir de um estado que não é draft lança SessionNotInDraftError", () => {
    const session = StockCountSession.create(baseProps()).start("manager@fonsat.pt");
    expect(() => session.start("manager@fonsat.pt")).toThrow(SessionNotInDraftError);
  });

  it("finishExecution() exige que não haja linhas pendentes", () => {
    const session = StockCountSession.create(baseProps()).start("manager@fonsat.pt");
    expect(() => session.finishExecution(false, 3)).toThrow(SessionHasPendingLinesError);
    const finished = session.finishExecution(true, 0);
    expect(finished.status).toBe("reviewing");
  });

  it("markReady() exige que não haja linhas recount_required/not_counted", () => {
    const session = StockCountSession.create(baseProps()).start("m@fonsat.pt").finishExecution(true, 0);
    expect(() => session.markReady(false, 1)).toThrow(SessionHasPendingLinesError);
    const ready = session.markReady(true, 0);
    expect(ready.status).toBe("ready");
  });

  it("apply() só a partir de ready, terminal depois", () => {
    const session = StockCountSession.create(baseProps()).start("m@fonsat.pt").finishExecution(true, 0).markReady(true, 0);
    const applied = session.apply("admin@fonsat.pt");
    expect(applied.status).toBe("completed");
    expect(() => applied.cancel("motivo")).toThrow(SessionAlreadyCompletedError);
  });

  it("cancel() exige motivo e nunca apaga a sessão (soft state)", () => {
    const session = StockCountSession.create(baseProps());
    expect(() => session.cancel("")).toThrow(CancellationReasonRequiredError);
    const cancelled = session.cancel("Duplicada");
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.toProps().cancellationReason).toBe("Duplicada");
  });

  it("cancel() nunca é possível depois de completed", () => {
    const session = StockCountSession.create(baseProps()).start("m@fonsat.pt").finishExecution(true, 0).markReady(true, 0).apply("admin@fonsat.pt");
    expect(() => session.cancel("motivo")).toThrow(SessionAlreadyCompletedError);
  });
});
