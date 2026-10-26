import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { BankReconciliationRule } from "../../domain/entities/bank-reconciliation-rule.js";
import { AutoMatchingService } from "../../domain/services/auto-matching.service.js";
import type { BankMovementRepositoryPort } from "../../domain/ports/out/bank-movement-repository.port.js";
import type { BankStatementImportRepositoryPort } from "../../domain/ports/out/bank-statement-import-repository.port.js";

/** Cobre todo o histórico de uma conta (datas de movimento). */
const ALL_HISTORY_FROM = new Date("2000-01-01T00:00:00.000Z");
const ALL_HISTORY_TO = new Date("2100-12-31T00:00:00.000Z");
const UPDATE_BATCH = 20;

/**
 * Aplica «movimentos recorrentes» (regras) aos movimentos intocados de uma conta em todos os meses
 * importados (ao criar, alterar ou reativar uma regra). Movimentos de extratos fechados ficam como estão.
 * Tal como a classificação manual, não mexe nas estatísticas guardadas do extrato — os ecrãs de mês e
 * de ano calculam a conciliação pelos movimentos. Devolve quantos movimentos ficaram conciliados.
 */
export async function applyRulesToAccount(
  deps: { movementRepo: BankMovementRepositoryPort; statementRepo: BankStatementImportRepositoryPort },
  organizationId: OrganizationId,
  bankAccountId: string,
  rules: BankReconciliationRule[],
): Promise<number> {
  if (rules.length === 0) return 0;
  const movements = await deps.movementRepo.findByAccountAndPeriod(organizationId, bankAccountId, ALL_HISTORY_FROM, ALL_HISTORY_TO);
  const matches = new AutoMatchingService().applyRules(rules, movements);
  if (matches.length === 0) return 0;

  const statementIds = [...new Set(matches.map((m) => m.updated.statementImportId))];
  const statements = await Promise.all(statementIds.map((id) => deps.statementRepo.findById(organizationId, id)));
  const closed = new Set(statements.filter((s) => s?.status === "closed").map((s) => s!.id));
  const toUpdate = matches.map((m) => m.updated).filter((m) => !closed.has(m.statementImportId));

  for (let i = 0; i < toUpdate.length; i += UPDATE_BATCH) {
    await Promise.all(toUpdate.slice(i, i + UPDATE_BATCH).map((m) => deps.movementRepo.update(organizationId, m)));
  }
  return toUpdate.length;
}
