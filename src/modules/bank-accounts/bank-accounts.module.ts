import type { Router } from "express";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";

// Adapters out
import { SupabaseBankRepository } from "./adapters/out/supabase-bank.repository.js";
import { SupabaseBankAccountRepository } from "./adapters/out/supabase-bank-account.repository.js";
import type { BankAccountRepositoryPort } from "./domain/ports/out/bank-account-repository.port.js";

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

/**
 * Composition root for the bank-accounts module (spec B2 ticket 02 — the
 * pilot for the scoped-access pattern; see the module README's Ports
 * section for the house style this establishes).
 *
 * Only this file knows the concrete adapters. Following D2, adapters don't
 * construct their own `ScopedQuery`: they receive the `createScopedQuery`
 * factory injected here, and build a scoped helper per call.
 *
 * Exposes:
 *  - router     : Express router mounted at /api
 *  - accountRepo: cross-module read access for bank-statements' auto-linking
 *                 on import (`BankAccountReadPort`) — the scoped
 *                 `SupabaseBankAccountRepository` satisfies that narrower
 *                 port structurally (both take `organizationId` first, per
 *                 D2), so it's exposed directly. Ticket 09 deleted the
 *                 temporary `BankAccountCrossModuleReadAdapter` bridge this
 *                 used to go through, now that bank-statements has its own
 *                 request-scoped organization to pass across the module
 *                 boundary.
 */
export function createBankAccountsModule(): {
  router: Router;
  accountRepo: BankAccountRepositoryPort;
} {
  // Adapters out
  const bankRepo = new SupabaseBankRepository(createScopedQuery);
  const accountRepo = new SupabaseBankAccountRepository(createScopedQuery);

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
