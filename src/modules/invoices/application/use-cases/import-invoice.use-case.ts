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
import { createHash, randomUUID } from "node:crypto";
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
import { applyQrToExtraction, enforceQrLines } from "../../domain/services/reading/reading-to-extraction.js";
import { otherFiscalQrs, readFiscalQr } from "../../domain/services/reading/invoice-reader.service.js";
import { ACCEPTED_FISCAL_DOCUMENT_TYPES, AiBudgetExceededError, NotAFiscalInvoiceError } from "../../domain/errors.js";
import type { AiBudgetPort } from "../../domain/ports/out/ai-budget.port.js";
import type { FiscalQr, ReadingIssue } from "../../domain/entities/invoice-reading.js";

const AI_CONFIDENCE_REVIEW_THRESHOLD = 0.7;
const VALUE_DISCREPANCY_MARGIN_CENTS = 2;
/**
 * Limite da leitura local (texto + QR). Generoso: ler o QR evita uma chamada à IA (que também
 * demora) e dá identidade e totais certificados; o servidor (Render starter) é bem mais lento do
 * que uma máquina de desenvolvimento. Ultrapassado → segue pela IA, com aviso na revisão.
 */
const LOCAL_READ_TIMEOUT_MS = 20_000;

/**
 * Leitor inteligente (E3): leitura determinística (QR + texto do PDF) antes da IA e
 * categoria sugerida por linha. Opcional — sem ela a importação é a de sempre.
 */
export interface SmartReadingDeps {
  pdf: PdfContentReaderPort;
  layouts: InvoiceLayout[];
  readingWrite: InvoiceReadingWritePort;
  classifyLines: ClassifyInvoiceLinesPort | null;
  /** Orçamento diário de IA por organização (sem ele, sem limite). */
  aiBudget?: AiBudgetPort | null;
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
  private async readLocally(
    buffer: Buffer,
    mimeType: string,
  ): Promise<{ reading: InvoiceReading | null; qr: FiscalQr | null; qrType: string | null; qrNotes: ReadingIssue[]; otherQrs: FiscalQr[]; timedOut: boolean }> {
    const none = { reading: null, qr: null, qrType: null, qrNotes: [], otherQrs: [], timedOut: false };
    if (!this.smart || mimeType !== "application/pdf") return none;
    const TIMED_OUT = Symbol("timeout");
    const t0 = Date.now();
    const timeout = new Promise<typeof TIMED_OUT>((resolve) => setTimeout(() => resolve(TIMED_OUT), LOCAL_READ_TIMEOUT_MS).unref?.());
    const content = await Promise.race([
      this.smart.pdf.read(buffer, mimeType).catch((e: unknown) => {
        console.error("[invoices] leitura local do PDF falhou (segue pela IA):", e instanceof Error ? e.message : e);
        return null;
      }),
      timeout,
    ]);
    if (content === TIMED_OUT) {
      console.warn(`[invoices] leitura local do PDF excedeu ${LOCAL_READ_TIMEOUT_MS} ms (segue pela IA, sem QR)`);
      return { ...none, timedOut: true };
    }
    if (!content) return none;
    const readMs = Date.now() - t0;
    if (readMs > LOCAL_READ_TIMEOUT_MS / 2) console.warn(`[invoices] leitura local do PDF lenta: ${readMs} ms`);
    const { qr, issues } = readFiscalQr(content);
    const validQr = qr && !issues.some((i) => i.blocking) ? qr : null;
    const reading = readInvoice(content, this.smart.layouts);
    const layout = this.smart.layouts.find((l) => l.id === reading.layout);
    const accepted = reading.status !== "unsupported" && reading.lines.length > 0 && (!layout?.strict || reading.status === "ready");
    // O tipo do documento conta mesmo com totais do QR incoerentes (o campo D continua legível).
    return {
      reading: accepted ? reading : null,
      qr: validQr,
      qrType: qr?.documentType ?? null,
      qrNotes: issues.filter((i) => !i.blocking && i.code === "qr_multiple_documents"),
      otherQrs: validQr ? otherFiscalQrs(content, validQr) : [],
      timedOut: false,
    };
  }

  /**
   * Logótipo da fatura para um fornecedor ainda sem logótipo (E3b): guardado no armazenamento da
   * organização e devolvido como sugestão — só fica no fornecedor se a pessoa confirmar. Nunca falha o import.
   */
  private async suggestLogo(command: ImportInvoiceCommand): Promise<{ url: string; width: number; height: number } | null> {
    if (!this.smart || command.mimeType !== "application/pdf") return null;
    try {
      const logo = await this.smart.pdf.extractLogo(command.fileBuffer);
      if (!logo) return null;
      const url = await this.storage.store(logo.png, "logo-fornecedor.png", "image/png", command.organizationId);
      return { url, width: logo.width, height: logo.height };
    } catch {
      return null;
    }
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
    const { reading, qr, qrType, qrNotes, otherQrs, timedOut } = await this.readLocally(command.fileBuffer, command.mimeType);
    if (qrType && !(ACCEPTED_FISCAL_DOCUMENT_TYPES as readonly string[]).includes(qrType)) throw new NotAFiscalInvoiceError(qrType);

    // Orçamento diário de IA: sem leitura determinística, a leitura pela IA tem de caber no limite do dia
    // (verificado antes de guardar o ficheiro — recusar não deixa nada para trás).
    if (!reading && this.smart?.aiBudget) {
      const budget = await this.smart.aiBudget.consume(command.organizationId, "invoice_extraction");
      if (!budget.allowed) throw new AiBudgetExceededError(budget.limit);
    }

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
      lineNotes = sanitized.notes.map((n) => ({ code: n.code, blocking: false, detail: n.detail }));
      // «Linhas conferidas»: com QR, linhas da IA que não fecham com ele dão lugar às bases do QR por taxa.
      if (qr) {
        const enforced = enforceQrLines(extraction, qr);
        extraction = enforced.extraction;
        if (enforced.note) lineNotes = [{ code: "lines_replaced_by_qr", blocking: false, detail: enforced.note }];
      }
    }
    lineNotes.push(...qrNotes.map((n) => ({ code: n.code, blocking: false, detail: n.detail })));
    if (timedOut) {
      lineNotes.push({ code: "local_read_timeout", blocking: false, detail: "A leitura do QR fiscal demorou demasiado — a fatura foi lida só pela IA. Confirme fornecedor, número e valores com o documento." });
    }
    const readMs = Date.now() - t0;

    // 4. Um rascunho por fatura fiscal: a 1.ª com a leitura acima; num documento de pagamento com
    //    vários QR (ex.: águas + resíduos), as restantes saem de cada QR (emitente pelo NIF, uma linha
    //    por taxa) — sem nova chamada à IA — e ficam no mesmo grupo de pagamento.
    const primary = await this.buildDraft(command, { extraction, reading, qr, lineNotes, fileUrl, sha256, readMs, primary: true });
    const siblings: InvoiceImportResultDTO[] = [];
    for (const other of otherQrs) {
      if (!(ACCEPTED_FISCAL_DOCUMENT_TYPES as readonly string[]).includes(other.documentType ?? "")) continue;
      const fromQr = enforceQrLines(
        applyQrToExtraction({ ...extraction, supplierName: null, supplierAddress: null, supplierEmail: null, lines: [], confidence: 1, validationIssues: [] }, other),
        other,
      ).extraction;
      const note = { code: "read_from_qr", blocking: false, detail: `Fatura ${other.documentNumber} lida do QR fiscal do mesmo documento de pagamento (sem IA) — confirme o fornecedor e classifique.` };
      siblings.push(await this.buildDraft(command, { extraction: fromQr, reading: null, qr: other, lineNotes: [note], fileUrl, sha256, readMs, primary: false }));
    }
    if (!siblings.length) {
      if (primary.reused) await this.storage.delete(fileUrl).catch(() => undefined);
      return primary;
    }

    const all = [primary, ...siblings];
    // Tudo já existia: nada novo ficou a apontar para o ficheiro acabado de guardar.
    if (all.every((r) => r.reused)) await this.storage.delete(fileUrl).catch(() => undefined);
    const fresh = all.filter((r) => !r.reused);
    let groupId: string | null = null;
    if (fresh.length > 1) {
      // A ligação é uma ajuda (recorrência e conciliação do grupo): se falhar, as faturas ficam criadas.
      try {
        const id = randomUUID();
        await this.invoiceRepo.setPaymentGroup(command.organizationId, fresh.map((r) => r.invoice.id), id);
        groupId = id;
      } catch (e) {
        console.error("[invoices] não foi possível ligar as faturas do mesmo documento de pagamento (ignorado):", e instanceof Error ? e.message : e);
      }
    }
    const withGroup = (r: InvoiceImportResultDTO) => (groupId && !r.reused ? { ...r, invoice: { ...r.invoice, paymentGroupId: groupId } } : r);
    return { ...withGroup(primary), siblings: siblings.map(withGroup) };
  }

  /** Fornecedor, validações, identidade fiscal e rascunho de UMA fatura lida (a 1.ª do PDF ou outra pelo seu QR). */
  private async buildDraft(
    command: ImportInvoiceCommand,
    ctx: {
      extraction: AiExtractionResult;
      reading: InvoiceReading | null;
      qr: FiscalQr | null;
      lineNotes: { code: string; blocking: boolean; detail: string }[];
      fileUrl: string;
      sha256: string;
      readMs: number;
      /** A 1.ª fatura do PDF: fica com o hash do ficheiro, a IA (se houve) e o logótipo. */
      primary: boolean;
    },
  ): Promise<InvoiceImportResultDTO> {
    const { extraction, reading, qr, lineNotes, fileUrl, sha256, readMs } = ctx;
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

    // 3b. Com QR, o NIF do emitente é certificado: um fornecedor achado pela dica ou pelo nome com
    //     outro NIF não é este emitente (ex.: «Águas e Energia do Porto» → «Goldenergy»). Fica sem
    //     fornecedor (a revisão propõe criá-lo com o NIF do QR); se essa ficha tiver o NIF da própria
    //     empresa (o cliente da fatura), avisa — a ficha está errada.
    let supplierRecordHasOwnNif = false;
    if (qr && supplierMatch && supplierMatchMethod !== "nif" && supplierMatch.nif && normalizeNif(supplierMatch.nif) !== normalizeNif(qr.issuerNif)) {
      const recordNif = normalizeNif(supplierMatch.nif);
      supplierRecordHasOwnNif =
        (!!ownNif && recordNif === normalizeNif(ownNif)) || (!!qr.buyerNif && recordNif === normalizeNif(qr.buyerNif));
      supplierMatch = null;
      supplierMatchMethod = null;
    }

    // 4. Collect validation issues
    const validationIssues = [...extraction.validationIssues];
    if (extractedIsOwnCompany) validationIssues.push("supplier_is_own_company");
    if (supplierRecordHasOwnNif) validationIssues.push("supplier_record_has_own_nif");

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
        return { invoice: toInvoiceDTO(original), aiConfidence: extraction.confidence, validationIssues: ["duplicate_invoice"], supplierMatch: null, extractedLines: [], reused: "same_fiscal_identity", fiscal: { kind: fiscalCheck.kind, existingInvoiceId: original.id, identityId: fiscalCheck.identityId } };
      }
    }
    if (fiscalCheck.kind === "existing_stock_only") validationIssues.push("exists_in_stock");
    if (fiscalCheck.kind === "possible_duplicate") validationIssues.push("possible_duplicate");
    if (fiscalCheck.kind === "incomplete") {
      // NIF lido com dígito de controlo errado: dizê-lo (não é falta de NIF nem de país).
      validationIssues.push(fiscalCheck.missing.includes("issuer_tax_id_invalid") ? "supplier_nif_invalid" : "fiscal_identity_incomplete");
    }

    // Quantidade/preço corrigidos por ordem de grandeza (separador decimal): fica «para rever».
    if (lineNotes.some((n) => n.code === "quantity_scale_corrected" || n.code === "unit_price_scale_corrected")) validationIssues.push("quantity_scale_corrected");
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
    if (ctx.primary) await this.invoiceRepo.setFileHash(command.organizationId, finalInvoice.id, sha256);
    if (this.smart && (reading || qr)) {
      // Evidência da leitura: se falhar, a importação continua (o rascunho já está gravado).
      await this.smart.readingWrite.save(command.organizationId, finalInvoice.id, { fiscalQr: (reading?.qr ?? qr)?.fields ?? null, source: reading || !ctx.primary ? "deterministic" : "ai" }).catch(() => undefined);
    }
    const classifications = await this.classify(command.organizationId, supplierMatch?.id ?? null, extraction);
    const logoSuggestion = !ctx.primary || supplierMatch?.logoUrl ? null : await this.suggestLogo(command);
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
          source: reading || !ctx.primary ? ("deterministic" as const) : ("ai" as const),
          layout: reading?.layout ?? null,
          qrRead: !!(reading?.qr ?? qr),
          status: reading?.status ?? (ctx.primary ? ("unsupported" as const) : ("needs_attention" as const)),
          issues: reading?.issues ?? lineNotes,
          aiCalls: reading || !ctx.primary ? 0 : 1,
          ms: readMs,
        },
      }),
      ...(logoSuggestion && { logoSuggestion }),
      fiscal: {
        kind: fiscalCheck.kind,
        ...(fiscalCheck.kind === "existing_stock_only" && { identityId: fiscalCheck.identityId }),
        ...(fiscalCheck.kind === "possible_duplicate" && { candidates: fiscalCheck.candidates }),
        ...(fiscalCheck.kind === "incomplete" && { missing: fiscalCheck.missing }),
      },
    };
  }
}
