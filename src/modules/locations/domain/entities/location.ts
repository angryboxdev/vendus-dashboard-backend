interface LocationProps {
  id: string;
  name: string;
  code: string;
  timezone: string;
  isActive: boolean;
}

/**
 * A location belonging to one organization. Read-only in this module —
 * locations are provisioned by `runOrganizationProvisioning` (spec B1), not
 * created here — so there is no `create`, only `reconstitute`.
 */
export class Location {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly timezone: string;
  readonly isActive: boolean;

  private constructor(props: LocationProps) {
    this.id = props.id;
    this.name = props.name;
    this.code = props.code;
    this.timezone = props.timezone;
    this.isActive = props.isActive;
  }

  static reconstitute(props: LocationProps): Location {
    return new Location(props);
  }
}
