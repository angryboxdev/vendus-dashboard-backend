import type { OrganizationId } from "../../../../kernel/organization-id.js";
import {
  InvoiceAlreadyInStockError,
  InvoiceAlreadyInStockReviewError,
  InvoiceDraftInFinanceError,
  InvoiceExistsNotRoutedError,
  StockImportNoLinesError,
} from "../../domain/errors.js";
import type {
  ImportInvoiceForStockCommand,
  ImportInvoiceForStockPort,
  ImportInvoiceForStockResultDTO,
  ImportInvoicePort,
  InvoiceImportResultDTO,
} from "../../domain/ports/in/invoice.ports.js";
import type { InvoiceRepositoryPort } from "../../domain/ports/out/invoice-repository.port.js";
import type { InvoiceLineRepositoryPort } from "../../domain/ports/out/invoice-line-repository.port.js";
import type { DocumentStoragePort } from "../../domain/ports/out/document-storage.port.js";
import type { InvoiceStockReviewStatusReadPort } from "../../domain/ports/out/invoice-stock-review-status-read.port.js";
import type { StockDecisionNotifyPort } from "../../domain/ports/out/stock-decision-notify.port.js";
import type { FiscalIdentityPort } from "../../domain/ports/out/fiscal-identity.port.js";
import type { SupplierLookupPort } from "../../domain/ports/out/supplier-lookup.port.js";
import type { SaveInvoiceDraftUseCase } from "./save-invoice-draft.use-case.js";
import type { Invoice } from "../../domain/entities/invoice.js";
import type { InvoiceLine } from "../../domain/entities/invoice-line.js";
import { claimFiscalIdentity } from "./shared-fiscal-identity.js";
import { persistExtractedDraft } from "./shared-extracted-draft.js";

export { extractedToLineCommand } from "./shared-extracted-draft.js";
import { FiscalIdentityConflictError } from "../../domain/errors.js";

/**
 * Importar uma fatura diretamente no Stock (task v1.2 F3c). Usa a mesma ingestão do Financeiro
 * (QR fiscal + texto, IA só sem leitura; mesmo ficheiro / identidade fiscal → o mesmo documento).
 * - Já deu entrada no Stock (revisão movimentada/excluída, ou importação antiga do Stock) → bloqueia.
 * - Já está em Compras por rever → aponta para essa revisão.
 * - Já lançada no Financeiro sem ir ao Stock → oferece encaminhar (com `routeExisting`).
 * - Novo: rascunho com as linhas lidas, origem Stock, «Aguardando lançamento no Financeiro» (sem conta a
 *   pagar) e revisão de Stock criada logo — o Stock pode mapear de imediato.
 */
export class ImportInvoiceForStockUseCase implements ImportInvoiceForStockPort {
  constructor(
    private readonly importInvoice: ImportInvoicePort,
    private readonly saveDraft: Pick<SaveInvoiceDraftUseCase, "execute">,
    private readonly invoiceRepo: InvoiceRepositoryPort,
    private readonly lineRepo: InvoiceLineRepositoryPort,
    private readonly storage: DocumentStoragePort,
    private readonly statusRead: InvoiceStockReviewStatusReadPort,
    private readonly stockNotify: StockDecisionNotifyPort,
    private readonly fiscal: FiscalIdentityPort,
    private readonly supplierLookup: SupplierLookupPort,
  ) {}

  async execute(command: ImportInvoiceForStockCommand): Promise<ImportInvoiceForStockResultDTO> {
    const org = command.organizationId;
    const result = await this.importInvoice.execute({ organizationId: org, fileBuffer: command.fileBuffer, filename: command.filename, mimeType: command.mimeType });

    if (result.reused) return this.existing(org, result, command);

    const draft = await this.invoiceRepo.findById(org, result.invoice.id);
    if (!draft) throw new StockImportNoLinesError("O documento lido não ficou gravado.");

    // Identidade antiga só do Stock (importação anterior que já movimentou) → não volta a entrar.
    if (result.validationIssues.includes("exists_in_stock")) {
      await this.discard(org, draft);
      throw new InvoiceAlreadyInStockError(null, "Esta fatura já deu entrada no Stock (importação anterior no Stock).");
    }
    if (result.extractedLines.length === 0) {
      await this.discard(org, draft);
      throw new StockImportNoLinesError("Não foi possível ler as linhas da fatura. Tente de novo com um PDF melhor ou lance-a pelo Financeiro.");
    }

    // Linhas reais gravadas no rascunho (motor de valores) e origem Stock.
    await persistExtractedDraft(this.saveDraft, org, result, command.actor);
    const saved = await this.invoiceRepo.findById(org, draft.id);
    if (!saved) throw new StockImportNoLinesError("O documento lido não ficou gravado.");
    const invoice = saved.markImportedFromStock();
    await this.invoiceRepo.update(org, invoice);

    // Reserva a identidade fiscal já agora: o Financeiro, ao importar o mesmo PDF, abre este rascunho.
    const warnings: string[] = [];
    try {
      await claimFiscalIdentity(this.fiscal, this.supplierLookup, org, command.actor, invoice);
    } catch (e) {
      if (!(e instanceof FiscalIdentityConflictError)) throw e;
      warnings.push(e.code === "identity_incomplete" ? "fiscal_identity_incomplete" : e.code);
    }

    const lines = await this.lineRepo.findByInvoiceId(org, invoice.id);
    await this.notify(org, invoice, lines, "stock", command.actor);
    const status = await this.statusRead.findForInvoice(org, invoice.id);
    return { kind: "created", invoiceId: invoice.id, reviewId: status?.reviewId ?? null, validationIssues: [...result.validationIssues, ...warnings], reading: result.reading ?? null };
  }

  private async existing(org: OrganizationId, result: InvoiceImportResultDTO, command: ImportInvoiceForStockCommand): Promise<ImportInvoiceForStockResultDTO> {
    const existing = await this.invoiceRepo.findById(org, result.invoice.id);
    if (!existing) throw new StockImportNoLinesError("O documento lido não ficou gravado.");
    const label = `${existing.supplierName} ${existing.invoiceNumber}`.trim();
    const status = await this.statusRead.findForInvoice(org, existing.id);
    if (status && (status.status === "applied" || status.status === "excluded")) {
      throw new InvoiceAlreadyInStockError(status.reviewId, `A fatura ${label} já deu entrada no Stock — não pode entrar outra vez.`);
    }
    if (status) throw new InvoiceAlreadyInStockReviewError(status.reviewId, `A fatura ${label} já está em Compras por rever.`);
    if (existing.status === "draft_ai" || existing.status === "pending_review") {
      throw new InvoiceDraftInFinanceError(existing.id, `A fatura ${label} já foi importada no Financeiro e está em rascunho — conclua-a lá com «Enviar para Stock».`);
    }
    if (!command.routeExisting) {
      throw new InvoiceExistsNotRoutedError(existing.id, `A fatura ${label} já está lançada no Financeiro mas não foi enviada para o Stock.`);
    }
    const lines = await this.lineRepo.findByInvoiceId(org, existing.id);
    if (lines.length === 0) throw new StockImportNoLinesError(`A fatura ${label} foi lançada sem linhas: detalhe-a por artigo no Financeiro para a enviar para o Stock.`);
    await this.notify(org, existing, lines, "stock_routed", command.actor);
    const after = await this.statusRead.findForInvoice(org, existing.id);
    return { kind: "routed", invoiceId: existing.id, reviewId: after?.reviewId ?? null, validationIssues: [], reading: null };
  }

  private async notify(org: OrganizationId, invoice: Invoice, lines: InvoiceLine[], how: "stock" | "stock_routed", actor: string) {
    await this.stockNotify.notifyInvoiceFinalized(org, {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate.toISOString().slice(0, 10),
      supplierId: invoice.supplierId,
      supplierName: invoice.supplierName,
      supplierNif: invoice.supplierNifSnapshot,
      override: "force_create",
      overrideReason: how === "stock" ? "Importada no Stock." : "Encaminhada para o Stock a partir da importação no Stock.",
      // Encaminhar uma fatura já lançada: o Financeiro está feito, não fica pendente.
      origin: how === "stock" ? "stock" : "finance",
      subtotalWithoutVat: invoice.subtotalWithoutVat,
      totalVat: invoice.totalVat,
      totalWithVat: invoice.totalWithVat,
      lines: lines.map((l) => ({
        id: l.id,
        description: l.description,
        quantity: l.quantity,
        unit: l.unit,
        unitCostWithoutVat: l.unitCostWithoutVat,
        totalWithVat: l.totalWithVat,
        vatAmount: l.vatAmount,
        supplierItemCode: null,
        costCenterCategoryId: l.costCenterCategoryId ?? invoice.costCenterCategoryId,
        locationId: l.locationId,
      })),
      actor,
    });
  }

  /** Rascunho criado nesta importação mas que não pode seguir: sai sem deixar rasto (ficheiro incluído). */
  private async discard(org: OrganizationId, draft: Invoice) {
    await this.lineRepo.deleteByInvoiceId(org, draft.id).catch(() => undefined);
    await this.invoiceRepo.delete(org, draft.id);
    if (draft.attachmentUrl) await this.storage.delete(draft.attachmentUrl).catch(() => undefined);
  }
}
