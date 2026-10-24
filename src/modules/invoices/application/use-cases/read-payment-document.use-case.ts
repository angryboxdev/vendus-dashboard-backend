import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { PaymentDocumentImportDTO, ReadPaymentDocumentPort } from "../../domain/ports/in/payment-document.ports.js";
import type { ObligationCandidatesPort } from "../../domain/ports/out/obligation-candidates.port.js";
import type { OrganizationIdentityReadPort } from "../../domain/ports/out/organization-identity-read.port.js";
import type { PdfContentReaderPort } from "../../domain/ports/out/pdf-content-reader.port.js";
import type { SupplierLookupPort } from "../../domain/ports/out/supplier-lookup.port.js";
import { readFiscalQr } from "../../domain/services/reading/invoice-reader.service.js";
import { matchObligations } from "../../domain/services/reading/obligation-match.js";
import { detectDocumentKind, readPaymentDocument } from "../../domain/services/reading/payment-documents.js";
import { normalizeSupplierName } from "../../domain/utils/supplier-name.js";

const ISSUER_SUPPLIER = {
  AT: /(AUTORIDADE TRIBUTARIA|TESOURO E FINANCAS|DIRECAO GERAL DO TESOURO|DIRECCAO GERAL DO TESOURO|FINANCAS)/,
  SS: /(SEGURANCA SOCIAL)/,
};

const DETECTION_TIMEOUT_MS = 8000;

const lisbonToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date());

/**
 * Documentos de cobrança do Estado (AT retenções, SS referência MB): lidos sem IA,
 * sem criar fatura, dívida, despesa nem Stock. Devolve a leitura para revisão e as
 * obrigações já registadas que parecem ser a mesma.
 */
export class ReadPaymentDocumentUseCase implements ReadPaymentDocumentPort {
  constructor(
    private readonly pdf: PdfContentReaderPort,
    private readonly candidates: ObligationCandidatesPort,
    private readonly suppliers: SupplierLookupPort,
    private readonly organizationIdentity: OrganizationIdentityReadPort,
    private readonly today: () => string = lisbonToday,
  ) {}

  async execute(organizationId: OrganizationId, file: { buffer: Buffer; mimeType: string }): Promise<PaymentDocumentImportDTO | null> {
    const t0 = Date.now();
    // Corre antes de cada importação: se a leitura local falhar ou demorar, segue o fluxo de faturas de sempre.
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), DETECTION_TIMEOUT_MS).unref?.());
    const content = await Promise.race([this.pdf.read(file.buffer, file.mimeType).catch(() => null), timeout]);
    if (!content) return null;
    const kind = detectDocumentKind(content, readFiscalQr(content).qr);
    if (kind !== "at_withholding" && kind !== "ss_payment_reference") return null;

    const tb = Date.now();
    // A SS não traz código; só a AT justifica rasterizar.
    const barcode = kind === "at_withholding" ? await this.pdf.readBarcode(file.buffer, 2) : ({ status: "absent" } as const);
    const barcodeMs = Date.now() - tb;
    const organizationNif = await this.organizationIdentity.getNif(organizationId);
    const payment = readPaymentDocument({ content, kind, barcode, today: this.today(), organizationNif });

    const numbers = [payment.documentNumber, payment.paymentReference].filter((n): n is string => !!n);
    const [existing, allSuppliers] = await Promise.all([
      this.candidates.find(organizationId, { amountCents: payment.totalCents, numbers }),
      this.suppliers.findAll(organizationId),
    ]);
    const rx = ISSUER_SUPPLIER[payment.issuer];
    const supplier = allSuppliers.find((s) => rx.test(normalizeSupplierName(s.name).toUpperCase())) ?? null;
    return {
      kind: "payment_document",
      payment,
      matches: matchObligations(payment, existing),
      supplierSuggestion: supplier
        ? { id: supplier.id, name: supplier.name, defaultCostCenterGroupId: supplier.defaultCostCenterGroupId, defaultCostCenterCategoryId: supplier.defaultCostCenterCategoryId }
        : null,
      metrics: { totalMs: Date.now() - t0, barcodeMs, aiCalls: 0 },
    };
  }
}
