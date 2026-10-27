import { Router, type Response } from "express";
import type {
  GetEmailIntakePort,
  RotateInboundAddressPort,
  SetEmailIntakeDestinationPort,
} from "../../domain/ports/in/email-intake.ports.js";
import { EmailIntakeNotAllowedError, EmailIntakeNotConfiguredError } from "../../domain/errors.js";

function handleError(res: Response, e: unknown) {
  if (e instanceof EmailIntakeNotConfiguredError || e instanceof EmailIntakeNotAllowedError) {
    res.status(409).json({ error: e.message });
    return;
  }
  res.status(500).json({ error: e instanceof Error ? e.message : "Erro interno." });
}

/**
 * «Faturas por email» — o mesmo ecrã em dois sítios, cada um com a permissão da sua área:
 * `/invoices/email-intake` (Faturas, `finance.invoices`) e `/stock-purchase-reviews/email-intake`
 * (Compras por rever, `stock.purchase_reviews`). GET = ler; POST/PATCH = gerir. Nunca mostra a chave,
 * o segredo nem o webhook (são do servidor).
 */
export function createEmailIntakeRouter(ports: {
  getEmailIntake: GetEmailIntakePort;
  rotateAddress: RotateInboundAddressPort;
  setDestination: SetEmailIntakeDestinationPort;
}): Router {
  const router = Router();
  for (const base of ["/invoices/email-intake", "/stock-purchase-reviews/email-intake"]) {
    router.get(base, async (req, res) => {
      try {
        res.json(await ports.getEmailIntake.execute({ organizationId: req.auth!.orgId }));
      } catch (e) {
        handleError(res, e);
      }
    });

    router.post(`${base}/address`, async (req, res) => {
      try {
        const reason = (req.body as { reason?: unknown } | undefined)?.reason;
        const created = await ports.rotateAddress.execute({
          organizationId: req.auth!.orgId,
          actor: req.auth!.email || req.auth!.sub,
          reason: typeof reason === "string" ? reason : null,
        });
        res.status(201).json(created);
      } catch (e) {
        handleError(res, e);
      }
    });

    router.patch(`${base}/settings`, async (req, res) => {
      const destination = (req.body as { destination?: unknown } | undefined)?.destination;
      if (destination !== "finance" && destination !== "stock") {
        res.status(400).json({ error: "destination must be finance or stock" });
        return;
      }
      try {
        await ports.setDestination.execute({ organizationId: req.auth!.orgId, destination, actor: req.auth!.email || req.auth!.sub });
        res.status(204).send();
      } catch (e) {
        handleError(res, e);
      }
    });
  }
  return router;
}
