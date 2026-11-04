import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { AtCommunicationRecord, AtCommunicationView, AtCredentials, AtEnvironment, AtQueueItem } from "../../domain/entities/at-communication.js";
import { AtTransportError } from "../../domain/errors.js";
import type { AtCommunicationStorePort } from "../../domain/ports/out/at-communication-store.port.js";
import type { AtCredentialsPort, AtCredentialsSummary } from "../../domain/ports/out/at-credentials.port.js";
import type { AtGatewayPort, AtService } from "../../domain/ports/out/at-gateway.port.js";

/** Fila em memória: um item por documento; `record` atualiza-o como a função da BD. */
export class FakeAtStore implements AtCommunicationStorePort {
  items: AtQueueItem[] = [];
  records: AtCommunicationRecord[] = [];
  seriesStatus = new Map<string, "finalized" | "cancelled">();

  async queue(_org: OrganizationId, _env: AtEnvironment, limit: number) {
    return this.items.filter((i) => i.acceptedStatus !== i.status).slice(0, limit);
  }
  async record(_org: OrganizationId, r: AtCommunicationRecord) {
    this.records.push(r);
    const i = this.items.find((x) => x.documentId === r.documentId);
    if (!i) return;
    if (r.outcome === "accepted") Object.assign(i, { acceptedStatus: r.documentStatus, failures: 0 });
    else i.failures++;
    Object.assign(i, { lastOutcome: r.outcome, lastCode: r.code, lastMessage: r.message, lastAttemptAt: "2027-03-10T12:00:00.000Z" });
  }
  async forDocument(_org: OrganizationId, documentId: string): Promise<AtCommunicationView[]> {
    return this.records.filter((r) => r.documentId === documentId).map((r) => ({ ...r, createdAt: "2027-03-10T12:00:00.000Z" }));
  }
  async setSeriesStatus(_org: OrganizationId, ref: string, status: "finalized" | "cancelled") {
    this.seriesStatus.set(ref, status);
  }
}

export class FakeAtCredentials implements AtCredentialsPort {
  stored = new Map<string, AtCredentials & { actor: string; updatedAt?: string }>();
  async list(): Promise<AtCredentialsSummary[]> {
    return [...this.stored.entries()].map(([legalEntityId, c]) => ({ legalEntityId, username: c.username, updatedAt: "2027-03-01T00:00:00.000Z" }));
  }
  async get(_org: OrganizationId, _env: AtEnvironment, legalEntityId: string) {
    const c = this.stored.get(legalEntityId);
    return c ? { username: c.username, password: c.password, updatedAt: c.updatedAt ?? "2027-03-01T00:00:00.000Z" } : null;
  }
  async save(_org: OrganizationId, _env: AtEnvironment, legalEntityId: string, c: AtCredentials, actor: string) {
    this.stored.set(legalEntityId, { ...c, actor });
  }
  async remove(_org: OrganizationId, _env: AtEnvironment, legalEntityId: string) {
    this.stored.delete(legalEntityId);
  }
}

/** Responde pela ordem de `responses` (XML, ou Error → falha de ligação) e guarda o que foi enviado. */
export class FakeAtGateway implements AtGatewayPort {
  sent: Array<{ service: AtService; body: string; credentials: AtCredentials }> = [];
  constructor(public responses: Array<string | Error> = []) {}
  async send(service: AtService, body: string, credentials: AtCredentials) {
    this.sent.push({ service, body, credentials });
    const next = this.responses.shift();
    if (next === undefined) throw new Error("FakeAtGateway: sem resposta preparada");
    if (next instanceof Error) throw new AtTransportError(next.message);
    return next;
  }
}

export const efaturaResponse = (code: number, msg = "Mensagem da AT") =>
  `<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/"><S:Body><ns2:RegisterInvoiceResponse xmlns:ns2="http://factemi.at.min_financas.pt/documents"><ns2:Response><ns2:CodigoResposta>${code}</ns2:CodigoResposta><ns2:Mensagem>${msg}</ns2:Mensagem><ns2:DataOperacao>2027-03-10T12:00:05</ns2:DataOperacao></ns2:Response></ns2:RegisterInvoiceResponse></S:Body></S:Envelope>`;

export const seriesResponse = (info: { seriesId: string; code?: string; status?: string } | null, result = { code: 2001, msg: "Operação efetuada com sucesso." }) =>
  `<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/"><S:Body><ns2:resp xmlns:ns2="http://at.gov.pt/"><r>` +
  (info
    ? `<infoSerie><serie>${info.seriesId}</serie><tipoDoc>FS</tipoDoc>${info.code ? `<codValidacaoSerie>${info.code}</codValidacaoSerie>` : ""}<estado>${info.status ?? "A"}</estado></infoSerie>`
    : "") +
  `<infoResultOper><codResultOper>${result.code}</codResultOper><msgResultOper>${result.msg}</msgResultOper></infoResultOper></r></ns2:resp></S:Body></S:Envelope>`;
