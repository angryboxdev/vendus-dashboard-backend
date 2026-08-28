import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { SupplierDTO } from "./supplier.ports.js";

// ---- KPIs globais da listagem ----

export interface SuppliersKpisDTO {
  totalActive: number;
  totalInactive: number;
  /** Nº de fornecedores com pelo menos uma fatura em aberto (pending/overdue/partial). */
  totalWithPending: number;
  /** Soma do total faturado de todos os fornecedores (faturas não canceladas nem draft). */
  totalBilledAll: number;
}

export interface GetSuppliersKpisPort {
  execute(organizationId: OrganizationId): Promise<SuppliersKpisDTO>;
}

// ---- Estatísticas por fornecedor ----

export interface SupplierStatsDTO {
  invoiceCount: number;
  totalBilled: number;
  totalPaid: number;
  totalPending: number;
  lastInvoiceDate: Date | null;
  lastPaymentDate: Date | null;
}

// ---- Listagem com estatísticas ----

export interface SupplierWithStatsDTO extends SupplierDTO {
  stats: SupplierStatsDTO;
}

export interface ListSuppliersWithStatsCommand {
  organizationId: OrganizationId;
  status?: "active" | "inactive";
  search?: string;
}

export interface ListSuppliersWithStatsPort {
  execute(command: ListSuppliersWithStatsCommand): Promise<SupplierWithStatsDTO[]>;
}

// ---- Detalhe completo do fornecedor ----

export interface SupplierInvoiceRowDTO {
  id: string;
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate: Date | null;
  totalWithoutVat: number;
  vatAmount: number;
  totalWithVat: number;
  status: string;
  paidAt: Date | null;
  attachmentUrl: string | null;
}

export interface SupplierDetailDTO extends SupplierDTO {
  stats: SupplierStatsDTO;
  invoices: SupplierInvoiceRowDTO[];
}

export interface GetSupplierDetailCommand {
  organizationId: OrganizationId;
  id: string;
}

export interface GetSupplierDetailPort {
  execute(command: GetSupplierDetailCommand): Promise<SupplierDetailDTO>;
}
