export class ObligationNotFoundError extends Error {
  constructor(id: string) {
    super(`Financial obligation not found: ${id}`);
    this.name = "ObligationNotFoundError";
  }
}
