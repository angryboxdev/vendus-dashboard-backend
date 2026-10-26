import type { OrganizationId } from "../../../../../kernel/organization-id.js";
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
  organizationId: OrganizationId;
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

export interface ListBanksQuery {
  organizationId: OrganizationId;
}

export interface ListBanksPort {
  execute(query: ListBanksQuery): Promise<BankSummaryDto[]>;
}

// ─── Get Bank ─────────────────────────────────────────────────────────────────

export interface GetBankQuery {
  organizationId: OrganizationId;
  id: string;
}

export interface GetBankPort {
  execute(query: GetBankQuery): Promise<BankDetailDto | null>;
}

// ─── Update Bank ──────────────────────────────────────────────────────────────

export interface UpdateBankCommand {
  organizationId: OrganizationId;
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

export interface DeleteBankCommand {
  organizationId: OrganizationId;
  id: string;
}

export interface DeleteBankPort {
  execute(command: DeleteBankCommand): Promise<void>;
}

// ─── Create Bank Account ──────────────────────────────────────────────────────

export interface CreateBankAccountCommand {
  organizationId: OrganizationId;
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

export interface ListBankAccountsQuery {
  organizationId: OrganizationId;
  bankId: string;
}

export interface ListBankAccountsPort {
  execute(query: ListBankAccountsQuery): Promise<BankAccountDto[]>;
}

// ─── Get Bank Account ─────────────────────────────────────────────────────────

export interface GetBankAccountQuery {
  organizationId: OrganizationId;
  id: string;
}

export interface GetBankAccountPort {
  execute(query: GetBankAccountQuery): Promise<BankAccountDto | null>;
}

// ─── Update Bank Account ──────────────────────────────────────────────────────

export interface UpdateBankAccountCommand {
  organizationId: OrganizationId;
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

export interface DeleteBankAccountCommand {
  organizationId: OrganizationId;
  id: string;
}

export interface DeleteBankAccountPort {
  execute(command: DeleteBankAccountCommand): Promise<void>;
}

// ─── Resolve statement account (Conciliação bancária V2, F3) ──────────────────

/**
 * Banco e conta de um extrato importado: reutiliza os existentes (pelo IBAN / nº de conta, sem
 * duplicados) ou, com `create`, cria-os a partir dos dados do próprio extrato.
 */
export interface ResolveStatementAccountCommand {
  organizationId: OrganizationId;
  bankName: string;
  logoKey: BankLogoKey;
  statementFormat: StatementFormat;
  color: string;
  country: string;
  bic: string | null;
  iban: string | null;
  accountNumber: string | null;
  accountLabel: string | null;
  /** false = só ver o que aconteceria (pré-visualização). */
  create: boolean;
}

export interface ResolveStatementAccountResult {
  /** existing = conta já registada; created = criada agora; to_create = seria criada (create=false). */
  status: "existing" | "created" | "to_create";
  bankId: string | null;
  bankName: string;
  /** O banco também é novo (criado agora, ou a criar). */
  bankIsNew: boolean;
  accountId: string | null;
  accountName: string;
}

export interface ResolveStatementAccountPort {
  /** `null` quando o extrato não traz IBAN nem nº de conta (não há como identificar a conta). */
  execute(command: ResolveStatementAccountCommand): Promise<ResolveStatementAccountResult | null>;
}
