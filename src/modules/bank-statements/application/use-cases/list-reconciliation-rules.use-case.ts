import type { BankReconciliationRuleRepositoryPort } from "../../domain/ports/out/bank-reconciliation-rule-repository.port.js";
import type { BankMovementRepositoryPort } from "../../domain/ports/out/bank-movement-repository.port.js";
import type {
  ListReconciliationRulesPort,
  ListReconciliationRulesQuery,
  ReconciliationRuleDto,
} from "../../domain/ports/in/bank-statement.ports.js";
import { ruleToDto } from "./create-reconciliation-rule.use-case.js";

export class ListReconciliationRulesUseCase implements ListReconciliationRulesPort {
  constructor(
    private readonly ruleRepo: BankReconciliationRuleRepositoryPort,
    /** Para mostrar quantos movimentos cada regra conciliou e quando foi a última vez. */
    private readonly movementRepo?: BankMovementRepositoryPort,
  ) {}

  async execute(query: ListReconciliationRulesQuery): Promise<ReconciliationRuleDto[]> {
    const [rules, usage] = await Promise.all([
      this.ruleRepo.findAll(query.organizationId, query.activeOnly ?? false),
      this.movementRepo ? this.movementRepo.ruleUsage(query.organizationId) : Promise.resolve(null),
    ]);
    if (!usage) return rules.map(ruleToDto);
    const byRule = new Map(usage.map((u) => [u.ruleId, u]));
    return rules.map((r) => {
      const u = byRule.get(r.id);
      return { ...ruleToDto(r), usage: { movementsCount: u?.movementsCount ?? 0, lastBookingDate: u?.lastBookingDate ?? null } };
    });
  }
}
