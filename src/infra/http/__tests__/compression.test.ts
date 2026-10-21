import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const express = require("express") as typeof import("express");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const compression = require("compression") as typeof import("compression");

/** O mesmo filtro do servidor: JSON comprimido; fluxos (SSE) nunca. */
describe("Compressão das respostas", () => {
  let server: Server;
  let base: string;
  beforeAll(async () => {
    const app = express();
    app.use(compression({ filter: (req, res) => !String(res.getHeader("Content-Type") ?? "").includes("text/event-stream") && compression.filter(req, res) }));
    app.get("/json", (_req, res) => res.json({ people: Array.from({ length: 500 }, (_, i) => ({ id: i, name: `Colaborador ${i}` })) }));
    app.get("/sse", (_req, res) => {
      res.setHeader("Content-Type", "text/event-stream");
      res.flushHeaders();
      res.write(`data: ${"x".repeat(2000)}\n\n`);
      res.end();
    });
    server = await new Promise<Server>((r) => {
      const s = app.listen(0, () => r(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });

  test("JSON grande vai comprimido; SSE não", async () => {
    const json = await fetch(`${base}/json`, { headers: { "Accept-Encoding": "gzip" } });
    expect(json.headers.get("content-encoding")).toBe("gzip");
    expect((await json.json()).people).toHaveLength(500);
    const sse = await fetch(`${base}/sse`, { headers: { "Accept-Encoding": "gzip" } });
    expect(sse.headers.get("content-encoding")).toBeNull();
  });
});
