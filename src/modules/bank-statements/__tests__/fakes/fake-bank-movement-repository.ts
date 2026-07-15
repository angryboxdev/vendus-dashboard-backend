import type { BankMovement } from "../../domain/entities/bank-movement.js";
import type {
  BankMovementFilter,
  BankMovementRepositoryPort,
} from "../../domain/ports/out/bank-movement-repository.port.js";

export class FakeBankMovementRepository implements BankMovementRepositoryPort {
  private store = new Map<string, BankMovement>();

  async saveBulk(movements: BankMovement[]): Promise<void> {
    for (const m of movements) {
      this.store.set(m.id, m);
    }
  }

  async findByStatementId(
    statementImportId: string,
    filter?: BankMovementFilter
  ): Promise<BankMovement[]> {
    let results = [...this.store.values()].filter(
      (m) => m.statementImportId === statementImportId
    );
    if (filter?.reconciliationStatus) {
      results = results.filter((m) => m.reconciliationStatus === filter.reconciliationStatus);
    }
    if (filter?.movementType) {
      results = results.filter((m) => m.movementType === filter.movementType);
    }
    if (filter?.riskLevel) {
      results = results.filter((m) => m.riskLevel === filter.riskLevel);
    }
    return results;
  }

  async findById(id: string): Promise<BankMovement | null> {
    return this.store.get(id) ?? null;
  }

  async update(movement: BankMovement): Promise<void> {
    if (!this.store.has(movement.id)) {
      throw new Error(`Movement ${movement.id} not found`);
    }
    this.store.set(movement.id, movement);
  }

  async existsByHash(deduplicationHash: string): Promise<boolean> {
    return [...this.store.values()].some(
      (m) => m.deduplicationHash === deduplicationHash
    );
  }
}
