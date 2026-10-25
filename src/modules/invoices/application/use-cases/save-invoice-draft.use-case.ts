import { keepLinesUnderStockReview, type StockLockedLinesDeps } from "./shared-stock-locked-lines.js";
import { InvoiceLine } from "../../domain/entities/invoice-line.js";
import type { UpdateInvoiceData } from "../../domain/entities/invoice.js";
import { InvoiceNotDraftError, InvoiceNotFoundError, InvoiceVersionConflictError } from "../../domain/errors.js";
import type { ConfirmImportedInvoiceCommand, InvoiceDTO } from "../../domain/ports/in/invoice.ports.js";
import type { CostCenterCategoryReaderPort } from "../../domain/ports/out/cost-center-category-reader.port.js";
import type { InvoiceAllocationRepositoryPort } from "../../domain/ports/out/invoice-allocation-repository.port.js";
import type { InvoiceAmountsWritePort } from "../../domain/ports/out/invoice-amounts-write.port.js";
import type { InvoiceAuditPort } from "../../domain/ports/out/invoice-audit.port.js";
import type { InvoiceLineRepositoryPort } from "../../domain/ports/out/invoice-line-repository.port.js";
import type { InvoiceRepositoryPort } from "../../domain/ports/out/invoice-repository.port.js";
import { computeAmountsForInvoice } from "./shared-amounts.js";
import { auditSnapshot } from "./shared-audit.js";
import { buildAllocations, toLineDetailMode } from "./shared-financial-mode.js";
import { toInvoiceDTO } from "./shared.js";

export interface SaveDraftResult {
  invoice: InvoiceDTO;
  /** Diferença para a fatura (motor único); null sem total. */
  differenceCents: number | null;
  /** «Por valores»: base líquida ainda por distribuir. */
  remainingCents: number | null;
  /** Pronto a lançar (valores reconciliados e, em «Por valores», tudo distribuído). */
  readyToFinalize: boolean;
  blockingReason: string | null;
}

/**
 * «Guardar rascunho» (F2 v1.2 §2.2): grava cabeçalho, linhas reais (com
 * descontos e textos originais), modo financeiro e repartições SEM finalizar —
 * não cria obrigação financeira, não reserva a identidade fiscal, não envia
 * revisão para o Stock. Divergências ficam registadas para conferir; só o
 * confirmar (lançar) exige reconciliação ao cêntimo.
 */
export class SaveInvoiceDraftUseCase {
  constructor(
    private readonly invoiceRepo: InvoiceRepositoryPort,
    private readonly lineRepo: InvoiceLineRepositoryPort,
    private readonly amountsWrite: InvoiceAmountsWritePort,
    private readonly categoryReader: CostCenterCategoryReaderPort,
    private readonly allocationRepo: InvoiceAllocationRepositoryPort,
    private readonly audit: InvoiceAuditPort,
    /** F3c: linhas já em Compras por rever (opcional nos testes antigos). */
    private readonly stockLines?: StockLockedLinesDeps,
  ) {}

  async execute(command: ConfirmImportedInvoiceCommand): Promise<SaveDraftResult> {
    const existing = await this.invoiceRepo.findById(command.organizationId, command.id);
    if (!existing) throw new InvoiceNotFoundError(command.id);
    if (existing.status !== "draft_ai" && existing.status !== "pending_review") throw new InvoiceNotDraftError(existing.id);
    if (command.expectedVersion !== undefined && command.expectedVersion !== existing.version) {
      throw new InvoiceVersionConflictError(existing.id, existing.version);
    }

    const data: UpdateInvoiceData = {};
    if (command.supplierId !== undefined) data.supplierId = command.supplierId;
    if (command.supplierName !== undefined) data.supplierName = command.supplierName;
    if (command.supplierNifSnapshot !== undefined) data.supplierNifSnapshot = command.supplierNifSnapshot;
    if (command.invoiceNumber !== undefined) data.invoiceNumber = command.invoiceNumber;
    if (command.invoiceDate !== undefined) data.invoiceDate = new Date(command.invoiceDate);
    if (command.dueDate !== undefined) data.dueDate = command.dueDate ? new Date(command.dueDate) : null;
    if (command.isDirectDebit !== undefined) data.isDirectDebit = command.isDirectDebit;
    if (command.directDebitDate !== undefined) data.directDebitDate = command.directDebitDate ? new Date(command.directDebitDate) : null;
    if (command.subtotalWithoutVat !== undefined) data.subtotalWithoutVat = command.subtotalWithoutVat;
    if (command.totalVat !== undefined) data.totalVat = command.totalVat;
    if (command.totalWithVat !== undefined) data.totalWithVat = command.totalWithVat;
    if (command.documentType !== undefined) data.documentType = command.documentType;
    if (command.notes !== undefined) data.notes = command.notes;
    if (command.costCenterGroupId !== undefined) data.costCenterGroupId = command.costCenterGroupId;
    if (command.costCenterCategoryId !== undefined) data.costCenterCategoryId = command.costCenterCategoryId;
    if (command.stockReviewOverride !== undefined) data.stockReviewOverride = command.stockReviewOverride;
    if (command.stockReviewOverrideReason !== undefined) data.stockReviewOverrideReason = command.stockReviewOverrideReason;
    let draft = existing.update(data);

    // Linhas reais: as enviadas substituem as do rascunho; sem `lines` mantêm-se.
    // F3c: já em Compras por rever → mantêm-se as guardadas (só a classificação muda) ou pede confirmação.
    const kept = await keepLinesUnderStockReview(this.stockLines, {
      organizationId: command.organizationId,
      invoiceId: draft.id,
      storedLines: command.lines === undefined ? [] : await this.lineRepo.findByInvoiceId(command.organizationId, draft.id),
      lineCommands: command.lines,
      confirmRemoveStockReview: command.confirmRemoveStockReview,
      actor: command.actor ?? "sistema",
    });
    const lineCommands = kept ? undefined : command.lines;
    const lines = kept
      ? kept
      : lineCommands === undefined
        ? await this.lineRepo.findByInvoiceId(command.organizationId, draft.id)
        : lineCommands.map((lc) => {
            const props: Parameters<typeof InvoiceLine.create>[0] = {
              invoiceId: draft.id,
              description: lc.description,
              quantity: lc.quantity,
              unitCostWithoutVat: lc.unitCostWithoutVat,
              vatRate: lc.vatRate,
              vatAmount: lc.vatAmount,
              totalWithVat: lc.totalWithVat,
            };
            if (lc.type !== undefined) props.type = lc.type;
            if (lc.costCenterCategoryId !== undefined) props.costCenterCategoryId = lc.costCenterCategoryId;
            if (lc.unit !== undefined) props.unit = lc.unit;
            if (lc.locationId !== undefined) props.locationId = lc.locationId;
            return InvoiceLine.create(props);
          });

    const amounts = computeAmountsForInvoice(draft, lines.map((line, i) => ({ line, cmd: (kept ? command.lines : lineCommands)?.[i] })), command.amounts);
    draft = amounts.invoice;

    const mode = toLineDetailMode(command.financialMode) ?? draft.lineDetailMode;
    let remainingCents: number | null = null;
    let allocationsBlocking: string | null = null;
    let allocations = mode === "by_values" ? await this.allocationRepo.findByInvoiceId(command.organizationId, draft.id) : [];
    if (mode === "by_values" && command.allocations !== undefined) {
      const built = await buildAllocations(this.categoryReader, command.organizationId, draft.id, command.allocations, Math.abs(draft.subtotalWithoutVat), false);
      allocations = built.allocations;
      remainingCents = built.remainingCents;
    } else if (mode === "by_values") {
      remainingCents = Math.abs(draft.subtotalWithoutVat) - allocations.reduce((s, a) => s + a.netCents, 0);
    }
    if (mode === "by_values" && (remainingCents !== 0 || allocations.length === 0)) {
      allocationsBlocking = allocations.length === 0 ? "sem repartições" : `por distribuir ${((remainingCents ?? 0) / 100).toFixed(2).replace(".", ",")} €`;
    }
    draft = draft.setLineDetailMode(mode);

    const version = await this.invoiceRepo.claimVersion(command.organizationId, existing.id, command.expectedVersion ?? existing.version);
    if (version === null) throw new InvoiceVersionConflictError(existing.id, null);
    draft = draft.withVersion(version);
    await this.invoiceRepo.update(command.organizationId, draft);
    if (lineCommands !== undefined) {
      await this.lineRepo.deleteByInvoiceId(command.organizationId, draft.id);
      if (amounts.lines.length) await this.lineRepo.saveAll(command.organizationId, amounts.lines);
    }
    if (kept) for (const l of amounts.lines) await this.lineRepo.updateLine(command.organizationId, l);
    await this.amountsWrite.save(command.organizationId, draft.id, amounts.record);
    if (mode === "by_values" && command.allocations !== undefined) {
      await this.allocationRepo.replaceForInvoice(command.organizationId, draft.id, allocations);
    }
    await this.audit.record(command.organizationId, {
      invoiceId: draft.id,
      action: "update",
      actor: command.actor ?? "sistema",
      origin: "import",
      reason: "Rascunho guardado",
      before: auditSnapshot(existing),
      after: auditSnapshot(draft),
    });

    const blockingReason = [amounts.blocking?.description ?? null, allocationsBlocking].filter(Boolean).join("; ") || null;
    return {
      invoice: toInvoiceDTO(draft, amounts.lines, undefined, false, allocations),
      differenceCents: amounts.record.differenceCents,
      remainingCents,
      readyToFinalize: blockingReason === null,
      blockingReason,
    };
  }
}
