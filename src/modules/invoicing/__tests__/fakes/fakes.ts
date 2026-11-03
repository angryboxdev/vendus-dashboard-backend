import { dec, type Dec } from "../../../../kernel/money/decimal.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { IssuerSnapshot } from "../../domain/entities/parties.js";
import type { SeriesState } from "../../domain/entities/series.js";
import { InvoicingNotFoundError, StaleSeriesError } from "../../domain/errors.js";
import type { ClockPort, FiscalNow } from "../../domain/ports/out/clock.port.js";
import type {
  DocumentSummary,
  InvoicingStorePort,
  IssuedDocumentRecord,
  NewSeries,
  SeriesListItem,
  StoredDocument,
} from "../../domain/ports/out/invoicing-store.port.js";
import type { IssuerDirectoryPort } from "../../domain/ports/out/issuer-directory.port.js";
import type { DocumentSignature, SignerPort } from "../../domain/ports/out/signer.port.js";
import { add } from "../../domain/services/decimal-ops.js";

/** BD em memória com o mesmo compare-and-swap da função de emissão. */
export class FakeInvoicingStore implements InvoicingStorePort {
  series = new Map<string, SeriesState>();
  saved: IssuedDocumentRecord[] = [];
  summaries = new Map<string, DocumentSummary>();
  credited = new Map<string, Dec>();
  cancelled: Array<{ documentId: string; reason: string; actor: string }> = [];
  lastEntryAt: string | null = null;
  /** Simula outro terminal a emitir antes desta gravação (n vezes). */
  concurrentIssues = 0;

  async getSeries(_org: OrganizationId, ref: string) {
    const s = this.series.get(ref);
    return s ? { ...s } : null;
  }
  async listSeries(): Promise<SeriesListItem[]> {
    return [...this.series.values()].map((s) => ({ ...s, status: "active" as const, createdAt: "2027-01-01T00:00:00.000Z" }));
  }
  async createSeries(_org: OrganizationId, n: NewSeries): Promise<SeriesState> {
    const s: SeriesState = { ref: `s${this.series.size + 1}`, ...n, validationCode: null, lastSequence: 0, lastHash: null, lastDocumentDate: null, lastSystemEntryAt: null };
    this.series.set(s.ref, s);
    return s;
  }
  async setSeriesValidationCode(_org: OrganizationId, ref: string, code: string) {
    const s = this.series.get(ref);
    if (!s) throw new InvoicingNotFoundError("Série");
    this.series.set(ref, { ...s, validationCode: code });
  }
  async lastSystemEntryAt() {
    return this.lastEntryAt;
  }
  async documentsByIds(_org: OrganizationId, ids: string[]) {
    return ids.flatMap((id) => (this.summaries.has(id) ? [this.summaries.get(id)!] : []));
  }
  async creditedTotal(_org: OrganizationId, id: string) {
    return this.credited.get(id) ?? dec("0");
  }
  async getDocument(): Promise<StoredDocument | null> {
    return null;
  }
  async listDocuments() {
    return [...this.summaries.values()];
  }
  async saveIssued(_org: OrganizationId, r: IssuedDocumentRecord) {
    const s = this.series.get(r.seriesRef)!;
    if (this.concurrentIssues > 0) {
      this.concurrentIssues--;
      this.series.set(s.ref, { ...s, lastSequence: s.lastSequence + 1, lastHash: `outro-${s.lastSequence + 1}` });
      throw new StaleSeriesError(s.ref);
    }
    if (s.lastSequence !== r.expected.lastSequence || s.lastHash !== r.expected.lastHash) throw new StaleSeriesError(s.ref);
    this.series.set(s.ref, { ...s, lastSequence: r.sequence, lastHash: r.hash, lastDocumentDate: r.documentDate, lastSystemEntryAt: r.systemEntryAt });
    this.saved.push(r);
    return { documentId: `doc-${this.saved.length}` };
  }
  async cancel(_org: OrganizationId, documentId: string, reason: string, actor: string) {
    this.cancelled.push({ documentId, reason, actor });
  }
}

/** Assinatura determinística de 172 caracteres (o algoritmo real é testado no adapter). */
export class FakeSigner implements SignerPort {
  messages: string[] = [];
  async sign(message: string): Promise<DocumentSignature> {
    this.messages.push(message);
    const n = String(this.messages.length);
    return { hash: (n + "A".repeat(171)).slice(0, 171) + "=", keyVersion: 1 };
  }
}

export class FixedClock implements ClockPort {
  constructor(public value: FiscalNow) {}
  now() {
    return this.value;
  }
}

export const ISSUER: IssuerSnapshot = {
  taxId: "599999999",
  name: "Empresa Fictícia, Lda",
  address: { street: "Rua A, 1", postalCode: "4000-001", city: "Porto", country: "PT" },
};

export class FakeIssuers implements IssuerDirectoryPort {
  constructor(private readonly issuer: IssuerSnapshot | null = ISSUER) {}
  async getIssuer() {
    return this.issuer;
  }
}

export const sumDec = (values: Dec[]) => values.reduce(add, dec("0"));
