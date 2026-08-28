import { Router } from "express";
import { BANK_LOGO_KEYS, STATEMENT_FORMATS } from "../../domain/entities/bank.js";
import {
  BankNotFoundError,
  BankAccountNotFoundError,
  BankHasAccountsError,
  BankAccountHasStatementsError,
} from "../../domain/errors.js";
import type { CreateBankPort } from "../../domain/ports/in/bank-accounts.ports.js";
import type { ListBanksPort } from "../../domain/ports/in/bank-accounts.ports.js";
import type { GetBankPort } from "../../domain/ports/in/bank-accounts.ports.js";
import type { UpdateBankPort } from "../../domain/ports/in/bank-accounts.ports.js";
import type { DeleteBankPort } from "../../domain/ports/in/bank-accounts.ports.js";
import type { CreateBankAccountPort } from "../../domain/ports/in/bank-accounts.ports.js";
import type { GetBankAccountPort } from "../../domain/ports/in/bank-accounts.ports.js";
import type { UpdateBankAccountPort } from "../../domain/ports/in/bank-accounts.ports.js";
import type { DeleteBankAccountPort } from "../../domain/ports/in/bank-accounts.ports.js";

export class BankAccountsController {
  readonly router: Router;

  constructor(
    private readonly createBank: CreateBankPort,
    private readonly listBanks: ListBanksPort,
    private readonly getBank: GetBankPort,
    private readonly updateBank: UpdateBankPort,
    private readonly deleteBank: DeleteBankPort,
    private readonly createBankAccount: CreateBankAccountPort,
    private readonly getBankAccount: GetBankAccountPort,
    private readonly updateBankAccount: UpdateBankAccountPort,
    private readonly deleteBankAccount: DeleteBankAccountPort
  ) {
    this.router = Router();
    this.registerRoutes();
  }

  private registerRoutes(): void {
    /**
     * GET /bank-accounts/logos
     * Returns the predefined list of bank logo keys.
     */
    this.router.get("/bank-accounts/logos", (_req, res) => {
      res.json(BANK_LOGO_KEYS);
    });

    /**
     * GET /bank-accounts/formats
     * Returns the supported statement format identifiers.
     */
    this.router.get("/bank-accounts/formats", (_req, res) => {
      res.json(STATEMENT_FORMATS);
    });

    /**
     * GET /bank-accounts/banks
     * Returns all banks with account counts, scoped to the caller's
     * organization. Mounted below the global `requireAuth` in server.ts,
     * so `req.auth` is always set.
     */
    this.router.get("/bank-accounts/banks", async (req, res) => {
      try {
        const banks = await this.listBanks.execute({ organizationId: req.auth!.orgId });
        res.json(banks);
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /**
     * POST /bank-accounts/banks
     * Body: { name, logoKey, color, country, bic?, statementFormat }
     */
    this.router.post("/bank-accounts/banks", async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        if (!body["name"] || !body["logoKey"] || !body["color"] || !body["country"] || !body["statementFormat"]) {
          res.status(400).json({ error: "name, logoKey, color, country and statementFormat are required" });
          return;
        }
        const bank = await this.createBank.execute({
          organizationId: req.auth!.orgId,
          name: body["name"] as string,
          logoKey: body["logoKey"] as import("../../domain/entities/bank.js").BankLogoKey,
          color: body["color"] as string,
          country: body["country"] as string,
          bic: (body["bic"] as string | undefined) ?? null,
          statementFormat: body["statementFormat"] as import("../../domain/entities/bank.js").StatementFormat,
        });
        res.status(201).json(bank);
      } catch (e) {
        res.status(400).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /**
     * GET /bank-accounts/banks/:bankId
     * Returns bank detail with all its accounts.
     */
    this.router.get("/bank-accounts/banks/:bankId", async (req, res) => {
      try {
        const detail = await this.getBank.execute({
          organizationId: req.auth!.orgId,
          id: req.params["bankId"]!,
        });
        if (!detail) {
          res.status(404).json({ error: "Bank not found" });
          return;
        }
        res.json(detail);
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /**
     * PATCH /bank-accounts/banks/:bankId
     * Body: any subset of { name, logoKey, color, country, bic, statementFormat }
     */
    this.router.patch("/bank-accounts/banks/:bankId", async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        // Trusted fields spread last so a body containing `organizationId`
        // or `id` can never override the caller's own values.
        const bank = await this.updateBank.execute({
          ...body as object,
          organizationId: req.auth!.orgId,
          id: req.params["bankId"]!,
        });
        res.json(bank);
      } catch (e) {
        if (e instanceof BankNotFoundError) {
          res.status(404).json({ error: e.message });
          return;
        }
        res.status(400).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /**
     * DELETE /bank-accounts/banks/:bankId
     * Fails if the bank has any accounts.
     */
    this.router.delete("/bank-accounts/banks/:bankId", async (req, res) => {
      try {
        await this.deleteBank.execute({ organizationId: req.auth!.orgId, id: req.params["bankId"]! });
        res.status(204).send();
      } catch (e) {
        if (e instanceof BankNotFoundError) {
          res.status(404).json({ error: e.message });
          return;
        }
        if (e instanceof BankHasAccountsError) {
          res.status(409).json({ error: e.message });
          return;
        }
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /**
     * POST /bank-accounts/banks/:bankId/accounts
     * Body: { type, nickname?, iban?, accountNumber?, accountType?, lastFourDigits?,
     *         cardName?, creditLimitCents?, billingCycleDay? }
     */
    this.router.post("/bank-accounts/banks/:bankId/accounts", async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        if (!body["type"]) {
          res.status(400).json({ error: "type is required (account | credit_card)" });
          return;
        }
        const account = await this.createBankAccount.execute({
          organizationId: req.auth!.orgId,
          bankId: req.params["bankId"]!,
          type: body["type"] as import("../../domain/entities/bank-account.js").BankAccountType,
          nickname: (body["nickname"] as string | undefined) ?? null,
          iban: (body["iban"] as string | undefined) ?? null,
          accountNumber: (body["accountNumber"] as string | undefined) ?? null,
          accountType: (body["accountType"] as import("../../domain/entities/bank-account.js").CheckingAccountType | undefined) ?? null,
          lastFourDigits: (body["lastFourDigits"] as string | undefined) ?? null,
          cardName: (body["cardName"] as string | undefined) ?? null,
          creditLimitCents: body["creditLimitCents"] != null ? Number(body["creditLimitCents"]) : null,
          billingCycleDay: body["billingCycleDay"] != null ? Number(body["billingCycleDay"]) : null,
        });
        res.status(201).json(account);
      } catch (e) {
        if (e instanceof BankNotFoundError) {
          res.status(404).json({ error: e.message });
          return;
        }
        res.status(400).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /**
     * GET /bank-accounts/:accountId
     * Returns a single bank account.
     */
    this.router.get("/bank-accounts/:accountId", async (req, res) => {
      try {
        const account = await this.getBankAccount.execute({
          organizationId: req.auth!.orgId,
          id: req.params["accountId"]!,
        });
        if (!account) {
          res.status(404).json({ error: "Bank account not found" });
          return;
        }
        res.json(account);
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /**
     * PATCH /bank-accounts/:accountId
     * Body: any subset of account fields.
     */
    this.router.patch("/bank-accounts/:accountId", async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        // Trusted fields spread last so a body containing `organizationId`
        // or `id` can never override the caller's own values.
        const account = await this.updateBankAccount.execute({
          ...body as object,
          ...(body["creditLimitCents"] != null ? { creditLimitCents: Number(body["creditLimitCents"]) } : {}),
          ...(body["billingCycleDay"] != null ? { billingCycleDay: Number(body["billingCycleDay"]) } : {}),
          organizationId: req.auth!.orgId,
          id: req.params["accountId"]!,
        });
        res.json(account);
      } catch (e) {
        if (e instanceof BankAccountNotFoundError) {
          res.status(404).json({ error: e.message });
          return;
        }
        res.status(400).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });

    /**
     * DELETE /bank-accounts/:accountId
     * Fails if the account has imported statements.
     */
    this.router.delete("/bank-accounts/:accountId", async (req, res) => {
      try {
        await this.deleteBankAccount.execute({
          organizationId: req.auth!.orgId,
          id: req.params["accountId"]!,
        });
        res.status(204).send();
      } catch (e) {
        if (e instanceof BankAccountNotFoundError) {
          res.status(404).json({ error: e.message });
          return;
        }
        if (e instanceof BankAccountHasStatementsError) {
          res.status(409).json({ error: e.message });
          return;
        }
        res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
      }
    });
  }
}
