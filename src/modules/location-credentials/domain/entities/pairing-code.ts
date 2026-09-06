import type { OrganizationId } from "../../../../kernel/organization-id.js";

interface PairingCodeProps {
  id: string;
  organizationId: OrganizationId;
  locationId: string;
  code: string;
  expiresAt: Date;
  burnedAt: Date | null;
  createdAt: Date;
  description: string | null;
}

/**
 * A short-lived, single-use code an admin generates to bring a new screen
 * online (D6). Burned on the first redemption *attempt*, whether it
 * succeeds or not — `burn()` and `isExpired()` are separate so the use case
 * can burn before checking expiry, per D6/stories 2-3.
 */
export class PairingCode {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly locationId: string;
  readonly code: string;
  readonly expiresAt: Date;
  readonly createdAt: Date;
  readonly description: string | null;
  private _burnedAt: Date | null;

  private constructor(props: PairingCodeProps) {
    this.id = props.id;
    this.organizationId = props.organizationId;
    this.locationId = props.locationId;
    this.code = props.code;
    this.expiresAt = props.expiresAt;
    this.createdAt = props.createdAt;
    this.description = props.description;
    this._burnedAt = props.burnedAt;
  }

  get isBurned(): boolean {
    return this._burnedAt !== null;
  }

  get burnedAt(): Date | null {
    return this._burnedAt;
  }

  isExpired(now: Date): boolean {
    return now.getTime() >= this.expiresAt.getTime();
  }

  burn(now: Date): void {
    this._burnedAt = now;
  }

  static create(props: {
    organizationId: OrganizationId;
    locationId: string;
    code: string;
    expiresAt: Date;
    description?: string | null;
  }): PairingCode {
    return new PairingCode({
      id: crypto.randomUUID(),
      organizationId: props.organizationId,
      locationId: props.locationId,
      code: props.code,
      expiresAt: props.expiresAt,
      burnedAt: null,
      createdAt: new Date(),
      description: props.description ?? null,
    });
  }

  static reconstitute(props: PairingCodeProps): PairingCode {
    return new PairingCode(props);
  }
}
