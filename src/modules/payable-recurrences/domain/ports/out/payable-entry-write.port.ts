/**
 * Cross-module output port — declarado aqui, implementado por adapter Supabase
 * que acede directamente à tabela payable_entries (sem importar o módulo payable-entries).
 */
export interface CreatePayableData {
  supplierId: string | null;
  supplierName: string;
  description: string;
  costCenterId: string | null;
  category: string | null;
  amountCents: number;
  dueDate: string; // YYYY-MM-DD
  notes: string | null;
}

export interface PayableEntryWritePort {
  create(data: CreatePayableData): Promise<{ id: string }>;
}
