// Valida a migração do POS (fase 2: stock, código de barras, vistas) num Postgres 17 real (PGlite).
// Uso (na pasta com @electric-sql/pglite e apply-chain.mjs): node validate-pos2.mjs <repo-backend>
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyChain } from "./apply-chain.mjs";

const repo = process.argv[2];
const MIG = readFileSync(join(repo, "supabase/migrations/20261221110000_pos_phase2.sql"), "utf8");
const RB = readFileSync(join(repo, "docs/migrations/rollback/20261221110000_pos_phase2.sql"), "utf8");
const db = new PGlite();
let passed = 0;
const failures = [];
const check = (name, cond, detail = "") => (cond ? passed++ : failures.push(`${name} ${detail}`));
async function asRole(role, name, sql, pattern) {
  try { await db.exec(`begin; set local role ${role}; ${sql}; commit;`); if (pattern) failures.push(`${name}: esperava erro /${pattern}/, passou`); else passed++; }
  catch (e) { await db.exec("rollback;").catch(() => {}); if (pattern && new RegExp(pattern, "i").test(e.message)) passed++; else failures.push(`${name}: «${e.message}»`); }
}
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];

await applyChain(db, join(repo, "supabase/migrations"));
try { await db.exec(MIG); passed++; } catch (e) { failures.push(`reaplicar: ${e.message}`); }

const org = (await one(`insert into organizations (name, nif) values ('Org Teste', '599999999') returning id`)).id;
const org2 = (await one(`insert into organizations (name, nif) values ('Org Dois', '599999998') returning id`)).id;
const le = (await one(
  `insert into legal_entities (org_id, name, country, tax_id_type, tax_id, social_security_id, billing_email, street, postal_code, city, region, created_by)
   values ($1, 'Empresa Fictícia, Lda', 'PT', 'nif', '599999999', '20000000000', 'f@example.invalid', 'Rua A', '4000-001', 'Porto', 'Porto', 't') returning id`, [org])).id;
const FR = (await one(`insert into invoicing_series (org_id, legal_entity_id, document_type, series_id, mode, validation_code, created_by) values ($1, $2, 'FR', 'POS-2027', 'training', 'CDF7T5HD', 't') returning id`, [org, le])).id;
const line = { line_number: 1, product_code: "VREF", product_type: "P", unit_of_measure: "UN", description: "Refri", quantity: "1", unit_price: "2.5", line_amount: "2.5", tax_region: "PT", tax_code: "NOR", tax_percentage: "23" };
const taxes = [{ tax_region: "PT", tax_code: "NOR", tax_percentage: "23", taxable_base: "2.03", tax_amount: "0.47" }];
let seq = 0;
async function issue() {
  seq++;
  const doc = { sequence: seq, document_number: `FR POS-2027/${seq}`, atcud: `CDF7T5HD-${seq}`, document_date: "2027-03-10", tax_point_date: "2027-03-10", system_entry_date: "2027-03-10T12:00:00", system_entry_at: "2027-03-10T12:00:00Z", software_certificate_number: "0", hash: "a".repeat(171) + "=", key_version: 1, qr_payload: "q", prices_include_tax: true, net_total: "2.03", tax_payable: "0.47", gross_total: "2.50", payment_mechanism: "NU", customer: { taxId: "999999990", name: "Consumidor final" }, issuer: { taxId: "599999999", name: "Empresa Fictícia, Lda" } };
  return (await one(`select fn_invoicing_issue_document($1, $2, $3, $4, $5, $6, $7, 'u') as id`, [org, FR, seq - 1, seq === 1 ? null : "a".repeat(171) + "=", JSON.stringify(doc), JSON.stringify([line]), JSON.stringify(taxes)])).id;
}

const drink = (await one(`insert into pos_products (org_id, ref, name, price_cents, vat_rate, track_stock) values ($1, 'VREF', 'Refrigerante', 250, 23, true) returning id`, [org])).id;
const pizza = (await one(`insert into pos_products (org_id, ref, name, price_cents, vat_rate, track_stock) values ($1, 'VPIZ', 'Pizza', 1850, 13, false) returning id`, [org])).id;
check("produto novo com stock 0", (await one(`select stock_qty from pos_products where id = $1`, [drink])).stock_qty === 0);

// Entrada e contagem
await asRole("service_role", "entrada de 5", `insert into pos_stock_moves (org_id, product_id, kind, qty, actor_name) values ('${org}', '${drink}', 'entry', 5, 'Gestão')`);
check("stock 5 após entrada", (await one(`select stock_qty from pos_products where id = $1`, [drink])).stock_qty === 5);
await asRole("service_role", "contagem para 3", `insert into pos_stock_moves (org_id, product_id, kind, qty, count_to) values ('${org}', '${drink}', 'count', 0, 3)`);
const count = await one(`select qty, stock_before, stock_after from pos_stock_moves where kind = 'count'`);
check("contagem calcula a diferença", count.qty === -2 && count.stock_before === 5 && count.stock_after === 3, JSON.stringify(count));
await asRole("service_role", "entrada a zero recusada", `insert into pos_stock_moves (org_id, product_id, kind, qty) values ('${org}', '${drink}', 'entry', 0)`, "pos_stock_moves_kind_ck");
await asRole("service_role", "produto de outra organização", `insert into pos_stock_moves (org_id, product_id, kind, qty) values ('${org2}', '${drink}', 'entry', 1)`, "produto desconhecido|foreign key");

// Venda: 2 linhas do refrigerante (2 + 3) e uma pizza → um movimento de −5; stock 3 → −2 (alerta)
const doc1 = await issue();
const lines = [
  { lineNumber: 1, productId: drink, quantity: 2 },
  { lineNumber: 2, productId: pizza, quantity: 1 },
  { lineNumber: 3, productId: drink, quantity: 3 },
];
const sale = (await one(
  `insert into pos_sales (org_id, kind, document_id, document_number, employee_id, employee_name, payment_method, total_cents, lines)
   values ($1, 'sale', $2, 'FR POS-2027/1', gen_random_uuid(), 'Ana', 'card', 1500, $3) returning id`, [org, doc1, JSON.stringify(lines)])).id;
const saleMoves = (await db.query(`select product_id, qty, stock_before, stock_after, actor_name, document_number from pos_stock_moves where sale_id = $1`, [sale])).rows;
check("venda gera 1 movimento (só o que controla stock, linhas somadas)", saleMoves.length === 1 && saleMoves[0].qty === -5, JSON.stringify(saleMoves));
check("stock fica negativo (-2) com o antes registado", saleMoves[0]?.stock_before === 3 && saleMoves[0]?.stock_after === -2);
check("movimento com funcionário e documento", saleMoves[0]?.actor_name === "Ana" && saleMoves[0]?.document_number === "FR POS-2027/1");
check("pizza sem movimento", (await one(`select count(*)::int n from pos_stock_moves where product_id = $1`, [pizza])).n === 0);

// Devolução de 1 → volta ao stock
const doc2 = await issue();
await db.query(
  `insert into pos_sales (org_id, kind, document_id, document_number, employee_id, employee_name, payment_method, total_cents, refund_of, reason, lines)
   values ($1, 'refund', $2, 'NC POS/1', gen_random_uuid(), 'Rui', 'card', 250, $3, 'Devolução do cliente', $4)`, [org, doc2, sale, JSON.stringify([{ lineNumber: 1, productId: drink, quantity: 1 }])]);
check("devolução volta ao stock (-1)", (await one(`select stock_qty from pos_products where id = $1`, [drink])).stock_qty === -1);

// Integridade
await asRole("service_role", "contador não se altera à mão", `update pos_products set stock_qty = 100 where id = '${drink}'`, "só muda por movimentos");
await asRole("service_role", "outros campos do produto continuam editáveis", `update pos_products set price_cents = 260 where id = '${drink}'`);
await asRole("service_role", "upsert do CSV não mexe no stock", `insert into pos_products (org_id, ref, name, price_cents, vat_rate, track_stock) values ('${org}', 'VREF', 'Refrigerante 33cl', 270, 23, true) on conflict (org_id, ref) do update set name = excluded.name, price_cents = excluded.price_cents`);
check("stock intacto depois do upsert", (await one(`select stock_qty from pos_products where id = $1`, [drink])).stock_qty === -1);
await asRole("service_role", "service_role não altera movimentos", `update pos_stock_moves set qty = 1`, "permission denied");
await asRole("postgres", "dono não apaga movimentos (trigger)", `delete from pos_stock_moves`, "imutável");
await asRole("authenticated", "browser não escreve movimentos", `insert into pos_stock_moves (org_id, product_id, kind, qty) values ('${org}', '${drink}', 'entry', 1)`, "permission denied");
await asRole("service_role", "venda com sale_id é obrigatório", `insert into pos_stock_moves (org_id, product_id, kind, qty) values ('${org}', '${drink}', 'sale', -1)`, "pos_stock_moves_kind_ck");

// Código de barras e vistas
await asRole("service_role", "código de barras", `update pos_products set barcode = '5601234567890' where id = '${drink}'`);
await asRole("service_role", "código de barras repetido na organização", `update pos_products set barcode = '5601234567890' where id = '${pizza}'`, "pos_products_barcode_uq");
await asRole("service_role", "código de barras inválido", `update pos_products set barcode = 'ab c' where id = '${pizza}'`, "pos_products_barcode_ck");
await asRole("service_role", "vista por omissão B", `insert into pos_settings (org_id, default_view) values ('${org}', 'B')`);
await asRole("service_role", "vista inválida", `update pos_settings set default_view = 'C'`, "pos_settings_default_view_ck");
await asRole("service_role", "vista do funcionário", `insert into pos_employee_prefs (org_id, employee_id, view) values ('${org}', gen_random_uuid(), 'B')`);
await asRole("authenticated", "browser não escreve vistas", `insert into pos_employee_prefs (org_id, employee_id, view) values ('${org}', gen_random_uuid(), 'A')`, "permission denied");

try { await db.exec(MIG); passed++; } catch (e) { failures.push(`reaplicar com dados: ${e.message}`); }
try { await db.exec(RB); passed++; } catch (e) { failures.push(`rollback: ${e.message}`); }
check("rollback remove movimentos e vistas", (await one(`select count(*)::int n from information_schema.tables where table_name in ('pos_stock_moves', 'pos_employee_prefs')`)).n === 0);
check("rollback mantém produtos e vendas", (await one(`select (select count(*) from pos_products)::int p, (select count(*) from pos_sales)::int s`)).s === 2);
check("rollback remove o contador", (await one(`select count(*)::int n from information_schema.columns where table_name = 'pos_products' and column_name in ('stock_qty', 'barcode')`)).n === 0);
const doc3 = await issue();
await asRole("service_role", "venda depois do rollback continua a funcionar", `insert into pos_sales (org_id, kind, document_id, document_number, employee_id, employee_name, payment_method, total_cents, lines) values ('${org}', 'sale', '${doc3}', 'FR 3', gen_random_uuid(), 'Ana', 'cash', 250, '${JSON.stringify([{ lineNumber: 1, productId: drink, quantity: 1 }])}')`);
try { await db.exec(MIG); passed++; } catch (e) { failures.push(`reaplicar após rollback: ${e.message}`); }

console.log(`${passed} verificações OK, ${failures.length} falhas`);
for (const f of failures) console.log(" ✗ " + f);
process.exit(failures.length ? 1 : 0);
