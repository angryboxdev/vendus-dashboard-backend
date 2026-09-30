export class StockCountSessionNotFoundError extends Error {
  constructor(id: string) {
    super(`Sessão de contagem "${id}" não encontrada`);
    this.name = "StockCountSessionNotFoundError";
  }
}

export class StockCountLineNotFoundError extends Error {
  constructor(id: string) {
    super(`Linha de contagem "${id}" não encontrada`);
    this.name = "StockCountLineNotFoundError";
  }
}

export class StockCountAttemptNotFoundError extends Error {
  constructor(id: string) {
    super(`Tentativa de contagem "${id}" não encontrada`);
    this.name = "StockCountAttemptNotFoundError";
  }
}

export class StockCountZoneNotFoundError extends Error {
  constructor(id: string) {
    super(`Zona de contagem "${id}" não encontrada`);
    this.name = "StockCountZoneNotFoundError";
  }
}

export class SessionAlreadyCompletedError extends Error {
  constructor(id: string) {
    super(`Sessão de contagem "${id}" já foi concluída — imutável, correção só por nova sessão`);
    this.name = "SessionAlreadyCompletedError";
  }
}

export class SessionAlreadyCancelledError extends Error {
  constructor(id: string) {
    super(`Sessão de contagem "${id}" já foi cancelada`);
    this.name = "SessionAlreadyCancelledError";
  }
}

export class SessionNotInDraftError extends Error {
  constructor(id: string) {
    super(`Sessão de contagem "${id}" já foi iniciada — só é possível iniciar a partir de Rascunho`);
    this.name = "SessionNotInDraftError";
  }
}

export class SessionNotCountingError extends Error {
  constructor(id: string) {
    super(`Sessão de contagem "${id}" não está em contagem`);
    this.name = "SessionNotCountingError";
  }
}

export class SessionNotReviewingError extends Error {
  constructor(id: string) {
    super(`Sessão de contagem "${id}" não está em revisão`);
    this.name = "SessionNotReviewingError";
  }
}

export class SessionNotReadyError extends Error {
  constructor(reason: string) {
    super(`Sessão de contagem ainda não está pronta para confirmar: ${reason}`);
    this.name = "SessionNotReadyError";
  }
}

export class SessionHasPendingLinesError extends Error {
  constructor(reason: string) {
    super(`A sessão tem linhas por resolver: ${reason}`);
    this.name = "SessionHasPendingLinesError";
  }
}

export class StaleCountSessionVersionError extends Error {
  constructor(public readonly currentVersion: number) {
    super("Esta sessão de contagem foi alterada por outro utilizador — recarregue antes de tentar novamente");
    this.name = "StaleCountSessionVersionError";
  }
}

export class StaleCountLineVersionError extends Error {
  constructor(public readonly currentVersion: number) {
    super("Esta linha de contagem foi alterada por outro utilizador — recarregue antes de tentar novamente");
    this.name = "StaleCountLineVersionError";
  }
}

export class CancellationReasonRequiredError extends Error {
  constructor() {
    super("É obrigatório indicar o motivo do cancelamento");
    this.name = "CancellationReasonRequiredError";
  }
}

export class ManualResolutionReasonRequiredError extends Error {
  constructor() {
    super("É obrigatório indicar o motivo ao definir um valor final manual");
    this.name = "ManualResolutionReasonRequiredError";
  }
}

export class LineAlreadyResolvedError extends Error {
  constructor(id: string) {
    super(`Linha de contagem "${id}" já está resolvida`);
    this.name = "LineAlreadyResolvedError";
  }
}

export class LineNotCountedYetError extends Error {
  constructor(id: string) {
    super(`Linha de contagem "${id}" ainda não foi contada`);
    this.name = "LineNotCountedYetError";
  }
}

export class LineLockedByAnotherUserError extends Error {
  constructor(public readonly lockedBy: string) {
    super(`Esta linha está a ser contada por "${lockedBy}" — tente novamente dentro de alguns minutos`);
    this.name = "LineLockedByAnotherUserError";
  }
}

export class AttemptDoesNotBelongToLineError extends Error {
  constructor(attemptId: string, lineId: string) {
    super(`Tentativa "${attemptId}" não pertence à linha "${lineId}"`);
    this.name = "AttemptDoesNotBelongToLineError";
  }
}

export class OverlappingSessionError extends Error {
  constructor(
    public readonly conflictingSessionId: string,
    public readonly conflictingSessionNumber: number | null,
  ) {
    super(
      `Um ou mais itens já pertencem à sessão de contagem ativa #${conflictingSessionNumber ?? conflictingSessionId} nesta loja`,
    );
    this.name = "OverlappingSessionError";
  }
}

export class OverlapOverrideReasonRequiredError extends Error {
  constructor() {
    super("É obrigatório indicar o motivo para forçar o início apesar da sobreposição");
    this.name = "OverlapOverrideReasonRequiredError";
  }
}

export class InvalidCountedQuantityError extends Error {
  constructor(reason: string) {
    super(`Quantidade contada inválida: ${reason}`);
    this.name = "InvalidCountedQuantityError";
  }
}

export class InvalidConversionFactorError extends Error {
  constructor(value: unknown) {
    super(`Fator de conversão inválido: ${String(value)} (tem de ser um número positivo e finito)`);
    this.name = "InvalidConversionFactorError";
  }
}

export class UnknownCountUnitError extends Error {
  constructor(unit: string, itemId: string) {
    super(`Unidade "${unit}" não está configurada para o item "${itemId}" (nem é a unidade base)`);
    this.name = "UnknownCountUnitError";
  }
}

export class StockItemNotFoundError extends Error {
  constructor(id: string) {
    super(`Item de stock "${id}" não encontrado`);
    this.name = "StockItemNotFoundError";
  }
}

export class StockItemNotEligibleError extends Error {
  constructor(id: string) {
    super(`Item de stock "${id}" não é elegível para contagem (inativo ou sem controlo de stock ativado)`);
    this.name = "StockItemNotEligibleError";
  }
}

export class ItemAlreadyInScopeError extends Error {
  constructor(itemId: string) {
    super(`Item "${itemId}" já está no escopo desta sessão`);
    this.name = "ItemAlreadyInScopeError";
  }
}

export class LocationRequiredError extends Error {
  constructor() {
    super("Há mais que uma loja ativa — é preciso indicar a loja antes de criar a sessão");
    this.name = "LocationRequiredError";
  }
}

export class NoActiveLocationError extends Error {
  constructor() {
    super("Não há nenhuma loja ativa configurada");
    this.name = "NoActiveLocationError";
  }
}
