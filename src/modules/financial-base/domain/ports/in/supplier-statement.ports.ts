import type { SupplierDTO } from "./supplier.ports.js";
import type { SupplierInvoiceRowDTO, SupplierStatsDTO } from "./supplier-detail.ports.js";

export interface GetSupplierStatementCommand {
  id: string;
  startDate?: Date;
  endDate?: Date;
}

export interface SupplierStatementDTO {
  supplier: SupplierDTO;
  /** Stats calculados sobre o conjunto filtrado de faturas (não sobre o histórico completo). */
  stats: SupplierStatsDTO;
  invoices: SupplierInvoiceRowDTO[];
  /** Período do extrato (undefined = histórico completo). */
  period: { startDate: Date | null; endDate: Date | null };
}

export interface GetSupplierStatementPort {
  execute(command: GetSupplierStatementCommand): Promise<SupplierStatementDTO>;
}
