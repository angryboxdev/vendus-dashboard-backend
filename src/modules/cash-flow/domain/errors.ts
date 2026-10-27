export class InvalidCashFlowPeriodError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCashFlowPeriodError";
  }
}

export class InvalidDreParametersError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidDreParametersError";
  }
}
