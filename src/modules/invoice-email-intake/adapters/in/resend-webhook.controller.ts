import type { Request, Response } from "express";
import { z } from "zod";
import type { ProcessInboundAttachmentsPort, ReceiveInboundEmailPort } from "../../domain/ports/in/email-intake.ports.js";
import { verifySvixSignature } from "./svix-signature.js";

/** Corpo máximo do webhook (só metadados — os anexos vêm pela API); o `express.raw` do server.ts usa-o. */
export const RESEND_WEBHOOK_MAX_BODY = "512kb";

const attachmentSchema = z.object({
  id: z.string().min(1),
  filename: z.string().default("anexo"),
  content_type: z.string().nullish(),
  content_disposition: z.string().nullish(),
  size: z.number().nullish(),
});

const eventSchema = z.object({
  type: z.string().min(1),
  created_at: z.string().optional(),
  data: z
    .object({
      email_id: z.string().min(1),
      created_at: z.string().optional(),
      from: z.string().nullish(),
      to: z.array(z.string()).default([]),
      cc: z.array(z.string()).nullish(),
      received_for: z.array(z.string()).nullish(),
      attachments: z.array(attachmentSchema).default([]),
    })
    .passthrough(),
});

const header = (req: Request, name: string) => {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
};

/**
 * `POST /api/webhooks/resend` — público (antes da autenticação) e montado ANTES do `express.json` global com
 * `express.raw` (server.ts): a assinatura é verificada sobre o corpo original (`req.body` é um Buffer). Sem segredo configurado a funcionalidade está
 * desligada (503). Responde logo; o processamento dos PDFs corre a seguir, fora do pedido.
 */
export function createResendWebhookHandler(deps: {
  secret: string | null;
  receive: ReceiveInboundEmailPort;
  process: ProcessInboundAttachmentsPort;
  /** Para correr depois de responder (testes: síncrono). */
  defer?: (job: () => Promise<unknown>) => void;
}) {
  const defer = deps.defer ?? ((job) => void setImmediate(() => void job().catch((e) => console.error("[faturas-email] processamento falhou:", e instanceof Error ? e.message : e))));
  const handler = async (req: Request, res: Response) => {
    if (!deps.secret) {
      res.status(503).json({ error: "not_configured" });
      return;
    }
    const raw = Buffer.isBuffer(req.body) ? req.body : null;
    const webhookId = header(req, "svix-id");
    if (!raw || !verifySvixSignature(deps.secret, { id: webhookId, timestamp: header(req, "svix-timestamp"), signature: header(req, "svix-signature") }, raw)) {
      res.status(401).json({ error: "invalid_signature" });
      return;
    }
    let parsed: z.infer<typeof eventSchema>;
    try {
      parsed = eventSchema.parse(JSON.parse(raw.toString("utf8")));
    } catch {
      res.status(400).json({ error: "invalid_payload" });
      return;
    }
    const d = parsed.data;
    const receivedAt = new Date(d.created_at ?? parsed.created_at ?? Date.now());
    // Destinatário verificado: `received_for` (a quem a Resend entregou — inclui Bcc e reencaminhamentos);
    // sem ele, to + cc.
    const recipients = d.received_for?.length ? d.received_for : [...d.to, ...(d.cc ?? [])];
    try {
      const result = await deps.receive.execute({
        webhookId: webhookId!,
        type: parsed.type,
        emailId: d.email_id,
        receivedAt: Number.isNaN(receivedAt.getTime()) ? new Date() : receivedAt,
        from: d.from ?? null,
        recipients,
        attachments: d.attachments.map((a) => ({
          id: a.id,
          filename: a.filename,
          contentType: a.content_type ?? null,
          size: a.size ?? null,
          contentDisposition: a.content_disposition ?? null,
        })),
      });
      // Quarentena / ignorado / repetido também é 200: a Resend não deve voltar a enviar.
      res.status(200).json({ status: result.status });
      if (result.status === "accepted" && result.acceptedAttachments > 0) {
        const organizationId = result.organizationId;
        defer(() => deps.process.execute({ organizationId }));
      }
    } catch (e) {
      // Falha nossa (base de dados): 500 → a Resend repete e o evento é retomado (idempotente).
      console.error("[faturas-email] webhook falhou:", e instanceof Error ? e.message : e);
      res.status(500).json({ error: "internal_error" });
    }
  };
  return handler;
}
