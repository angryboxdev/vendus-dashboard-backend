import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { AtCommunicationUseCases } from "../../application/use-cases/at-communication.use-cases.js";
import type { AtQueueItem } from "../../domain/entities/at-communication.js";
import type { SeriesState } from "../../domain/entities/series.js";
import { AtBusyError, InvoicingNotFoundError, InvoicingRuleError, InvoicingUnavailableError } from "../../domain/errors.js";
import { efaturaResponse, FakeAtCredentials, FakeAtGateway, FakeAtStore, seriesResponse } from "../fakes/at-fakes.js";
import { FakeInvoicingStore, FakeIssuers, FixedClock } from "../fakes/fakes.js";
import { storedDoc } from "../fixtures/stored-documents.js";

const ORG = mintOrganizationId("b6999cff-79b2-4583-b8b4-a744b3ace748");
const NOW = { systemEntryDate: "2027-03-10T12:00:00", date: "2027-03-10", instant: "2027-03-10T12:00:00.000Z" };
const USER = "a1b2c3d4-e5f6-4789-8abc-def012345678";
const WFA = { username: "599999999/37", password: "senha-ficticia" };

function setup(opts: { gateway?: FakeAtGateway | null } = {}) {
  const store = new FakeInvoicingStore();
  const at = new FakeAtStore();
  const credentials = new FakeAtCredentials();
  const gateway = opts.gateway === undefined ? new FakeAtGateway() : opts.gateway;
  const docs = new Map([["d1", storedDoc({ id: "d1" })], ["d2", storedDoc({ id: "d2", documentNumber: "FS L01-2027/2" })]]);
  store.getDocument = async (_o, id) => docs.get(id) ?? null;
  const uc = new AtCommunicationUseCases({ store, at, credentials, gateway, environment: "test", issuers: new FakeIssuers(), clock: new FixedClock(NOW), certificateNumber: null });
  return { uc, store, at, credentials, gateway, docs };
}

const queued = (over: Partial<AtQueueItem> = {}): AtQueueItem => ({
  documentId: "d1",
  legalEntityId: "le-1",
  documentNumber: "FS L01-2027/1",
  documentType: "FS",
  documentDate: "2027-03-10",
  status: "N",
  acceptedStatus: null,
  failures: 0,
  lastAttemptAt: null,
  lastOutcome: null,
  lastCode: null,
  lastMessage: null,
  ...over,
});

describe("credenciais WFA do emitente", () => {
  it("guarda o subutilizador do NIF do emitente e regista o evento (sem a senha)", async () => {
    const { uc, credentials, store } = setup();
    await uc.saveCredentials(ORG, USER, "le-1", { username: " 599999999/37 ", password: "senha-ficticia" });
    expect(credentials.stored.get("le-1")).toEqual({ username: "599999999/37", password: "senha-ficticia", actor: "a1b2c3d4e5f647898abcdef0123456" });
    expect(store.events).toEqual([{ actor: "a1b2c3d4e5f647898abcdef0123456", action: "at.credentials.saved", details: { legalEntityId: "le-1", username: "599999999/37", environment: "test" } }]);
    expect(JSON.stringify(store.events)).not.toContain("senha");
  });

  it("recusa formato errado, NIF de outro contribuinte e senha vazia", async () => {
    const { uc } = setup();
    await expect(uc.saveCredentials(ORG, USER, "le-1", { username: "admin", password: "x" })).rejects.toBeInstanceOf(InvoicingRuleError);
    await expect(uc.saveCredentials(ORG, USER, "le-1", { username: "500000000/1", password: "x" })).rejects.toThrow(/NIF do emitente/);
    await expect(uc.saveCredentials(ORG, USER, "le-1", { username: "599999999/1", password: "" })).rejects.toThrow(/Senha/);
  });

  it("emitente inexistente → não encontrado", async () => {
    const { store, at, credentials } = setup();
    const uc = new AtCommunicationUseCases({ store, at, credentials, gateway: null, environment: "test", issuers: new FakeIssuers(null), clock: new FixedClock(NOW), certificateNumber: null });
    await expect(uc.saveCredentials(ORG, USER, "le-x", WFA)).rejects.toBeInstanceOf(InvoicingNotFoundError);
  });
});

describe("comunicar ao e-Fatura", () => {
  it("regista o que falta com as credenciais do emitente e guarda cada resposta", async () => {
    const { uc, at, credentials, gateway } = setup();
    credentials.stored.set("le-1", { ...WFA, actor: "x" });
    at.items = [queued(), queued({ documentId: "d2", documentNumber: "FS L01-2027/2" })];
    gateway!.responses = [efaturaResponse(0, "Registado"), efaturaResponse(-3, "Valores diferentes")];

    const r = await uc.communicatePending(ORG, USER);

    expect(r).toEqual({ attempted: 2, accepted: 1, rejected: 1, failed: 0, withoutCredentials: 0 });
    expect(gateway!.sent.map((s) => s.service)).toEqual(["efatura", "efatura"]);
    expect(gateway!.sent[0]!.body).toContain("<doc:RegisterInvoiceRequest");
    expect(gateway!.sent[0]!.credentials).toEqual(WFA);
    expect(at.records.map((x) => [x.documentId, x.operation, x.outcome, x.code])).toEqual([
      ["d1", "register", "accepted", 0],
      ["d2", "register", "rejected", -3],
    ]);
  });

  it("documento anulado depois de aceite → ChangeInvoiceStatus", async () => {
    const { uc, at, credentials, gateway, docs } = setup();
    credentials.stored.set("le-1", { ...WFA, actor: "x" });
    docs.set("d1", storedDoc({ id: "d1", status: "A", statusEntryDate: "2027-03-10T13:00:00" }));
    at.items = [queued({ status: "A", acceptedStatus: "N" })];
    gateway!.responses = [efaturaResponse(0)];
    await uc.communicatePending(ORG, USER);
    expect(gateway!.sent[0]!.body).toContain("<doc:ChangeInvoiceStatusRequest");
    expect(at.records[0]).toMatchObject({ operation: "change-status", documentStatus: "A", outcome: "accepted" });
  });

  it("sem credenciais do emitente: fica na fila sem enviar", async () => {
    const { uc, at, gateway } = setup();
    at.items = [queued()];
    expect(await uc.communicatePending(ORG, USER)).toMatchObject({ attempted: 0, withoutCredentials: 1 });
    expect(gateway!.sent).toHaveLength(0);
  });

  it("credenciais recusadas: não insiste nos outros documentos do mesmo emitente", async () => {
    const { uc, at, credentials, gateway } = setup();
    credentials.stored.set("le-1", { ...WFA, actor: "x" });
    at.items = [queued(), queued({ documentId: "d2" })];
    gateway!.responses = [efaturaResponse(99, "Senha errada")];
    expect(await uc.communicatePending(ORG, USER)).toMatchObject({ attempted: 1, rejected: 1 });
    expect(at.records[0]).toMatchObject({ outcome: "auth", code: 99 });
  });

  it("AT em baixo: regista a falha e volta a tentar depois do intervalo", async () => {
    const { uc, at, credentials, gateway } = setup();
    credentials.stored.set("le-1", { ...WFA, actor: "x" });
    at.items = [queued()];
    gateway!.responses = [new Error("ECONNRESET")];
    expect(await uc.communicatePending(ORG, USER)).toMatchObject({ attempted: 1, failed: 1 });
    expect(at.records[0]).toMatchObject({ outcome: "failed", code: null, message: "ECONNRESET" });
    // Logo a seguir (mesmo instante) não repete: espera 5 min.
    expect(await uc.communicatePending(ORG, USER)).toMatchObject({ attempted: 0 });
  });

  it("recusados só se repetem quando o utilizador força", async () => {
    const { uc, at, credentials, gateway } = setup();
    credentials.stored.set("le-1", { ...WFA, actor: "x" });
    at.items = [queued({ lastOutcome: "rejected", lastCode: -3 })];
    expect(await uc.communicatePending(ORG, USER)).toMatchObject({ attempted: 0 });
    gateway!.responses = [efaturaResponse(-10, "Já registado")];
    expect(await uc.communicatePending(ORG, USER, { force: true })).toMatchObject({ attempted: 1, accepted: 1 });
  });

  it("credenciais regravadas depois da recusa → volta a tentar", async () => {
    const { uc, at, credentials, gateway } = setup();
    at.items = [queued({ lastOutcome: "auth", lastCode: 99, lastAttemptAt: "2027-03-10T11:00:00Z" })];
    credentials.stored.set("le-1", { ...WFA, actor: "x", updatedAt: "2027-03-09T00:00:00Z" });
    expect(await uc.communicatePending(ORG, USER, { force: true })).toMatchObject({ attempted: 0 });
    credentials.stored.set("le-1", { ...WFA, actor: "x", updatedAt: "2027-03-10T11:30:00Z" });
    gateway!.responses = [efaturaResponse(0)];
    expect(await uc.communicatePending(ORG, USER)).toMatchObject({ attempted: 1, accepted: 1 });
  });

  it("duas comunicações em simultâneo na mesma organização: a segunda é recusada (sem envios em duplicado)", async () => {
    const { uc, at, credentials, gateway } = setup();
    credentials.stored.set("le-1", { ...WFA, actor: "x" });
    at.items = [queued()];
    let release!: (v: string) => void;
    gateway!.send = (service, body, c) => (gateway!.sent.push({ service, body, credentials: c }), new Promise<string>((r) => (release = r)));
    const first = uc.communicatePending(ORG, USER);
    await new Promise((r) => setImmediate(r));
    await expect(uc.communicatePending(ORG, USER)).rejects.toBeInstanceOf(AtBusyError);
    release(efaturaResponse(0));
    expect(await first).toMatchObject({ attempted: 1, accepted: 1 });
    expect(gateway!.sent).toHaveLength(1);
  });

  it("sem certificado configurado → indisponível", async () => {
    const { uc } = setup({ gateway: null });
    await expect(uc.communicatePending(ORG, USER)).rejects.toBeInstanceOf(InvoicingUnavailableError);
  });

  it("estado: pendentes, prazo e recusas para corrigir", async () => {
    const { uc, at } = setup();
    at.items = [queued({ documentDate: "2027-02-28", lastOutcome: "rejected", lastCode: -8, lastMessage: "Código de isenção inválido" }), queued({ documentId: "d2" })];
    const s = await uc.status(ORG);
    expect(s).toMatchObject({ configured: true, environment: "test", queue: { pending: 2, blocked: 1, deadline: "2027-03-05", overdue: true } });
    expect(s.problems).toEqual([{ documentId: "d1", documentNumber: "FS L01-2027/1", code: -8, message: "Código de isenção inválido", outcome: "rejected" }]);
  });
});

describe("séries na AT (credenciais WSE no momento, nunca guardadas)", () => {
  const S: SeriesState = { ref: "s1", legalEntityId: "le-1", locationId: null, documentType: "FS", seriesId: "L01-2027", mode: "training", validationCode: null, lastSequence: 0, lastHash: null, lastDocumentDate: null, lastSystemEntryAt: null };
  const WSE = { username: "599999999/2", password: "outra-senha" };

  it("registar: guarda o código de validação devolvido e não guarda as credenciais", async () => {
    const { uc, store, gateway, credentials } = setup();
    store.series.set("s1", { ...S });
    gateway!.responses = [seriesResponse({ seriesId: "L01-2027", code: "aajfj4vd" })];
    const out = await uc.registerSeries(ORG, USER, "s1", WSE);
    expect(out.validationCode).toBe("AAJFJ4VD");
    expect(store.series.get("s1")!.validationCode).toBe("AAJFJ4VD");
    expect(gateway!.sent[0]).toMatchObject({ service: "series", credentials: WSE });
    expect(gateway!.sent[0]!.body).toContain("<dataInicioPrevUtiliz>2027-03-10</dataInicioPrevUtiliz>");
    expect(credentials.stored.size).toBe(0);
    expect(store.events.map((e) => e.action)).toEqual(["at.series.registered"]);
  });

  it("registar: recusa da AT vira erro com a mensagem e o código", async () => {
    const { uc, store, gateway } = setup();
    store.series.set("s1", { ...S });
    gateway!.responses = [seriesResponse(null, { code: 4049, msg: "Data de início inválida" })];
    await expect(uc.registerSeries(ORG, USER, "s1", WSE)).rejects.toThrow("A AT recusou o registo da série: Data de início inválida (código 4049)");
    expect(store.series.get("s1")!.validationCode).toBeNull();
  });

  it("registar uma série que já tem código → recusado antes de chamar a AT", async () => {
    const { uc, store, gateway } = setup();
    store.series.set("s1", { ...S, validationCode: "ABCD1234" });
    await expect(uc.registerSeries(ORG, USER, "s1", WSE)).rejects.toBeInstanceOf(InvoicingRuleError);
    expect(gateway!.sent).toHaveLength(0);
  });

  it("finalizar: só com documentos; a série local fica finalizada quando a AT confirma (estado F)", async () => {
    const { uc, store, at, gateway } = setup();
    store.series.set("s1", { ...S, validationCode: "ABCD1234", lastSequence: 0 });
    await expect(uc.finalizeSeries(ORG, USER, "s1", WSE)).rejects.toThrow(/anule-a/);
    store.series.set("s1", { ...S, validationCode: "ABCD1234", lastSequence: 7 });
    gateway!.responses = [seriesResponse({ seriesId: "L01-2027", status: "F" })];
    await uc.finalizeSeries(ORG, USER, "s1", WSE, "Fim do ano");
    expect(gateway!.sent[0]!.body).toContain("<seqUltimoDocEmitido>7</seqUltimoDocEmitido>");
    expect(at.seriesStatus.get("s1")).toBe("finalized");
  });

  it("anular: só sem documentos; sem confirmação da AT a série local fica ativa", async () => {
    const { uc, store, at, gateway } = setup();
    store.series.set("s1", { ...S, validationCode: "ABCD1234", lastSequence: 3 });
    await expect(uc.cancelSeries(ORG, USER, "s1", WSE)).rejects.toThrow(/finalize-a/);
    store.series.set("s1", { ...S, validationCode: "ABCD1234" });
    gateway!.responses = [seriesResponse({ seriesId: "L01-2027", status: "A" }, { code: 4001, msg: "Série já utilizada" })];
    await expect(uc.cancelSeries(ORG, USER, "s1", WSE)).rejects.toThrow(/Série já utilizada/);
    expect(at.seriesStatus.size).toBe(0);
  });

  it("AT indisponível → erro de indisponibilidade (503)", async () => {
    const { uc, store, gateway } = setup();
    store.series.set("s1", { ...S });
    gateway!.responses = [new Error("tempo esgotado")];
    await expect(uc.registerSeries(ORG, USER, "s1", WSE)).rejects.toThrow("AT indisponível: tempo esgotado");
  });
});
