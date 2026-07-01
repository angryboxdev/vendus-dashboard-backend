import { Invoice } from "../../domain/entities/invoice.js";
import type {
  ImportInvoicePort,
  ImportInvoiceCommand,
  InvoiceImportResultDTO,
} from "../../domain/ports/in/invoice.ports.js";
import type { InvoiceRepositoryPort } from "../../domain/ports/out/invoice-repository.port.js";
import type { DocumentStoragePort } from "../../domain/ports/out/document-storage.port.js";
import type { AiExtractionPort } from "../../domain/ports/out/ai-extraction.port.js";
import type { SupplierLookupPort, SupplierSummary } from "../../domain/ports/out/supplier-lookup.port.js";
import { toInvoiceDTO } from "./shared.js";

const AI_CONFIDENCE_REVIEW_THRESHOLD = 0.7;
const VALUE_DISCREPANCY_MARGIN_CENTS = 2;

export class ImportInvoiceUseCase implements ImportInvoicePort {
  constructor(
    private readonly invoiceRepo: InvoiceRepositoryPort,
    private readonly storage: DocumentStoragePort,
    private readonly aiExtraction: AiExtractionPort,
    private readonly supplierLookup: SupplierLookupPort,
  ) {}

  async execute(command: ImportInvoiceCommand): Promise<InvoiceImportResultDTO> {
    // 1. Persist the original file
    const fileUrl = await this.storage.store(
      command.fileBuffer,
      command.filename,
      command.mimeType,
    );

    // 2. Extract invoice data with AI (send buffer directly — no public URL needed)
    const extraction = await this.aiExtraction.extract(command.fileBuffer, command.mimeType);

    // 3. Look up supplier by NIF
    let supplierMatch: SupplierSummary | null = null;
    if (extraction.supplierNif) {
      supplierMatch = await this.supplierLookup.findByNif(extraction.supplierNif);
    }

    // 4. Collect validation issues
    const validationIssues = [...extraction.validationIssues];

    // Duplicate check by NIF + invoice number — warn only, don't block (user can correct in review)
    if (extraction.supplierNif && extraction.invoiceNumber) {
      const duplicate = await this.invoiceRepo.findDuplicateByNif(extraction.invoiceNumber, extraction.supplierNif);
      if (duplicate) validationIssues.push("duplicate_invoice");
    }

    if (!extraction.dueDate) {
      validationIssues.push("no_due_date");
    }
    if (!supplierMatch) {
      validationIssues.push("no_supplier_match");
    }
    if (extraction.confidence < AI_CONFIDENCE_REVIEW_THRESHOLD) {
      validationIssues.push("low_ai_confidence");
    }
    if (
      extraction.subtotalWithoutVat !== null &&
      extraction.vatAmount !== null &&
      extraction.totalWithVat !== null
    ) {
      const diff = Math.abs(
        extraction.subtotalWithoutVat + extraction.vatAmount - extraction.totalWithVat,
      );
      if (diff > VALUE_DISCREPANCY_MARGIN_CENTS) {
        validationIssues.push("value_discrepancy");
      }
    }

    const requiresReview = validationIssues.length > 0;

    // 5. Apply supplier defaults if found
    const costCenterGroupId = supplierMatch?.defaultCostCenterGroupId ?? null;
    const costCenterCategoryId = supplierMatch?.defaultCostCenterCategoryId ?? null;
    const financialType = supplierMatch?.defaultFinancialType ?? null;

    // 6. Create draft invoice (supplier defaults embedded at creation time)
    const source = command.mimeType === "application/pdf" ? "pdf_import" : "image_import";
    const finalInvoice = Invoice.createFromImport({
      supplierId: supplierMatch?.id ?? null,
      supplierName: extraction.supplierName ?? "Fornecedor desconhecido",
      supplierNifSnapshot: extraction.supplierNif ?? null,
      invoiceNumber: extraction.invoiceNumber ?? "",
      invoiceDate: extraction.issueDate ?? new Date(),
      dueDate: extraction.dueDate ?? null,
      subtotalWithoutVat: extraction.subtotalWithoutVat ?? 0,
      totalVat: extraction.vatAmount ?? 0,
      totalWithVat: extraction.totalWithVat ?? 0,
      source,
      attachmentUrl: fileUrl,
      aiConfidence: extraction.confidence,
      requiresReview,
      costCenterGroupId,
      costCenterCategoryId,
      financialType,
      currency: extraction.currency ?? "EUR",
    });

    await this.invoiceRepo.save(finalInvoice);

    return {
      invoice: toInvoiceDTO(finalInvoice),
      aiConfidence: extraction.confidence,
      validationIssues,
      supplierMatch: supplierMatch
        ? {
            id: supplierMatch.id,
            name: supplierMatch.name,
            nif: supplierMatch.nif,
            defaultCostCenterGroupId: supplierMatch.defaultCostCenterGroupId,
            defaultCostCenterCategoryId: supplierMatch.defaultCostCenterCategoryId,
            defaultFinancialType: supplierMatch.defaultFinancialType,
          }
        : null,
      extractedLines: extraction.lines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unitPriceWithoutVat: l.unitPriceWithoutVat,
        vatRate: l.vatRate,
        vatAmount: l.vatAmount,
        totalWithoutVat: l.totalWithoutVat,
        totalWithVat: l.totalWithVat,
      })),
    };
  }
}
