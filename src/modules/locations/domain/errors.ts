export class LocationNotFoundError extends Error {
  constructor(locationId: string) {
    super(`Local "${locationId}" não encontrado`);
    this.name = "LocationNotFoundError";
  }
}

export interface LocationFieldError {
  field: string;
  message: string;
}

/** Agrega todos os campos inválidos de uma vez. */
export class InvalidLocationError extends Error {
  constructor(readonly fieldErrors: LocationFieldError[]) {
    super(`Local inválido: ${fieldErrors.map((e) => `${e.field} (${e.message})`).join(", ")}`);
    this.name = "InvalidLocationError";
  }
}

export class DuplicateLocationCodeError extends Error {
  constructor(code: string) {
    super(`Já existe um local com o código "${code}"`);
    this.name = "DuplicateLocationCodeError";
  }
}
