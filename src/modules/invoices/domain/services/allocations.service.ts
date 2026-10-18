import type { InvoiceAllocation } from "../entities/invoice-allocation.js";

export type AllocationIssue =
  | { code: "empty" }
  | { code: "invalid_amount"; position: number }
  | { code: "missing_description"; position: number }
  | { code: "missing_category"; position: number }
  | { code: "invalid_category"; position: number; reason: "not_found" | "inactive" | "wrong_group" }
  | { code: "not_distributed"; remainingCents: number };

export interface AllocationsCheck {
  distributedCents: number;
  /** «Por distribuir» = base líquida − soma das alocações (negativo = excesso). */
  remainingCents: number;
  issues: AllocationIssue[];
  ok: boolean;
}

type AllocationInput = Pick<InvoiceAllocation, "position" | "description" | "costCenterGroupId" | "costCenterCategoryId" | "netCents">;

/**
 * Conferência «Por valores» (F2 §2.2): a soma das alocações tem de igualar a
 * base líquida do documento (motor único, já com descontos) ao cêntimo. Os
 * montantes já são líquidos: nunca se volta a descontar cada categoria nem se
 * redistribui em silêncio quando a base muda.
 */
export function checkAllocations(
  allocations: AllocationInput[],
  netBaseCents: number,
  categories: Map<string, { groupId?: string; isActive?: boolean }>,
): AllocationsCheck {
  const issues: AllocationIssue[] = [];
  if (allocations.length === 0) issues.push({ code: "empty" });
  for (const a of allocations) {
    if (!Number.isInteger(a.netCents) || a.netCents <= 0) issues.push({ code: "invalid_amount", position: a.position });
    if (!a.description.trim()) issues.push({ code: "missing_description", position: a.position });
    if (!a.costCenterCategoryId) {
      issues.push({ code: "missing_category", position: a.position });
      continue;
    }
    const cat = categories.get(a.costCenterCategoryId);
    if (!cat) issues.push({ code: "invalid_category", position: a.position, reason: "not_found" });
    else if (cat.isActive === false) issues.push({ code: "invalid_category", position: a.position, reason: "inactive" });
    else if (a.costCenterGroupId && cat.groupId && cat.groupId !== a.costCenterGroupId) {
      issues.push({ code: "invalid_category", position: a.position, reason: "wrong_group" });
    }
  }
  const distributedCents = allocations.reduce((s, a) => s + (Number.isInteger(a.netCents) && a.netCents > 0 ? a.netCents : 0), 0);
  const remainingCents = netBaseCents - distributedCents;
  if (allocations.length > 0 && remainingCents !== 0) issues.push({ code: "not_distributed", remainingCents });
  return { distributedCents, remainingCents, issues, ok: issues.length === 0 };
}

const eur = (c: number) => `${(Math.abs(c) / 100).toFixed(2).replace(".", ",")} €`;

export function describeAllocationIssues(issues: AllocationIssue[]): string {
  return issues
    .map((i) => {
      switch (i.code) {
        case "empty":
          return "indique pelo menos uma repartição";
        case "invalid_amount":
          return `repartição ${i.position + 1}: montante inválido`;
        case "missing_description":
          return `repartição ${i.position + 1}: falta a descrição`;
        case "missing_category":
          return `repartição ${i.position + 1}: falta a subcategoria`;
        case "invalid_category":
          return `repartição ${i.position + 1}: subcategoria ${i.reason === "inactive" ? "inativa" : i.reason === "wrong_group" ? "fora do grupo indicado" : "inexistente"}`;
        case "not_distributed":
          return i.remainingCents > 0 ? `faltam distribuir ${eur(i.remainingCents)}` : `distribuído a mais ${eur(i.remainingCents)}`;
      }
    })
    .join("; ");
}
