import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export interface FillSupplierLogoResult {
  filled: boolean;
  logoUrl?: string;
}

export interface FillMissingSupplierLogosResult {
  /** Fornecedores sem logótipo vistos neste lote. */
  processed: number;
  /** Desses, quantos ficaram com logótipo. */
  filled: number;
  /** Cursor para o lote seguinte (`after`); `null` quando já não há mais. */
  next: string | null;
}

/**
 * Logótipo do fornecedor tirado das faturas, gravado sem pedir confirmação (2026-10-25, substitui a
 * proposta da E3b-1) — só para fornecedores ainda sem logótipo; nunca substitui um existente.
 */
export interface FillSupplierLogosPort {
  /** Um fornecedor: a fatura indicada primeiro (se tiver PDF), depois as mais recentes. */
  fillForSupplier(organizationId: OrganizationId, supplierId: string, preferredInvoiceId?: string): Promise<FillSupplierLogoResult>;
  /** Todos os fornecedores sem logótipo, por lotes (pedidos curtos; o ecrã repete até `next` ser `null`). */
  fillMissing(organizationId: OrganizationId, options?: { after?: string; batchSize?: number }): Promise<FillMissingSupplierLogosResult>;
}
