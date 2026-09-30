export type RiskLevel = "critico" | "atencao" | "excesso" | "ok";

export interface RiskClassificationInput {
  /** Data de rutura projetada dentro do horizonte; `null` = sem risco de rutura visível. */
  ruptureDate: string | null;
  coverageDays: number | null;
  /** Configurável (secção 70 — nunca "30 dias" hardcoded); `true` quando já resolvido como parado/excesso por outro sinal. */
  isSlowMoving: boolean;
  /** Nº de dias de cobertura abaixo do qual já vale a pena atenção, mesmo sem rutura iminente. */
  attentionCoverageDaysThreshold: number;
}

/**
 * Classificação dos badges de risco usados no ecrã de Planeamento
 * (`Crítico`/`Atenção`/`Excesso`/`OK`). Rutura prevista tem sempre
 * prioridade sobre excesso (um item pode estar simultaneamente parado E em
 * risco — nesse caso a rutura é o que importa agir primeiro).
 */
export function classifyRisk(input: RiskClassificationInput): RiskLevel {
  if (input.ruptureDate != null) return "critico";
  if (input.isSlowMoving) return "excesso";
  if (input.coverageDays != null && input.coverageDays <= input.attentionCoverageDaysThreshold) return "atencao";
  return "ok";
}
