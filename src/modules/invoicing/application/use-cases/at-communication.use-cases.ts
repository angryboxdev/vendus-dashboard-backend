import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { AT_USERNAME, type AtCommunicationView, type AtCredentials, type AtEnvironment, type AtQueueItem } from "../../domain/entities/at-communication.js";
import type { SeriesState } from "../../domain/entities/series.js";
import { AtBusyError, AtTransportError, InvoicingNotFoundError, InvoicingRuleError, InvoicingUnavailableError } from "../../domain/errors.js";
import type { AtCommunicationPort, AtProblem, AtStatus, CommunicateResult } from "../../domain/ports/in/at-communication.ports.js";
import type { AtCommunicationStorePort } from "../../domain/ports/out/at-communication-store.port.js";
import type { AtCredentialsPort } from "../../domain/ports/out/at-credentials.port.js";
import type { AtGatewayPort } from "../../domain/ports/out/at-gateway.port.js";
import type { ClockPort } from "../../domain/ports/out/clock.port.js";
import type { InvoicingStorePort } from "../../domain/ports/out/invoicing-store.port.js";
import type { IssuerDirectoryPort } from "../../domain/ports/out/issuer-directory.port.js";
import { nextAtAction, summarizeQueue } from "../../domain/services/at-queue.service.js";
import { cancelSeriesBody, finalizeSeriesBody, parseSeriesResponse, registerSeriesBody, type AtSeriesResponse } from "../../domain/services/at-series-message.service.js";
import { efaturaChangeStatusBody, efaturaRegisterBody, parseEfaturaResponse } from "../../domain/services/efatura-message.service.js";
import { sourceIdFor } from "../../domain/services/source-id.service.js";

export interface AtCommunicationDeps {
  store: InvoicingStorePort;
  at: AtCommunicationStorePort;
  credentials: AtCredentialsPort;
  /** null = certificado mTLS / chave pública da AT não configurados no servidor. */
  gateway: AtGatewayPort | null;
  environment: AtEnvironment;
  issuers: IssuerDirectoryPort;
  clock: ClockPort;
  certificateNumber: string | null;
}

/** Envios por execução (o resto fica para a seguinte). */
const BATCH = 100;
const QUEUE_PEEK = 1000;

export class AtCommunicationUseCases implements AtCommunicationPort {
  /** Organizações com uma comunicação em curso: o pedido manual e o cron nunca enviam em paralelo (uma só instância do servidor). */
  private readonly running = new Set<string>();

  constructor(private readonly deps: AtCommunicationDeps) {}

  async status(org: OrganizationId): Promise<AtStatus> {
    const { at, environment, credentials, clock, gateway } = this.deps;
    const [items, creds] = await Promise.all([at.queue(org, environment, QUEUE_PEEK), credentials.list(org, environment)]);
    const problems: AtProblem[] = items
      .filter((i): i is AtQueueItem & { lastOutcome: "rejected" | "auth" } => i.lastOutcome === "rejected" || i.lastOutcome === "auth")
      .slice(0, 50)
      .map((i) => ({ documentId: i.documentId, documentNumber: i.documentNumber, code: i.lastCode, message: i.lastMessage, outcome: i.lastOutcome }));
    return { configured: gateway !== null, environment, credentials: creds, queue: summarizeQueue(items, clock.now().date), problems };
  }

  async saveCredentials(org: OrganizationId, actor: string, legalEntityId: string, c: AtCredentials): Promise<void> {
    const creds = await this.checkedCredentials(org, legalEntityId, c);
    await this.deps.credentials.save(org, this.deps.environment, legalEntityId, creds, sourceIdFor(actor));
    await this.deps.store.recordEvent(org, { actor: sourceIdFor(actor), action: "at.credentials.saved", details: { legalEntityId, username: creds.username, environment: this.deps.environment } });
  }

  async removeCredentials(org: OrganizationId, actor: string, legalEntityId: string): Promise<void> {
    await this.deps.credentials.remove(org, this.deps.environment, legalEntityId);
    await this.deps.store.recordEvent(org, { actor: sourceIdFor(actor), action: "at.credentials.removed", details: { legalEntityId, environment: this.deps.environment } });
  }

  async communicatePending(org: OrganizationId, actor: string, opts: { force?: boolean } = {}): Promise<CommunicateResult> {
    const gateway = this.requireGateway();
    const key = `${org}:${this.deps.environment}`;
    if (this.running.has(key)) throw new AtBusyError();
    this.running.add(key);
    try {
      return await this.communicate(org, gateway, actor, opts);
    } finally {
      this.running.delete(key);
    }
  }

  private async communicate(org: OrganizationId, gateway: AtGatewayPort, actor: string, opts: { force?: boolean }): Promise<CommunicateResult> {
    const { at, store, credentials, environment } = this.deps;
    const result: CommunicateResult = { attempted: 0, accepted: 0, rejected: 0, failed: 0, withoutCredentials: 0 };
    const now = new Date(this.deps.clock.now().instant);
    const creds = new Map<string, (AtCredentials & { updatedAt: string }) | null>();
    /** Emitentes cujas credenciais a AT recusou nesta execução (não insistir). */
    const refused = new Set<string>();
    const who = sourceIdFor(actor);

    for (const item of await at.queue(org, environment, QUEUE_PEEK)) {
      if (result.attempted >= BATCH) break;
      if (refused.has(item.legalEntityId)) continue;
      if (!creds.has(item.legalEntityId)) creds.set(item.legalEntityId, await credentials.get(org, environment, item.legalEntityId));
      const c = creds.get(item.legalEntityId) ?? null;
      const operation = nextAtAction(item, now, { ...opts, credentialsUpdatedAt: c?.updatedAt ?? null });
      if (operation === null) continue;
      if (!c) {
        result.withoutCredentials++;
        continue;
      }
      const doc = await store.getDocument(org, item.documentId);
      if (!doc) continue;
      result.attempted++;
      const body = operation === "register" ? efaturaRegisterBody(doc) : efaturaChangeStatusBody(doc);
      let outcome;
      try {
        outcome = parseEfaturaResponse(await gateway.send("efatura", body, { username: c.username, password: c.password }));
      } catch (e) {
        if (!(e instanceof AtTransportError)) throw e;
        outcome = { outcome: "failed" as const, code: null, message: e.message };
      }
      await at.record(org, { documentId: doc.id, environment, operation, documentStatus: doc.status, outcome: outcome.outcome, code: outcome.code, message: outcome.message || null, actor: who });
      if (outcome.outcome === "accepted") result.accepted++;
      else if (outcome.outcome === "failed") result.failed++;
      else {
        result.rejected++;
        if (outcome.outcome === "auth") refused.add(item.legalEntityId);
      }
    }
    return result;
  }

  documentCommunications(org: OrganizationId, documentId: string): Promise<AtCommunicationView[]> {
    return this.deps.at.forDocument(org, documentId);
  }

  async registerSeries(org: OrganizationId, actor: string, seriesRef: string, c: AtCredentials): Promise<SeriesState> {
    const series = await this.series(org, seriesRef);
    if (series.validationCode !== null) throw new InvoicingRuleError("A série já tem código de validação da AT");
    const creds = await this.checkedCredentials(org, series.legalEntityId, c);
    const body = registerSeriesBody(series, { startDate: this.deps.clock.now().date, certificateNumber: this.deps.certificateNumber ?? "0" });
    const res = await this.callSeries(body, creds);
    const code = res.series.find((s) => s.seriesId === series.seriesId)?.validationCode ?? null;
    if (!code) throw new InvoicingRuleError(`A AT recusou o registo da série: ${res.message}${res.code !== null ? ` (código ${res.code})` : ""}`);
    await this.deps.store.setSeriesValidationCode(org, seriesRef, code.toUpperCase());
    await this.deps.store.recordEvent(org, { actor: sourceIdFor(actor), action: "at.series.registered", details: { seriesRef, seriesId: series.seriesId, documentType: series.documentType, environment: this.deps.environment } });
    return { ...series, validationCode: code.toUpperCase() };
  }

  async finalizeSeries(org: OrganizationId, actor: string, seriesRef: string, c: AtCredentials, justification?: string): Promise<void> {
    const series = await this.series(org, seriesRef);
    if (series.validationCode === null) throw new InvoicingRuleError("A série ainda não foi comunicada à AT");
    if (series.lastSequence === 0) throw new InvoicingRuleError("Série sem documentos: anule-a em vez de a finalizar");
    const creds = await this.checkedCredentials(org, series.legalEntityId, c);
    await this.changeSeries(org, actor, series, finalizeSeriesBody(series, justification?.trim() || undefined), creds, "F", "finalized");
  }

  async cancelSeries(org: OrganizationId, actor: string, seriesRef: string, c: AtCredentials): Promise<void> {
    const series = await this.series(org, seriesRef);
    if (series.validationCode === null) throw new InvoicingRuleError("A série ainda não foi comunicada à AT");
    if (series.lastSequence > 0) throw new InvoicingRuleError("Só se anula uma série sem documentos — finalize-a");
    const creds = await this.checkedCredentials(org, series.legalEntityId, c);
    await this.changeSeries(org, actor, series, cancelSeriesBody(series), creds, "N", "cancelled");
  }

  private async changeSeries(
    org: OrganizationId,
    actor: string,
    series: SeriesState,
    body: string,
    creds: AtCredentials,
    atStatus: "F" | "N",
    localStatus: "finalized" | "cancelled",
  ): Promise<void> {
    const res = await this.callSeries(body, creds);
    const info = res.series.find((s) => s.seriesId === series.seriesId);
    if (info?.status !== atStatus) throw new InvoicingRuleError(`A AT recusou a operação: ${res.message}${res.code !== null ? ` (código ${res.code})` : ""}`);
    await this.deps.at.setSeriesStatus(org, series.ref, localStatus);
    await this.deps.store.recordEvent(org, { actor: sourceIdFor(actor), action: `at.series.${localStatus}`, details: { seriesRef: series.ref, seriesId: series.seriesId, documentType: series.documentType, environment: this.deps.environment } });
  }

  private async callSeries(body: string, creds: AtCredentials): Promise<AtSeriesResponse> {
    const gateway = this.requireGateway();
    try {
      return parseSeriesResponse(await gateway.send("series", body, creds));
    } catch (e) {
      if (e instanceof AtTransportError) throw new InvoicingUnavailableError(`AT indisponível: ${e.message}`);
      throw e;
    }
  }

  private async series(org: OrganizationId, ref: string): Promise<SeriesState> {
    const s = await this.deps.store.getSeries(org, ref);
    if (!s) throw new InvoicingNotFoundError("Série");
    return s;
  }

  /** Subutilizador do NIF do emitente (`NIF/n.º`) e senha preenchida. */
  private async checkedCredentials(org: OrganizationId, legalEntityId: string, c: AtCredentials): Promise<AtCredentials> {
    const username = (c.username ?? "").trim();
    const m = AT_USERNAME.exec(username);
    if (!m) throw new InvoicingRuleError("Utilizador da AT no formato NIF/n.º do subutilizador (ex.: 599999999/1)");
    if (typeof c.password !== "string" || c.password.length === 0 || c.password.length > 128) throw new InvoicingRuleError("Senha do subutilizador em falta");
    const issuer = await this.deps.issuers.getIssuer(org, legalEntityId, { includeArchived: true });
    if (!issuer) throw new InvoicingNotFoundError("Emitente");
    if (m[1] !== issuer.taxId) throw new InvoicingRuleError("O subutilizador tem de ser do NIF do emitente");
    return { username, password: c.password };
  }

  private requireGateway(): AtGatewayPort {
    if (!this.deps.gateway) throw new InvoicingUnavailableError("Comunicação com a AT não configurada no servidor (certificado e chave pública da AT)");
    return this.deps.gateway;
  }
}
