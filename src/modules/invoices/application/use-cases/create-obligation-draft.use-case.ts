import { Invoice } from "../../domain/entities/invoice.js";
import { NotAPaymentDocumentError, ObligationAlreadyRegisteredError } from "../../domain/errors.js";
import type { InvoiceImportResultDTO } from "../../domain/ports/in/invoice.ports.js";
import type { CreateObligationDraftCommand, CreateObligationDraftPort, ReadPaymentDocumentPort } from "../../domain/ports/in/payment-document.ports.js";
import type { DocumentStoragePort } from "../../domain/ports/out/document-storage.port.js";
import type { InvoiceRepositoryPort } from "../../domain/ports/out/invoice-repository.port.js";
import type { SupplierLookupPort } from "../../domain/ports/out/supplier-lookup.port.js";
import { toInvoiceDTO } from "./shared.js";

const ISSUER_NAMES = { AT: "Autoridade Tributária e Aduaneira", SS: "Segurança Social" } as const;

/**
 * Rascunho de obrigação a partir de um documento de cobrança (E3b-2). O servidor volta a ler o
 * ficheiro (nunca confia em valores vindos do ecrã): sem IVA, sem linhas, sem Stock; prazo e
 * referência do documento. A conta a pagar só nasce quando a pessoa confirma o rascunho.
 */
export class CreateObligationDraftUseCase implements CreateObligationDraftPort {
  constructor(
    private readonly readPaymentDocument: ReadPaymentDocumentPort,
    private readonly storage: DocumentStoragePort,
    private readonly invoiceRepo: InvoiceRepositoryPort,
    private readonly supplierLookup: SupplierLookupPort,
  ) {}

  async execute(command: CreateObligationDraftCommand): Promise<InvoiceImportResultDTO> {
    const read = await this.readPaymentDocument.execute(command.organizationId, { buffer: command.fileBuffer, mimeType: command.mimeType });
    if (!read) throw new NotAPaymentDocumentError();
    const p = read.payment;
    const blocking = p.issues.filter((i) => i.blocking);
    if (blocking.length) throw new NotAPaymentDocumentError(`O documento tem problemas por resolver: ${blocking.map((i) => i.detail).join(" ")}`);

    const strong = read.matches.filter((m) => m.strength === "strong");
    if (strong.length && !command.force) {
      throw new ObligationAlreadyRegisteredError(strong.map((m) => ({ invoiceId: m.existing.invoiceId, label: m.existing.label, supplierName: m.existing.supplierName })));
    }

    const supplier = read.supplierSuggestion ? await this.supplierLookup.findById(command.organizationId, read.supplierSuggestion.id) : null;
    const attachmentUrl = await this.storage.store(command.fileBuffer, command.filename, command.mimeType, command.organizationId);
    const number = p.documentNumber ?? `${p.issuer} ${p.period ?? ""} ${p.paymentReference ?? ""}`.replace(/\s+/g, " ").trim();
    const day = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`) : null);
    const total = p.totalCents ?? 0;

    const invoice = Invoice.createFromImport({
      supplierId: supplier?.id ?? null,
      supplierName: supplier?.name ?? ISSUER_NAMES[p.issuer],
      supplierNifSnapshot: supplier?.nif ?? null,
      invoiceNumber: number,
      invoiceDate: day(p.issueDate) ?? day(p.declarationReceivedAt) ?? new Date(),
      dueDate: day(p.dueDate),
      subtotalWithoutVat: total,
      totalVat: 0,
      totalWithVat: total,
      source: "pdf_import",
      attachmentUrl,
      aiConfidence: 1,
      requiresReview: true,
      costCenterGroupId: supplier?.defaultCostCenterGroupId ?? null,
      costCenterCategoryId: supplier?.defaultCostCenterCategoryId ?? null,
      financialType: supplier?.defaultFinancialType ?? null,
      obligation: {
        kind: p.obligationType === "obrigacao_fiscal" ? "tax_obligation" : "contribution_obligation",
        paymentReference: p.paymentReference,
        mbEntity: p.mbEntity,
        period: p.period,
      },
    }).update({ stockReviewOverride: "force_skip", stockReviewOverrideReason: "Obrigação fiscal/contributiva — não afeta o Stock." });

    await this.invoiceRepo.save(command.organizationId, invoice);
    return {
      invoice: toInvoiceDTO(invoice),
      aiConfidence: 1,
      validationIssues: p.issues.map((i) => i.code),
      supplierMatch: supplier
        ? { id: supplier.id, name: supplier.name, nif: supplier.nif, defaultCostCenterGroupId: supplier.defaultCostCenterGroupId, defaultCostCenterCategoryId: supplier.defaultCostCenterCategoryId, defaultFinancialType: supplier.defaultFinancialType }
        : null,
      extractedLines: [],
    };
  }
}
