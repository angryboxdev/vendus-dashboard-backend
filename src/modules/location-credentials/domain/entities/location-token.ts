import type { OrganizationId } from "../../../../kernel/organization-id.js";

interface LocationTokenProps {
  id: string;
  organizationId: OrganizationId;
  locationId: string;
  tokenHash: string;
  issuedAt: Date;
  description: string | null;
}

/**
 * The persistent, opaque credential a screen holds after redeeming a
 * pairing code (D5). Authorizes one Location, not a feature (D8) — there is
 * no field naming which screen or which of kiosk/till/KDS it is for. Only
 * the hash is ever held here; the raw token is minted and returned once, at
 * redemption, by the use case — never reconstructed from this entity.
 * `description` is a plain opaque label copied from the `PairingCode` at
 * redemption — no identity/lookup semantics, not the Device entity (D3)
 * this module still doesn't have.
 */
export class LocationToken {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly locationId: string;
  readonly tokenHash: string;
  readonly issuedAt: Date;
  readonly description: string | null;

  private constructor(props: LocationTokenProps) {
    this.id = props.id;
    this.organizationId = props.organizationId;
    this.locationId = props.locationId;
    this.tokenHash = props.tokenHash;
    this.issuedAt = props.issuedAt;
    this.description = props.description;
  }

  static create(props: {
    organizationId: OrganizationId;
    locationId: string;
    tokenHash: string;
    description?: string | null;
  }): LocationToken {
    return new LocationToken({
      id: crypto.randomUUID(),
      organizationId: props.organizationId,
      locationId: props.locationId,
      tokenHash: props.tokenHash,
      issuedAt: new Date(),
      description: props.description ?? null,
    });
  }

  static reconstitute(props: LocationTokenProps): LocationToken {
    return new LocationToken(props);
  }
}
