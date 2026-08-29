import {
  StatementNotFoundError,
  BlockingMovementsError,
} from "../../domain/errors.js";
import type { BankStatementImportRepositoryPort } from "../../domain/ports/out/bank-statement-import-repository.port.js";
import type { BankMovementRepositoryPort } from "../../domain/ports/out/bank-movement-repository.port.js";
import type { CloseStatementCommand, CloseStatementPort } from "../../domain/ports/in/bank-statement.ports.js";

const BLOCKING_STATUSES = new Set(["saida_nao_justificada", "divergente"] as const);
const BLOCKING_RISKS = new Set(["high", "critical"] as const);

export class CloseStatementUseCase implements CloseStatementPort {
  constructor(
    private readonly statementRepo: BankStatementImportRepositoryPort,
    private readonly movementRepo: BankMovementRepositoryPort
  ) {}

  async execute(command: CloseStatementCommand): Promise<void> {
    const { organizationId, statementImportId } = command;
    const statement = await this.statementRepo.findById(organizationId, statementImportId);
    if (!statement) throw new StatementNotFoundError(statementImportId);

    // Entity validates balance diff === 0 (throws StatementBalanceDifferenceError)
    const closed = statement.close();

    // Use case validates blocking movements
    const movements = await this.movementRepo.findByStatementId(organizationId, statementImportId);
    const blocking = movements.filter(
      (m) =>
        BLOCKING_STATUSES.has(m.reconciliationStatus as "saida_nao_justificada" | "divergente") &&
        BLOCKING_RISKS.has(m.riskLevel as "high" | "critical")
    );

    if (blocking.length > 0) {
      throw new BlockingMovementsError(statementImportId, blocking.length);
    }

    await this.statementRepo.update(organizationId, closed);
  }
}
