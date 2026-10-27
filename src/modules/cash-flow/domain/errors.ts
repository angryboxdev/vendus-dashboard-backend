export class InvalidCashFlowPeriodError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCashFlowPeriodError";
  }
}
