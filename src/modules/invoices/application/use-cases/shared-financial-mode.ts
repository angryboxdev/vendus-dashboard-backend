import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { LineDetailMode } from "../../domain/entities/invoice.js";
import type { InvoiceAllocation } from "../../domain/entities/invoice-allocation.js";
import { AllocationsNotReconciledError } from "../../domain/errors.js";
import type { AllocationCommand, FinancialModeName } from "../../domain/ports/in/invoice.ports.js";
import type { CostCenterCategoryReaderPort } from "../../domain/ports/out/cost-center-category-reader.port.js";
import { checkAllocations, describeAllocationIssues } from "../../domain/services/allocations.service.js";

/** «Única» | «Por artigo» | «Por valores» ↔ modo guardado (simple | detailed | by_values). */
export function toLineDetailMode(mode: FinancialModeName | undefined): LineDetailMode | undefined {
  if (mode === "single") return "simple";
  if (mode === "by_item") return "detailed";
  if (mode === "by_values") return "by_values";
  return undefined;
}

export function toFinancialMode(mode: LineDetailMode): FinancialModeName {
  return mode === "detailed" ? "by_item" : mode === "by_values" ? "by_values" : "single";
}

/**
 * Alocações «Por valores» a partir do pedido (F2 §2.2). `strict` (finalizar):
 * soma = base líquida ao cêntimo e subcategorias válidas, senão 422 com o que
 * está «Por distribuir». Em rascunho só se recusam linhas que não podem ser
 * guardadas (sem subcategoria ou montante); a diferença fica para conferir.
 */
export async function buildAllocations(
  categoryReader: CostCenterCategoryReaderPort,
  organizationId: OrganizationId,
  invoiceId: string,
  commands: AllocationCommand[],
  netBaseCents: number,
  strict: boolean,
): Promise<{ allocations: InvoiceAllocation[]; remainingCents: number }> {
  const allocations: InvoiceAllocation[] = commands.map((c, position) => ({
    id: crypto.randomUUID(),
    invoiceId,
    position,
    description: (c.description ?? "").trim(),
    costCenterGroupId: c.costCenterGroupId ?? null,
    costCenterCategoryId: c.costCenterCategoryId ?? "",
    locationId: c.locationId ?? null,
    netCents: Math.round(Math.abs(c.netCents)),
  }));
  const ids = [...new Set(allocations.map((a) => a.costCenterCategoryId).filter(Boolean))];
  const lookups = ids.length ? await categoryReader.findManyByIds(organizationId, ids) : [];
  const check = checkAllocations(allocations, netBaseCents, new Map(lookups.map((l) => [l.id, l])));
  const fatal = strict ? check.issues : check.issues.filter((i) => i.code !== "not_distributed" && i.code !== "empty");
  if (fatal.length) {
    throw new AllocationsNotReconciledError(describeAllocationIssues(fatal), { remainingCents: check.remainingCents, issues: fatal });
  }
  return { allocations, remainingCents: check.remainingCents };
}
