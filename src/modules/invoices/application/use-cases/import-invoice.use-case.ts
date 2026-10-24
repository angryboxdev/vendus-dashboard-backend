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
import { createHash } from "node:crypto";
import type { FiscalIdentityPort } from "../../domain/ports/out/fiscal-identity.port.js";
import type { PdfContentReaderPort } from "../../domain/ports/out/pdf-content-reader.port.js";
import type { InvoiceReadingWritePort } from "../../domain/ports/out/invoice-reading-write.port.js";
import type { ClassifyInvoiceLinesPort } from "../../domain/ports/in/classify-invoice-lines.port.js";
import type { InvoiceLayout } from "../../domain/services/reading/invoice-layout.js";
import type { InvoiceReading } from "../../domain/entities/invoice-reading.js";
import type { AiExtractionResult } from "../../domain/entities/ai-extraction-result.js";
import type { LineClassification } from "../../domain/services/classification/line-classifier.js";
import { readInvoice } from "../../domain/services/reading/invoice-reader.service.js";
import { readingToExtraction } from "../../domain/services/reading/reading-to-extraction.js";
import { sanitizeExtractedLines } from "../../domain/services/extracted-lines.service.js";
import { applyQrToExtraction } from "../../domain/services/reading/reading-to-extraction.js";
import { readFiscalQr } from "../../domain/services/reading/invoice-reader.service.js";
import { ACCEPTED_FISCAL_DOCUMENT_TYPES, NotAFiscalInvoiceError } from "../../domain/errors.js";
import type { FiscalQr } from "../../domain/entities/invoice-reading.js";

const AI_CONFIDENCE_REVIEW_THRESHOLD = 0.7;
const VALUE_DISCREPANCY_MARGIN_CENTS = 2;
const LOCAL_READ_TIMEOUT_MS = 8000;

/**
 * Leitor inteligente (E3): leitura determinística (QR + texto do PDF) antes da IA e
 * categoria sugerida por linha. Opcional — sem ela a importação é a de sempre.
 */
export interface SmartReadingDeps {
  pdf: PdfContentReaderPort;
  layouts: InvoiceLayout[];
  readingWrite: InvoiceReadingWritePort;
  classifyLines: ClassifyInvoiceLinesPort | null;
}

export class ImportInvoiceUseCase implements ImportInvoicePort {
  constructor(
    private readonly invoiceRepo: InvoiceRepositoryPort,
    private readonly storage: DocumentStoragePort,
    private readonly aiExtraction: AiExtractionPort,
    private readonly supplierLookup: SupplierLookupPort,
    private readonly supplierHint: SupplierHintPort,
    private readonly organizationIdentityRead: OrganizationIdentityReadPort,
    private readonly fiscal: FiscalIdentityPort,
    private readonly smart: SmartReadingDeps | null = null,
  ) {}

  /**
   * Leitura determinística. `reading` = null quando nenhum layout serve (segue a IA); um layout
   * genérico (estrito) só conta se reconciliar ao cêntimo. `qr` = QR fiscal válido, mesmo sem layout.
   */
  private async readLocally(buffer: Buffer, mimeType: string): Promise<{ reading: InvoiceReading | null; qr: FiscalQr | null; qrType: string | null }> {
    if (!this.smart || mimeType !== "application/pdf") return { reading: null, qr: null, qrType: null };
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), LOCAL_READ_TIMEOUT_MS).unref?.());
    const content = await Promise.race([this.smart.pdf.read(buffer, mimeType).catch(() => null), timeout]);
    if (!content) return { reading: null, qr: null, qrType: null };
    const { qr, issues } = readFiscalQr(content);
    const validQr = qr && !issues.some((i) => i.blocking) ? qr : null;
    const reading = readInvoice(content, this.smart.layouts);
    const layout = this.smart.layouts.find((l) => l.id === reading.layout);
    const accepted = reading.status !== "unsupported" && reading.lines.length > 0 && (!layout?.strict || reading.status === "ready");
    // O tipo do documento conta mesmo com totais do QR incoerentes (o campo D continua legível).
    return { reading: accepted ? reading : null, qr: validQr, qrType: qr?.documentType ?? null };
  }

  /** Categoria sugerida por linha; nunca faz falhar a importação. */
  private async classify(organizationId: ImportInvoiceCommand["organizationId"], supplierId: string | null, extraction: AiExtractionResult): Promise<LineClassification[]> {
    if (!this.smart?.classifyLines || extraction.lines.length === 0) return [];
    try {
      const lines = extraction.lines.map((l, index) => ({ index, kind: l.meta?.kind ?? ("product" as const), supplierCode: l.meta?.supplierCode ?? null, description: l.description }));
      return (await this.smart.classifyLines.execute(organizationId, { supplierId, lines })).classifications;
    } catch {
      return [];
    }
  }

  async execute(command: ImportInvoiceCommand): Promise<InvoiceImportResultDTO> {
    // 0. Mesmo ficheiro já importado → devolve o mesmo documento (sem nova extração paga nem cópia).
    const sha256 = createHash("sha256").update(command.fileBuffer).digest("hex");
    const sameFile = await this.invoiceRepo.findByFileHash(command.organizationId, sha256);
    if (sameFile) {
      return { invoice: toInvoiceDTO(sameFile), aiConfidence: sameFile.aiConfidence ?? 0, validationIssues: ["duplicate_invoice"], supplierMatch: null, extractedLines: [], reused: "same_file" };
    }

    // 1. Leitor determinístico primeiro (QR fiscal + texto do PDF, sem IA). O QR diz o tipo do documento:
    //    pró-formas, orçamentos, guias e recibos não são faturas → recusados antes de guardar o ficheiro.
    const t0 = Date.now();
    const { reading, qr, qrType } = await this.readLocally(command.fileBuffer, command.mimeType);
    if (qrType && !(ACCEPTED_FISCAL_DOCUMENT_TYPES as readonly string[]).includes(qrType)) throw new NotAFiscalInvoiceError(qrType);

    // 2. Persist the original file
    const fileUrl = await this.storage.store(
      command.fileBuffer,
      command.filename,
      command.mimeType,
      command.organizationId,
    );

    // 3. Sem layout conhecido → IA (buffer enviado diretamente — sem URL público).
    let lineNotes: { code: string; blocking: boolean; detail: string }[] = [];
    let extraction: AiExtractionResult;
    if (reading) extraction = readingToExtraction(reading);
    else {
      // Linhas da IA: quantidade × preço tem de dar o total impresso da linha (senão prevalece o total).
      const raw = await this.aiExtraction.extract(command.fileBuffer, command.mimeType);
      const sanitized = sanitizeExtractedLines(raw.lines);
      // Com QR fiscal válido, identidade e totais vêm do QR (dado certificado), não da leitura da IA.
      extraction = qr ? applyQrToExtraction({ ...raw, lines: sanitized.lines }, qr) : { ...raw, lines: sanitized.lines };
      lineNotes = sanitized.notes.map((n) => ({ code: "line_unit_price_discarded", blocking: false, detail: n.detail }));
    }
    const readMs = Date.now() - t0;

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
    // A escolha explícita do utilizador (feita antes do upload) tem sempre
    // prioridade sobre a deteção automática da IA.
    const documentType = command.documentType ?? extraction.documentType ?? "invoice";
    if (command.documentType === undefined && extraction.documentType === "credit_note") {
      // Só força revisão quando foi a IA a decidir — se o utilizador já
      // escolheu explicitamente, não há nada de novo para rever aqui.
      validationIssues.push("credit_note_detected");
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

    // Identidade fiscal partilhada (task v1.2 §1.2): o mesmo documento já lançado no Financeiro não gera
    // novo rascunho — devolve-se o original; só no Stock → o rascunho oferece completar o existente.
    const fiscalCheck = await this.fiscal.check(command.organizationId, {
      legalEntityId: null,
      supplierNif: supplierNif ?? supplierMatch?.nif ?? null,
      documentType: command.documentType ?? extraction.documentType ?? "invoice",
      invoiceNumber: extraction.invoiceNumber ?? null,
      atcud: reading?.header.atcud ?? qr?.atcud ?? null,
    });
    if (fiscalCheck.kind === "existing_finance" && fiscalCheck.existingInvoiceId) {
      const original = await this.invoiceRepo.findById(command.organizationId, fiscalCheck.existingInvoiceId);
      if (original) {
        await this.storage.delete(fileUrl).catch(() => undefined);
        return { invoice: toInvoiceDTO(original), aiConfidence: extraction.confidence, validationIssues: ["duplicate_invoice"], supplierMatch: null, extractedLines: [], reused: "same_fiscal_identity", fiscal: { kind: fiscalCheck.kind, existingInvoiceId: original.id, identityId: fiscalCheck.identityId } };
      }
    }
    if (fiscalCheck.kind === "existing_stock_only") validationIssues.push("exists_in_stock");
    if (fiscalCheck.kind === "possible_duplicate") validationIssues.push("possible_duplicate");
    if (fiscalCheck.kind === "incomplete") {
      // NIF lido com dígito de controlo errado: dizê-lo (não é falta de NIF nem de país).
      validationIssues.push(fiscalCheck.missing.includes("issuer_tax_id_invalid") ? "supplier_nif_invalid" : "fiscal_identity_incomplete");
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
      documentType,
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
    await this.invoiceRepo.setFileHash(command.organizationId, finalInvoice.id, sha256);
    if (this.smart && (reading || qr)) {
      // Evidência da leitura: se falhar, a importação continua (o rascunho já está gravado).
      await this.smart.readingWrite.save(command.organizationId, finalInvoice.id, { fiscalQr: (reading?.qr ?? qr)?.fields ?? null, source: reading ? "deterministic" : "ai" }).catch(() => undefined);
    }
    const classifications = await this.classify(command.organizationId, supplierMatch?.id ?? null, extraction);
    const byIndex = new Map(classifications.map((c) => [c.index, c]));

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
      extractedLines: extraction.lines.map((l, i) => ({
        ...(l.meta && { meta: l.meta }),
        ...(byIndex.has(i) && {
          suggestedCostCenterCategoryId: byIndex.get(i)!.categoryId,
          classificationSource: byIndex.get(i)!.source,
          classificationEvidence: byIndex.get(i)!.evidence,
          ...(byIndex.get(i)!.conflict && { classificationConflict: true }),
        }),
        description: l.description,
        quantity: l.quantity,
        unitPriceWithoutVat: l.unitPriceWithoutVat,
        vatRate: l.vatRate,
        vatAmount: l.vatAmount,
        totalWithoutVat: l.totalWithoutVat,
        totalWithVat: l.totalWithVat,
        quantityText: l.quantityText ?? null,
        unitPriceText: l.unitPriceText ?? null,
        grossWithoutDiscount: l.grossWithoutDiscount ?? null,
        discountPct: l.discountPct ?? null,
        discountAmount: l.discountAmount ?? null,
      })),
      ...(extraction.amounts && { extractedAmounts: extraction.amounts }),
      ...(this.smart && {
        reading: {
          source: reading ? ("deterministic" as const) : ("ai" as const),
          layout: reading?.layout ?? null,
          qrRead: !!(reading?.qr ?? qr),
          status: reading?.status ?? ("unsupported" as const),
          issues: reading?.issues ?? lineNotes,
          aiCalls: reading ? 0 : 1,
          ms: readMs,
        },
      }),
      fiscal: {
        kind: fiscalCheck.kind,
        ...(fiscalCheck.kind === "existing_stock_only" && { identityId: fiscalCheck.identityId }),
        ...(fiscalCheck.kind === "possible_duplicate" && { candidates: fiscalCheck.candidates }),
        ...(fiscalCheck.kind === "incomplete" && { missing: fiscalCheck.missing }),
      },
    };
  }
}
