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
import type { SupplierHintPort } from "../../domain/ports/out/supplier-hint.port.js";
import type { OrganizationIdentityReadPort } from "../../domain/ports/out/organization-identity-read.port.js";
import { normalizeNif } from "../../domain/utils/nif.js";
import { normalizeSupplierName, supplierNameSimilarity, FUZZY_MATCH_THRESHOLD } from "../../domain/utils/supplier-name.js";
import { toInvoiceDTO } from "./shared.js";

const AI_CONFIDENCE_REVIEW_THRESHOLD = 0.7;
const VALUE_DISCREPANCY_MARGIN_CENTS = 2;

export class ImportInvoiceUseCase implements ImportInvoicePort {
  constructor(
    private readonly invoiceRepo: InvoiceRepositoryPort,
    private readonly storage: DocumentStoragePort,
    private readonly aiExtraction: AiExtractionPort,
    private readonly supplierLookup: SupplierLookupPort,
    private readonly supplierHint: SupplierHintPort,
    private readonly organizationIdentityRead: OrganizationIdentityReadPort,
  ) {}

  async execute(command: ImportInvoiceCommand): Promise<InvoiceImportResultDTO> {
    // 1. Persist the original file
    const fileUrl = await this.storage.store(
      command.fileBuffer,
      command.filename,
      command.mimeType,
      command.organizationId,
    );

    // 2. Extract invoice data with AI (send buffer directly — no public URL needed)
    const extraction = await this.aiExtraction.extract(command.fileBuffer, command.mimeType);

    // 2b. Guard: the AI sometimes reads our own company's details off the
    // invoice (billing/"cliente" section) instead of the actual issuer's —
    // never let our own NIF end up as the supplier of an imported invoice,
    // regardless of which legal name the organization is currently trading
    // under (the NIF is what stays constant across a company name change).
    const ownNif = await this.organizationIdentityRead.getNif(command.organizationId);
    const extractedIsOwnCompany =
      !!ownNif && !!extraction.supplierNif && normalizeNif(extraction.supplierNif) === normalizeNif(ownNif);
    const supplierNif = extractedIsOwnCompany ? null : extraction.supplierNif;
    const supplierName = extractedIsOwnCompany ? null : extraction.supplierName;

    // 3. Look up supplier — 3-step chain:
    //    a) NIF exacto (normalizado) → b) hint de confirmação anterior → c) fuzzy por nome
    let supplierMatch: SupplierSummary | null = null;
    let supplierMatchMethod: "nif" | "hint" | "fuzzy" | null = null;

    if (supplierNif) {
      supplierMatch = await this.supplierLookup.findByNif(command.organizationId, normalizeNif(supplierNif));
      if (supplierMatch) supplierMatchMethod = "nif";
    }

    if (!supplierMatch && supplierName) {
      const normalizedName = normalizeSupplierName(supplierName);
      if (normalizedName) {
        supplierMatch = await this.supplierHint.findByNormalizedName(command.organizationId, normalizedName);
        if (supplierMatch) supplierMatchMethod = "hint";
      }
    }

    if (!supplierMatch && supplierName) {
      const allSuppliers = await this.supplierLookup.findAll(command.organizationId);
      let bestScore = 0;
      let bestSupplier: SupplierSummary | null = null;
      for (const s of allSuppliers) {
        const score = supplierNameSimilarity(supplierName, s.name);
        if (score > bestScore) {
          bestScore = score;
          bestSupplier = s;
        }
      }
      if (bestScore >= FUZZY_MATCH_THRESHOLD && bestSupplier) {
        supplierMatch = bestSupplier;
        supplierMatchMethod = "fuzzy";
      }
    }

    // 4. Collect validation issues
    const validationIssues = [...extraction.validationIssues];
    if (extractedIsOwnCompany) validationIssues.push("supplier_is_own_company");

    // Duplicate check — warn only, don't block (user can correct in review).
    // Prefer the resolved supplier (reliable regardless of whether the AI
    // extracted a NIF this time — e.g. supplier matched by hint/fuzzy name);
    // fall back to supplierNif (sanitized — null when extractedIsOwnCompany,
    // so we never check duplicates against our own company's NIF).
    if (extraction.invoiceNumber) {
      const duplicate = supplierMatch
        ? await this.invoiceRepo.findDuplicate(command.organizationId, extraction.invoiceNumber, supplierMatch.id)
        : supplierNif
          ? await this.invoiceRepo.findDuplicateByNif(command.organizationId, extraction.invoiceNumber, supplierNif)
          : null;
      if (duplicate) validationIssues.push("duplicate_invoice");
    }

    if (!extraction.dueDate) {
      validationIssues.push("no_due_date");
    }
    if (!supplierMatch) {
      validationIssues.push("no_supplier_match");
    } else if (supplierMatchMethod === "fuzzy") {
      // Fuzzy match should be reviewed — hint matches (from prior confirmations) are reliable
      validationIssues.push("supplier_matched_by_name");
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
      supplierName: supplierName ?? "Fornecedor desconhecido",
      supplierNifSnapshot: supplierNif ?? null,
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

    await this.invoiceRepo.save(command.organizationId, finalInvoice);

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
