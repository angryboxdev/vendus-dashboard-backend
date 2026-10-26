import { demandSourceOf, type PosProduct } from "../entities/stock-demo.js";
import { daysBetween, simulateDailySales, unit } from "./pos-sales.service.js";
import type { BaseUnit, DishDef, IngredientDef, PreparationDef, PriceTrend, ScenarioDef } from "./scenarios/scenario-types.js";

/**
 * Gerador da demonstração do Stock (puro, determinístico). Transforma um cenário nas linhas de cada tabela,
 * sem `org_id` (o seeder grava pela organização fictícia, que o carimba):
 * vendas do POS fictício (90 dias) → consumo pelas fichas técnicas → baixas diárias; compras semanais por
 * fornecedor que cobrem o consumo (arredondadas à embalagem) → faturas + compras aplicadas + entradas de stock;
 * preços com a tendência de cada ingrediente e desconto comercial do fornecedor. Os custos seguem as unidades
 * reais: linha da compra em cêntimos (por unidade base em cêntimos), movimento em euros por unidade base.
 */

export type Row = Record<string, unknown>;
export interface StockDemoPlan {
  /** Pela ordem de gravação (as chaves estrangeiras vêm antes). */
  tables: { table: string; rows: Row[] }[];
  /** As versões das fichas (criadas pelos triggers) passam a valer desde aqui. */
  historyFrom: string;
  summary: { items: number; suppliers: number; invoices: number; dishes: number; preparations: number; salesCents30d: number; movements: number };
}

const DAYS_SALES = 90;
const DAYS_PURCHASES = 84;
const SIZE_SUFFIX: Record<string, string> = { xs: "XS", small: "I", large: "G" };
const SIZE_TITLE: Record<string, string> = { xs: "XS", small: "Individual", large: "Grande" };
const PRICING_FACTOR: Record<BaseUnit, number> = { g: 1000, ml: 1000, un: 1 };
const PRICING_UNIT: Record<BaseUnit, string> = { g: "kg", ml: "l", un: "un" };

/** UUID determinístico (formato v4) para (semente, chave). */
export function demoUuid(seed: number, key: string): string {
  const hex = [0, 1, 2, 3].map((i) => Math.floor(unit(seed, `${key}#${i}`) * 0x100000000).toString(16).padStart(8, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const r6 = (n: number) => Math.round(n * 1_000_000) / 1_000_000;
const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();

function trendFactor(trend: PriceTrend | undefined, weekIndex: number): number {
  // weekIndex: 0 = semana mais antiga … 11 = mais recente.
  if (trend === "up") return 1 + (0.14 * weekIndex) / 11;
  if (trend === "down") return 1 - (0.09 * weekIndex) / 11;
  if (trend === "spike") return weekIndex >= 9 ? 1.22 : 1;
  return 1;
}

function sizesOf(dish: DishDef): ("xs" | "small" | "large")[] {
  return (["xs", "small", "large"] as const).filter((s) => dish.prices[s] != null);
}

function lineQty(line: DishDef["lines"][number], size: "xs" | "small" | "large"): number | null {
  if (size === "small") return line[2];
  if (size === "large") return line[3];
  if (line[4] !== undefined) return line[4] ?? null;
  return line[2] != null ? r3(line[2] / 2) : null;
}

export function buildStockDemoPlan(scenario: ScenarioDef, input: { seed: number; today: string; locationId: string }): StockDemoPlan {
  const { seed, today, locationId } = input;
  const id = (key: string) => demoUuid(seed, `${scenario.key}:${key}`);
  const ing = new Map(scenario.ingredients.map((i) => [i.key, i]));
  const prep = new Map(scenario.preparations.map((p) => [p.key, p]));
  for (const p of scenario.preparations) for (const [k] of p.items) if (!ing.has(k)) throw new Error(`Preparação ${p.key}: ingrediente ${k} em falta`);
  for (const d of scenario.dishes) for (const l of d.lines) if (!(l[0] === "i" ? ing.has(l[1]) : prep.has(l[1]))) throw new Error(`Prato ${d.key}: ${l[1]} em falta`);

  const salesFrom = addDays(today, -DAYS_SALES);
  const salesTo = addDays(today, -1);
  const historyFrom = `${addDays(today, -DAYS_SALES - 1)}T00:00:00.000Z`;

  // ── Catálogo ──
  const categories = [...new Set(scenario.ingredients.map((i) => i.category))];
  const stockCategories = categories.map((name) => ({ id: id(`cat:${name}`), name }));
  const supplierRows = scenario.suppliers.map((s) => ({
    id: id(`sup:${s.key}`),
    name: s.name,
    default_stock_policy: "usually_creates_review",
    default_location_id: locationId,
    notes: "Fornecedor fictício (demonstração do Stock).",
  }));

  // ── Vendas do POS fictício e consumo pelas fichas ──
  const dishProducts: PosProduct[] = scenario.dishes.flatMap((d) =>
    sizesOf(d).map((s) => ({ reference: `DEMO-${d.key.toUpperCase()}-${SIZE_SUFFIX[s]}`, title: `${d.name} (${SIZE_TITLE[s]})`, kind: "dish" as const, pizzaId: id(`dish:${d.key}`), size: s, stockItemId: null, priceCents: Math.round(d.prices[s]! * 100) })),
  );
  // Bebidas vendidas tal como vêm (água, refrigerante…): artigos vendáveis, sem ficha técnica.
  const itemProducts: PosProduct[] = scenario.ingredients
    .filter((i) => i.salePrice != null)
    .map((i) => ({ reference: `DEMO-ART-${i.key.toUpperCase()}`, title: i.name, kind: "item" as const, pizzaId: null, size: null, stockItemId: id(`item:${i.key}`), priceCents: Math.round(i.salePrice! * 100) }));
  const products = [...dishProducts, ...itemProducts];
  const dishByRef = new Map(dishProducts.map((p) => [p.reference, scenario.dishes.find((d) => id(`dish:${d.key}`) === p.pizzaId)!]));
  const itemKeyByRef = new Map(scenario.ingredients.filter((i) => i.salePrice != null).map((i) => [`DEMO-ART-${i.key.toUpperCase()}`, i.key]));
  const consumption = new Map<string, Map<string, number>>(); // ingrediente → dia → quantidade base
  const addUse = (key: string, day: string, q: number) => {
    const m = consumption.get(key) ?? new Map<string, number>();
    m.set(day, (m.get(day) ?? 0) + q);
    consumption.set(key, m);
  };
  const expand = (kind: "i" | "p", key: string, q: number, day: string, times: number) => {
    if (kind === "i") return addUse(key, day, q * times);
    const p: PreparationDef = prep.get(key)!;
    const factor = p.asUnit ? q : q / p.yieldQty;
    for (const [k, iq] of p.items) addUse(k, day, iq * factor * times);
  };
  const demandRows: Row[] = [];
  let salesCents30d = 0;
  const salesSettings = { seed, monthlySalesTargetCents: scenario.monthlySales * 100 };
  for (const day of daysBetween(salesFrom, salesTo)) {
    for (const sale of simulateDailySales(products, day, salesSettings)) {
      if (day >= addDays(today, -30)) salesCents30d += sale.grossCents;
      if (sale.kind === "item") {
        // Artigo vendido avulso: baixa de 1 unidade do próprio artigo por venda.
        addUse(itemKeyByRef.get(sale.reference)!, day, sale.quantity);
      } else {
        const dish = dishByRef.get(sale.reference)!;
        for (const line of dish.lines) {
          const q = lineQty(line, sale.size as "xs" | "small" | "large");
          if (q) expand(line[0], line[1], q, day, sale.quantity);
        }
      }
      const source = demandSourceOf(sale);
      demandRows.push({ location_id: locationId, demand_source_type: source.type, demand_source_ref: source.ref, sale_date: day, quantity_sold: sale.quantity });
    }
  }
  const used = (key: string, from: string, to: string) => {
    let t = 0;
    for (const [d, q] of consumption.get(key) ?? []) if (d >= from && d <= to) t += q;
    return t;
  };

  // ── Artigos ──
  const itemId = (k: string) => id(`item:${k}`);
  const avgDaily = (k: string) => used(k, addDays(today, -28), salesTo) / 28;
  const minOf = (i: IngredientDef) => {
    const min = Math.ceil(avgDaily(i.key) * 4);
    return min > 0 ? min : i.type === "cleaning" ? 1000 : 0;
  };
  const isBought = (i: IngredientDef) => !i.manualOnly && !i.noCost && !!i.supplier && !!i.pack;
  // Stock inicial: ~5 dias para o que se compra; o que nunca se compra cobre o período todo.
  const openingOf = (i: IngredientDef) => {
    const q = isBought(i) ? used(i.key, salesFrom, addDays(salesFrom, 4)) : used(i.key, salesFrom, salesTo) * 1.15;
    return Math.ceil(q) || (i.type === "cleaning" ? 5000 : 0);
  };
  const stockItems = scenario.ingredients.map((i) => {
    const perBase = i.price / PRICING_FACTOR[i.unit];
    const manual = i.manualOnly ? r6(perBase) : null;
    const min = minOf(i);
    return {
      id: itemId(i.key),
      name: i.name,
      sku: `DEMO-${i.key.toUpperCase()}`,
      category_id: id(`cat:${i.category}`),
      type: i.type,
      base_unit: i.unit,
      min_stock: min,
      is_active: true,
      is_sellable: i.salePrice != null,
      sale_price: i.salePrice ?? null,
      purchase_reference_unit_cost_without_vat: manual,
      purchase_reference_unit_cost_with_vat: manual == null ? null : r6(manual * (1 + i.vat / 100)),
    };
  });

  // ── Compras semanais por fornecedor ──
  const invoices: Row[] = [];
  const invoiceLines: Row[] = [];
  const reviews: Row[] = [];
  const reviewLines: Row[] = [];
  const movements: Row[] = [];
  const presentations: Row[] = [];
  const purchaseFrom = addDays(today, -DAYS_PURCHASES);
  let invoiceSeq = 1000;
  scenario.suppliers.forEach((s, sIdx) => {
    const supplied = scenario.ingredients.filter((i) => i.supplier === s.key && isBought(i));
    const bought = new Map<string, number>();
    for (const i of supplied) {
      presentations.push({
        id: id(`pres:${s.key}:${i.key}`),
        supplier_id: id(`sup:${s.key}`),
        match_key: i.name.toLowerCase(),
        supplier_reference: `${s.key.slice(0, 3).toUpperCase()}-${i.key.toUpperCase()}`,
        description: `${i.name} (${i.pack!.unit} ${i.pack!.content} ${i.unit})`,
        stock_item_id: itemId(i.key),
        package_unit: i.pack!.unit,
        content_quantity: i.pack!.content,
        content_unit: i.unit,
        invoiced_by: i.pack!.invoicedBy,
        min_order_packages: 1,
        order_increment_packages: 1,
        source: "document",
        confidence: 1,
        created_by: "demonstração",
      });
    }
    const deliveryDays = daysBetween(purchaseFrom, salesTo).filter((d) => weekday(d) === s.deliveryWeekday);
    deliveryDays.forEach((day, dIdx) => {
      const isLast = dIdx === deliveryDays.length - 1;
      const weekIndex = Math.min(11, Math.floor((DAYS_PURCHASES - (Date.parse(`${today}T12:00:00Z`) - Date.parse(`${day}T12:00:00Z`)) / 86_400_000) / 7));
      const invoiceId = id(`inv:${s.key}:${day}`);
      const reviewId = id(`rev:${s.key}:${day}`);
      const number = `FT DEMO${sIdx + 1}/${invoiceSeq++}`;
      const lines: Row[] = [];
      let net = 0;
      let vatSum = 0;
      for (const i of supplied) {
        // Cobre o consumo até à próxima entrega, descontando o que ainda há em stock (como um comprador faria).
        const stockBefore = openingOf(i) + (bought.get(i.key) ?? 0) - used(i.key, salesFrom, addDays(day, -1));
        let need = used(i.key, day, addDays(day, 6)) * 1.03 + minOf(i) * 1.2 - stockBefore;
        // Artigos «stock baixo»: a última entrega vem curta e acabam a metade do mínimo (alertas e reposição).
        if (isLast && i.lowStock) need = minOf(i) * 0.5 + used(i.key, day, salesTo) - stockBefore;
        if (need <= 0) continue;
        const pack = i.pack!;
        const packages = Math.max(1, Math.ceil(need / pack.content));
        const baseQty = packages * pack.content;
        bought.set(i.key, (bought.get(i.key) ?? 0) + baseQty);
        const pf = PRICING_FACTOR[i.unit];
        const noise = 1 + (unit(seed, `price:${i.key}:${day}`) - 0.5) * 0.04;
        const pricePerPricingUnit = i.price * trendFactor(i.trend, weekIndex) * noise;
        const byPackage = pack.invoicedBy === "package";
        const purchaseQty = byPackage ? packages : r3(baseQty / pf);
        const conversion = byPackage ? pack.content : pf;
        const unitCents = Math.round(pricePerPricingUnit * (byPackage ? pack.content / pf : 1) * 100);
        const gross = Math.round(purchaseQty * unitCents);
        const discount = Math.round((gross * s.discountPct) / 100);
        const lineNet = gross - discount;
        const lineVat = Math.round((lineNet * i.vat) / 100);
        const total = lineNet + lineVat;
        net += lineNet;
        vatSum += lineVat;
        const lineId = id(`il:${s.key}:${day}:${i.key}`);
        const rlId = id(`rl:${s.key}:${day}:${i.key}`);
        const reference = `${s.key.slice(0, 3).toUpperCase()}-${i.key.toUpperCase()}`;
        const description = `${i.name} ${byPackage ? `(${pack.unit} ${pack.content} ${i.unit})` : ""}`.trim();
        lines.push({
          id: lineId, invoice_id: invoiceId, description, quantity: purchaseQty, unit: byPackage ? pack.unit : PRICING_UNIT[i.unit],
          unit_cost_without_vat: unitCents, vat_rate: i.vat, vat_amount: lineVat, total_with_vat: total, stock_item_id: itemId(i.key), location_id: locationId,
          gross_cents: gross, discount_kind: "pct", discount_value: s.discountPct || null, discount_cents: discount || null, net_cents: lineNet, supplier_item_code: reference,
        });
        reviewLines.push({
          id: rlId, review_id: reviewId, invoice_line_id: lineId, description, purchase_quantity: purchaseQty, purchase_unit: byPackage ? pack.unit : PRICING_UNIT[i.unit],
          unit_cost_without_vat: unitCents, total_with_vat: total, vat_amount: lineVat, resolution_type: "existing_item", stock_item_id: itemId(i.key),
          conversion_factor: conversion, stock_quantity: baseQty, location_id: locationId,
          unit_cost_per_base_unit_without_vat: r6(lineNet / baseQty), unit_cost_per_base_unit_with_vat: r6(total / baseQty),
          resolved_by: "demonstração", resolved_at: `${day}T11:00:00.000Z`, supplier_item_code: reference,
        });
        movements.push({
          id: id(`mv:p:${s.key}:${day}:${i.key}`), item_id: itemId(i.key), type: "purchase", quantity: baseQty, location_id: locationId,
          unit_cost_per_base_unit_without_vat: r6(lineNet / baseQty / 100), unit_cost_per_base_unit_with_vat: r6(total / baseQty / 100),
          reason: "Compra confirmada (demonstração)", reference: number, movement_date: `${day}T11:00:00.000Z`, created_by: "demonstração",
          purchase_review_id: reviewId, review_line_id: rlId,
        });
      }
      if (lines.length === 0) return;
      invoices.push({
        id: invoiceId, supplier_id: id(`sup:${s.key}`), supplier_name: s.name, invoice_number: number, invoice_date: day, due_date: addDays(day, 30),
        subtotal_without_vat: net, total_vat: vatSum, total_with_vat: net + vatSum, line_detail_mode: "detailed", document_type: "invoice",
        stock_review_override: "auto", notes: "Fatura fictícia (demonstração do Stock).",
      });
      invoiceLines.push(...lines);
      reviews.push({
        id: reviewId, invoice_id: invoiceId, status: "applied", source_hash: `demo:${invoiceId}`, decision_source: "supplier", decision_supplier_id: id(`sup:${s.key}`),
        decision_policy_used: "CREATE_REVIEW", decision_at: `${day}T10:00:00.000Z`, supplier_name: s.name, invoice_number: number, invoice_date: day,
        location_id: locationId, applied_at: `${day}T11:00:00.000Z`, invoice_net_cents: net, invoice_vat_cents: vatSum, invoice_total_cents: net + vatSum, origin: "finance",
      });
    });
  });

  // ── Stock inicial e baixas diárias pelas vendas ──
  const openingDay = addDays(today, -DAYS_SALES - 1);
  for (const i of scenario.ingredients) {
    const qty = openingOf(i);
    if (qty > 0) {
      movements.push({ id: id(`mv:o:${i.key}`), item_id: itemId(i.key), type: "adjustment", quantity: qty, location_id: locationId, reason: "Stock inicial (demonstração)", reference: "Contagem inicial", movement_date: `${openingDay}T09:00:00.000Z`, created_by: "demonstração" });
    }
    for (const [day, q] of consumption.get(i.key) ?? []) {
      const quantity = r3(q);
      if (quantity <= 0) continue;
      movements.push({ id: id(`mv:c:${i.key}:${day}`), item_id: itemId(i.key), type: "consumption", quantity: -quantity, location_id: locationId, reason: "Baixa por vendas — CaixaFlow POS (fictício)", reference: `CaixaFlow:${day}`, movement_date: `${day}T22:00:00.000Z`, created_by: "demonstração" });
    }
  }

  // ── Fichas técnicas, PVP e referências do POS ──
  const preparations = scenario.preparations.map((p) => ({ id: id(`prep:${p.key}`), name: p.name, description: null, yield_qty: p.yieldQty, yield_unit: p.yieldUnit, use_as_unit: !!p.asUnit, is_active: true }));
  const preparationItems = scenario.preparations.flatMap((p) => p.items.map(([k, q]) => ({ id: id(`pi:${p.key}:${k}`), preparation_id: id(`prep:${p.key}`), stock_item_id: itemId(k), quantity: q })));
  const dishes = scenario.dishes.map((d) => ({ id: id(`dish:${d.key}`), name: d.name, description: "", category: d.category, is_active: true }));
  const prices = scenario.dishes.flatMap((d) => sizesOf(d).map((s) => ({ id: id(`price:${d.key}:${s}`), pizza_id: id(`dish:${d.key}`), size: s, price: d.prices[s] })));
  const recipes = scenario.dishes.map((d) => ({ id: id(`recipe:${d.key}`), pizza_id: id(`dish:${d.key}`), version: 1, is_active: true, notes: "Ficha fictícia (demonstração)." }));
  const recipeItems = scenario.dishes.flatMap((d) =>
    d.lines.flatMap((l, li) =>
      sizesOf(d).flatMap((s) => {
        const q = lineQty(l, s);
        if (!q) return [];
        return [{ id: id(`ri:${d.key}:${li}:${s}`), recipe_id: id(`recipe:${d.key}`), stock_item_id: l[0] === "i" ? itemId(l[1]) : null, preparation_id: l[0] === "p" ? id(`prep:${l[1]}`) : null, size: s, quantity: q, waste_factor: null, is_optional: false }];
      }),
    ),
  );
  const mappings = products.map((p) =>
    p.kind === "item"
      ? { id: id(`map:${p.reference}`), match_by: "reference", match_value: p.reference, target_type: "stock", stock_item_id: p.stockItemId }
      : { id: id(`map:${p.reference}`), match_by: "reference", match_value: p.reference, target_type: "pizza", pizza_id: p.pizzaId, pizza_size: p.size },
  );

  return {
    historyFrom,
    tables: [
      { table: "stock_categories", rows: stockCategories },
      { table: "stock_items", rows: stockItems },
      { table: "suppliers", rows: supplierRows },
      { table: "supplier_purchase_presentations", rows: presentations },
      { table: "preparations", rows: preparations },
      { table: "preparation_items", rows: preparationItems },
      { table: "pizzas", rows: dishes },
      { table: "pizza_prices", rows: prices },
      { table: "pizza_recipes", rows: recipes },
      { table: "pizza_recipe_items", rows: recipeItems },
      { table: "vendus_product_mapping", rows: mappings },
      { table: "invoices", rows: invoices },
      { table: "invoice_lines", rows: invoiceLines },
      { table: "stock_purchase_reviews", rows: reviews },
      { table: "stock_review_lines", rows: reviewLines },
      { table: "stock_movements", rows: movements },
      { table: "sales_demand_actuals_daily", rows: demandRows },
      { table: "menu_costing_settings", rows: [{ sales_vat_rate: scenario.salesVatRate, updated_by: "demonstração" }] },
      { table: "stock_settings", rows: [{ default_location_id: locationId, updated_by: "demonstração" }] },
    ],
    summary: {
      items: stockItems.length,
      suppliers: supplierRows.length,
      invoices: invoices.length,
      dishes: dishes.length,
      preparations: preparations.length,
      salesCents30d,
      movements: movements.length,
    },
  };
}

export type { IngredientDef };
