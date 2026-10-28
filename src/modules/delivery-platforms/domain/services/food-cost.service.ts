import {
  PACKAGING_KEYS,
  type DishCostOption,
  type FoodCost,
  type FoodCostLine,
  type ItemCostOption,
  type PackagingKey,
  type PackagingLine,
  type ProductMapping,
  type ResolvedTarget,
} from "../entities/food-cost.js";
import type { SoldProduct } from "../entities/platform-statement.js";
import type { StoredPlatformStatement } from "../ports/out/platform-statement-repository.port.js";

const SIZE_LABEL: Record<string, string> = { xs: "XS", small: "Pequena", large: "Grande" };

/** Chave de um produto: minúsculas, sem acentos, «&» = «e», espaços simples. */
export function productKey(description: string): string {
  return description
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/\s*&\s*/g, " e ")
    .replace(/[-_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Para comparar nomes: além da chave, sem «+», sem letras repetidas («pepperoni» = «peperoni»). */
const compareKey = (s: string) => productKey(s).replace(/\+/g, "").replace(/(.)\1+/g, "$1").replace(/\s+/g, " ").trim();
const tokens = (s: string) => new Set(compareKey(s).split(" ").filter(Boolean));

/** Sugestão pelo nome: upgrade, prato (XS / «Focaccia de …»), artigo de stock com nome parecido, ou nada. */
export function suggestTarget(
  description: string,
  netCents: number,
  dishes: DishCostOption[],
  items: ItemCostOption[],
): Omit<ResolvedTarget, "source"> | null {
  const key = compareKey(description);
  if (netCents === 0) return { targetType: "ignore", pizzaId: null, size: null, stockItemId: null, label: "Ignorar (sem valor)" };
  if (/\bupgrade\b/.test(key)) return { targetType: "upgrade_large", pizzaId: null, size: null, stockItemId: null, label: "Upgrade para Grande" };
  const xs = /\bxs\b/.test(key);
  const bare = key.replace(/\bxs\b/g, "").replace(/^focacia de /, "").replace(/\s+/g, " ").trim();
  const dish = dishes.find((d) => compareKey(d.name) === bare || compareKey(d.name) === key);
  if (dish) {
    const size = xs ? "xs" : "small";
    return { targetType: "dish", pizzaId: dish.pizzaId, size, stockItemId: null, label: `${dish.name} (${SIZE_LABEL[size]})` };
  }
  // Artigo: todas as palavras de um contidas nas do outro; o mais parecido (menos palavras a mais).
  const mine = tokens(description);
  const candidates = items
    .map((i) => {
      const theirs = tokens(i.name);
      const inter = [...mine].filter((t) => theirs.has(t)).length;
      const contained = inter === mine.size || inter === theirs.size;
      return { i, score: contained && inter >= 2 ? inter / (mine.size + theirs.size - inter) : 0 };
    })
    .filter((c) => c.score >= 0.5)
    .sort((a, b) => b.score - a.score);
  if (candidates.length > 0 && (candidates.length === 1 || candidates[0]!.score > candidates[1]!.score)) {
    const { i } = candidates[0]!;
    return { targetType: "item", pizzaId: null, size: null, stockItemId: i.stockItemId, label: i.name };
  }
  return null;
}

const PACKAGING: { key: PackagingKey; label: string; name: string }[] = [
  { key: PACKAGING_KEYS.boxSmall, label: "Caixa por pizza pequena", name: "caixa s" },
  { key: PACKAGING_KEYS.boxLarge, label: "Caixa por pizza grande (upgrade)", name: "caixa l" },
  { key: PACKAGING_KEYS.bag, label: "Saco por pedido", name: "sacolas delivery" },
  { key: PACKAGING_KEYS.napkin, label: "Guardanapo por pedido", name: "guardanapo delivery" },
];

const inMonth = (p: SoldProduct, from: string, to: string) => p.date >= from && p.date <= to;
/** Custo por unidade de embalagem acima do qual se avisa (provavelmente o preço do pacote). */
const PACKAGING_UNIT_ALERT_CENTS = 100;

/**
 * Custo da comida e da embalagem do delivery no mês: os produtos do SAF-T (do mês) ligados ao que lhes
 * corresponde — mapeamento gravado, senão sugestão pelo nome. Pizza = Pequena; cada «Upgrade para L»
 * soma a diferença Grande − Pequena (média pela mistura do mês). Embalagem: caixa S por pizza pequena,
 * caixa L por upgrade, saco e guardanapo por pedido. Os produtos sem custo conhecido estimam-se pela %
 * dos que o têm (assinalado).
 */
export function computeFoodCost(
  year: number,
  month: number,
  statements: StoredPlatformStatement[],
  mappings: ProductMapping[],
  dishes: DishCostOption[],
  items: ItemCostOption[],
): FoodCost {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const to = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const safts = statements.filter((s) => s.documentKind === "airmenu_saft");

  // Produtos do mês, juntos pela chave.
  const byKey = new Map<string, { code: string; description: string; quantity: number; netCents: number }>();
  for (const p of safts.flatMap((s) => s.products ?? []).filter((p) => inMonth(p, from, to))) {
    const k = productKey(p.description);
    const a = byKey.get(k) ?? { code: p.code, description: p.description, quantity: 0, netCents: 0 };
    a.quantity += p.quantity;
    a.netCents += p.netCents;
    byKey.set(k, a);
  }
  // Pedidos do mês: documentos do SAF-T, na parte do mês (pelas vendas diárias).
  const ordersCount = Math.round(
    safts.reduce((acc, s) => {
      const sales = s.lines.filter((l) => l.kind === "sales");
      const total = sales.reduce((a, l) => a + l.grossCents, 0);
      const own = sales.filter((l) => !l.date || (l.date >= from && l.date <= to)).reduce((a, l) => a + l.grossCents, 0);
      return acc + (total > 0 ? ((s.ordersCount ?? 0) * own) / total : 0);
    }, 0),
  );

  const manual = new Map(mappings.map((m) => [m.productKey, m]));
  const dishById = new Map(dishes.map((d) => [d.pizzaId, d]));
  const itemById = new Map(items.map((i) => [i.stockItemId, i]));
  const dishSize = (pizzaId: string | null, size: string | null) => dishById.get(pizzaId ?? "")?.sizes.find((s) => s.size === size) ?? null;

  const resolve = (key: string, description: string, netCents: number): ResolvedTarget | null => {
    const m = manual.get(key);
    if (m) {
      const label =
        m.targetType === "dish"
          ? `${dishById.get(m.pizzaId ?? "")?.name ?? "Prato removido"} (${SIZE_LABEL[m.size ?? ""] ?? m.size})`
          : m.targetType === "item"
            ? (itemById.get(m.stockItemId ?? "")?.name ?? "Artigo removido")
            : m.targetType === "upgrade_large"
              ? "Upgrade para Grande"
              : "Ignorar";
      return { targetType: m.targetType, pizzaId: m.pizzaId, size: m.size, stockItemId: m.stockItemId, label, source: "manual" };
    }
    const s = suggestTarget(description, netCents, dishes, items);
    return s ? { ...s, source: "auto" } : null;
  };

  const drafts = [...byKey.entries()].map(([key, p]) => ({ key, ...p, target: resolve(key, p.description, p.netCents) }));

  // Upgrade: diferença Grande − Pequena, média ponderada pelas pizzas pequenas vendidas.
  let upgradeWeight = 0;
  let upgradeSum = 0;
  let upgradeComplete = true;
  for (const d of drafts.filter((x) => x.target?.targetType === "dish" && x.target.size === "small" && x.quantity > 0)) {
    const s = dishSize(d.target!.pizzaId, "small");
    const l = dishSize(d.target!.pizzaId, "large");
    if (!s || !l) continue;
    upgradeSum += (l.costCents - s.costCents) * d.quantity;
    upgradeWeight += d.quantity;
    upgradeComplete &&= s.complete && l.complete;
  }
  const upgradeUnit = upgradeWeight > 0 ? Math.round(upgradeSum / upgradeWeight) : null;

  const lines: FoodCostLine[] = drafts
    .map((d): FoodCostLine => {
      let unit: number | null = null;
      let complete = false;
      const t = d.target;
      if (t?.targetType === "dish") {
        const s = dishSize(t.pizzaId, t.size);
        unit = s ? s.costCents : null;
        complete = !!s?.complete;
      } else if (t?.targetType === "item") {
        unit = itemById.get(t.stockItemId ?? "")?.unitCostCents ?? null;
        complete = unit !== null;
      } else if (t?.targetType === "upgrade_large") {
        unit = upgradeUnit;
        complete = upgradeUnit !== null && upgradeComplete;
      } else if (t?.targetType === "ignore") {
        unit = 0;
        complete = true;
      }
      return {
        productKey: d.key,
        code: d.code,
        description: d.description,
        quantity: d.quantity,
        netCents: d.netCents,
        target: t,
        unitCostCents: unit,
        costCents: unit === null ? null : Math.round(unit * d.quantity),
        complete,
      };
    })
    .sort((a, b) => b.netCents - a.netCents);

  const counted = lines.filter((l) => l.target?.targetType !== "ignore");
  const qtyOf = (type: string, size?: string) =>
    counted.filter((l) => l.target?.targetType === type && (size === undefined || l.target.size === size)).reduce((a, l) => a + l.quantity, 0);
  const upgrades = qtyOf("upgrade_large");
  const pizzas = qtyOf("dish", "small") + qtyOf("dish", "xs");
  const packagingQty: Record<PackagingKey, number> = {
    [PACKAGING_KEYS.boxSmall]: Math.max(0, pizzas - upgrades),
    [PACKAGING_KEYS.boxLarge]: upgrades,
    [PACKAGING_KEYS.bag]: ordersCount,
    [PACKAGING_KEYS.napkin]: ordersCount,
  };
  const packaging: PackagingLine[] = PACKAGING.map(({ key, label, name }) => {
    const m = manual.get(key);
    const item = m?.stockItemId ? itemById.get(m.stockItemId) : items.find((i) => compareKey(i.name) === compareKey(name));
    const unit = item?.unitCostCents ?? null;
    const quantity = packagingQty[key];
    return {
      key,
      label,
      item: item ? { stockItemId: item.stockItemId, name: item.name, source: m ? "manual" : "auto" } : null,
      quantity,
      unitCostCents: unit,
      costCents: unit === null ? null : Math.round(unit * quantity),
    };
  });

  const revenueNetCents = counted.reduce((a, l) => a + l.netCents, 0);
  const costed = counted.filter((l) => l.costCents !== null);
  const costedRevenueNetCents = costed.reduce((a, l) => a + l.netCents, 0);
  const productsCostCents = costed.reduce((a, l) => a + l.costCents!, 0);
  const uncostedRevenue = revenueNetCents - costedRevenueNetCents;
  const extrapolatedCostCents = costedRevenueNetCents > 0 ? Math.round((productsCostCents * uncostedRevenue) / costedRevenueNetCents) : 0;
  const packagingCostCents = packaging.reduce((a, p) => a + (p.costCents ?? 0), 0);
  const totalCostCents = productsCostCents + extrapolatedCostCents + packagingCostCents;

  const warnings: string[] = [];
  const unmapped = counted.filter((l) => !l.target);
  if (unmapped.length > 0) {
    warnings.push(`${unmapped.length} produto(s) sem correspondência (${(unmapped.reduce((a, l) => a + l.netCents, 0) / 100).toFixed(2)} € de vendas): custo estimado pela % dos outros.`);
  }
  const noPrice = counted.filter((l) => l.target && l.costCents === null);
  if (noPrice.length > 0) warnings.push(`${noPrice.length} produto(s) sem custo (ficha ou artigo sem preço): custo estimado pela % dos outros.`);
  const partial = counted.filter((l) => l.costCents !== null && !l.complete);
  if (partial.length > 0) warnings.push(`${partial.length} produto(s) com ficha técnica incompleta (ingredientes sem preço): custo subavaliado.`);
  for (const p of packaging.filter((x) => x.unitCostCents !== null && x.unitCostCents > PACKAGING_UNIT_ALERT_CENTS)) {
    warnings.push(`${p.label}: «${p.item!.name}» custa ${(p.unitCostCents! / 100).toFixed(2)} € por unidade — confirme no Stock se não é o preço do pacote.`);
  }
  for (const p of packaging.filter((x) => x.quantity > 0 && x.costCents === null)) {
    warnings.push(`${p.label}: ${p.item ? `«${p.item.name}» sem custo — preencha o custo no Stock` : "artigo não encontrado"}.`);
  }
  if (safts.length === 0 || byKey.size === 0) warnings.push("Sem SAF-T do AirMenu com produtos neste mês: importe-o para calcular o custo real.");

  return {
    period: { year, month, from, to },
    hasProducts: byKey.size > 0,
    ordersCount,
    revenueNetCents,
    costedRevenueNetCents,
    productsCostCents,
    extrapolatedCostCents,
    packagingCostCents,
    totalCostCents,
    foodCostPct: costedRevenueNetCents > 0 && revenueNetCents > 0 ? Math.round((totalCostCents / revenueNetCents) * 1000) / 10 : null,
    complete: unmapped.length === 0 && noPrice.length === 0 && partial.length === 0 && packaging.every((p) => p.quantity === 0 || p.costCents !== null),
    lines,
    packaging,
    targets: {
      dishes: dishes.map((d) => ({ pizzaId: d.pizzaId, name: d.name })).sort((a, b) => a.name.localeCompare(b.name)),
      items: items.map((i) => ({ stockItemId: i.stockItemId, name: i.name })).sort((a, b) => a.name.localeCompare(b.name)),
    },
    warnings,
  };
}
