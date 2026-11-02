export class PositionNotFoundError extends Error {
  constructor(id: string) {
    super(`Cargo não encontrado: ${id}`);
    this.name = "PositionNotFoundError";
  }
}

export class InvalidPositionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPositionError";
  }
}

/** Já existe um cargo com o mesmo nome normalizado ("Preparador" = "preparador" = " PREPARADOR "). */
export class DuplicatePositionNameError extends Error {
  constructor(name: string) {
    super(`Já existe um cargo com o nome "${name}"`);
    this.name = "DuplicatePositionNameError";
  }
}
