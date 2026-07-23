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
  constructor(hash: string) {
    super(`Movement with deduplication hash ${hash} already exists`);
    this.name = "DuplicateMovementError";
  }
}

export class EntityAlreadyReconciledError extends Error {
  constructor(entityType: string, entityId: string) {
    super(`${entityType} ${entityId} is already reconciled with another movement`);
    this.name = "EntityAlreadyReconciledError";
  }
}
