import type { ObligationSource, ObligationStatus, PaymentMethod } from "../../entities/financial-obligation.js";

// ── DTO ───────────────────────────────────────────────────────────────────────

export interface FinancialObligationDTO {
  id: string;
  source: ObligationSource;
  supplierId: string | null;
  supplierName: string;
  description: string;
  amountCents: number;
  dueDate: string;        // YYYY-MM-DD
  paidAt: string | null;  // YYYY-MM-DD
  paymentMethod: PaymentMethod | null;
  status: ObligationStatus;
  invoiceId: string | null;
  recurrenceId: string | null;
  recurrenceName: string | null;
  documentUrl: string | null;
  costCenterId: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Commands ──────────────────────────────────────────────────────────────────

export interface ListObligationsFilter {
  from?: string;           // YYYY-MM-DD
  to?: string;             // YYYY-MM-DD
  supplierId?: string;
  status?: ObligationStatus;
  source?: ObligationSource;
}

export interface CreateManualObligationCommand {
  supplierId?: string | null;
  supplierName: string;
  description: string;
  amountCents: number;
  dueDate: string;         // YYYY-MM-DD
  paymentMethod?: PaymentMethod | null;
  costCenterId?: string | null;
}

export interface MarkObligationAsPaidCommand {
  id: string;
  paidAt?: string;         // YYYY-MM-DD — defaults to today
  paymentMethod?: PaymentMethod | null;
}

// ── Input ports ───────────────────────────────────────────────────────────────

export interface ListObligationsPort {
  execute(filter?: ListObligationsFilter): Promise<FinancialObligationDTO[]>;
}

export interface CreateManualObligationPort {
  execute(command: CreateManualObligationCommand): Promise<FinancialObligationDTO>;
}

export interface MarkObligationAsPaidPort {
  execute(command: MarkObligationAsPaidCommand): Promise<FinancialObligationDTO>;
}
