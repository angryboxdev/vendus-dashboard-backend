export class LocationNotOwnedError extends Error {
  constructor(locationId: string) {
    super(`Location "${locationId}" does not belong to the calling organization`);
    this.name = "LocationNotOwnedError";
  }
}

export class PairingCodeNotFoundError extends Error {
  constructor() {
    super("Pairing code not found");
    this.name = "PairingCodeNotFoundError";
  }
}

export class PairingCodeAlreadyUsedError extends Error {
  constructor() {
    super("Pairing code has already been used");
    this.name = "PairingCodeAlreadyUsedError";
  }
}

export class PairingCodeExpiredError extends Error {
  constructor() {
    super("Pairing code has expired");
    this.name = "PairingCodeExpiredError";
  }
}

export class InvalidDescriptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidDescriptionError";
  }
}
