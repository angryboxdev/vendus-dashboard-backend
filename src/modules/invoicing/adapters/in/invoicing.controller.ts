import { Router, type Request } from "express";
import { idempotency, type IdempotencyStore } from "../../../../infra/http/idempotency.js";
import { problem } from "../../../../infra/http/problem-details.js";
import type { Dec } from "../../../../kernel/money/decimal.js";
import { formatAmount } from "../../domain/services/amount-format.js";
import type { InvoicingPort, IssueDocumentInput, IssueDocumentPort } from "../../domain/ports/in/invoicing.ports.js";
import type { CancelReasonCode } from "../../domain/entities/cancel-reasons.js";
import { DOCUMENT_TYPES, type FiscalDocumentType } from "../../domain/entities/series.js";
import {
  InvoicingNotFoundError,
  InvoicingRuleError,
  InvoicingUnavailableError,
  IssueNeedsConfirmationError,
  StaleSeriesError,
} from "../../domain/errors.js";
import type { DocumentStatus } from "../../domain/ports/out/invoicing-store.port.js";

/** Erros de domínio → Problem Details (RFC 9457). */
async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof InvoicingRuleError) throw problem(422, "fiscal_rule", e.message);
    if (e instanceof InvoicingNotFoundError) throw problem(404, "not_found", e.message);
    if (e instanceof IssueNeedsConfirmationError) throw problem(409, "confirmation_required", e.message, { warnings: e.warnings });
    if (e instanceof StaleSeriesError) throw problem(409, "series_busy", "A série está a ser usada noutro terminal — tente de novo.");
    if (e instanceof InvoicingUnavailableError) throw problem(503, "invoicing_unavailable", e.message);
    throw e;
  }
}

const org = (req: Request) => req.auth!.orgId;
const actor = (req: Request) => req.auth!.email || req.auth!.sub;
const body = (req: Request) => (req.body ?? {}) as Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = new Set(["N", "A", "F"]);
/** Ids de registos fiscais são UUID; outro formato é pedido inválido (400), não erro do servidor. */
function uuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID.test(value)) throw problem(400, "invalid_request", `${field}: identificador inválido`);
  return value;
}
const id = (req: Request) => uuid(req.params.id, "id");
const text = (v: unknown) => (typeof v === "string" ? v : undefined);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** O domínio usa `Dec` (bigint) nos totais; na API saem como texto exato com 2 casas ("28.00"). */
function documentJson<T extends { grossTotal: Dec }>(d: T): Omit<T, "grossTotal"> & { grossTotal: string } {
  return { ...d, grossTotal: formatAmount(d.grossTotal) };
}

function badRequest(detail: string): never {
  throw problem(400, "invalid_request", detail);
}

/** Corpo de `POST /invoicing/documents`: forma; as regras fiscais ficam no domínio. */
function issueInput(b: Record<string, unknown>, who: string): IssueDocumentInput {
  uuid(b.seriesRef, "seriesRef");
  if (b.customer !== undefined && b.customer !== null && typeof b.customer !== "object") badRequest("customer tem de ser um objeto");
  if (b.references !== undefined) {
    if (!Array.isArray(b.references)) badRequest("references tem de ser uma lista");
    for (const r of b.references as unknown[]) uuid((r as Record<string, unknown> | null)?.documentId, "references[].documentId");
  }
  if (b.orderReferences !== undefined) {
    if (!Array.isArray(b.orderReferences)) badRequest("orderReferences tem de ser uma lista");
    for (const r of b.orderReferences as unknown[]) uuid(r, "orderReferences[]");
  }
  if (!Array.isArray(b.lines) || b.lines.length === 0) badRequest("lines tem de ser uma lista com pelo menos uma linha");
  if (b.documentDate !== undefined && (typeof b.documentDate !== "string" || !DATE.test(b.documentDate))) badRequest("documentDate tem de ser AAAA-MM-DD");
  for (const [i, l] of (b.lines as unknown[]).entries()) {
    const line = l as Record<string, unknown> | null;
    if (!line || typeof line !== "object") badRequest(`Linha ${i + 1} inválida`);
    for (const k of ["productCode", "productType", "unit", "description", "quantity", "unitPrice"]) {
      if (typeof line[k] !== "string") badRequest(`Linha ${i + 1}: ${k} obrigatório (texto)`);
    }
    if (!line.tax || typeof line.tax !== "object") badRequest(`Linha ${i + 1}: tax obrigatório`);
  }
  return {
    seriesRef: b.seriesRef as string,
    ...(b.documentDate ? { documentDate: b.documentDate as string } : {}),
    customer: (b.customer as IssueDocumentInput["customer"]) ?? null,
    ...(typeof b.pricesIncludeTax === "boolean" ? { pricesIncludeTax: b.pricesIncludeTax } : {}),
    lines: b.lines as IssueDocumentInput["lines"],
    ...(b.paymentMechanism ? { paymentMechanism: b.paymentMechanism as NonNullable<IssueDocumentInput["paymentMechanism"]> } : {}),
    ...(Array.isArray(b.references) ? { references: b.references as NonNullable<IssueDocumentInput["references"]> } : {}),
    ...(Array.isArray(b.orderReferences) ? { orderReferences: b.orderReferences as string[] } : {}),
    confirmWarnings: b.confirmWarnings === true,
    actor: who,
  };
}

/**
 * Faturação certificada AT (testes): `/api/invoicing/*`. Leitura com
 * `sales.invoicing` READ, escrita com MANAGE (route-permissions). A emissão
 * exige `Idempotency-Key` — um reenvio nunca cria um segundo documento.
 */
export function createInvoicingRouter(uc: InvoicingPort, issue: IssueDocumentPort, store: IdempotencyStore): Router {
  const r = Router();
  const B = "/invoicing";
  r.use(`${B}/documents`, (req, res, next) => (req.method === "POST" && req.path === "/" ? idempotency(store, { required: true })(req, res, next) : idempotency(store)(req, res, next)));
  r.use(`${B}/series`, idempotency(store));

  r.get(`${B}/meta`, (_req, res) => res.json(uc.meta()));

  r.get(`${B}/series`, async (req, res) => res.json(await run(() => uc.listSeries(org(req)))));
  r.post(`${B}/series`, async (req, res) => {
    const b = body(req);
    uuid(b.legalEntityId, "legalEntityId");
    if (b.locationId !== undefined && b.locationId !== null) uuid(b.locationId, "locationId");
    if (typeof b.seriesId !== "string" || typeof b.documentType !== "string") badRequest("documentType e seriesId obrigatórios");
    const created = await run(() =>
      uc.createSeries(org(req), actor(req), {
        legalEntityId: b.legalEntityId as string,
        locationId: text(b.locationId) ?? null,
        documentType: b.documentType as FiscalDocumentType,
        seriesId: (b.seriesId as string).trim(),
        mode: (text(b.mode) ?? "training") as "training" | "normal",
      }),
    );
    res.status(201).json(created);
  });
  r.put(`${B}/series/:id/validation-code`, async (req, res) => {
    const code = text(body(req).validationCode);
    if (!code) badRequest("validationCode obrigatório");
    res.json(await run(() => uc.setValidationCode(org(req), id(req), code)));
  });

  r.get(`${B}/documents`, async (req, res) => {
    const q = req.query;
    const filter = {
      ...(typeof q.from === "string" && DATE.test(q.from) ? { from: q.from } : {}),
      ...(typeof q.to === "string" && DATE.test(q.to) ? { to: q.to } : {}),
      ...(typeof q.type === "string" && DOCUMENT_TYPES.includes(q.type as FiscalDocumentType) ? { documentType: q.type as FiscalDocumentType } : {}),
      ...(typeof q.status === "string" && STATUSES.has(q.status) ? { status: q.status as DocumentStatus } : {}),
      ...(typeof q.limit === "string" && /^\d+$/.test(q.limit) ? { limit: Number(q.limit) } : {}),
    };
    res.json((await run(() => uc.listDocuments(org(req), filter))).map(documentJson));
  });
  r.get(`${B}/documents/:id`, async (req, res) => res.json(documentJson(await run(() => uc.getDocument(org(req), id(req))))));
  r.post(`${B}/documents`, async (req, res) => {
    const input = issueInput(body(req), actor(req));
    res.status(201).json(await run(() => issue.execute(org(req), input)));
  });
  r.post(`${B}/documents/:id/cancel`, async (req, res) => {
    const b = body(req);
    res.json(documentJson(await run(() => uc.cancel(org(req), actor(req), id(req), String(b.reasonCode ?? "") as CancelReasonCode, text(b.note)))));
  });

  return r;
}
