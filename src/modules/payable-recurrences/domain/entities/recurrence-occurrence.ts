import {
  OccurrenceInvalidTransitionError,
  OccurrenceInvoiceRequiredError,
} from "../errors.js";

// ── Value types ────────────────────────────────────────────────────────────────

export type OccurrenceStatus =
  | "forecast"          // previsão gerada, sem documento real
  | "awaiting_invoice"  // documento obrigatório antes de pagar
  | "invoice_linked"    // fatura associada e validada
  | "paid"              // pagamento registado
  | "cancelled";        // anulada

export type OccurrencePaymentMethod =
  | "transfer"
  | "direct_debit"
  | "check"
  | "cash"
  | "card"
  | "mbway"
  | "other";

/** YYYY-MM (e.g. "2026-09") */
export type OccurrencePeriod = string;

const TERMINAL_STATUSES: OccurrenceStatus[] = ["paid", "cancelled"];

// ── Internal props ─────────────────────────────────────────────────────────────

interface OccurrenceProps {
  id: string;
  recurrenceId: string;
  /** YYYY-MM — identifies the month this occurrence belongs to */
  period: OccurrencePeriod;
  estimatedAmountCents: number;
  /** Real amount in cents — set when invoice is linked */
  realAmountCents: number | null;
  dueDate: Date;
  status: OccurrenceStatus;
  /** Whether this recurrence requires an invoice before payment */
  requireInvoice: boolean;
  invoiceId: string | null;
  paidAt: Date | null;
  paymentMethod: OccurrencePaymentMethod | null;
  paymentBankAccountId: string | null;
  paymentNotes: string | null;
  notes: string | null;
  /** URL of a document (invoice PDF, payment proof, salary sheet) stored in Supabase Storage. */
  documentUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ── Entity ─────────────────────────────────────────────────────────────────────

export class RecurrenceOccurrence {
  readonly id: string;
  readonly recurrenceId: string;
  readonly period: OccurrencePeriod;
  readonly estimatedAmountCents: number;
  readonly realAmountCents: number | null;
  readonly dueDate: Date;
  readonly status: OccurrenceStatus;
  readonly requireInvoice: boolean;
  readonly invoiceId: string | null;
  readonly paidAt: Date | null;
  readonly paymentMethod: OccurrencePaymentMethod | null;
  readonly paymentBankAccountId: string | null;
  readonly paymentNotes: string | null;
  readonly notes: string | null;
  readonly documentUrl: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: OccurrenceProps) {
    this.id = props.id;
    this.recurrenceId = props.recurrenceId;
    this.period = props.period;
    this.estimatedAmountCents = props.estimatedAmountCents;
    this.realAmountCents = props.realAmountCents;
    this.dueDate = props.dueDate;
    this.status = props.status;
    this.requireInvoice = props.requireInvoice;
    this.invoiceId = props.invoiceId;
    this.paidAt = props.paidAt;
    this.paymentMethod = props.paymentMethod;
    this.paymentBankAccountId = props.paymentBankAccountId;
    this.paymentNotes = props.paymentNotes;
    this.notes = props.notes;
    this.documentUrl = props.documentUrl;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  // ── Factories ────────────────────────────────────────────────────────────────

  static create(props: {
    recurrenceId: string;
    period: OccurrencePeriod;
    estimatedAmountCents: number;
    dueDate: Date;
    requireInvoice: boolean;
    notes?: string | null;
  }): RecurrenceOccurrence {
    const initialStatus: OccurrenceStatus = props.requireInvoice ? "awaiting_invoice" : "forecast";
    const now = new Date();
    return new RecurrenceOccurrence({
      id: crypto.randomUUID(),
      recurrenceId: props.recurrenceId,
      period: props.period,
      estimatedAmountCents: props.estimatedAmountCents,
      realAmountCents: null,
      dueDate: props.dueDate,
      status: initialStatus,
      requireInvoice: props.requireInvoice,
      invoiceId: null,
      paidAt: null,
      paymentMethod: null,
      paymentBankAccountId: null,
      paymentNotes: null,
      notes: props.notes ?? null,
      documentUrl: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: OccurrenceProps): RecurrenceOccurrence {
    return new RecurrenceOccurrence(props);
  }

  // ── Transitions ──────────────────────────────────────────────────────────────

  /**
   * Links an invoice/document to this occurrence.
   * Valid from: forecast, awaiting_invoice
   * Result: invoice_linked
   */
  linkInvoice(invoiceId: string, realAmountCents: number): RecurrenceOccurrence {
    if (this.status !== "forecast" && this.status !== "awaiting_invoice") {
      throw new OccurrenceInvalidTransitionError(this.id, this.status, "invoice_linked");
    }
    if (realAmountCents <= 0) throw new Error("realAmountCents must be greater than zero");
    return new RecurrenceOccurrence({
      ...this.toProps(),
      invoiceId,
      realAmountCents,
      status: "invoice_linked",
      updatedAt: new Date(),
    });
  }

  /**
   * Marks occurrence as paid directly (no payable entry required).
   * Valid from: forecast (requireInvoice=false), invoice_linked
   * If requireInvoice=true, must be in invoice_linked first.
   * Result: paid
   */
  markPaid(
    paidAt: Date,
    paymentMethod?: OccurrencePaymentMethod | null,
    paymentBankAccountId?: string | null,
    paymentNotes?: string | null,
  ): RecurrenceOccurrence {
    if (this.requireInvoice && this.status !== "invoice_linked") {
      throw new OccurrenceInvoiceRequiredError(this.id);
    }
    const validFrom: OccurrenceStatus[] = ["forecast", "awaiting_invoice", "invoice_linked"];
    if (!validFrom.includes(this.status)) {
      throw new OccurrenceInvalidTransitionError(this.id, this.status, "paid");
    }
    return new RecurrenceOccurrence({
      ...this.toProps(),
      status: "paid",
      paidAt,
      paymentMethod: paymentMethod ?? null,
      paymentBankAccountId: paymentBankAccountId ?? null,
      paymentNotes: paymentNotes ?? null,
      updatedAt: new Date(),
    });
  }

  /**
   * Cancels this occurrence. Terminal states cannot be cancelled.
   * Result: cancelled
   */
  cancel(): RecurrenceOccurrence {
    if (this.status === "cancelled" || this.status === "paid") {
      throw new OccurrenceInvalidTransitionError(this.id, this.status, "cancelled");
    }
    return new RecurrenceOccurrence({ ...this.toProps(), status: "cancelled", updatedAt: new Date() });
  }

  setDocumentUrl(url: string | null): RecurrenceOccurrence {
    if (this.isTerminal()) {
      throw new OccurrenceInvalidTransitionError(this.id, this.status, "set-document");
    }
    return new RecurrenceOccurrence({ ...this.toProps(), documentUrl: url, updatedAt: new Date() });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  isTerminal(): boolean {
    return TERMINAL_STATUSES.includes(this.status);
  }

  /** The effective amount: real when available, estimated otherwise. Always in cents. */
  get effectiveAmountCents(): number {
    return this.realAmountCents ?? this.estimatedAmountCents;
  }

  private toProps(): OccurrenceProps {
    return {
      id: this.id,
      recurrenceId: this.recurrenceId,
      period: this.period,
      estimatedAmountCents: this.estimatedAmountCents,
      realAmountCents: this.realAmountCents,
      dueDate: this.dueDate,
      status: this.status,
      requireInvoice: this.requireInvoice,
      invoiceId: this.invoiceId,
      paidAt: this.paidAt,
      paymentMethod: this.paymentMethod,
      paymentBankAccountId: this.paymentBankAccountId,
      paymentNotes: this.paymentNotes,
      notes: this.notes,
      documentUrl: this.documentUrl,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

// ── Display state (computed, not persisted) ─────────────────────────────────────
//
// Spec Task_Recorrencias_Conciliacao_AngryBox.md §7 lists 7 estados: Previsto,
// Aguardando fatura, Fatura vinculada, Aguardando pagamento, Pago, Pago
// parcialmente, Vencido. "Fatura vinculada" and "Previsto" collapse into
// "awaiting_payment" here: once an occurrence has no invoice gate left (either
// it never required one, or the invoice is already linked), there is no real
// behavioural difference in this system between "still just a forecast" and
// "ready to be paid" — both are equally reconcilable at any time. Splitting
// them would need an arbitrary days-before-due-date threshold with no
// business rule backing it yet.

export type OccurrenceDisplayState =
  | "awaiting_invoice"
  | "awaiting_payment"
  | "partially_paid"
  | "paid"
  | "overdue"
  | "cancelled";

/** Same tolerance used for bank reconciliation partial-match detection (bank-statements' PARTIAL_TOLERANCE_CENTS). */
export const DISPLAY_STATE_TOLERANCE_CENTS = 100;

/**
 * Computed live from `paidAmountCents` (sum of whatever bank movements/invoice
 * allocations back this occurrence — resolved by the caller, since that
 * depends on cross-module reads the entity itself has no access to) and
 * today's date. Never stored: an unreconciliation, a newly-linked bank
 * movement, or the day simply passing all change the result on next read
 * without needing any write-back to this entity.
 */
export function computeOccurrenceDisplayState(
  occurrence: RecurrenceOccurrence,
  paidAmountCents: number,
  today: Date = new Date(),
): OccurrenceDisplayState {
  if (occurrence.status === "cancelled") return "cancelled";
  if (occurrence.status === "awaiting_invoice") return "awaiting_invoice";

  const remaining = occurrence.effectiveAmountCents - paidAmountCents;
  if (occurrence.status === "paid" || remaining <= DISPLAY_STATE_TOLERANCE_CENTS) return "paid";
  if (paidAmountCents > 0) return "partially_paid";

  const due = occurrence.dueDate;
  const dueDateOnly = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return dueDateOnly < todayOnly ? "overdue" : "awaiting_payment";
}
