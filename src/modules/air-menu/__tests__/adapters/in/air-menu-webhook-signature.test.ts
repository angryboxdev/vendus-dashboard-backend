import type { AddressInfo } from "node:net";
import type { Express } from "express";
import type { Server } from "node:http";
import { createHmac } from "node:crypto";
// Plain `require` sidesteps the esModuleInterop mismatch (tsconfig.test.json
// deliberately doesn't set it) — mirrors public-router-scope.test.ts.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const express = require("express") as typeof import("express");
import { AirMenuController } from "../../../adapters/in/air-menu.controller.js";
import type { GetEnterprisesPort } from "../../../domain/ports/in/get-enterprises.port.js";
import type { GetSummaryPort } from "../../../domain/ports/in/get-summary.port.js";
import type { GetOrderRawPort } from "../../../domain/ports/in/get-order-raw.port.js";
import type { RegisterWebhookPort } from "../../../domain/ports/in/register-webhook.port.js";
import type { OrderEventBusPort } from "../../../domain/ports/out/order-event-bus.port.js";

function unusedPort<T>(): T {
  return {
    execute: () => {
      throw new Error("not exercised by this test");
    },
  } as unknown as T;
}

function sign(secret: string, body: unknown): string {
  return createHmac("sha256", secret).update(JSON.stringify(body)).digest("hex");
}

async function startApp(webhookSecret: string | null): Promise<{
  app: Express;
  server: Server;
  baseUrl: string;
  publishedEvents: unknown[];
}> {
  const publishedEvents: unknown[] = [];
  const eventBus: OrderEventBusPort = {
    publish: (event) => publishedEvents.push(event),
    subscribe: () => () => {},
  };

  const controller = new AirMenuController(
    unusedPort<GetEnterprisesPort>(),
    unusedPort<GetSummaryPort>(),
    unusedPort<GetOrderRawPort>(),
    unusedPort<RegisterWebhookPort>(),
    eventBus,
    webhookSecret,
  );

  const app = express();
  app.use(express.json());
  app.use("/api", controller.publicRouter);

  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;

  return { app, server, baseUrl: `http://127.0.0.1:${port}`, publishedEvents };
}

describe("AirMenuController — POST /air-menu/webhook/receive signature", () => {
  const payload = { enterpriseId: "ent-1", event: "CREATED", resource: "order" };

  describe("webhookSecret configured", () => {
    const secret = "test-secret";
    let server: Server;
    let baseUrl: string;
    let publishedEvents: unknown[];

    beforeEach(async () => {
      ({ server, baseUrl, publishedEvents } = await startApp(secret));
    });

    afterEach(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it("rejects with 401 when the signature header is missing", async () => {
      const res = await fetch(`${baseUrl}/api/air-menu/webhook/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({ error: "Invalid webhook signature" });
      expect(publishedEvents).toHaveLength(0);
    });

    it("rejects with 401 when the signature is present but mismatched", async () => {
      const res = await fetch(`${baseUrl}/api/air-menu/webhook/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-airmenu-signature": "not-the-right-signature" },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({ error: "Invalid webhook signature" });
      expect(publishedEvents).toHaveLength(0);
    });

    it("processes normally when the signature matches", async () => {
      const res = await fetch(`${baseUrl}/api/air-menu/webhook/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-airmenu-signature": sign(secret, payload) },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ ok: true });
      expect(publishedEvents).toHaveLength(1);
    });
  });

  describe("webhookSecret not configured", () => {
    let server: Server;
    let baseUrl: string;
    let publishedEvents: unknown[];

    beforeEach(async () => {
      ({ server, baseUrl, publishedEvents } = await startApp(null));
    });

    afterEach(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it("processes normally with no signature header", async () => {
      const res = await fetch(`${baseUrl}/api/air-menu/webhook/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ ok: true });
      expect(publishedEvents).toHaveLength(1);
    });
  });
});
