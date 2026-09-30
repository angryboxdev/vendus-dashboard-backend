/**
 * Política de tolerância — qualquer subconjunto dos 3 campos pode estar
 * definido. Usada só para decidir "Recontagem necessária", nunca para
 * "ignorar" a diferença: o `finalVariance` é sempre gravado e sempre gera
 * `AJUSTE_CONTAGEM`, mesmo dentro da tolerância (secção 34 da task).
 */
export interface TolerancePolicy {
  absoluteQty?: number | null;
  percent?: number | null;
  financialImpact?: number | null;
}

export interface ResolveToleranceInput {
  itemTolerance: TolerancePolicy | null;
  categoryTolerance: TolerancePolicy | null;
  companyDefaultTolerance: TolerancePolicy | null;
}

function isBlockSet(policy: TolerancePolicy | null | undefined): policy is TolerancePolicy {
  return !!policy && (policy.absoluteQty != null || policy.percent != null || policy.financialImpact != null);
}

/**
 * Hierarquia item → categoria → empresa. Primeiro nível não-nulo vence
 * **como bloco completo** — nunca faz merge campo-a-campo entre níveis
 * (evita uma política "meio item, meio categoria" confusa de auditar).
 * `null` quando nenhum nível define nada — nunca inventa uma percentagem
 * padrão (secção 33 da task).
 */
export function resolveTolerance(input: ResolveToleranceInput): TolerancePolicy | null {
  if (isBlockSet(input.itemTolerance)) return input.itemTolerance;
  if (isBlockSet(input.categoryTolerance)) return input.categoryTolerance;
  if (isBlockSet(input.companyDefaultTolerance)) return input.companyDefaultTolerance;
  return null;
}
