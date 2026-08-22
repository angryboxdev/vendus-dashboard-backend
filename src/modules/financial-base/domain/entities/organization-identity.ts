interface OrganizationIdentityProps {
  id: string;
  name: string;
  nif: string;
  address: string | null;
  email: string | null;
}

export class OrganizationIdentity {
  readonly id: string;
  readonly name: string;
  readonly nif: string;
  readonly address: string | null;
  readonly email: string | null;

  private constructor(props: OrganizationIdentityProps) {
    this.id = props.id;
    this.name = props.name;
    this.nif = props.nif;
    this.address = props.address;
    this.email = props.email;
  }

  static reconstitute(props: OrganizationIdentityProps): OrganizationIdentity {
    return new OrganizationIdentity(props);
  }
}
