import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { BankReconciliationRule } from "../../domain/entities/bank-reconciliation-rule.js";
import { InvalidRuleError } from "../../domain/errors.js";
import { AutoMatchingService } from "../../domain/services/auto-matching.service.js";
import { recurringMatchText } from "../../domain/utils/bank-description.js";
import type { BankReconciliationRuleRepositoryPort } from "../../domain/ports/out/bank-reconciliation-rule-repository.port.js";
import type { BankMovementRepositoryPort } from "../../domain/ports/out/bank-movement-repository.port.js";
import type { OccurrenceMatchReadPort } from "../../domain/ports/out/occurrence-match-read.port.js";
import type { RecurrenceRuleTargetPort } from "../../domain/ports/out/recurrence-rule-target.port.js";

const ALL_HISTORY_FROM = new Date("2000-01-01T00:00:00.000Z");
const ALL_HISTORY_TO = new Date("2100-12-31T00:00:00.000Z");

export interface RecurrenceRuleValidationDeps {
  ruleRepo: BankReconciliationRuleRepositoryPort;
  movementRepo?: BankMovementRepositoryPort | undefined;
  target?: RecurrenceRuleTargetPort | undefined;
  occurrenceRead?: OccurrenceMatchReadPort | undefined;
}

/**
 * Travas de uma regra ligada a uma recorrência (antes de gravar), para a automação nunca ligar o pagamento
 * errado:
 *  1. a recorrência existe, não está encerrada e não exige fatura (essas concilia-se pela fatura);
 *  2. nenhuma outra regra ativa da mesma conta tem o mesmo texto (não haver duas respostas);
 *  3. o texto não apanha pagamentos já ligados a OUTRA recorrência (ex.: dois «António J…»).
 */
export async function assertRecurrenceRule(
  organizationId: OrganizationId,
  rule: BankReconciliationRule,
  deps: RecurrenceRuleValidationDeps,
): Promise<void> {
  if (rule.recurrenceId === null) return;
  if (!deps.target) throw new InvalidRuleError("A ligação de regras a recorrências não está disponível.");

  const recurrence = await deps.target.describe(organizationId, rule.recurrenceId);
  if (!recurrence) throw new InvalidRuleError("A recorrência escolhida não existe.");
  if (recurrence.status === "closed") throw new InvalidRuleError(`A recorrência «${recurrence.name}» está encerrada.`);
  if (recurrence.requireInvoice) {
    throw new InvalidRuleError(
      `A recorrência «${recurrence.name}» exige fatura: os pagamentos concilia-se com a fatura, que paga a recorrência.`,
    );
  }

  const text = recurringMatchText(rule.descriptionContains);
  const twin = (await deps.ruleRepo.findAll(organizationId, true)).find(
    (r) => r.id !== rule.id && r.bankAccountId === rule.bankAccountId && recurringMatchText(r.descriptionContains) === text,
  );
  if (twin) {
    throw new InvalidRuleError(
      `Já existe o movimento recorrente «${twin.name}» com este texto nesta conta — altere esse (ligando-o à recorrência) em vez de criar outro.`,
    );
  }

  if (!deps.occurrenceRead || !deps.movementRepo) return;
  const matcher = new AutoMatchingService();
  const linkedOccurrenceIds = (await deps.movementRepo.findByAccountAndPeriod(organizationId, rule.bankAccountId!, ALL_HISTORY_FROM, ALL_HISTORY_TO))
    .filter((m) => m.matchedEntityType === "recurrence_occurrence" && m.matchedEntityId && matcher.matchRule([rule], m))
    .map((m) => m.matchedEntityId!);
  if (linkedOccurrenceIds.length === 0) return;
  const other = (await deps.occurrenceRead.findByIds(organizationId, [...new Set(linkedOccurrenceIds)])).find(
    (o) => o.recurrenceId !== rule.recurrenceId,
  );
  if (other) {
    throw new InvalidRuleError(
      `Este texto também apanha pagamentos já ligados a «${other.recurrenceName}». Use um texto mais específico (ex.: o nome completo).`,
    );
  }
}
