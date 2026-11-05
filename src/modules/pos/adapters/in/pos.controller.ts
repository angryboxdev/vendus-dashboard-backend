import { Router, type Request } from "express";
import { idempotency, type IdempotencyStore } from "../../../../infra/http/idempotency.js";
import { problem } from "../../../../infra/http/problem-details.js";
import type { Discount, PaymentMethod } from "../../domain/entities/pos.js";
import { PosNotFoundError, PosPinError, PosRuleError } from "../../domain/errors.js";
import type { PosPort } from "../../domain/ports/in/pos.port.js";

async function run<T>(fn: () => Promise<T> | T): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof PosRuleError) throw problem(422, "pos_rule", e.message);
    if (e instanceof PosNotFoundError) throw problem(404, "not_found", e.message);
    if (e instanceof PosPinError) throw problem(403, "pos_pin", e.message);
    throw e;
  }
}

const org = (req: Request) => req.auth!.orgId;
const body = (req: Request) => (req.body ?? {}) as Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CSV = 2_000_000;

function bad(detail: string): never {
  throw problem(400, "invalid_request", detail);
}
function uuid(v: unknown, field: string): string {
  if (typeof v !== "string" || !UUID.test(v)) bad(`${field}: identificador inválido`);
  return v;
}
const id = (req: Request) => uuid(req.params.id, "id");
const pin = (b: Record<string, unknown>) => (typeof b.pin === "string" ? b.pin : bad("pin obrigatório"));
function csv(b: Record<string, unknown>): string {
  if (typeof b.csv !== "string" || b.csv.length === 0) bad("csv obrigatório (texto do ficheiro)");
  if (b.csv.length > MAX_CSV) bad("Ficheiro demasiado grande (máx. 2 MB)");
  return b.csv;
}
function discount(v: unknown): Discount | undefined {
  if (v === undefined || v === null) return undefined;
  const d = v as Record<string, unknown>;
  if ((d.kind !== "pct" && d.kind !== "eur") || typeof d.value !== "number") bad("desconto: {kind: pct|eur, value}");
  return { kind: d.kind, value: d.value };
}

/**
 * POS do Mezza (fase 1): `/api/pos/*`, com a permissão `sales.invoicing`
 * (GET = READ, resto = MANAGE). O funcionário identifica-se com o PIN do
 * quiosque em cada venda; vendas e devoluções exigem `Idempotency-Key` —
 * um duplo toque nunca emite duas faturas.
 */
export function createPosRouter(pos: PosPort, store: IdempotencyStore): Router {
  const r = Router();
  const B = "/pos";
  r.use(`${B}/sales`, idempotency(store, { required: true }));

  r.get(`${B}/products`, async (req, res) => res.json(await run(() => pos.listProducts(org(req), { activeOnly: req.query.active === "1" }))));
  r.post(`${B}/products/import/preview`, async (req, res) => res.json(await run(() => pos.previewImport(csv(body(req))))));
  r.post(`${B}/products/import`, async (req, res) => res.json(await run(() => pos.importProducts(org(req), csv(body(req))))));
  r.put(`${B}/products/:id`, async (req, res) => {
    const b = body(req);
    const patch = {
      ...(typeof b.name === "string" ? { name: b.name } : {}),
      ...(typeof b.category === "string" || b.category === null ? { category: b.category as string | null } : {}),
      ...(typeof b.priceCents === "number" ? { priceCents: b.priceCents } : {}),
      ...(typeof b.vatRate === "number" ? { vatRate: b.vatRate } : {}),
      ...(typeof b.active === "boolean" ? { active: b.active } : {}),
    };
    res.json(await run(() => pos.updateProduct(org(req), id(req), patch)));
  });

  r.get(`${B}/settings`, async (req, res) => res.json(await run(() => pos.getSettings(org(req)))));
  r.put(`${B}/settings`, async (req, res) => {
    const b = body(req);
    const optional = (v: unknown, f: string) => (v === null || v === undefined || v === "" ? null : uuid(v, f));
    if (!Array.isArray(b.managerEmployeeIds)) bad("managerEmployeeIds tem de ser uma lista");
    const settings = {
      invoiceSeriesRef: optional(b.invoiceSeriesRef, "invoiceSeriesRef"),
      creditSeriesRef: optional(b.creditSeriesRef, "creditSeriesRef"),
      managerEmployeeIds: (b.managerEmployeeIds as unknown[]).map((x) => uuid(x, "managerEmployeeIds[]")),
    };
    res.json(await run(() => pos.saveSettings(org(req), settings)));
  });
  r.get(`${B}/employees`, async (req, res) => res.json(await run(() => pos.listEmployees(org(req)))));

  r.post(`${B}/pin`, async (req, res) => res.json(await run(() => pos.login(org(req), pin(body(req))))));

  r.post(`${B}/sales`, async (req, res) => {
    const b = body(req);
    if (!Array.isArray(b.lines)) bad("lines tem de ser uma lista");
    const lines = (b.lines as unknown[]).map((l, i) => {
      const line = (l ?? {}) as Record<string, unknown>;
      if (typeof line.quantity !== "number") bad(`Linha ${i + 1}: quantity obrigatório`);
      return { productId: uuid(line.productId, `lines[${i}].productId`), quantity: line.quantity, ...(line.discount ? { discount: discount(line.discount)! } : {}) };
    });
    const payment = (b.payment ?? {}) as Record<string, unknown>;
    const customer = b.customer && typeof b.customer === "object" ? (b.customer as { taxId?: unknown; name?: unknown }) : null;
    const input = {
      pin: pin(b),
      lines,
      ...(b.saleDiscount ? { saleDiscount: discount(b.saleDiscount)! } : {}),
      payment: { method: payment.method as PaymentMethod, ...(typeof payment.givenCents === "number" ? { givenCents: payment.givenCents } : {}) },
      customer: customer && typeof customer.taxId === "string" ? { taxId: customer.taxId, name: typeof customer.name === "string" ? customer.name : "" } : null,
    };
    res.status(201).json(await run(() => pos.checkout(org(req), input)));
  });
  r.post(`${B}/sales/:id/refund`, async (req, res) => {
    const b = body(req);
    if (!Array.isArray(b.lines)) bad("lines tem de ser uma lista");
    const lines = (b.lines as unknown[]).map((l) => {
      const line = (l ?? {}) as Record<string, unknown>;
      if (typeof line.lineNumber !== "number" || typeof line.quantity !== "number") bad("lines[]: lineNumber e quantity");
      return { lineNumber: line.lineNumber, quantity: line.quantity };
    });
    res.status(201).json(await run(() => pos.refund(org(req), id(req), { pin: pin(b), lines, reason: typeof b.reason === "string" ? b.reason : "" })));
  });

  r.get(`${B}/documents`, async (req, res) => res.json(await run(() => pos.documents(org(req), typeof req.query.date === "string" ? req.query.date : undefined))));
  r.get(`${B}/summary`, async (req, res) => res.json(await run(() => pos.summary(org(req), typeof req.query.date === "string" ? req.query.date : undefined))));

  return r;
}
