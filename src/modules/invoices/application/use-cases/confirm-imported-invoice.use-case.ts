import { InvoiceLine } from "../../domain/entities/invoice-line.js";
import type {
  ConfirmImportedInvoicePort,
  ConfirmImportedInvoiceCommand,
  InvoiceDTO,
} from "../../domain/ports/in/invoice.ports.js";
import type { InvoiceRepositoryPort } from "../../domain/ports/out/invoice-repository.port.js";
import type { InvoiceLineRepositoryPort } from "../../domain/ports/out/invoice-line-repository.port.js";
import type { PayableEntryWritePort } from "../../domain/ports/out/payable-entry-write.port.js";
import type { SupplierCreatePort } from "../../domain/ports/out/supplier-create.port.js";
import type { SupplierHintPort } from "../../domain/ports/out/supplier-hint.port.js";
import type { StockDecisionNotifyPort } from "../../domain/ports/out/stock-decision-notify.port.js";
import { normalizeSupplierName } from "../../domain/utils/supplier-name.js";
import { InvoiceNotFoundError, DuplicateInvoiceError, InvoiceVersionConflictError } from "../../domain/errors.js";
import type { InvoiceAuditPort } from "../../domain/ports/out/invoice-audit.port.js";
import { auditSnapshot } from "./shared-audit.js";
import { toInvoiceDTO } from "./shared.js";
import { claimFiscalIdentity } from "./shared-fiscal-identity.js";
import type { FiscalIdentityPort } from "../../domain/ports/out/fiscal-identity.port.js";
import type { SupplierLookupPort } from "../../domain/ports/out/supplier-lookup.port.js";
import type { InvoiceAmountsWritePort } from "../../domain/ports/out/invoice-amounts-write.port.js";
import { reconcileForFinalize } from "./shared-amounts.js";

export class ConfirmImportedInvoiceUseCase implements ConfirmImportedInvoicePort {
  constructor(
    private readonly invoiceRepo: InvoiceRepositoryPort,
    private readonly lineRepo: InvoiceLineRepositoryPort,
    private readonly payableWrite: PayableEntryWritePort,
    private readonly supplierCreate: SupplierCreatePort,
    private readonly supplierHint: SupplierHintPort,
    private readonly stockDecisionNotify: StockDecisionNotifyPort,
    private readonly fiscal: FiscalIdentityPort,
    private readonly supplierLookup: SupplierLookupPort,
    private readonly amountsWrite: InvoiceAmountsWritePort,
    private readonly audit: InvoiceAuditPort,
  ) {}

  async execute(command: ConfirmImportedInvoiceCommand): Promise<InvoiceDTO> {
    const existing = await this.invoiceRepo.findById(command.organizationId, command.id);
    if (!existing) throw new InvoiceNotFoundError(command.id);
    if (command.expectedVersion !== undefined && command.expectedVersion !== existing.version) {
      throw new InvoiceVersionConflictError(existing.id, existing.version);
    }

    if (existing.status !== "draft_ai" && existing.status !== "pending_review") {
      throw new Error(
        `Cannot confirm invoice with status "${existing.status}". Expected draft_ai or pending_review.`,
      );
    }

    // Criar fornecedor novo se solicitado (tem precedência sobre supplierId)
    let resolvedSupplierId = command.supplierId;
    let resolvedSupplierName = command.supplierName;
    if (command.newSupplier) {
      const created = await this.supplierCreate.create(command.organizationId, command.newSupplier);
      resolvedSupplierId = created.id;
      resolvedSupplierName = resolvedSupplierName ?? created.name;
    }

    // Apply user corrections and transition to pending
    const confirmData: Parameters<typeof existing.confirmImport>[0] = {};
    if (resolvedSupplierId !== undefined) confirmData.supplierId = resolvedSupplierId;
    if (resolvedSupplierName !== undefined) confirmData.supplierName = resolvedSupplierName;
    if (command.supplierNifSnapshot !== undefined) confirmData.supplierNifSnapshot = command.supplierNifSnapshot;
    if (command.invoiceNumber !== undefined) confirmData.invoiceNumber = command.invoiceNumber;
    if (command.invoiceDate !== undefined) confirmData.invoiceDate = new Date(command.invoiceDate);
    if (command.dueDate !== undefined) confirmData.dueDate = command.dueDate ? new Date(command.dueDate) : null;
    if (command.isDirectDebit !== undefined) confirmData.isDirectDebit = command.isDirectDebit;
    if (command.directDebitDate !== undefined) confirmData.directDebitDate = command.directDebitDate ? new Date(command.directDebitDate) : null;
    if (command.subtotalWithoutVat !== undefined) confirmData.subtotalWithoutVat = command.subtotalWithoutVat;
    if (command.totalVat !== undefined) confirmData.totalVat = command.totalVat;
    if (command.totalWithVat !== undefined) confirmData.totalWithVat = command.totalWithVat;
    if (command.documentType !== undefined) confirmData.documentType = command.documentType;
    if (command.notes !== undefined) confirmData.notes = command.notes;
    if (command.costCenterGroupId !== undefined) confirmData.costCenterGroupId = command.costCenterGroupId;
    if (command.costCenterCategoryId !== undefined) confirmData.costCenterCategoryId = command.costCenterCategoryId;
    if (command.financialType !== undefined) confirmData.financialType = command.financialType;
    if (command.affectsDre !== undefined) confirmData.affectsDre = command.affectsDre;
    if (command.affectsCashflow !== undefined) confirmData.affectsCashflow = command.affectsCashflow;
    if (command.affectsProfitability !== undefined) confirmData.affectsProfitability = command.affectsProfitability;
    if (command.currency !== undefined) confirmData.currency = command.currency;
    if (command.stockReviewOverride !== undefined) confirmData.stockReviewOverride = command.stockReviewOverride;
    if (command.stockReviewOverrideReason !== undefined) confirmData.stockReviewOverrideReason = command.stockReviewOverrideReason;

    let confirmed = existing.confirmImport(confirmData);
    if (command.markAsPaid) {
      const paidAt = command.paidAt ? new Date(command.paidAt) : (confirmed.invoiceDate ?? new Date());
      confirmed = confirmed.markPaid(paidAt);
    }

    // Linhas confirmadas (novas) + as que o rascunho já tinha.
    const lineCommands = command.lines ?? [];
    const newLines: InvoiceLine[] = lineCommands.map((lc) => {
      const lineProps: Parameters<typeof InvoiceLine.create>[0] = {
        invoiceId: confirmed.id,
        description: lc.description,
        quantity: lc.quantity,
        unitCostWithoutVat: lc.unitCostWithoutVat,
        vatRate: lc.vatRate,
        vatAmount: lc.vatAmount,
        totalWithVat: lc.totalWithVat,
      };
      if (lc.type !== undefined) lineProps.type = lc.type;
      if (lc.costCenterCategoryId !== undefined) lineProps.costCenterCategoryId = lc.costCenterCategoryId;
      if (lc.unit !== undefined) lineProps.unit = lc.unit;
      if (lc.affectsDre !== undefined) lineProps.affectsDre = lc.affectsDre;
      if (lc.affectsCashflow !== undefined) lineProps.affectsCashflow = lc.affectsCashflow;
      if (lc.affectsProfitability !== undefined) lineProps.affectsProfitability = lc.affectsProfitability;
      if (lc.locationId !== undefined) lineProps.locationId = lc.locationId;
      return InvoiceLine.create(lineProps);
    });
    const storedLines = await this.lineRepo.findByInvoiceId(command.organizationId, confirmed.id);

    // Motor único de valores (task v1.2 §1.3): o servidor recalcula; não reconcilia ao cêntimo → não
    // finaliza (o rascunho fica como estava, nada foi gravado ainda).
    const amounts = reconcileForFinalize(
      confirmed,
      [...storedLines.map((line) => ({ line })), ...newLines.map((line, i) => ({ line, cmd: lineCommands[i] }))],
      command.amounts,
    );
    confirmed = amounts.invoice;
    const reconciledStored = amounts.lines.slice(0, storedLines.length);
    const lines = amounts.lines.slice(storedLines.length);

    // Duplicate check — hard block, exclude this invoice itself. Prefer the
    // resolved supplierId (reliable regardless of NIF extraction); fall back
    // to the supplier NIF snapshot when no supplier is linked yet.
    if (confirmed.invoiceNumber) {
      const duplicate = confirmed.supplierId
        ? await this.invoiceRepo.findDuplicate(command.organizationId, confirmed.invoiceNumber, confirmed.supplierId, confirmed.id)
        : confirmed.supplierNifSnapshot
          ? await this.invoiceRepo.findDuplicateByNif(command.organizationId, confirmed.invoiceNumber, confirmed.supplierNifSnapshot, confirmed.id)
          : null;
      if (duplicate) throw new DuplicateInvoiceError(confirmed.invoiceNumber, confirmed.supplierName);
    }

    // Identidade fiscal partilhada (task v1.2 §1.2): reserva antes de finalizar.
    // Já movimentado no Stock → completa o mesmo documento sem nova revisão de stock.
    const fiscal = await claimFiscalIdentity(this.fiscal, this.supplierLookup, command.organizationId, command.actor ?? "sistema", confirmed, {
      notADuplicate: command.notADuplicate === true,
      ...(command.completeStockIdentityId && { completeStockIdentityId: command.completeStockIdentityId }),
    });
    if (fiscal.linkedToStock && confirmed.stockReviewOverride !== "force_skip") {
      confirmed = confirmed.update({ stockReviewOverride: "force_skip", stockReviewOverrideReason: "Documento já movimentado no Stock (importação feita no Stock) — sem nova revisão." });
    }

    // Bloqueio otimista atómico: dois cliques/sessões a confirmar o mesmo rascunho → só um passa.
    const version = await this.invoiceRepo.claimVersion(command.organizationId, existing.id, command.expectedVersion ?? existing.version);
    if (version === null) throw new InvoiceVersionConflictError(existing.id, null);
    confirmed = confirmed.withVersion(version);
    await this.invoiceRepo.update(command.organizationId, confirmed);

    // Guardar hint nome→fornecedor para importações futuras.
    // Usa o nome extraído pela IA (pre-confirm) para que nomes ligeiramente
    // diferentes do mesmo fornecedor sejam reconhecidos automaticamente.
    if (resolvedSupplierId && existing.supplierName) {
      const normalizedName = normalizeSupplierName(existing.supplierName);
      if (normalizedName.length > 0) {
        await this.supplierHint.save(command.organizationId, normalizedName, resolvedSupplierId);
      }
    }

    // Save optional lines (valores já recalculados pelo motor)
    if (lines.length > 0) {
      await this.lineRepo.saveAll(command.organizationId, lines);
    }
    for (const l of reconciledStored) await this.lineRepo.updateLine(command.organizationId, l);
    await this.amountsWrite.save(command.organizationId, confirmed.id, amounts.record);

    // Derivar lineDetailMode automaticamente: se há linhas confirmadas → detailed, caso contrário manter simple
    let finalInvoice = confirmed;
    if (lines.length > 0) {
      finalInvoice = confirmed.setLineDetailMode("detailed");
      await this.invoiceRepo.update(command.organizationId, finalInvoice);
    }

    // Propagar costCenterCategoryId da fatura para todas as linhas existentes
    if (finalInvoice.costCenterCategoryId !== null) {
      await this.lineRepo.updateCostCenterCategoryForInvoice(
        command.organizationId,
        finalInvoice.id,
        finalInvoice.costCenterCategoryId,
      );
    }

    // Create payable entry if explicitly requested and due date is set — nunca
    // para notas de crédito (não fazem sentido como "conta a pagar", e
    // PayableEntry.amount exige > 0, o que rebentaria com o total negativo).
    if (command.saveAsPayable && finalInvoice.dueDate && finalInvoice.documentType !== "credit_note") {
      await this.payableWrite.createForInvoice(command.organizationId, {
        invoiceId: finalInvoice.id,
        supplierId: finalInvoice.supplierId,
        supplierName: finalInvoice.supplierName,
        invoiceNumber: finalInvoice.invoiceNumber,
        dueDate: finalInvoice.dueDate,
        amount: finalInvoice.totalWithVat,
      });
    }

    try {
      await this.stockDecisionNotify.notifyInvoiceFinalized(command.organizationId, {
        invoiceId: finalInvoice.id,
        invoiceNumber: finalInvoice.invoiceNumber,
        invoiceDate: finalInvoice.invoiceDate.toISOString().slice(0, 10),
        supplierId: finalInvoice.supplierId,
        supplierName: finalInvoice.supplierName,
        supplierNif: finalInvoice.supplierNifSnapshot,
        override: finalInvoice.stockReviewOverride,
        overrideReason: finalInvoice.stockReviewOverrideReason,
        lines: lines.map((l) => ({
          id: l.id,
          description: l.description,
          quantity: l.quantity,
          unit: l.unit,
          unitCostWithoutVat: l.unitCostWithoutVat,
          totalWithVat: l.totalWithVat,
          costCenterCategoryId: l.costCenterCategoryId,
          locationId: l.locationId,
        })),
        actor: null,
      });
    } catch (e) {
      console.error("[invoices] falha ao notificar stock-purchase-review (ignorada, sweep fará retry):", e);
    }

    await this.audit.record(command.organizationId, { invoiceId: finalInvoice.id, action: "confirm", actor: command.actor ?? "sistema", origin: "import", reason: null, before: auditSnapshot(existing), after: auditSnapshot(finalInvoice) });

    return toInvoiceDTO(finalInvoice, lines);
  }
}
