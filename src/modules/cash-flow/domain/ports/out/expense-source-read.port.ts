import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { ExpenseReferences, ExpenseSources } from "../../entities/cash-flow.js";

export interface ExpenseSourceReadPort {
  /**
   * Faturas, contas a pagar e ocorrências de recorrência referidas, com a informação de categoria.
   * Inclui as faturas associadas às contas a pagar e às ocorrências.
   */
  load(organizationId: OrganizationId, refs: ExpenseReferences): Promise<ExpenseSources>;
}
