import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { BankMovement } from "../../domain/entities/bank-movement.js";
import type { BankReconciliationRule } from "../../domain/entities/bank-reconciliation-rule.js";
import type { RecurrenceRuleTargetPort } from "../../domain/ports/out/recurrence-rule-target.port.js";
import type { OccurrencePaymentPort } from "../../domain/ports/out/occurrence-payment.port.js";

type RuleMatch = { original: BankMovement; updated: BankMovement; rule: BankReconciliationRule };

/** Portas para conciliar «movimentos recorrentes» ligados a uma recorrência (renda, salário). */
export interface RecurrenceLinkingDeps {
  target: RecurrenceRuleTargetPort;
  occurrencePayment: OccurrencePaymentPort;
}

export interface RecurrenceLinkingResult {
  matches: RuleMatch[];
  /** Ocorrências pagas agora — reabrir se a gravação dos movimentos falhar. */
  settled: { occurrenceId: string; movementId: string }[];
}

/**
 * Regras ligadas a uma recorrência: cada movimento passa a estar ligado à ocorrência do mês (que fica paga).
 * Sem resposta segura (ou sem as portas), o movimento sai da lista e fica «Por conciliar». Por mês, o primeiro
 * pagamento (o maior, no mesmo dia) fica com a ocorrência; os seguintes ficam por conciliar.
 * Não grava os movimentos — quem chama grava e, se falhar, chama `reopenSettled`.
 */
export async function linkRuleRecurrences(
  organizationId: OrganizationId,
  matches: RuleMatch[],
  deps: RecurrenceLinkingDeps | undefined,
): Promise<RecurrenceLinkingResult> {
  const plain = matches.filter((m) => m.rule.recurrenceId === null);
  const linked = matches
    .filter((m) => m.rule.recurrenceId !== null)
    .sort((a, b) => a.original.bookingDate.getTime() - b.original.bookingDate.getTime() || Math.abs(b.original.amount) - Math.abs(a.original.amount));
  if (linked.length === 0 || !deps) return { matches: plain, settled: [] };

  const claimed = new Set<string>();
  const kept: RuleMatch[] = [];
  const settled: RecurrenceLinkingResult["settled"] = [];
  for (const m of linked) {
    const r = await deps.target.settle(organizationId, {
      recurrenceId: m.rule.recurrenceId!,
      movementId: m.original.id,
      paidAt: m.original.bookingDate.toISOString().slice(0, 10),
      bankAccountId: m.original.bankAccountId,
    });
    if (!r || claimed.has(r.occurrenceId)) continue;
    claimed.add(r.occurrenceId);
    if (r.paidNow) settled.push({ occurrenceId: r.occurrenceId, movementId: m.original.id });
    kept.push({ ...m, updated: m.original.classifyByRule(m.rule, r.occurrenceId) });
  }
  return { matches: [...plain, ...kept], settled };
}

/** Desfaz os pagamentos feitos por `linkRuleRecurrences` (a gravação dos movimentos falhou). */
export async function reopenSettled(
  organizationId: OrganizationId,
  settled: RecurrenceLinkingResult["settled"],
  deps: RecurrenceLinkingDeps | undefined,
): Promise<void> {
  if (!deps) return;
  for (const s of settled) await deps.occurrencePayment.reopen(organizationId, s);
}
