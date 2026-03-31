import { createHash, randomUUID } from "crypto";
import type {
  ConfirmSupplierInvoiceImportBody,
  ConfirmSupplierInvoiceImportResult,
  SupplierInvoiceImportSummaryDto,
} from "../domain/supplierInvoiceImportTypes.js";
import {
  invoiceImportMovementReference,
  SUPPLIER_INVOICE_IMPORT_CREATED_BY,
} from "../domain/supplierInvoiceImportTypes.js";
import { ENV } from "../config/env.js";
import { getSupabase, isSupabaseConfigured } from "../infra/supabaseClient.js";
import { extractInvoiceWithOpenAI } from "./openaiInvoiceExtractService.js";
import { lisbonDayEndUtcIso } from "../utils/lisbonDayInstants.js";
import { updateStockItem } from "./stockItemService.js";

const BUCKET = "invoice-imports";

function requireSupabase(): NonNullable<ReturnType<typeof getSupabase>> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase não configurado");
  }
  const s = getSupabase();
  if (!s) throw new Error("Supabase indisponível");
  return s;
}

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
  return {
    id: String(r.id),
    line_index: Number(r.line_index),
    description: String(r.description),
    supplier_article_code:
      r.supplier_article_code != null ? String(r.supplier_article_code) : null,
    quantity: Number(r.quantity),
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
  supabase: ReturnType<typeof getSupabase>,
  description: string
): Promise<{ id: string } | null> {
  const d = description.trim();
  if (!d) return null;
  const { data, error } = await supabase!
    .from("stock_items")
    .select("id, name")
    .eq("is_active", true)
    .limit(2000);
  if (error || !data?.length) return null;
  const lower = d.toLowerCase();
  for (const row of data as Array<{ id: string; name: string }>) {
    if (row.name.trim().toLowerCase() === lower) return { id: row.id };
  }
  return null;
}

async function findMappedStockItem(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  supplierNormalized: string,
  descriptionNormalized: string
): Promise<{ id: string; quantity_per_invoice_unit: number } | null> {
  const { data, error } = await supabase
    .from("supplier_article_mappings")
    .select("stock_item_id, quantity_per_invoice_unit")
    .eq("supplier_normalized", supplierNormalized)
    .contains("supplier_article_description_normalized", [descriptionNormalized])
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { stock_item_id: string; quantity_per_invoice_unit: number };
  return {
    id: row.stock_item_id,
    quantity_per_invoice_unit: Number(row.quantity_per_invoice_unit) || 1,
  };
}

async function upsertSupplierArticleMappings(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  supplierNormalized: string,
  lines: Array<{
    supplier_article_code: string | null;
    description: string;
    stock_item_id: string | null;
    quantity: number;
    original_invoice_quantity: number;
  }>
): Promise<void> {
  const eligible = lines.filter((l) => l.description && l.stock_item_id);
  if (!eligible.length) return;

  for (const l of eligible) {
    const factor =
      l.original_invoice_quantity > 0
        ? Math.round((l.quantity / l.original_invoice_quantity) * 10000) / 10000
        : 1;
    const descNorm = normalizeKeyPart(l.description);

    const { data: existing } = await supabase
      .from("supplier_article_mappings")
      .select("id, supplier_article_description_normalized")
      .eq("supplier_normalized", supplierNormalized)
      .eq("stock_item_id", l.stock_item_id!)
      .maybeSingle();

    if (existing) {
      const row = existing as { id: string; supplier_article_description_normalized: string[] };
      const descs: string[] = row.supplier_article_description_normalized ?? [];
      const updatedDescs = descs.includes(descNorm) ? descs : [...descs, descNorm];
      await supabase
        .from("supplier_article_mappings")
        .update({
          supplier_article_description_normalized: updatedDescs,
          supplier_article_code: l.supplier_article_code ?? null,
          supplier_article_description: l.description,
          quantity_per_invoice_unit: factor,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
    } else {
      await supabase
        .from("supplier_article_mappings")
        .insert({
          supplier_normalized: supplierNormalized,
          supplier_article_code: l.supplier_article_code ?? null,
          supplier_article_description: l.description,
          supplier_article_description_normalized: [descNorm],
          stock_item_id: l.stock_item_id!,
          quantity_per_invoice_unit: factor,
        });
    }
  }
}

/**
 * Upload + parse OpenAI + linhas em BD.
 */
export async function createSupplierInvoiceImport(options: {
  buffer: Buffer;
  fileName: string;
  mime: string;
}): Promise<SupplierInvoiceImportSummaryDto> {
  const supabase = requireSupabase();
  const { buffer, fileName, mime } = options;
  const id = randomUUID();
  const hash = sha256Hex(buffer);
  const safeName = sanitizeFileName(fileName || "invoice");
  const storagePath = `${id}/${safeName}`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType: mime,
      upsert: false,
    });
  if (upErr) {
    throw new Error(`Upload Storage: ${upErr.message}`);
  }

  const { error: insErr } = await supabase.from("supplier_invoice_imports").insert({
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
    void supabase.storage.from(BUCKET).remove([storagePath]);
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
      const { data: dup } = await supabase
        .from("supplier_invoice_imports")
        .select("id")
        .eq("business_key", bk)
        .eq("status", "confirmed")
        .neq("id", id)
        .limit(1)
        .maybeSingle();
      if (dup) {
        duplicateWarning = true;
        duplicateOfId = (dup as { id: string }).id;
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
      let quantity = line.quantity;

      // 1. Look up persisted supplier→stock mapping by normalized description
      if (supplierNorm && line.description) {
        const mapped = await findMappedStockItem(supabase, supplierNorm, normalizeKeyPart(line.description));
        if (mapped) {
          stockItemId = mapped.id;
          lineStatus = "matched";
          confidence = 1;
          if (mapped.quantity_per_invoice_unit !== 1) {
            const f = mapped.quantity_per_invoice_unit;
            quantity = Math.round(line.quantity * f * 1000) / 1000;
            // Divide unit prices so they reflect cost-per-stock-unit, not cost-per-invoice-unit.
            // Line totals are unchanged (total paid doesn't change).
            if (line.unit_price_gross != null)
              line.unit_price_gross = Math.round((line.unit_price_gross / f) * 10000) / 10000;
            if (line.unit_price_net != null)
              line.unit_price_net = Math.round((line.unit_price_net / f) * 10000) / 10000;
          }
        }
      }

      // 2. Fall back to exact description match
      if (!stockItemId) {
        const match = await findExactStockMatch(supabase, line.description);
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

    const { error: lineInsErr } = await supabase
      .from("supplier_invoice_import_lines")
      .insert(lineRows);
    if (lineInsErr) throw new Error(`Linhas: ${lineInsErr.message}`);

    const { error: updErr } = await supabase
      .from("supplier_invoice_imports")
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

    return getSupplierInvoiceImport(id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase
      .from("supplier_invoice_imports")
      .update({
        status: "failed",
        parse_error: msg,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    return getSupplierInvoiceImport(id);
  }
}

export async function getSupplierInvoiceImport(
  importId: string
): Promise<SupplierInvoiceImportSummaryDto> {
  const supabase = requireSupabase();
  const { data: imp, error } = await supabase
    .from("supplier_invoice_imports")
    .select("*")
    .eq("id", importId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!imp) throw new Error("Importação não encontrada");

  const { data: lines } = await supabase
    .from("supplier_invoice_import_lines")
    .select("*")
    .eq("import_id", importId)
    .order("line_index", { ascending: true });

  const lineDtos = ((lines ?? []) as Record<string, unknown>[]).map(mapLineRow);
  return mapImportRow(imp as Record<string, unknown>, lineDtos);
}

async function deleteMovementsForImport(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  importId: string
): Promise<void> {
  const ref = invoiceImportMovementReference(importId);
  const { error } = await supabase
    .from("stock_movements")
    .delete()
    .eq("created_by", SUPPLIER_INVOICE_IMPORT_CREATED_BY)
    .eq("reference", ref);
  if (error) throw new Error(`Remover movimentos anteriores: ${error.message}`);
}

export async function confirmSupplierInvoiceImport(
  importId: string,
  body: ConfirmSupplierInvoiceImportBody
): Promise<ConfirmSupplierInvoiceImportResult> {
  const supabase = requireSupabase();
  const imp = await getSupplierInvoiceImport(importId);
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

  // Capture invoice quantities BEFORE user adjustments so we can compute the
  // conversion factor (confirmed_qty / invoice_qty) when saving the mapping.
  const originalQtyById = new Map(imp.lines.map((l) => [l.id, l.quantity]));

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
        const origQty = originalQtyById.get(adj.line_id);
        if (adj.quantity != null && origQty != null && origQty > 0 && adj.quantity !== origQty) {
          const factor = adj.quantity / origQty;
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
      const qty = adj.quantity ?? originalQtyById.get(adj.line_id);
      if (grossU != null && qty != null && qty > 0) {
        updates.line_total_gross = Math.round(grossU * qty * 100) / 100;
        if (vatRate != null) {
          const netU = (grossU / (1 + vatRate));
          updates.line_total_net = Math.round(netU * qty * 100) / 100;
        }
      }

      if (Object.keys(updates).length) {
        const { error } = await supabase
          .from("supplier_invoice_import_lines")
          .update(updates)
          .eq("id", adj.line_id)
          .eq("import_id", importId);
        if (error) throw new Error(`Atualizar linha: ${error.message}`);
      }
    }
  }

  const fresh = await getSupplierInvoiceImport(importId);
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
    await upsertSupplierArticleMappings(
      supabase,
      supplierNormForMapping,
      activeLines.map((l) => ({
        ...l,
        original_invoice_quantity: originalQtyById.get(l.id) ?? l.quantity,
      }))
    );
  }

  const bk = fresh.business_key;
  const replacedIds: string[] = [];

  if (body.override_duplicate && bk) {
    const { data: others } = await supabase
      .from("supplier_invoice_imports")
      .select("id")
      .eq("business_key", bk)
      .eq("status", "confirmed")
      .neq("id", importId);
    for (const row of others ?? []) {
      const oid = (row as { id: string }).id;
      await deleteMovementsForImport(supabase, oid);
      replacedIds.push(oid);
      await supabase
        .from("supplier_invoice_imports")
        .update({
          status: "cancelled",
          updated_at: new Date().toISOString(),
        })
        .eq("id", oid);
    }
  }

  await deleteMovementsForImport(supabase, importId);

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
    });
  }

  if (movementRows.length) {
    const { error: movErr } = await supabase
      .from("stock_movements")
      .insert(movementRows);
    if (movErr) throw new Error(`Inserir compras: ${movErr.message}`);
  }

  let stockItemsUpdated = 0;
  for (const l of activeLines) {
    if (!l.stock_item_id) continue;
    const hasWith = l.unit_price_gross != null && Number.isFinite(l.unit_price_gross);
    const hasWithout = l.unit_price_net != null && Number.isFinite(l.unit_price_net);
    if (!hasWith && !hasWithout) continue;
    await updateStockItem(l.stock_item_id, {
      purchase_reference_unit_cost_with_vat: hasWith ? l.unit_price_gross : null,
      purchase_reference_unit_cost_without_vat: hasWithout ? l.unit_price_net : null,
    });
    stockItemsUpdated++;
  }

  const { error: finErr } = await supabase
    .from("supplier_invoice_imports")
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
