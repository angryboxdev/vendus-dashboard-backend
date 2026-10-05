export class InvalidCalendarEntryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCalendarEntryError";
  }
}

export class HolidayNotFoundError extends Error {
  constructor(id: string) {
    super(`Feriado não encontrado: ${id}`);
    this.name = "HolidayNotFoundError";
  }
}

/** Mesmo dia + tipo + âmbito/local já existe (chave de deduplicação da task §6). */
export class DuplicateHolidayError extends Error {
  constructor(date: string) {
    super(`Já existe um feriado igual em ${date} (mesmo tipo e âmbito)`);
    this.name = "DuplicateHolidayError";
  }
}

export class CompanyEventNotFoundError extends Error {
  constructor(id: string) {
    super(`Evento não encontrado: ${id}`);
    this.name = "CompanyEventNotFoundError";
  }
}

/** Um Local inexistente ou inativo numa nova marcação. */
export class InvalidCalendarLocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCalendarLocationError";
  }
}
