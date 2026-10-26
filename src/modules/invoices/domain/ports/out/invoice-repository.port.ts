import type { LineDetailMode } from "../../entities/invoice.js";
import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { Invoice, InvoiceStatus, InvoiceDocumentType, ReconciliationStatus } from "../../entities/invoice.js";

export interface InvoiceFilter {
  supplierId?: string;
  costCenterId?: string;
  status?: InvoiceStatus;
  reconciliationStatus?: ReconciliationStatus;
  from?: Date;
  to?: Date;
  isDirectDebit?: boolean;
  documentType?: InvoiceDocumentType;
  search?: string; // matches supplier_name or invoice_number (case-insensitive)
}

export interface InvoiceRepositoryPort {
  save(organizationId: OrganizationId, invoice: Invoice): Promise<void>;
  findById(organizationId: OrganizationId, id: string): Promise<Invoice | null>;
  findAll(organizationId: OrganizationId, filter?: InvoiceFilter): Promise<Invoice[]>;
  update(organizationId: OrganizationId, invoice: Invoice): Promise<void>;
  delete(organizationId: OrganizationId, id: string): Promise<void>;
  /** Returns an existing (non-cancelled) invoice with the same number and supplier, or null. excludeId skips that invoice (used when updating). */
  findDuplicate(
    organizationId: OrganizationId,
    invoiceNumber: string,
    supplierId: string,
    excludeId?: string,
  ): Promise<Invoice | null>;
  /** Returns an existing (non-cancelled) invoice with the same number and supplier NIF, or null. Used for import/confirm flows where NIF is more reliable than supplierId. */
  findDuplicateByNif(
    organizationId: OrganizationId,
    invoiceNumber: string,
    supplierNif: string,
    excludeId?: string,
  ): Promise<Invoice | null>;
  /** Returns invoices that are direct debit, have directDebitDate ≤ today, and are not yet paid or cancelled. */
  findPendingDirectDebits(organizationId: OrganizationId): Promise<Invoice[]>;
  /** Documento (não cancelado) importado a partir do mesmo ficheiro (SHA-256). */
  findByFileHash(organizationId: OrganizationId, sha256: string): Promise<Invoice | null>;
  setFileHash(organizationId: OrganizationId, invoiceId: string, sha256: string): Promise<void>;
  /** Documento de pagamento com várias faturas fiscais: marca-as com o mesmo grupo. */
  setPaymentGroup(organizationId: OrganizationId, invoiceIds: string[], groupId: string): Promise<void>;
  /** Faturas do mesmo documento de pagamento, pela ordem de criação. */
  findByPaymentGroup(organizationId: OrganizationId, groupId: string): Promise<Invoice[]>;
  /**
   * Bloqueio otimista (F1 §1.4): incrementa a versão de forma atómica. Com
   * `expectedVersion`, só incrementa se ainda for essa; devolve a nova versão
   * ou null quando outra escrita passou à frente.
   */
  claimVersion(organizationId: OrganizationId, invoiceId: string, expectedVersion: number | null): Promise<number | null>;
  /** Ids das faturas nestes modos financeiros (F2 — filtrar feeds de análise). */
  findIdsByLineDetailMode(organizationId: OrganizationId, modes: LineDetailMode[]): Promise<Set<string>>;
}
