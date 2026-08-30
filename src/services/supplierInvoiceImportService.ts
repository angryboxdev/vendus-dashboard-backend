import { createHash, randomUUID } from "crypto";
import type {
  ConfirmSupplierInvoiceImportBody,
  ConfirmSupplierInvoiceImportResult,
  SupplierInvoiceImportSummaryDto,
  UpdateSupplierInvoiceImportBody,
} from "../domain/supplierInvoiceImportTypes.js";
import {
  invoiceImportMovementReference,
  SUPPLIER_INVOICE_IMPORT_CREATED_BY,
} from "../domain/supplierInvoiceImportTypes.js";
import { ENV } from "../config/env.js";
import { createScopedQuery } from "../infra/scoped-db/scoped-query.js";
import { objectStorage } from "../infra/scoped-db/object-storage.js";
import type { OrganizationId } from "../kernel/organization-id.js";
import { extractInvoiceWithOpenAI } from "./openaiInvoiceExtractService.js";
import { lisbonDayEndUtcIso } from "../utils/lisbonDayInstants.js";
import { updateStockItem } from "./stockItemService.js";

const BUCKET = "invoice-imports";

function sha256Hex(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function normalizeKeyPart(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function businessKey(
  supplier: string | null,
  invoiceNumber: string | null,
  invoiceDate: string | null
): string | null {
  if (!supplier || !invoiceNumber || !invoiceDate) return null;
  const raw = `${normalizeKeyPart(supplier)}|${normalizeKeyPart(invoiceNumber)}|${invoiceDate}`;
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
}

function mapLineRow(r: Record<string, unknown>): SupplierInvoiceImportSummaryDto["lines"][0] {
  const qty = Number(r.quantity);
  return {
    id: String(r.id),
    line_index: Number(r.line_index),
    description: String(r.description),
    supplier_article_code:
      r.supplier_article_code != null ? String(r.supplier_article_code) : null,
    quantity: qty,
    raw_invoice_quantity: r.raw_invoice_quantity != null ? Number(r.raw_invoice_quantity) : qty,
    unit: r.unit != null ? String(r.unit) : null,
    unit_price_net: r.unit_price_net != null ? Number(r.unit_price_net) : null,
    unit_price_gross: r.unit_price_gross != null ? Number(r.unit_price_gross) : null,
    vat_rate: r.vat_rate != null ? Number(r.vat_rate) : null,
    // Stored as decimal (0.10); returned as percentage (10) for the frontend
    discount_pct: r.discount_pct != null ? Math.round(Number(r.discount_pct) * 10000) / 100 : null,
    line_total_net: r.line_total_net != null ? Number(r.line_total_net) : null,
    line_total_gross: r.line_total_gross != null ? Number(r.line_total_gross) : null,
    stock_item_id: r.stock_item_id != null ? String(r.stock_item_id) : null,
    match_confidence: r.match_confidence != null ? Number(r.match_confidence) : null,
    line_status: r.line_status as SupplierInvoiceImportSummaryDto["lines"][0]["line_status"],
    notes: r.notes != null ? String(r.notes) : null,
  };
}

function mapImportRow(
  row: Record<string, unknown>,
  lines: SupplierInvoiceImportSummaryDto["lines"]
): SupplierInvoiceImportSummaryDto {
  return {
    id: String(row.id),
    status: row.status as SupplierInvoiceImportSummaryDto["status"],
    file_name: String(row.file_name),
    file_mime: String(row.file_mime),
    file_sha256: String(row.file_sha256),
    file_size: Number(row.file_size),
    supplier_name: row.supplier_name != null ? String(row.supplier_name) : null,
    invoice_number: row.invoice_number != null ? String(row.invoice_number) : null,
    invoice_date: row.invoice_date != null ? String(row.invoice_date) : null,
    currency: String(row.currency ?? "EUR"),
    subtotal: row.subtotal != null ? Number(row.subtotal) : null,
    tax_total: row.tax_total != null ? Number(row.tax_total) : null,
    total: row.total != null ? Number(row.total) : null,
    business_key: row.business_key != null ? String(row.business_key) : null,
    duplicate_warning: Boolean(row.duplicate_warning),
    duplicate_of_import_id:
      row.duplicate_of_import_id != null
        ? String(row.duplicate_of_import_id)
        : null,
    parse_error: row.parse_error != null ? String(row.parse_error) : null,
    lines,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    confirmed_at: row.confirmed_at != null ? String(row.confirmed_at) : null,
  };
}

async function findExactStockMatch(
  organizationId: OrganizationId,
  description: string
): Promise<{ id: string } | null> {
  const d = description.trim();
  if (!d) return null;
  const { data, error } = await createScopedQuery(organizationId)
    .table("stock_items")
    .select("id, name")
    .eq("is_active", true)
    .limit(2000);
  if (error || !data?.length) return null;
  const lower = d.toLowerCase();
  for (const row of data as unknown as Array<{ id: string; name: string }>) {
    if (row.name.trim().toLowerCase() === lower) return { id: row.id };
  }
  return null;
}

async function findMappedStockItem(
  organizationId: OrganizationId,
  supplierNormalized: string,
  descriptionNormalized: string
): Promise<{ id: string; stock_quantity: number | null; stock_unit: string | null } | null> {
  const { data, error } = await createScopedQuery(organizationId)
    .table("supplier_article_mappings")
    .select("stock_item_id, stock_quantity, stock_unit")
    .eq("supplier_normalized", supplierNormalized)
    .contains("supplier_article_description_normalized", [descriptionNormalized])
    .maybeSingle();
  if (error || !data) return null;
  const row = data as unknown as { stock_item_id: string; stock_quantity: number | null; stock_unit: string | null };
  return {
    id: row.stock_item_id,
    stock_quantity: row.stock_quantity != null ? Number(row.stock_quantity) : null,
    stock_unit: row.stock_unit ?? null,
  };
}

async function upsertSupplierArticleMappings(
  organizationId: OrganizationId,
  supplierNormalized: string,
  lines: Array<{
    supplier_article_code: string | null;
    description: string;
    /** Unidade conforme vem na fatura (ex.: "KG"). */
    unit: string | null;
    stock_item_id: string | null;
    /** Quantidade em unidades de stock (o que o utilizador definiu). */
    quantity: number;
    /** Quantidade original na fatura (antes de qualquer conversão). */
    original_invoice_quantity: number;
    /** Unidade de stock definida pelo utilizador (ex.: "g"). */
    stock_unit?: string | null;
  }>
): Promise<void> {
  const eligible = lines.filter((l) => l.description && l.stock_item_id);
  if (!eligible.length) return;

  for (const l of eligible) {
    const descNorm = normalizeKeyPart(l.description);

    const { data: existing } = await createScopedQuery(organizationId)
      .table("supplier_article_mappings")
      .select("id, supplier_article_description_normalized")
      .eq("supplier_normalized", supplierNormalized)
      .eq("stock_item_id", l.stock_item_id!)
      .maybeSingle();

    const mappingData = {
      supplier_article_code: l.supplier_article_code ?? null,
      supplier_article_description: l.description,
      invoice_quantity: l.original_invoice_quantity,
      invoice_unit: l.unit ?? null,
      stock_quantity: l.quantity,
      stock_unit: l.stock_unit ?? null,
    };

    if (existing) {
      const row = existing as unknown as { id: string; supplier_article_description_normalized: string[] };
      const descs: string[] = row.supplier_article_description_normalized ?? [];
      const updatedDescs = descs.includes(descNorm) ? descs : [...descs, descNorm];
      await createScopedQuery(organizationId)
        .table("supplier_article_mappings")
        .update({
          ...mappingData,
          supplier_article_description_normalized: updatedDescs,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
    } else {
      await createScopedQuery(organizationId)
        .table("supplier_article_mappings")
        .insert({
          ...mappingData,
          supplier_normalized: supplierNormalized,
          supplier_article_description_normalized: [descNorm],
        });
    }
  }
}

/**
 * Upload + parse OpenAI + linhas em BD.
 */
export async function createSupplierInvoiceImport(
  organizationId: OrganizationId,
  options: {
    buffer: Buffer;
    fileName: string;
    mime: string;
  }
): Promise<SupplierInvoiceImportSummaryDto> {
  const { buffer, fileName, mime } = options;
  const id = randomUUID();
  const hash = sha256Hex(buffer);
  const safeName = sanitizeFileName(fileName || "invoice");
  const storagePath = `${id}/${safeName}`;

  await objectStorage.upload(BUCKET, storagePath, buffer, mime);

  const { error: insErr } = await createScopedQuery(organizationId).table("supplier_invoice_imports").insert({
    id,
    status: "processing",
    storage_bucket: BUCKET,
    storage_path: storagePath,
    file_name: fileName,
    file_mime: mime,
    file_sha256: hash,
    file_size: buffer.length,
  });
  if (insErr) {
    void objectStorage.remove(BUCKET, storagePath);
    throw new Error(`Criar import: ${insErr.message}`);
  }

  try {
    const extracted = await extractInvoiceWithOpenAI({
      buffer,
      mime,
      fileName,
    });

    const supplierName = extracted.supplier_name ?? null;
    const invoiceNumber = extracted.invoice_number ?? null;
    let invoiceDate: string | null = extracted.invoice_date ?? null;
    if (invoiceDate && !/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) {
      invoiceDate = null;
    }

    const bk = businessKey(supplierName, invoiceNumber, invoiceDate);

    let duplicateWarning = false;
    let duplicateOfId: string | null = null;
    if (bk) {
      const { data: dup } = await createScopedQuery(organizationId)
        .table("supplier_invoice_imports")
        .select("id")
        .eq("business_key", bk)
        .eq("status", "confirmed")
        .neq("id", id)
        .limit(1)
        .maybeSingle();
      if (dup) {
        duplicateWarning = true;
        duplicateOfId = (dup as unknown as { id: string }).id;
      }
    }

    const supplierNorm = supplierName ? normalizeKeyPart(supplierName) : null;

    const lineRows: Record<string, unknown>[] = [];
    let idx = 0;
    for (const line of extracted.lines) {
      let stockItemId: string | null = null;
      let lineStatus: "matched" | "needs_review" | "ignored" = "needs_review";
      let confidence: number | null = null;
      // May differ from line.quantity when a unit conversion factor is stored
      const rawInvoiceQuantity = line.quantity; // always the quantity as-is on the invoice
      let quantity = line.quantity;

      // 1. Look up persisted supplier→stock mapping by normalized description
      if (supplierNorm && line.description) {
        const mapped = await findMappedStockItem(organizationId, supplierNorm, normalizeKeyPart(line.description));
        if (mapped) {
          stockItemId = mapped.id;
          lineStatus = "matched";
          confidence = 1;
          // Direct mapping: use the stored stock quantity and unit directly.
          // Unit prices are recalculated proportionally so cost-per-stock-unit is correct.
          if (mapped.stock_quantity != null && mapped.stock_quantity !== rawInvoiceQuantity) {
            const f = rawInvoiceQuantity > 0 ? mapped.stock_quantity / rawInvoiceQuantity : 1;
            quantity = mapped.stock_quantity;
            if (line.unit_price_gross != null)
              line.unit_price_gross = Math.round((line.unit_price_gross / f) * 10000) / 10000;
            if (line.unit_price_net != null)
              line.unit_price_net = Math.round((line.unit_price_net / f) * 10000) / 10000;
          }
          if (mapped.stock_unit != null) line.unit = mapped.stock_unit;
        }
      }

      // 2. Fall back to exact description match
      if (!stockItemId) {
        const match = await findExactStockMatch(organizationId, line.description);
        if (match) {
          stockItemId = match.id;
          lineStatus = "matched";
          confidence = 1;
        }
      }
      lineRows.push({
        import_id: id,
        line_index: idx,
        description: line.description,
        supplier_article_code: line.supplier_article_code ?? null,
        quantity,
        raw_invoice_quantity: rawInvoiceQuantity,
        unit: line.unit ?? null,
        unit_price_net: line.unit_price_net ?? null,
        unit_price_gross: line.unit_price_gross ?? null,
        vat_rate: line.vat_rate ?? null,
        discount_pct: line.discount_pct ?? null,
        line_total_net: line.line_total_net ?? null,
        line_total_gross: line.line_total_gross ?? null,
        stock_item_id: stockItemId,
        match_confidence: confidence,
        line_status: lineStatus,
      });
      idx++;
    }

    const { error: lineInsErr } = await createScopedQuery(organizationId)
      .table("supplier_invoice_import_lines")
      .insert(lineRows);
    if (lineInsErr) throw new Error(`Linhas: ${lineInsErr.message}`);

    const { error: updErr } = await createScopedQuery(organizationId)
      .table("supplier_invoice_imports")
      .update({
        status: "ready_for_review",
        supplier_name: supplierName,
        supplier_normalized: supplierName ? normalizeKeyPart(supplierName) : null,
        invoice_number: invoiceNumber,
        invoice_date: invoiceDate,
        currency: extracted.currency ?? "EUR",
        subtotal: extracted.subtotal ?? null,
        tax_total: extracted.tax_total ?? null,
        total: extracted.total ?? null,
        business_key: bk,
        duplicate_warning: duplicateWarning,
        duplicate_of_import_id: duplicateOfId,
        raw_openai_json: extracted as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (updErr) throw new Error(`Atualizar import: ${updErr.message}`);

    return getSupplierInvoiceImport(organizationId, id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await createScopedQuery(organizationId)
      .table("supplier_invoice_imports")
      .update({
        status: "failed",
        parse_error: msg,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    return getSupplierInvoiceImport(organizationId, id);
  }
}

export async function getSupplierInvoiceImport(
  organizationId: OrganizationId,
  importId: string
): Promise<SupplierInvoiceImportSummaryDto> {
  const { data: imp, error } = await createScopedQuery(organizationId)
    .table("supplier_invoice_imports")
    .select("*")
    .eq("id", importId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!imp) throw new Error("Importação não encontrada");

  const { data: lines } = await createScopedQuery(organizationId)
    .table("supplier_invoice_import_lines")
    .select("*")
    .eq("import_id", importId)
    .order("line_index", { ascending: true });

  const lineDtos = ((lines ?? []) as unknown as Record<string, unknown>[]).map(mapLineRow);
  return mapImportRow(imp as unknown as Record<string, unknown>, lineDtos);
}

async function deleteMovementsForImport(
  organizationId: OrganizationId,
  importId: string
): Promise<void> {
  const ref = invoiceImportMovementReference(importId);
  const { error } = await createScopedQuery(organizationId)
    .table("stock_movements")
    .delete()
    .eq("created_by", SUPPLIER_INVOICE_IMPORT_CREATED_BY)
    .eq("reference", ref);
  if (error) throw new Error(`Remover movimentos anteriores: ${error.message}`);
}

export async function updateSupplierInvoiceImport(
  organizationId: OrganizationId,
  importId: string,
  body: UpdateSupplierInvoiceImportBody
): Promise<SupplierInvoiceImportSummaryDto> {
  const imp = await getSupplierInvoiceImport(organizationId, importId);
  if (imp.status !== "ready_for_review") {
    throw new Error(
      `Importação não pode ser editada (estado: ${imp.status})`
    );
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if ("supplier_name" in body) {
    const v = body.supplier_name ?? null;
    updates.supplier_name = v;
    updates.supplier_normalized = v ? normalizeKeyPart(v) : null;
  }
  if ("invoice_number" in body) updates.invoice_number = body.invoice_number ?? null;
  if ("invoice_date" in body) {
    const d = body.invoice_date ?? null;
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      throw new Error("invoice_date deve estar no formato YYYY-MM-DD");
    }
    updates.invoice_date = d;
  }
  if ("currency" in body && body.currency) updates.currency = body.currency;
  if ("subtotal" in body) updates.subtotal = body.subtotal ?? null;
  if ("tax_total" in body) updates.tax_total = body.tax_total ?? null;
  if ("total" in body) updates.total = body.total ?? null;

  // Recalculate business_key and duplicate detection if identity fields changed
  const supplierName = ("supplier_name" in body ? (body.supplier_name ?? null) : imp.supplier_name);
  const invoiceNumber = ("invoice_number" in body ? (body.invoice_number ?? null) : imp.invoice_number);
  const invoiceDate = ("invoice_date" in body ? (body.invoice_date ?? null) : imp.invoice_date);
  const bk = businessKey(supplierName, invoiceNumber, invoiceDate);
  updates.business_key = bk;

  let duplicateWarning = false;
  let duplicateOfId: string | null = null;
  if (bk) {
    const { data: dup } = await createScopedQuery(organizationId)
      .table("supplier_invoice_imports")
      .select("id")
      .eq("business_key", bk)
      .eq("status", "confirmed")
      .neq("id", importId)
      .limit(1)
      .maybeSingle();
    if (dup) {
      duplicateWarning = true;
      duplicateOfId = (dup as unknown as { id: string }).id;
    }
  }
  updates.duplicate_warning = duplicateWarning;
  updates.duplicate_of_import_id = duplicateOfId;

  const { error } = await createScopedQuery(organizationId)
    .table("supplier_invoice_imports")
    .update(updates)
    .eq("id", importId);
  if (error) throw new Error(`Atualizar cabeçalho: ${error.message}`);

  return getSupplierInvoiceImport(organizationId, importId);
}

export async function confirmSupplierInvoiceImport(
  organizationId: OrganizationId,
  importId: string,
  body: ConfirmSupplierInvoiceImportBody
): Promise<ConfirmSupplierInvoiceImportResult> {
  const imp = await getSupplierInvoiceImport(organizationId, importId);
  if (imp.status !== "ready_for_review") {
    throw new Error(
      `Importação não está pronta para confirmar (estado: ${imp.status})`
    );
  }

  if (imp.duplicate_warning && !body.override_duplicate) {
    throw new Error(
      "DUPLICATE: já existe uma importação confirmada com o mesmo fornecedor/número/data. Define override_duplicate=true para substituir."
    );
  }

  // D4: the caller supplies the location explicitly — stock_movements is
  // location-bearing (NOT NULL), and this import must not rely on the
  // column default.
  if (!body.location_id || !body.location_id.trim()) {
    throw new Error("location_id obrigatório");
  }
  const locationId = body.location_id;

  // raw_invoice_quantity: quantity as it appears on the invoice (before factor conversion).
  // Used to compute quantity_per_invoice_unit = confirmed_stock_qty / raw_invoice_qty,
  // preventing the factor from being reset to 1 on subsequent imports.
  const rawInvoiceQtyById = new Map(imp.lines.map((l) => [l.id, l.raw_invoice_quantity]));
  // stored quantity: already-converted stock quantity stored in the line.
  // Used for price auto-divide and line-total recomputation.
  const storedQtyById = new Map(imp.lines.map((l) => [l.id, l.quantity]));

  if (body.lines?.length) {
    for (const adj of body.lines) {
      const updates: Record<string, unknown> = {};
      if (adj.stock_item_id !== undefined) updates.stock_item_id = adj.stock_item_id;
      if (adj.ignored === true) {
        updates.line_status = "ignored";
      } else if (adj.ignored === false) {
        updates.line_status = adj.stock_item_id ? "matched" : "needs_review";
      }
      if (adj.quantity !== undefined) updates.quantity = adj.quantity;

      // Price / VAT overrides
      const grossU = adj.unit_price != null && Number.isFinite(adj.unit_price) ? adj.unit_price : null;
      const vatRate = adj.vat_rate_pct != null && Number.isFinite(adj.vat_rate_pct)
        ? adj.vat_rate_pct / 100
        : null;
      if (grossU != null) {
        updates.unit_price_gross = grossU;
        if (vatRate != null) {
          updates.vat_rate = vatRate;
          updates.unit_price_net = Math.round((grossU / (1 + vatRate)) * 10000) / 10000;
        }
      } else if (vatRate != null) {
        updates.vat_rate = vatRate;
      } else {
        // No explicit price override — if the user changed quantity (pack conversion),
        // auto-divide the extracted unit prices so they reflect cost-per-stock-unit.
        const prevQty = storedQtyById.get(adj.line_id);
        if (adj.quantity != null && prevQty != null && prevQty > 0 && adj.quantity !== prevQty) {
          const factor = adj.quantity / prevQty;
          const origLine = imp.lines.find((l) => l.id === adj.line_id);
          if (origLine?.unit_price_gross != null) {
            updates.unit_price_gross = Math.round((origLine.unit_price_gross / factor) * 10000) / 10000;
          }
          if (origLine?.unit_price_net != null) {
            updates.unit_price_net = Math.round((origLine.unit_price_net / factor) * 10000) / 10000;
          }
        }
      }

      // Recompute line totals when we have price + quantity
      const qty = adj.quantity ?? storedQtyById.get(adj.line_id);
      if (grossU != null && qty != null && qty > 0) {
        updates.line_total_gross = Math.round(grossU * qty * 100) / 100;
        if (vatRate != null) {
          const netU = (grossU / (1 + vatRate));
          updates.line_total_net = Math.round(netU * qty * 100) / 100;
        }
      }

      if (Object.keys(updates).length) {
        const { error } = await createScopedQuery(organizationId)
          .table("supplier_invoice_import_lines")
          .update(updates)
          .eq("id", adj.line_id)
          .eq("import_id", importId);
        if (error) throw new Error(`Atualizar linha: ${error.message}`);
      }
    }
  }

  const fresh = await getSupplierInvoiceImport(organizationId, importId);
  const activeLines = fresh.lines.filter((l) => l.line_status !== "ignored");

  for (const l of activeLines) {
    if (!l.stock_item_id) {
      throw new Error(
        `Linha ${l.line_index + 1} sem item de stock associado (ou marca como ignorada)`
      );
    }
    if (!Number.isFinite(l.quantity) || l.quantity <= 0) {
      throw new Error(`Linha ${l.line_index + 1}: quantidade inválida`);
    }
  }

  // Persist supplier article → stock item mappings for future auto-matching.
  // The conversion factor is derived from the ratio of confirmed vs. original
  // invoice quantity (e.g. user changes 1 PC → 10 un ⇒ factor = 10).
  const supplierNormForMapping = fresh.supplier_name ? normalizeKeyPart(fresh.supplier_name) : null;
  if (supplierNormForMapping) {
    // Build a lookup for stock_unit overrides provided by the user in this confirmation
    const stockUnitByLineId = new Map(
      (body.lines ?? [])
        .filter((adj) => adj.stock_unit !== undefined)
        .map((adj) => [adj.line_id, adj.stock_unit ?? null])
    );

    await upsertSupplierArticleMappings(
      organizationId,
      supplierNormForMapping,
      activeLines.map((l) => ({
        supplier_article_code: l.supplier_article_code,
        description: l.description,
        unit: l.unit,
        stock_item_id: l.stock_item_id,
        quantity: l.quantity,
        original_invoice_quantity: rawInvoiceQtyById.get(l.id) ?? l.raw_invoice_quantity,
        stock_unit: stockUnitByLineId.has(l.id) ? (stockUnitByLineId.get(l.id) ?? null) : l.unit,
      }))
    );
  }

  const bk = fresh.business_key;
  const replacedIds: string[] = [];

  if (body.override_duplicate && bk) {
    const { data: others } = await createScopedQuery(organizationId)
      .table("supplier_invoice_imports")
      .select("id")
      .eq("business_key", bk)
      .eq("status", "confirmed")
      .neq("id", importId);
    for (const row of others ?? []) {
      const oid = (row as unknown as { id: string }).id;
      await deleteMovementsForImport(organizationId, oid);
      replacedIds.push(oid);
      await createScopedQuery(organizationId)
        .table("supplier_invoice_imports")
        .update({
          status: "cancelled",
          updated_at: new Date().toISOString(),
        })
        .eq("id", oid);
    }
  }

  await deleteMovementsForImport(organizationId, importId);

  // Default to today (confirmation date); the frontend may override with a specific date.
  let movementDate: string;
  if (body.movement_date) {
    const d = String(body.movement_date).trim();
    // Accept YYYY-MM-DD or full ISO — normalise to end-of-day Lisbon UTC
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : d.slice(0, 10);
    movementDate = lisbonDayEndUtcIso(dateOnly);
  } else {
    movementDate = lisbonDayEndUtcIso(new Date().toISOString().slice(0, 10));
  }

  const ref = invoiceImportMovementReference(importId);
  const reason = `Fatura ${fresh.invoice_number ?? "?"} — ${fresh.supplier_name ?? "Fornecedor"}`;

  const movementRows: Record<string, unknown>[] = [];
  for (const l of activeLines) {
    movementRows.push({
      item_id: l.stock_item_id,
      type: "purchase",
      quantity: Math.round(l.quantity * 1000) / 1000,
      unit_cost_per_base_unit_with_vat: l.unit_price_gross,
      unit_cost_per_base_unit_without_vat: l.unit_price_net,
      reason,
      reference: ref,
      created_by: SUPPLIER_INVOICE_IMPORT_CREATED_BY,
      movement_date: movementDate,
      location_id: locationId,
    });
  }

  if (movementRows.length) {
    const { error: movErr } = await createScopedQuery(organizationId)
      .table("stock_movements")
      .insert(movementRows);
    if (movErr) throw new Error(`Inserir compras: ${movErr.message}`);
  }

  let stockItemsUpdated = 0;
  for (const l of activeLines) {
    if (!l.stock_item_id) continue;
    const hasWith = l.unit_price_gross != null && Number.isFinite(l.unit_price_gross);
    const hasWithout = l.unit_price_net != null && Number.isFinite(l.unit_price_net);
    if (!hasWith && !hasWithout) continue;
    await updateStockItem(organizationId, l.stock_item_id, {
      purchase_reference_unit_cost_with_vat: hasWith ? l.unit_price_gross : null,
      purchase_reference_unit_cost_without_vat: hasWithout ? l.unit_price_net : null,
    });
    stockItemsUpdated++;
  }

  const { error: finErr } = await createScopedQuery(organizationId)
    .table("supplier_invoice_imports")
    .update({
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", importId);
  if (finErr) throw new Error(`Finalizar import: ${finErr.message}`);

  return {
    import_id: importId,
    status: "confirmed",
    movements_inserted: movementRows.length,
    stock_items_updated: stockItemsUpdated,
    replaced_import_ids: replacedIds,
  };
}
