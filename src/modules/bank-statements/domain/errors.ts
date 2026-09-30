export class StatementNotFoundError extends Error {
  constructor(id: string) {
    super(`Bank statement import not found: ${id}`);
    this.name = "StatementNotFoundError";
  }
}

export class MovementNotFoundError extends Error {
  constructor(id: string) {
    super(`Bank movement not found: ${id}`);
    this.name = "MovementNotFoundError";
  }
}

export class RuleNotFoundError extends Error {
  constructor(id: string) {
    super(`Reconciliation rule not found: ${id}`);
    this.name = "RuleNotFoundError";
  }
}

export class StatementAlreadyClosedError extends Error {
  constructor(id: string) {
    super(`Statement ${id} is already closed`);
    this.name = "StatementAlreadyClosedError";
  }
}

export class StatementBalanceDifferenceError extends Error {
  constructor(id: string, diffCents: number) {
    super(
      `Statement ${id} has a balance difference of ${diffCents} cents. ` +
        `Resolve all divergences before closing.`
    );
    this.name = "StatementBalanceDifferenceError";
  }
}

export class BlockingMovementsError extends Error {
  constructor(id: string, count: number) {
    super(
      `Statement ${id} has ${count} blocking movement(s) (unjustified or divergent with high/critical risk). ` +
        `Resolve or justify them before closing.`
    );
    this.name = "BlockingMovementsError";
  }
}

export class DuplicateMovementError extends Error {
  constructor(hash?: string) {
    super(
      hash
        ? `Movement with deduplication hash ${hash} already exists`
        : "One or more movements already exist (duplicate deduplication hash)",
    );
    this.name = "DuplicateMovementError";
  }
}

export class EntityAlreadyReconciledError extends Error {
  constructor(entityType: string, entityId: string) {
    super(`${entityType} ${entityId} is already reconciled with another movement`);
    this.name = "EntityAlreadyReconciledError";
  }
}

/**
 * Thrown by `ConfirmGroupedSettlementUseCase` when the RPC
 * `fn_reconcile_movement_grouped` detects that at least one document's true
 * open balance (recomputed inside the transaction, row-locked) no longer
 * matches the `expectedOpenBalanceCents` the caller observed when building
 * the selection — i.e. someone else settled it concurrently. The whole
 * grouped write is rolled back; nothing is partially applied.
 */
export class StaleDocumentBalanceError extends Error {
  readonly entityIds: string[];

  constructor(entityIds: string[]) {
    super(
      "Um ou mais documentos foram alterados ou já foram liquidados. " +
        "Atualize a conciliação para continuar."
    );
    this.name = "StaleDocumentBalanceError";
    this.entityIds = entityIds;
  }
}
