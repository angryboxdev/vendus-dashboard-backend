/**
 * Cross-module output port — declarado aqui, implementado por adapter Supabase
 * que acede directamente à tabela invoices (sem importar o módulo invoices).
 *
 * Contém apenas os campos necessários para vincular uma fatura a uma ocorrência.
 */
export interface InvoiceSnapshot {
  id: string;
  supplierId: string | null;
  supplierName: string;
  totalWithVatCents: number;
  dueDate: string | null; // YYYY-MM-DD
  status: string;
  paidAt: string | null; // ISO timestamp
}

export interface InvoiceReadPort {
  findById(id: string): Promise<InvoiceSnapshot | null>;
}
