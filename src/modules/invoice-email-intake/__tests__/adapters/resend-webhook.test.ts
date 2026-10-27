import { describe, it, expect } from "@jest/globals";
import { createHmac } from "node:crypto";
import type { Request, Response } from "express";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { verifySvixSignature } from "../../adapters/in/svix-signature.js";
import { createResendWebhookHandler } from "../../adapters/in/resend-webhook.controller.js";
import type { ReceiveInboundEmailCommand } from "../../domain/ports/in/email-intake.ports.js";

// Segredo e dados fictícios (gerados só para o teste).
const KEY = Buffer.from("segredo-ficticio-de-teste-1234567890");
const SECRET = `whsec_${KEY.toString("base64")}`;
const NOW = 1_800_000_000;

function sign(id: string, ts: number, body: string, key = KEY) {
  return `v1,${createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64")}`;
}

const body = JSON.stringify({
  type: "email.received",
  created_at: "2026-10-27T10:00:00.000Z",
  data: {
    email_id: "email-1",
    created_at: "2026-10-27T10:00:00.000Z",
    from: "faturacao@fornecedor.example.invalid",
    to: ["outro@teste.example.invalid"],
    cc: [],
    received_for: ["abcdefghjkmnpqrs@teste.example.invalid"],
    attachments: [{ id: "a1", filename: "FT 1.pdf", content_type: "application/pdf", content_disposition: "attachment" }],
  },
});

describe("Assinatura do webhook (Svix)", () => {
  it("aceita a assinatura certa (entre várias) sobre o corpo original", () => {
    const sig = `v1,b3V0cmE= ${sign("msg_1", NOW, body)}`;
    expect(verifySvixSignature(SECRET, { id: "msg_1", timestamp: String(NOW), signature: sig }, Buffer.from(body), NOW)).toBe(true);
  });

  it("9. recusa assinatura inválida, corpo alterado, outro segredo, cabeçalhos em falta e hora fora da janela", () => {
    const ok = sign("msg_1", NOW, body);
    expect(verifySvixSignature(SECRET, { id: "msg_1", timestamp: String(NOW), signature: "v1,AAAA" }, Buffer.from(body), NOW)).toBe(false);
    expect(verifySvixSignature(SECRET, { id: "msg_1", timestamp: String(NOW), signature: ok }, Buffer.from(body + " "), NOW)).toBe(false);
    expect(verifySvixSignature(`whsec_${Buffer.from("outro").toString("base64")}`, { id: "msg_1", timestamp: String(NOW), signature: ok }, Buffer.from(body), NOW)).toBe(false);
    expect(verifySvixSignature(SECRET, { id: undefined, timestamp: String(NOW), signature: ok }, Buffer.from(body), NOW)).toBe(false);
    expect(verifySvixSignature(SECRET, { id: "msg_1", timestamp: String(NOW), signature: ok }, Buffer.from(body), NOW + 301)).toBe(false);
  });
});

function fakeRes() {
  const r = { statusCode: 0, body: undefined as unknown };
  const res = {
    status(code: number) {
      r.statusCode = code;
      return res;
    },
    json(b: unknown) {
      r.body = b;
      return res;
    },
  };
  return { res: res as unknown as Response, r };
}

describe("Webhook POST /api/webhooks/resend", () => {
  const nowTs = () => Math.floor(Date.now() / 1000);
  const build = (secret: string | null) => {
    const received: ReceiveInboundEmailCommand[] = [];
    const processed: string[] = [];
    const handler = createResendWebhookHandler({
      secret,
      receive: {
        execute: async (c) => {
          received.push(c);
          return { status: "accepted", organizationId: mintOrganizationId("org-a"), acceptedAttachments: 1 };
        },
      },
      process: {
        execute: async ({ organizationId }) => {
          processed.push(organizationId);
          return { processed: 1, imported: 1, duplicates: 0, rejected: 0, failed: 0 };
        },
      },
      defer: (job) => void job(),
    });
    return { handler, received, processed };
  };
  const req = (raw: string, headers: Record<string, string>) => ({ body: Buffer.from(raw), headers }) as unknown as Request;

  it("assinatura certa → 200, usa received_for como destinatário e processa a seguir", async () => {
    const { handler, received, processed } = build(SECRET);
    const ts = nowTs();
    const { res, r } = fakeRes();
    await handler(req(body, { "svix-id": "msg_1", "svix-timestamp": String(ts), "svix-signature": sign("msg_1", ts, body) }), res);
    expect(r.statusCode).toBe(200);
    expect(received[0]).toMatchObject({ webhookId: "msg_1", emailId: "email-1", recipients: ["abcdefghjkmnpqrs@teste.example.invalid"] });
    expect(received[0]!.attachments[0]).toMatchObject({ id: "a1", contentType: "application/pdf" });
    expect(processed).toEqual(["org-a"]);
  });

  it("9. assinatura inválida → 401 e nada é registado", async () => {
    const { handler, received } = build(SECRET);
    const { res, r } = fakeRes();
    await handler(req(body, { "svix-id": "msg_1", "svix-timestamp": String(nowTs()), "svix-signature": "v1,AAAA" }), res);
    expect(r.statusCode).toBe(401);
    expect(received).toHaveLength(0);
  });

  it("sem segredo configurado (funcionalidade desligada) → 503", async () => {
    const { handler } = build(null);
    const { res, r } = fakeRes();
    await handler(req(body, {}), res);
    expect(r.statusCode).toBe(503);
  });

  it("assinatura certa mas corpo sem o formato esperado → 400", async () => {
    const { handler } = build(SECRET);
    const bad = JSON.stringify({ type: "email.received", data: { to: [] } });
    const ts = nowTs();
    const { res, r } = fakeRes();
    await handler(req(bad, { "svix-id": "msg_9", "svix-timestamp": String(ts), "svix-signature": sign("msg_9", ts, bad) }), res);
    expect(r.statusCode).toBe(400);
  });
});
