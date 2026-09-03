import type { OrganizationId } from "../../../../kernel/organization-id.js";

interface LocationTokenProps {
  id: string;
  organizationId: OrganizationId;
  locationId: string;
  tokenHash: string;
  issuedAt: Date;
}

/**
 * The persistent, opaque credential a screen holds after redeeming a
 * pairing code (D5). Authorizes one Location, not a feature (D8) — there is
 * no field naming which screen or which of kiosk/till/KDS it is for. Only
 * the hash is ever held here; the raw token is minted and returned once, at
 * redemption, by the use case — never reconstructed from this entity.
 */
export class LocationToken {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly locationId: string;
  readonly tokenHash: string;
  readonly issuedAt: Date;

  private constructor(props: LocationTokenProps) {
    this.id = props.id;
    this.organizationId = props.organizationId;
    this.locationId = props.locationId;
    this.tokenHash = props.tokenHash;
    this.issuedAt = props.issuedAt;
  }

  static create(props: {
    organizationId: OrganizationId;
    locationId: string;
    tokenHash: string;
  }): LocationToken {
    return new LocationToken({
      id: crypto.randomUUID(),
      organizationId: props.organizationId,
      locationId: props.locationId,
      tokenHash: props.tokenHash,
      issuedAt: new Date(),
    });
  }

  static reconstitute(props: LocationTokenProps): LocationToken {
    return new LocationToken(props);
  }
}
