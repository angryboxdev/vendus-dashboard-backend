import type { BankCredit, BankDebit, CostCenterCatalog, ExpenseSources } from "../../domain/entities/cash-flow.js";

/** Catálogo fictício: Pessoal (Salários, Encargos), Operação Direta (Ingredientes) e Fora da DRE. */
export const catalog: CostCenterCatalog = {
  groups: [
    { id: "g-pes", code: "PES", name: "Pessoal", sortOrder: 1 },
    { id: "g-opd", code: "OPD", name: "Operação Direta", sortOrder: 0 },
    { id: "g-fdr", code: "FDR", name: "Fora da DRE", sortOrder: 9 },
  ],
  categories: [
    { id: "c-sal", groupId: "g-pes", code: "PES.01", name: "Salários" },
    { id: "c-enc", groupId: "g-pes", code: "PES.02", name: "Encargos" },
    { id: "c-ing", groupId: "g-opd", code: "OPD.01", name: "Ingredientes" },
    { id: "c-iva", groupId: "g-fdr", code: "FDR.03", name: "IVA" },
  ],
};

export function debit(overrides: Partial<BankDebit> = {}): BankDebit {
  return {
    id: "m1",
    date: "2026-10-05",
    amountCents: 10_000,
    kind: "transfer_out",
    reconciliationStatus: "saida_nao_justificada",
    justificationType: null,
    matchedEntityType: null,
    matchedEntityId: null,
    groupId: null,
    categoryId: null,
    links: [],
    ...overrides,
  };
}

export function credit(overrides: Partial<BankCredit> = {}): BankCredit {
  return {
    id: "c1",
    date: "2026-10-05",
    amountCents: 10_000,
    kind: "sales",
    reconciliationStatus: "conciliado_sem_fatura",
    justificationType: null,
    ...overrides,
  };
}

export function emptySources(): ExpenseSources {
  return { invoices: new Map(), payables: new Map(), occurrences: new Map() };
}
