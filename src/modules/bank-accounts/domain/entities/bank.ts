export type BankLogoKey =
  | "millennium_bcp"
  | "cgd"
  | "santander"
  | "bpi"
  | "novo_banco"
  | "banco_ctt"
  | "activobank"
  | "montepio"
  | "bankinter"
  | "eurobic"
  | "abanca"
  | "credito_agricola"
  | "bbva"
  | "ing"
  | "revolut"
  | "wise"
  | "other";

export const BANK_LOGO_KEYS: BankLogoKey[] = [
  "millennium_bcp",
  "cgd",
  "santander",
  "bpi",
  "novo_banco",
  "banco_ctt",
  "activobank",
  "montepio",
  "bankinter",
  "eurobic",
  "abanca",
  "credito_agricola",
  "bbva",
  "ing",
  "revolut",
  "wise",
  "other",
];

export type StatementFormat =
  | "millennium_bcp_csv"
  | "generic_xlsx"
  | "generic_csv"
  | "cgd_csv"
  | "bpi_csv"
  | "santander_csv";

export const STATEMENT_FORMATS: StatementFormat[] = [
  "millennium_bcp_csv",
  "generic_xlsx",
  "generic_csv",
  "cgd_csv",
  "bpi_csv",
  "santander_csv",
];

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

interface BankProps {
  id: string;
  name: string;
  logoKey: BankLogoKey;
  color: string;
  country: string;
  bic: string | null;
  statementFormat: StatementFormat;
  createdAt: Date;
  updatedAt: Date;
}

export class Bank {
  readonly id: string;
  readonly name: string;
  readonly logoKey: BankLogoKey;
  readonly color: string;
  readonly country: string;
  readonly bic: string | null;
  readonly statementFormat: StatementFormat;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: BankProps) {
    this.id = props.id;
    this.name = props.name;
    this.logoKey = props.logoKey;
    this.color = props.color;
    this.country = props.country;
    this.bic = props.bic;
    this.statementFormat = props.statementFormat;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: {
    name: string;
    logoKey: BankLogoKey;
    color: string;
    country: string;
    bic?: string | null;
    statementFormat: StatementFormat;
  }): Bank {
    if (!props.name.trim()) throw new Error("Bank name is required");
    if (!HEX_COLOR_RE.test(props.color))
      throw new Error("color must be a valid hex color (e.g. #A3211A)");
    if (!props.country.trim()) throw new Error("country is required");

    const now = new Date();
    return new Bank({
      id: crypto.randomUUID(),
      name: props.name.trim(),
      logoKey: props.logoKey,
      color: props.color,
      country: props.country.trim().toUpperCase(),
      bic: props.bic?.trim() || null,
      statementFormat: props.statementFormat,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: BankProps): Bank {
    return new Bank(props);
  }

  update(props: {
    name?: string;
    logoKey?: BankLogoKey;
    color?: string;
    country?: string;
    bic?: string | null;
    statementFormat?: StatementFormat;
  }): Bank {
    const newName = props.name !== undefined ? props.name.trim() : this.name;
    const newColor = props.color !== undefined ? props.color : this.color;
    if (newName === "") throw new Error("Bank name is required");
    if (!HEX_COLOR_RE.test(newColor))
      throw new Error("color must be a valid hex color");
    return new Bank({
      ...this.toProps(),
      name: newName,
      logoKey: props.logoKey ?? this.logoKey,
      color: newColor,
      country: props.country !== undefined ? props.country.trim().toUpperCase() : this.country,
      bic: props.bic !== undefined ? (props.bic?.trim() || null) : this.bic,
      statementFormat: props.statementFormat ?? this.statementFormat,
      updatedAt: new Date(),
    });
  }

  private toProps(): BankProps {
    return {
      id: this.id,
      name: this.name,
      logoKey: this.logoKey,
      color: this.color,
      country: this.country,
      bic: this.bic,
      statementFormat: this.statementFormat,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
