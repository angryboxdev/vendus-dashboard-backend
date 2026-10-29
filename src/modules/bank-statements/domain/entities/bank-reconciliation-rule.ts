import type { JustificationType, MovementType, RiskLevel } from "./bank-movement.js";
import { recurringMatchText } from "../utils/bank-description.js";
import { InvalidRuleError } from "../errors.js";

/** Margem por defeito de uma regra de valor fixo (1€, igual à tolerância da conciliação). */
export const DEFAULT_RULE_AMOUNT_TOLERANCE_CENTS = 100;

/** Justificações que uma regra não pode aplicar: «fatura» precisa de um documento real e «sem justificativa» não concilia. */
const NON_AUTOMATIC_JUSTIFICATIONS: ReadonlySet<JustificationType> = new Set(["fatura", "sem_justificativa"]);

interface BankReconciliationRuleProps {
  id: string;
  name: string;
  descriptionContains: string; // comparado com a descrição normalizada (sem acentos, datas nem referências)
  movementType: MovementType | null; // null = applies to both
  /** Conta a que a regra se aplica; null = todas (regras antigas). */
  bankAccountId: string | null;
  /** Valor fixo esperado (cêntimos); null = qualquer valor (ex.: taxas TPA, que variam todos os meses). */
  amountCents: number | null;
  amountToleranceCents: number;
  costCenterGroupId: string | null;
  costCenterCategoryId: string | null;
  supplierId: string | null;
  vatRate: number | null;
  vatIncluded: boolean | null;
  /** Recorrência sem fatura (renda, salário): cada movimento fica ligado à ocorrência do mês, que fica paga. */
  recurrenceId: string | null;
  /** Só classifica (categoria para a DRE): o movimento fica à espera da fatura. Senão, justifica de vez. */
  classifyOnly: boolean;
  justificationType: JustificationType;
  requiresDocument: boolean;
  affectsDre: boolean;
  affectsCashflow: boolean;
  affectsProfitability: boolean;
  riskLevel: RiskLevel;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Campos alteráveis de uma regra (ecrã «Movimentos recorrentes»). */
export type BankReconciliationRuleChanges = Partial<
  Pick<
    BankReconciliationRuleProps,
    | "name"
    | "descriptionContains"
    | "amountCents"
    | "amountToleranceCents"
    | "costCenterGroupId"
    | "costCenterCategoryId"
    | "supplierId"
    | "vatRate"
    | "vatIncluded"
    | "recurrenceId"
    | "classifyOnly"
    | "justificationType"
  >
>;

function validate(props: BankReconciliationRuleProps): void {
  if (!props.name.trim()) throw new InvalidRuleError("Rule name is required");
  if (!props.descriptionContains.trim()) throw new InvalidRuleError("descriptionContains is required");
  if (!recurringMatchText(props.descriptionContains)) throw new InvalidRuleError("descriptionContains has no identifying words");
  if (props.amountCents !== null && (!Number.isInteger(props.amountCents) || props.amountCents < 0)) {
    throw new InvalidRuleError("amountCents must be a non-negative integer");
  }
  if (!Number.isInteger(props.amountToleranceCents) || props.amountToleranceCents < 0) {
    throw new InvalidRuleError("amountToleranceCents must be a non-negative integer");
  }
  if (props.recurrenceId !== null && props.justificationType !== "contrato_recorrencia") {
    throw new InvalidRuleError("Uma regra ligada a uma recorrência tem de usar a justificação «Contrato / Recorrência».");
  }
  if (props.classifyOnly && props.recurrenceId !== null) {
    throw new InvalidRuleError("Uma regra ligada a uma recorrência paga a ocorrência: não pode ser só de classificar.");
  }
  if (props.classifyOnly && props.costCenterCategoryId === null && props.costCenterGroupId === null) {
    throw new InvalidRuleError("Uma regra que só classifica precisa da categoria.");
  }
  if (props.recurrenceId !== null && props.bankAccountId === null) {
    throw new InvalidRuleError("Uma regra ligada a uma recorrência tem de ser de uma conta bancária.");
  }
}

export class BankReconciliationRule {
  readonly id: string;
  readonly name: string;
  readonly descriptionContains: string;
  readonly movementType: MovementType | null;
  readonly bankAccountId: string | null;
  readonly amountCents: number | null;
  readonly amountToleranceCents: number;
  readonly costCenterGroupId: string | null;
  readonly costCenterCategoryId: string | null;
  readonly supplierId: string | null;
  readonly vatRate: number | null;
  readonly vatIncluded: boolean | null;
  readonly recurrenceId: string | null;
  readonly classifyOnly: boolean;
  readonly justificationType: JustificationType;
  readonly requiresDocument: boolean;
  readonly affectsDre: boolean;
  readonly affectsCashflow: boolean;
  readonly affectsProfitability: boolean;
  readonly riskLevel: RiskLevel;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: BankReconciliationRuleProps) {
    this.id = props.id;
    this.name = props.name;
    this.descriptionContains = props.descriptionContains;
    this.movementType = props.movementType;
    this.bankAccountId = props.bankAccountId;
    this.amountCents = props.amountCents;
    this.amountToleranceCents = props.amountToleranceCents;
    this.costCenterGroupId = props.costCenterGroupId;
    this.costCenterCategoryId = props.costCenterCategoryId;
    this.supplierId = props.supplierId;
    this.vatRate = props.vatRate;
    this.vatIncluded = props.vatIncluded;
    this.recurrenceId = props.recurrenceId;
    this.classifyOnly = props.classifyOnly;
    this.justificationType = props.justificationType;
    this.requiresDocument = props.requiresDocument;
    this.affectsDre = props.affectsDre;
    this.affectsCashflow = props.affectsCashflow;
    this.affectsProfitability = props.affectsProfitability;
    this.riskLevel = props.riskLevel;
    this.isActive = props.isActive;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: {
    name: string;
    descriptionContains: string;
    movementType?: MovementType | null;
    bankAccountId?: string | null;
    amountCents?: number | null;
    amountToleranceCents?: number;
    costCenterGroupId?: string | null;
    costCenterCategoryId?: string | null;
    supplierId?: string | null;
    vatRate?: number | null;
    vatIncluded?: boolean | null;
    recurrenceId?: string | null;
    classifyOnly?: boolean;
    justificationType: JustificationType;
    requiresDocument?: boolean;
    affectsDre?: boolean;
    affectsCashflow?: boolean;
    affectsProfitability?: boolean;
    riskLevel?: RiskLevel;
  }): BankReconciliationRule {
    if (NON_AUTOMATIC_JUSTIFICATIONS.has(props.justificationType)) {
      throw new InvalidRuleError(`A rule cannot apply the justification "${props.justificationType}"`);
    }
    const now = new Date();
    const full: BankReconciliationRuleProps = {
      id: crypto.randomUUID(),
      name: props.name.trim(),
      descriptionContains: props.descriptionContains.trim(),
      movementType: props.movementType ?? null,
      bankAccountId: props.bankAccountId ?? null,
      amountCents: props.amountCents ?? null,
      amountToleranceCents: props.amountToleranceCents ?? DEFAULT_RULE_AMOUNT_TOLERANCE_CENTS,
      costCenterGroupId: props.costCenterGroupId ?? null,
      costCenterCategoryId: props.costCenterCategoryId ?? null,
      supplierId: props.supplierId ?? null,
      vatRate: props.vatRate ?? null,
      vatIncluded: props.vatIncluded ?? null,
      recurrenceId: props.recurrenceId ?? null,
      classifyOnly: props.classifyOnly ?? false,
      justificationType: props.justificationType,
      requiresDocument: props.requiresDocument ?? false,
      affectsDre: props.affectsDre ?? true,
      affectsCashflow: props.affectsCashflow ?? true,
      affectsProfitability: props.affectsProfitability ?? false,
      riskLevel: props.riskLevel ?? "low",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    validate(full);
    return new BankReconciliationRule(full);
  }

  static reconstitute(
    props: Omit<
      BankReconciliationRuleProps,
      "bankAccountId" | "amountCents" | "amountToleranceCents" | "supplierId" | "vatRate" | "vatIncluded" | "recurrenceId" | "classifyOnly"
    > &
      Partial<BankReconciliationRuleProps>,
  ): BankReconciliationRule {
    return new BankReconciliationRule({
      ...props,
      bankAccountId: props.bankAccountId ?? null,
      amountCents: props.amountCents ?? null,
      amountToleranceCents: props.amountToleranceCents ?? DEFAULT_RULE_AMOUNT_TOLERANCE_CENTS,
      supplierId: props.supplierId ?? null,
      vatRate: props.vatRate ?? null,
      vatIncluded: props.vatIncluded ?? null,
      recurrenceId: props.recurrenceId ?? null,
      classifyOnly: props.classifyOnly ?? false,
    });
  }

  /** true quando a regra pode conciliar sozinha (regras antigas com «fatura»/«sem justificativa» ficam de fora). */
  get isAutomatic(): boolean {
    return this.isActive && !NON_AUTOMATIC_JUSTIFICATIONS.has(this.justificationType);
  }

  deactivate(): BankReconciliationRule {
    return new BankReconciliationRule({ ...this.toProps(), isActive: false, updatedAt: new Date() });
  }

  activate(): BankReconciliationRule {
    return new BankReconciliationRule({ ...this.toProps(), isActive: true, updatedAt: new Date() });
  }

  edit(changes: BankReconciliationRuleChanges): BankReconciliationRule {
    if (changes.justificationType && NON_AUTOMATIC_JUSTIFICATIONS.has(changes.justificationType)) {
      throw new InvalidRuleError(`A rule cannot apply the justification "${changes.justificationType}"`);
    }
    const defined = Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined));
    const next: BankReconciliationRuleProps = {
      ...this.toProps(),
      ...defined,
      name: (changes.name ?? this.name).trim(),
      descriptionContains: (changes.descriptionContains ?? this.descriptionContains).trim(),
      updatedAt: new Date(),
    };
    validate(next);
    return new BankReconciliationRule(next);
  }

  private toProps(): BankReconciliationRuleProps {
    return {
      id: this.id,
      name: this.name,
      descriptionContains: this.descriptionContains,
      movementType: this.movementType,
      bankAccountId: this.bankAccountId,
      amountCents: this.amountCents,
      amountToleranceCents: this.amountToleranceCents,
      costCenterGroupId: this.costCenterGroupId,
      costCenterCategoryId: this.costCenterCategoryId,
      supplierId: this.supplierId,
      vatRate: this.vatRate,
      vatIncluded: this.vatIncluded,
      recurrenceId: this.recurrenceId,
      classifyOnly: this.classifyOnly,
      justificationType: this.justificationType,
      requiresDocument: this.requiresDocument,
      affectsDre: this.affectsDre,
      affectsCashflow: this.affectsCashflow,
      affectsProfitability: this.affectsProfitability,
      riskLevel: this.riskLevel,
      isActive: this.isActive,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
