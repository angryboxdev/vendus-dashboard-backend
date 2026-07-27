export type BankAccountType = "account" | "credit_card";
export type CheckingAccountType = "corrente" | "poupança" | "ordenado";

interface BankAccountProps {
  id: string;
  bankId: string;
  type: BankAccountType;
  nickname: string | null;
  iban: string | null;
  accountNumber: string | null;
  accountType: CheckingAccountType | null;
  lastFourDigits: string | null;
  cardName: string | null;
  creditLimitCents: number | null;
  billingCycleDay: number | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const FOUR_DIGITS_RE = /^\d{4}$/;

export class BankAccount {
  readonly id: string;
  readonly bankId: string;
  readonly type: BankAccountType;
  readonly nickname: string | null;
  readonly iban: string | null;
  readonly accountNumber: string | null;
  readonly accountType: CheckingAccountType | null;
  readonly lastFourDigits: string | null;
  readonly cardName: string | null;
  readonly creditLimitCents: number | null;
  readonly billingCycleDay: number | null;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: BankAccountProps) {
    this.id = props.id;
    this.bankId = props.bankId;
    this.type = props.type;
    this.nickname = props.nickname;
    this.iban = props.iban;
    this.accountNumber = props.accountNumber;
    this.accountType = props.accountType;
    this.lastFourDigits = props.lastFourDigits;
    this.cardName = props.cardName;
    this.creditLimitCents = props.creditLimitCents;
    this.billingCycleDay = props.billingCycleDay;
    this.isActive = props.isActive;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: {
    bankId: string;
    type: BankAccountType;
    nickname?: string | null;
    iban?: string | null;
    accountNumber?: string | null;
    accountType?: CheckingAccountType | null;
    lastFourDigits?: string | null;
    cardName?: string | null;
    creditLimitCents?: number | null;
    billingCycleDay?: number | null;
  }): BankAccount {
    if (!props.bankId) throw new Error("bankId is required");

    const billingCycleDay = props.billingCycleDay ?? null;
    if (billingCycleDay != null && (billingCycleDay < 1 || billingCycleDay > 31))
      throw new Error("billingCycleDay must be between 1 and 31");

    const lastFourDigits = props.type === "credit_card" ? (props.lastFourDigits ?? null) : null;
    if (lastFourDigits != null && !FOUR_DIGITS_RE.test(lastFourDigits))
      throw new Error("lastFourDigits must be exactly 4 digits");

    const now = new Date();
    return new BankAccount({
      id: crypto.randomUUID(),
      bankId: props.bankId,
      type: props.type,
      nickname: props.nickname ?? null,
      iban: props.iban ?? null,
      accountNumber: props.accountNumber ?? null,
      accountType: props.type === "account" ? (props.accountType ?? null) : null,
      lastFourDigits,
      cardName: props.type === "credit_card" ? (props.cardName ?? null) : null,
      creditLimitCents: props.type === "credit_card" ? (props.creditLimitCents ?? null) : null,
      billingCycleDay: props.type === "credit_card" ? billingCycleDay : null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: BankAccountProps): BankAccount {
    return new BankAccount(props);
  }

  update(props: {
    nickname?: string | null;
    iban?: string | null;
    accountNumber?: string | null;
    accountType?: CheckingAccountType | null;
    lastFourDigits?: string | null;
    cardName?: string | null;
    creditLimitCents?: number | null;
    billingCycleDay?: number | null;
    isActive?: boolean;
  }): BankAccount {
    const newBillingCycleDay =
      props.billingCycleDay !== undefined ? props.billingCycleDay : this.billingCycleDay;
    if (newBillingCycleDay != null && (newBillingCycleDay < 1 || newBillingCycleDay > 31))
      throw new Error("billingCycleDay must be between 1 and 31");

    const newLastFour =
      props.lastFourDigits !== undefined ? props.lastFourDigits : this.lastFourDigits;
    if (newLastFour != null && !FOUR_DIGITS_RE.test(newLastFour))
      throw new Error("lastFourDigits must be exactly 4 digits");

    return new BankAccount({
      ...this.toProps(),
      nickname: props.nickname !== undefined ? props.nickname : this.nickname,
      iban: props.iban !== undefined ? props.iban : this.iban,
      accountNumber: props.accountNumber !== undefined ? props.accountNumber : this.accountNumber,
      accountType: props.accountType !== undefined ? props.accountType : this.accountType,
      lastFourDigits: newLastFour,
      cardName: props.cardName !== undefined ? props.cardName : this.cardName,
      creditLimitCents:
        props.creditLimitCents !== undefined ? props.creditLimitCents : this.creditLimitCents,
      billingCycleDay: newBillingCycleDay,
      isActive: props.isActive !== undefined ? props.isActive : this.isActive,
      updatedAt: new Date(),
    });
  }

  /** Returns the value used to match this account against a CSV/XLSX account number field. */
  matchesAccountNumber(raw: string): boolean {
    const normalised = raw.trim().replace(/\s+/g, "").toUpperCase();
    if (this.iban && this.iban.replace(/\s+/g, "").toUpperCase() === normalised) return true;
    if (this.accountNumber && this.accountNumber.replace(/\s+/g, "").toUpperCase() === normalised)
      return true;
    return false;
  }

  private toProps(): BankAccountProps {
    return {
      id: this.id,
      bankId: this.bankId,
      type: this.type,
      nickname: this.nickname,
      iban: this.iban,
      accountNumber: this.accountNumber,
      accountType: this.accountType,
      lastFourDigits: this.lastFourDigits,
      cardName: this.cardName,
      creditLimitCents: this.creditLimitCents,
      billingCycleDay: this.billingCycleDay,
      isActive: this.isActive,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
