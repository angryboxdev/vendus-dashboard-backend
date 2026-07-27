import type { BankLogoKey, StatementFormat } from "../../entities/bank.js";
import type { BankAccountType, CheckingAccountType } from "../../entities/bank-account.js";

// ─── Bank DTOs ────────────────────────────────────────────────────────────────

export interface BankDto {
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

export interface AccountPreviewDto {
  id: string;
  type: BankAccountType;
  label: string;
  isActive: boolean;
  nickname: string | null;
  accountNumber: string | null;
  iban: string | null;
  lastFourDigits: string | null;
  creditLimitCents: number | null;
  accountType: CheckingAccountType | null;
}

export interface BankSummaryDto extends BankDto {
  accountPreviews: AccountPreviewDto[];
}

// ─── Bank Account DTOs ────────────────────────────────────────────────────────

export interface BankAccountDto {
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

export interface BankDetailDto extends BankDto {
  accounts: BankAccountDto[];
}

// ─── Create Bank ──────────────────────────────────────────────────────────────

export interface CreateBankCommand {
  name: string;
  logoKey: BankLogoKey;
  color: string;
  country: string;
  bic?: string | null;
  statementFormat: StatementFormat;
}

export interface CreateBankPort {
  execute(command: CreateBankCommand): Promise<BankDto>;
}

// ─── List Banks ───────────────────────────────────────────────────────────────

export interface ListBanksPort {
  execute(): Promise<BankSummaryDto[]>;
}

// ─── Get Bank ─────────────────────────────────────────────────────────────────

export interface GetBankPort {
  execute(id: string): Promise<BankDetailDto | null>;
}

// ─── Update Bank ──────────────────────────────────────────────────────────────

export interface UpdateBankCommand {
  id: string;
  name?: string;
  logoKey?: BankLogoKey;
  color?: string;
  country?: string;
  bic?: string | null;
  statementFormat?: StatementFormat;
}

export interface UpdateBankPort {
  execute(command: UpdateBankCommand): Promise<BankDto>;
}

// ─── Delete Bank ──────────────────────────────────────────────────────────────

export interface DeleteBankPort {
  execute(id: string): Promise<void>;
}

// ─── Create Bank Account ──────────────────────────────────────────────────────

export interface CreateBankAccountCommand {
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
}

export interface CreateBankAccountPort {
  execute(command: CreateBankAccountCommand): Promise<BankAccountDto>;
}

// ─── List Bank Accounts ───────────────────────────────────────────────────────

export interface ListBankAccountsPort {
  execute(bankId: string): Promise<BankAccountDto[]>;
}

// ─── Get Bank Account ─────────────────────────────────────────────────────────

export interface GetBankAccountPort {
  execute(id: string): Promise<BankAccountDto | null>;
}

// ─── Update Bank Account ──────────────────────────────────────────────────────

export interface UpdateBankAccountCommand {
  id: string;
  nickname?: string | null;
  iban?: string | null;
  accountNumber?: string | null;
  accountType?: CheckingAccountType | null;
  lastFourDigits?: string | null;
  cardName?: string | null;
  creditLimitCents?: number | null;
  billingCycleDay?: number | null;
  isActive?: boolean;
}

export interface UpdateBankAccountPort {
  execute(command: UpdateBankAccountCommand): Promise<BankAccountDto>;
}

// ─── Delete Bank Account ──────────────────────────────────────────────────────

export interface DeleteBankAccountPort {
  execute(id: string): Promise<void>;
}
