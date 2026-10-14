import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { BackfillReport, ClaimOptions, ClaimResult, FiscalIdentity, FiscalIdentityInput, FiscalKey, FiscalOrigin, HistoricalDocument, IdentityResolution } from "../../domain/entities/fiscal-identity.js";
export type { BackfillReport, ClaimOptions, ClaimResult, HistoricalDocument } from "../../domain/entities/fiscal-identity.js";
import { FiscalKeyTakenError, type FiscalAuditPort, type FiscalIdentityRepositoryPort, type NewFiscalIdentity } from "../../domain/ports/out/fiscal-identity.ports.js";
import { fiscalKeyOf, numberDigits } from "../../domain/services/fiscal-key.service.js";

const keyString = (k: FiscalKey) => `${k.buyerKey}|${k.issuerCountry}|${k.issuerTaxId}|${k.documentType}|${k.seriesNumberNorm}`;

/**
 * Identidade fiscal partilhada (task v1.2 §1.2): uma verificação central no
 * backend para o Financeiro e o Stock. Nunca funde nem apaga documentos:
 * recusa a cópia e indica o original; possíveis duplicados vão para
 * comparação manual.
 */
export class FiscalDocumentsUseCases {
  constructor(
    private readonly repo: FiscalIdentityRepositoryPort,
    private readonly audit: FiscalAuditPort,
  ) {}

  /** Só leitura: como ficaria este documento (para avisar na importação). */
  async resolve(org: OrganizationId, input: FiscalIdentityInput): Promise<IdentityResolution> {
    const k = fiscalKeyOf(input);
    if ("missing" in k) return { kind: "incomplete", missing: k.missing };
    const found = await this.repo.findByKey(org, k.key);
    if (found) return found.invoiceId ? { kind: "existing_finance", identity: found } : { kind: "existing_stock_only", identity: found };
    const similar = await this.repo.findSimilar(org, k.key, numberDigits(k.key.seriesNumberNorm));
    if (similar.length) return { kind: "possible_duplicate", key: k.key, candidates: similar };
    return { kind: "new", key: k.key };
  }

  private row(input: FiscalIdentityInput, key: FiscalKey, origin: FiscalOrigin, link: { invoiceId?: string; stockImportId?: string }, actor: string): NewFiscalIdentity {
    return {
      ...key,
      legalEntityId: input.buyerLegalEntityId,
      seriesNumber: input.seriesNumber!.trim(),
      numberDigits: numberDigits(key.seriesNumberNorm),
      atcud: input.atcud?.trim() || null,
      firstOrigin: origin,
      invoiceId: link.invoiceId ?? null,
      stockImportId: link.stockImportId ?? null,
      createdBy: actor,
    };
  }

  /**
   * Reserva a identidade para uma fatura do Financeiro. Idempotente (a mesma
   * fatura volta a receber a mesma identidade) e seguro com pedidos
   * simultâneos (a base de dados decide quem fica com a chave).
   */
  async claimForInvoice(org: OrganizationId, actor: string, input: FiscalIdentityInput, invoiceId: string, opts: ClaimOptions = {}): Promise<ClaimResult> {
    const k = fiscalKeyOf(input);
    if ("missing" in k) return { ok: false, resolution: { kind: "incomplete", missing: k.missing } };
    const mine = await this.repo.findByInvoice(org, invoiceId);
    if (mine) {
      if (keyString(mine) === keyString(k.key)) return { ok: true, identity: mine, linkedToStock: !!mine.stockImportId };
      // Correção da identidade (ex.: número mal lido): a nova chave não pode pertencer a outro documento.
      try {
        const updated = await this.repo.rekey(org, mine.id, { ...k.key, seriesNumber: input.seriesNumber!.trim(), numberDigits: numberDigits(k.key.seriesNumberNorm), atcud: input.atcud?.trim() || null, legalEntityId: input.buyerLegalEntityId });
        await this.audit.record(org, { actor, action: "fiscal_identity.rekey", identityId: mine.id, before: mine, after: updated, origin: "finance" });
        return { ok: true, identity: updated, linkedToStock: !!updated.stockImportId };
      } catch (e) {
        if (e instanceof FiscalKeyTakenError) return { ok: false, resolution: e.existing.invoiceId ? { kind: "existing_finance", identity: e.existing } : { kind: "existing_stock_only", identity: e.existing } };
        throw e;
      }
    }
    const existing = await this.repo.findByKey(org, k.key);
    if (existing) return this.onExisting(org, actor, existing, invoiceId, opts);
    if (!opts.notADuplicate) {
      const similar = await this.repo.findSimilar(org, k.key, numberDigits(k.key.seriesNumberNorm));
      if (similar.length) return { ok: false, resolution: { kind: "possible_duplicate", key: k.key, candidates: similar } };
    }
    const { identity, created } = await this.repo.insertIfAbsent(org, this.row(input, k.key, "finance", { invoiceId }, actor));
    if (!created) return this.onExisting(org, actor, identity, invoiceId, opts);
    await this.audit.record(org, { actor, action: "fiscal_identity.create", identityId: identity.id, before: null, after: identity, origin: "finance" });
    return { ok: true, identity, linkedToStock: false };
  }

  private async onExisting(org: OrganizationId, actor: string, existing: FiscalIdentity, invoiceId: string, opts: ClaimOptions): Promise<ClaimResult> {
    if (existing.invoiceId === invoiceId) return { ok: true, identity: existing, linkedToStock: !!existing.stockImportId };
    if (existing.invoiceId) return { ok: false, resolution: { kind: "existing_finance", identity: existing } };
    // Só no Stock: completar o lançamento existente apenas por escolha explícita.
    if (opts.completeStockIdentityId !== existing.id) return { ok: false, resolution: { kind: "existing_stock_only", identity: existing } };
    const linked = await this.repo.link(org, existing.id, { invoiceId });
    await this.audit.record(org, { actor, action: "fiscal_identity.complete_from_stock", identityId: existing.id, before: existing, after: linked, origin: "finance" });
    return { ok: true, identity: linked, linkedToStock: true };
  }

  /** Reserva a identidade para uma importação feita no Stock. Documento já lançado no Financeiro → recusa. */
  async claimForStockImport(org: OrganizationId, actor: string, input: FiscalIdentityInput, stockImportId: string, opts: Pick<ClaimOptions, "notADuplicate"> = {}): Promise<ClaimResult> {
    const k = fiscalKeyOf(input);
    if ("missing" in k) return { ok: false, resolution: { kind: "incomplete", missing: k.missing } };
    const mine = await this.repo.findByStockImport(org, stockImportId);
    if (mine) return keyString(mine) === keyString(k.key) ? { ok: true, identity: mine, linkedToStock: true } : { ok: false, resolution: mine.invoiceId ? { kind: "existing_finance", identity: mine } : { kind: "existing_stock_only", identity: mine } };
    const existing = await this.repo.findByKey(org, k.key);
    if (existing) return { ok: false, resolution: existing.invoiceId ? { kind: "existing_finance", identity: existing } : { kind: "existing_stock_only", identity: existing } };
    if (!opts.notADuplicate) {
      const similar = await this.repo.findSimilar(org, k.key, numberDigits(k.key.seriesNumberNorm));
      if (similar.length) return { ok: false, resolution: { kind: "possible_duplicate", key: k.key, candidates: similar } };
    }
    const { identity, created } = await this.repo.insertIfAbsent(org, this.row(input, k.key, "stock", { stockImportId }, actor));
    if (!created) return identity.stockImportId === stockImportId ? { ok: true, identity, linkedToStock: true } : { ok: false, resolution: identity.invoiceId ? { kind: "existing_finance", identity } : { kind: "existing_stock_only", identity } };
    await this.audit.record(org, { actor, action: "fiscal_identity.create", identityId: identity.id, before: null, after: identity, origin: "stock" });
    return { ok: true, identity, linkedToStock: true };
  }

  /** Fatura apagada: liberta a chave só se o documento nunca chegou ao Stock. */
  async releaseInvoice(org: OrganizationId, actor: string, invoiceId: string): Promise<void> {
    const mine = await this.repo.findByInvoice(org, invoiceId);
    if (!mine || mine.stockImportId) return;
    await this.repo.removeForDeletedInvoice(org, invoiceId);
    await this.audit.record(org, { actor, action: "fiscal_identity.release", identityId: mine.id, before: mine, after: null, origin: "finance" });
  }

  /**
   * Migração do histórico (task §1.4): simula por omissão. Regista uma
   * identidade por documento único (o mais antigo fica com a chave); a mesma
   * identidade em vários documentos e as identidades incompletas vão para o
   * relatório — nada é fundido, apagado ou recalculado.
   */
  async backfill(org: OrganizationId, actor: string, docs: HistoricalDocument[], dryRun: boolean): Promise<BackfillReport> {
    const report: BackfillReport = { dryRun, scanned: docs.length, registered: 0, alreadyRegistered: 0, incomplete: [], duplicates: [] };
    const groups = new Map<string, { key: FiscalKey; docs: HistoricalDocument[] }>();
    for (const d of [...docs].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      const k = fiscalKeyOf(d.input);
      if ("missing" in k) {
        report.incomplete.push({ origin: d.origin, id: d.id, label: d.label, missing: k.missing });
        continue;
      }
      const g = groups.get(keyString(k.key)) ?? { key: k.key, docs: [] };
      g.docs.push(d);
      groups.set(keyString(k.key), g);
    }
    for (const [ks, g] of groups) {
      const finance = g.docs.filter((d) => d.origin === "finance");
      const stock = g.docs.filter((d) => d.origin === "stock");
      // Uma fatura + uma importação do Stock do mesmo documento = o mesmo documento nos dois módulos (liga-se);
      // mais de uma fatura ou mais de uma importação = duplicado a rever.
      if (finance.length > 1 || stock.length > 1) report.duplicates.push({ key: ks, documents: g.docs.map((d) => ({ origin: d.origin, id: d.id, label: d.label })) });
      const first = finance[0] ?? stock[0]!;
      if (dryRun) {
        const found = await this.repo.findByKey(org, g.key);
        if (found) report.alreadyRegistered++;
        else report.registered++;
        continue;
      }
      const { identity, created } = await this.repo.insertIfAbsent(org, this.row(first.input, g.key, first.origin, first.origin === "finance" ? { invoiceId: first.id } : { stockImportId: first.id }, actor));
      if (created) {
        report.registered++;
        await this.audit.record(org, { actor, action: "fiscal_identity.backfill", identityId: identity.id, before: null, after: identity, origin: "backfill" });
      } else report.alreadyRegistered++;
      if (finance[0] && stock[0] && (!identity.invoiceId || !identity.stockImportId)) {
        await this.repo.link(org, identity.id, { ...(!identity.invoiceId && { invoiceId: finance[0].id }), ...(!identity.stockImportId && { stockImportId: stock[0].id }) });
      }
    }
    return report;
  }
}
