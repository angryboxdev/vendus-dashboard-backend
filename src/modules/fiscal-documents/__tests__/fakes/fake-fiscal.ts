import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { FiscalIdentity, FiscalKey } from "../../domain/entities/fiscal-identity.js";
import { FiscalKeyTakenError, type FiscalAuditPort, type FiscalIdentityRepositoryPort, type NewFiscalIdentity } from "../../domain/ports/out/fiscal-identity.ports.js";

const keyOf = (k: FiscalKey) => `${k.buyerKey}|${k.issuerCountry}|${k.issuerTaxId}|${k.documentType}|${k.seriesNumberNorm}`;

/** Repositório em memória com as MESMAS regras de unicidade da base de dados (chave, fatura, importação). */
export class FakeFiscalRepo implements FiscalIdentityRepositoryPort {
  rows: (FiscalIdentity & { org: string })[] = [];
  private seq = 0;

  private of(org: OrganizationId) {
    return this.rows.filter((r) => r.org === org);
  }
  async findByKey(org: OrganizationId, key: FiscalKey) {
    return this.of(org).find((r) => keyOf(r) === keyOf(key)) ?? null;
  }
  async insertIfAbsent(org: OrganizationId, row: NewFiscalIdentity) {
    // "await" entre ler e escrever: simula a janela de corrida que a BD resolve com o índice único.
    await Promise.resolve();
    const clash = this.of(org).find((r) => keyOf(r) === keyOf(row) || (row.invoiceId && r.invoiceId === row.invoiceId) || (row.stockImportId && r.stockImportId === row.stockImportId));
    if (clash) return { identity: clash, created: false };
    const identity = { ...row, org, id: `fid-${++this.seq}`, createdAt: new Date(2026, 9, 14, 0, 0, this.seq).toISOString() };
    this.rows.push(identity);
    return { identity, created: true };
  }
  async findSimilar(org: OrganizationId, key: FiscalKey, digits: string) {
    return this.of(org).filter((r) => r.buyerKey === key.buyerKey && r.issuerCountry === key.issuerCountry && r.issuerTaxId === key.issuerTaxId && r.documentType === key.documentType && r.numberDigits === digits && r.seriesNumberNorm !== key.seriesNumberNorm);
  }
  async findByInvoice(org: OrganizationId, invoiceId: string) {
    return this.of(org).find((r) => r.invoiceId === invoiceId) ?? null;
  }
  async findByStockImport(org: OrganizationId, id: string) {
    return this.of(org).find((r) => r.stockImportId === id) ?? null;
  }
  async link(org: OrganizationId, id: string, link: { invoiceId?: string; stockImportId?: string }) {
    const r = this.of(org).find((x) => x.id === id)!;
    if ((link.invoiceId && r.invoiceId) || (link.stockImportId && r.stockImportId)) throw new Error("já ligada");
    Object.assign(r, link);
    return r;
  }
  async rekey(org: OrganizationId, id: string, row: Pick<NewFiscalIdentity, keyof FiscalKey | "seriesNumber" | "numberDigits" | "atcud" | "legalEntityId">) {
    const other = this.of(org).find((x) => x.id !== id && keyOf(x) === keyOf(row));
    if (other) throw new FiscalKeyTakenError(other);
    const r = this.of(org).find((x) => x.id === id)!;
    Object.assign(r, row);
    return r;
  }
  async removeForDeletedInvoice(org: OrganizationId, invoiceId: string) {
    this.rows = this.rows.filter((r) => !(r.org === org && r.invoiceId === invoiceId && !r.stockImportId));
  }
}

export class FakeFiscalAudit implements FiscalAuditPort {
  entries: { action: string; origin: string }[] = [];
  async record(_o: OrganizationId, e: { action: string; origin: string }) {
    this.entries.push({ action: e.action, origin: e.origin });
  }
}
