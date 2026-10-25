import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { InvalidEntryRulesError } from "../../domain/errors.js";
import type { EntryRulesPort, SaveEntryRulesCommand } from "../../domain/ports/in/stock-purchase-review.ports.js";
import type { EntryRulesRepositoryPort } from "../../domain/ports/out/entry-rules-repository.port.js";
import type { StockReviewAuditLogPort } from "../../domain/ports/out/stock-review-audit-log.port.js";
import { effectiveRules, isRuleItemType, type EntryMode, type EntryRules } from "../../domain/services/entry-rules.service.js";

const MODES: EntryMode[] = ["stock", "no_stock", "review"];

/** Regras de entrada no Stock da empresa (V4 §2): ler as efetivas e gravar alterações (auditadas). */
export class EntryRulesUseCase implements EntryRulesPort {
  constructor(
    private readonly repository: EntryRulesRepositoryPort,
    private readonly auditLog: StockReviewAuditLogPort,
  ) {}

  async get(organizationId: OrganizationId): Promise<EntryRules> {
    return effectiveRules(await this.repository.list(organizationId));
  }

  async save(command: SaveEntryRulesCommand): Promise<EntryRules> {
    const entries = Object.entries(command.rules);
    if (entries.length === 0) throw new InvalidEntryRulesError("nenhuma regra indicada");
    for (const [type, mode] of entries) {
      if (!isRuleItemType(type)) throw new InvalidEntryRulesError(`tipo de artigo desconhecido: ${type}`);
      if (!MODES.includes(mode)) throw new InvalidEntryRulesError(`modo inválido para ${type}: ${String(mode)}`);
    }
    const before = await this.get(command.organizationId);
    await this.repository.saveAll(command.organizationId, command.rules, command.actor);
    const after = await this.get(command.organizationId);
    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "stock_entry_rules",
      entityId: command.organizationId,
      action: "entry_rules_changed",
      before,
      after,
    });
    return after;
  }
}
