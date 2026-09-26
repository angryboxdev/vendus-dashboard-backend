import { SupplierNotFoundError } from "../../domain/errors.js";
import type { SupplierRepositoryPort } from "../../domain/ports/out/supplier-repository.port.js";
import type { SupplierInvoiceStatsPort } from "../../domain/ports/out/supplier-invoice-stats.port.js";
import type { InvoicePaymentReadPort } from "../../domain/ports/out/invoice-payment-read.port.js";
import type {
  GetSupplierStatementCommand,
  GetSupplierStatementPort,
  SupplierStatementDTO,
  StatementLineDTO,
} from "../../domain/ports/in/supplier-statement.ports.js";
import { toSupplierDTO } from "./shared.js";

const BALANCE_TOLERANCE = 0.01; // 1 cêntimo, mesma unidade (euros) que o resto deste DTO

export class GetSupplierStatementUseCase implements GetSupplierStatementPort {
  constructor(
    private readonly supplierRepository: SupplierRepositoryPort,
    private readonly invoiceStats: SupplierInvoiceStatsPort,
    private readonly invoicePaymentRead: InvoicePaymentReadPort,
  ) {}

  async execute(command: GetSupplierStatementCommand): Promise<SupplierStatementDTO> {
    const supplier = await this.supplierRepository.findById(command.organizationId, command.id);
    if (!supplier) throw new SupplierNotFoundError(command.id);

    const filter = command.startDate ?? command.endDate
      ? {
          ...(command.startDate && { startDate: command.startDate }),
          ...(command.endDate && { endDate: command.endDate }),
        }
      : undefined;

    const invoices = await this.invoiceStats.listInvoicesBySupplier(
      command.organizationId,
      supplier.id,
      filter,
    );

    // Calcula stats sobre as faturas filtradas (não sobre o histórico completo)
    const EXCLUDED = new Set(["cancelled", "draft_ai", "pending_review"]);
    const PENDING = new Set(["pending", "overdue", "partial"]);

    let invoiceCount = 0;
    let totalBilled = 0;
    let totalPaid = 0;
    let totalPending = 0;
    let lastInvoiceDate: Date | null = null;
    let lastPaymentDate: Date | null = null;

    for (const inv of invoices) {
      if (!EXCLUDED.has(inv.status)) {
        invoiceCount++;
        totalBilled += inv.totalWithVat;
        if (!lastInvoiceDate || inv.invoiceDate > lastInvoiceDate) {
          lastInvoiceDate = inv.invoiceDate;
        }
      }
      if (inv.status === "paid") {
        totalPaid += inv.totalWithVat;
        if (inv.paidAt && (!lastPaymentDate || inv.paidAt > lastPaymentDate)) {
          lastPaymentDate = inv.paidAt;
        }
      }
      if (PENDING.has(inv.status)) {
        totalPending += inv.totalWithVat;
      }
    }

    // ── Conta corrente: documentos + pagamentos reais, ordenados por data ────
    const activeDocs = invoices.filter((inv) => !EXCLUDED.has(inv.status));

    let totalInvoiced = 0;
    let totalCreditNotes = 0;
    let invoiceDocCount = 0;
    let creditNoteDocCount = 0;

    type Candidate = {
      date: Date;
      documentNumber: string;
      kind: "invoice" | "credit_note" | "payment";
      invoicedAmount: number | null;
      creditOrSettlementAmount: number | null;
    };
    const candidates: Candidate[] = [];
    const invoiceNumberById = new Map<string, string>();

    for (const inv of activeDocs) {
      const isCreditNote = inv.documentType === "credit_note";
      invoiceNumberById.set(inv.id, inv.invoiceNumber);
      if (isCreditNote) {
        totalCreditNotes += Math.abs(inv.totalWithVat);
        creditNoteDocCount++;
        candidates.push({
          date: inv.invoiceDate,
          documentNumber: inv.invoiceNumber,
          kind: "credit_note",
          invoicedAmount: null,
          creditOrSettlementAmount: Math.abs(inv.totalWithVat),
        });
      } else {
        totalInvoiced += inv.totalWithVat;
        invoiceDocCount++;
        candidates.push({
          date: inv.invoiceDate,
          documentNumber: inv.invoiceNumber,
          kind: "invoice",
          invoicedAmount: inv.totalWithVat,
          creditOrSettlementAmount: null,
        });
      }
    }

    // Pagamentos reais confirmados por conciliação bancária — só faz sentido
    // para faturas (uma nota de crédito não é "paga"), e uma fatura pode ter
    // vários pagamentos parciais em datas diferentes.
    const payableInvoiceIds = activeDocs
      .filter((inv) => inv.documentType !== "credit_note")
      .map((inv) => inv.id);
    const payments = await this.invoicePaymentRead.findByInvoiceIds(
      command.organizationId,
      payableInvoiceIds,
    );
    for (const payment of payments) {
      candidates.push({
        date: payment.date,
        documentNumber: invoiceNumberById.get(payment.invoiceId) ?? "",
        kind: "payment",
        invoicedAmount: null,
        creditOrSettlementAmount: payment.amount,
      });
    }

    candidates.sort((a, b) => a.date.getTime() - b.date.getTime());

    const openingBalance = command.openingBalance ?? 0;
    let runningBalance = openingBalance;
    const lines: StatementLineDTO[] = candidates.map((c) => {
      if (c.kind === "invoice") {
        runningBalance += c.invoicedAmount!;
      } else {
        runningBalance -= c.creditOrSettlementAmount!;
      }
      return {
        date: c.date.toISOString().slice(0, 10),
        documentNumber: c.documentNumber,
        kind: c.kind,
        invoicedAmount: c.invoicedAmount,
        creditOrSettlementAmount: c.creditOrSettlementAmount,
        runningBalance,
      };
    });

    const netDocumentBalanceBeforeSettlement = runningBalance;
    let finalBalance = netDocumentBalanceBeforeSettlement;

    if (
      command.informedFinalBalance !== undefined &&
      Math.abs(command.informedFinalBalance - netDocumentBalanceBeforeSettlement) > BALANCE_TOLERANCE
    ) {
      const settlementAmount = netDocumentBalanceBeforeSettlement - command.informedFinalBalance;
      finalBalance = command.informedFinalBalance;
      lines.push({
        date: null,
        documentNumber: "Conciliação final",
        kind: "settlement",
        invoicedAmount: null,
        creditOrSettlementAmount: settlementAmount,
        runningBalance: finalBalance,
      });
    }

    return {
      supplier: toSupplierDTO(supplier),
      stats: { invoiceCount, totalBilled, totalPaid, totalPending, lastInvoiceDate, lastPaymentDate },
      invoices: invoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate,
        dueDate: inv.dueDate,
        totalWithoutVat: inv.totalWithoutVat,
        vatAmount: inv.vatAmount,
        totalWithVat: inv.totalWithVat,
        documentType: inv.documentType,
        status: inv.status,
        paidAt: inv.paidAt,
        attachmentUrl: inv.attachmentUrl,
      })),
      period: {
        startDate: command.startDate ?? null,
        endDate: command.endDate ?? null,
      },
      openingBalance,
      lines,
      totalInvoiced,
      totalCreditNotes,
      totalMovement: totalInvoiced + totalCreditNotes,
      netDocumentBalanceBeforeSettlement,
      finalBalance,
      isReconciled: Math.abs(finalBalance) <= BALANCE_TOLERANCE,
      documentCounts: { invoices: invoiceDocCount, creditNotes: creditNoteDocCount },
    };
  }
}
