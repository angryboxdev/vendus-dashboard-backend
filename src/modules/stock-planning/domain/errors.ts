export class ForecastRunNotFoundError extends Error {
  constructor(id: string) {
    super(`Execução de previsão "${id}" não encontrada`);
    this.name = "ForecastRunNotFoundError";
  }
}

export class NoLatestForecastRunError extends Error {
  constructor(locationId: string) {
    super(`Ainda não há nenhuma previsão gerada para a loja "${locationId}" — corra o job diário primeiro`);
    this.name = "NoLatestForecastRunError";
  }
}

export class InvalidForecastRunTransitionError extends Error {
  constructor(id: string, from: string) {
    super(`Execução de previsão "${id}" não pode transitar a partir do estado "${from}"`);
    this.name = "InvalidForecastRunTransitionError";
  }
}

export class PlanningAlertNotFoundError extends Error {
  constructor(id: string) {
    super(`Alerta de planeamento "${id}" não encontrado`);
    this.name = "PlanningAlertNotFoundError";
  }
}

export class StockItemPlanningNotFoundError extends Error {
  constructor(id: string) {
    super(`Item de stock "${id}" não encontrado para planeamento`);
    this.name = "StockItemPlanningNotFoundError";
  }
}

export class RecommendationNotFoundError extends Error {
  constructor(id: string) {
    super(`Recomendação de reposição "${id}" não encontrada`);
    this.name = "RecommendationNotFoundError";
  }
}

export class ForecastFeedbackNotFoundError extends Error {
  constructor(id: string) {
    super(`Pedido de feedback de previsão "${id}" não encontrado`);
    this.name = "ForecastFeedbackNotFoundError";
  }
}

export class ForecastFeedbackAlreadySubmittedError extends Error {
  constructor(id: string) {
    super(`Feedback "${id}" já foi respondido — nunca é substituído, só criado uma vez por anomalia`);
    this.name = "ForecastFeedbackAlreadySubmittedError";
  }
}

export class ReasonCodeRequiredError extends Error {
  constructor() {
    super("É obrigatório indicar o motivo (reason_code) ao responder ao feedback de previsão");
    this.name = "ReasonCodeRequiredError";
  }
}

export class ReviewedQuantityRequiredError extends Error {
  constructor() {
    super("É obrigatório indicar a quantidade revista para registar a revisão da recomendação");
    this.name = "ReviewedQuantityRequiredError";
  }
}

export class LocationRequiredError extends Error {
  constructor() {
    super("Há mais que uma loja ativa — é preciso indicar a loja");
    this.name = "LocationRequiredError";
  }
}

export class NoActiveLocationError extends Error {
  constructor() {
    super("Não há nenhuma loja ativa configurada");
    this.name = "NoActiveLocationError";
  }
}

export class SilenceReasonRequiredError extends Error {
  constructor() {
    super("É obrigatório indicar o motivo para silenciar um alerta");
    this.name = "SilenceReasonRequiredError";
  }
}
