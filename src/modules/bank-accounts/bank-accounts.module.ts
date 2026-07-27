import type { Router } from "express";
import { getSupabaseServiceRole } from "../../infra/supabaseClient.js";

// Adapters out
import { SupabaseBankRepository } from "./adapters/out/supabase-bank.repository.js";
import { SupabaseBankAccountRepository } from "./adapters/out/supabase-bank-account.repository.js";

// Use cases
import { CreateBankUseCase } from "./application/use-cases/create-bank.use-case.js";
import { ListBanksUseCase } from "./application/use-cases/list-banks.use-case.js";
import { GetBankUseCase } from "./application/use-cases/get-bank.use-case.js";
import { UpdateBankUseCase } from "./application/use-cases/update-bank.use-case.js";
import { DeleteBankUseCase } from "./application/use-cases/delete-bank.use-case.js";
import { CreateBankAccountUseCase } from "./application/use-cases/create-bank-account.use-case.js";
import { GetBankAccountUseCase } from "./application/use-cases/get-bank-account.use-case.js";
import { UpdateBankAccountUseCase } from "./application/use-cases/update-bank-account.use-case.js";
import { DeleteBankAccountUseCase } from "./application/use-cases/delete-bank-account.use-case.js";

// Adapter in
import { BankAccountsController } from "./adapters/in/bank-accounts.controller.js";

// Cross-module: exposes account lookup for bank-statements import auto-linking
import type { BankAccountRepositoryPort } from "./domain/ports/out/bank-account-repository.port.js";

/**
 * Composition root for the bank-accounts module.
 *
 * Exposes:
 *  - router  : Express router mounted at /api
 *  - accountRepo : raw repo reference shared with bank-statements for cross-module lookup
 */
export function createBankAccountsModule(): {
  router: Router;
  accountRepo: BankAccountRepositoryPort;
} {
  const supabase = getSupabaseServiceRole();
  if (!supabase) throw new Error("Supabase service role client is not configured");

  // Adapters out
  const bankRepo = new SupabaseBankRepository(supabase);
  const accountRepo = new SupabaseBankAccountRepository(supabase);

  // Use cases
  const createBank = new CreateBankUseCase(bankRepo);
  const listBanks = new ListBanksUseCase(bankRepo, accountRepo);
  const getBank = new GetBankUseCase(bankRepo, accountRepo);
  const updateBank = new UpdateBankUseCase(bankRepo);
  const deleteBank = new DeleteBankUseCase(bankRepo, accountRepo);
  const createBankAccount = new CreateBankAccountUseCase(bankRepo, accountRepo);
  const getBankAccount = new GetBankAccountUseCase(accountRepo);
  const updateBankAccount = new UpdateBankAccountUseCase(accountRepo);
  const deleteBankAccount = new DeleteBankAccountUseCase(accountRepo);

  // Adapter in
  const controller = new BankAccountsController(
    createBank,
    listBanks,
    getBank,
    updateBank,
    deleteBank,
    createBankAccount,
    getBankAccount,
    updateBankAccount,
    deleteBankAccount
  );

  return { router: controller.router, accountRepo };
}
