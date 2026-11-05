// Valida a migração do POS (fase 1) num Postgres 17 real (PGlite).
// Uso (na pasta com @electric-sql/pglite e apply-chain.mjs): node validate-pos.mjs <repo-backend>
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyChain } from "./apply-chain.mjs";

const repo = process.argv[2];
const MIG = readFileSync(join(repo, "supabase/migrations/20261221100000_pos_phase1.sql"), "utf8");
const RB = readFileSync(join(repo, "docs/migrations/rollback/20261221100000_pos_phase1.sql"), "utf8");
const db = new PGlite();
let passed = 0;
const failures = [];
const check = (name, cond, detail = "") => (cond ? passed++ : failures.push(`${name} ${detail}`));
async function asRole(role, name, sql, pattern) {
  try { await db.exec(`begin; set local role ${role}; ${sql}; commit;`); if (pattern) failures.push(`${name}: esperava erro /${pattern}/, passou`); else passed++; }
  catch (e) { await db.exec("rollback;").catch(() => {}); if (pattern && new RegExp(pattern, "i").test(e.message)) passed++; else failures.push(`${name}: «${e.message}»`); }
}

await applyChain(db, join(repo, "supabase/migrations"));
try { await db.exec(MIG); passed++; } catch (e) { failures.push(`reaplicar: ${e.message}`); }

const org = (await db.query(`insert into organizations (name, nif) values ('Org Teste', '599999999') returning id`)).rows[0].id;
const le = (await db.query(
  `insert into legal_entities (org_id, name, country, tax_id_type, tax_id, social_security_id, billing_email, street, postal_code, city, region, created_by)
   values ($1, 'Empresa Fictícia, Lda', 'PT', 'nif', '599999999', '20000000000', 'f@example.invalid', 'Rua A', '4000-001', 'Porto', 'Porto', 't') returning id`, [org])).rows[0].id;
const FR = (await db.query(`insert into invoicing_series (org_id, legal_entity_id, document_type, series_id, mode, validation_code, created_by) values ($1, $2, 'FR', 'POS-2027', 'training', 'CDF7T5HD', 't') returning id`, [org, le])).rows[0].id;
const line = { line_number: 1, product_code: "VPIZ1", product_type: "P", unit_of_measure: "UN", description: "Pizza", quantity: "1", unit_price: "12.5", line_amount: "12.5", tax_region: "PT", tax_code: "INT", tax_percentage: "13" };
const taxes = [{ tax_region: "PT", tax_code: "INT", tax_percentage: "13", taxable_base: "11.06", tax_amount: "1.44" }];
const doc = { sequence: 1, document_number: "FR POS-2027/1", atcud: "CDF7T5HD-1", document_date: "2027-03-10", tax_point_date: "2027-03-10", system_entry_date: "2027-03-10T12:00:00", system_entry_at: "2027-03-10T12:00:00Z", software_certificate_number: "0", hash: "a".repeat(171) + "=", key_version: 1, qr_payload: "q", prices_include_tax: true, net_total: "11.06", tax_payable: "1.44", gross_total: "12.50", payment_mechanism: "NU", customer: { taxId: "999999990", name: "Consumidor final" }, issuer: { taxId: "599999999", name: "Empresa Fictícia, Lda" } };
const docId = (await db.query(`select fn_invoicing_issue_document($1, $2, 0, null, $3, $4, $5, 'u') as id`, [org, FR, JSON.stringify(doc), JSON.stringify([line]), JSON.stringify(taxes)])).rows[0].id;

const sale = (await db.query(
  `insert into pos_sales (org_id, kind, document_id, document_number, employee_id, employee_name, payment_method, total_cents, given_cents, change_cents, lines)
   values ($1, 'sale', $2, 'FR POS-2027/1', gen_random_uuid(), 'Ana', 'cash', 1250, 2000, 750, '[]') returning id`, [org, docId])).rows[0].id;
check("venda registada", !!sale);
await asRole("postgres", "devolução sem motivo", `insert into pos_sales (org_id, kind, document_id, document_number, employee_id, employee_name, payment_method, total_cents, refund_of, lines) values ('${org}', 'refund', '${docId}', 'NC 1', gen_random_uuid(), 'Rui', 'cash', 100, '${sale}', '[]')`, "pos_sales_refund_ck");
await asRole("postgres", "venda com documento de outra organização", `insert into pos_sales (org_id, kind, document_id, document_number, employee_id, employee_name, payment_method, total_cents, lines) values (gen_random_uuid(), 'sale', '${docId}', 'X', gen_random_uuid(), 'Ana', 'card', 1, '[]')`, "foreign key|violates");
await asRole("service_role", "service_role não altera venda", `update pos_sales set total_cents = 1`, "permission denied");
await asRole("postgres", "dono não apaga venda (trigger)", `delete from pos_sales`, "imutável");
await asRole("authenticated", "browser não escreve produtos", `insert into pos_products (org_id, ref, name, price_cents, vat_rate) values ('${org}', 'X', 'Teste', 100, 13)`, "permission denied");
await asRole("service_role", "service_role grava produtos", `insert into pos_products (org_id, ref, name, price_cents, vat_rate) values ('${org}', 'V1', 'Pizza', 990, 13)`);
await asRole("service_role", "IVA fora de 6/13/23", `insert into pos_products (org_id, ref, name, price_cents, vat_rate) values ('${org}', 'V2', 'Pizza', 990, 18)`, "check constraint");
await asRole("service_role", "referência repetida na organização", `insert into pos_products (org_id, ref, name, price_cents, vat_rate) values ('${org}', 'V1', 'Outra', 990, 13)`, "pos_products_ref_uq");
await asRole("service_role", "imagem sem https", `insert into pos_products (org_id, ref, name, price_cents, vat_rate, image_url) values ('${org}', 'V3', 'Pizza', 990, 13, 'http://x')`, "check constraint");

try { await db.exec(RB); passed++; } catch (e) { failures.push(`rollback: ${e.message}`); }
check("rollback remove as tabelas", (await db.query(`select count(*)::int n from information_schema.tables where table_name like 'pos_%'`)).rows[0].n === 0);
check("rollback mantém os documentos", (await db.query(`select count(*)::int n from invoicing_documents`)).rows[0].n === 1);
try { await db.exec(MIG); passed++; } catch (e) { failures.push(`reaplicar após rollback: ${e.message}`); }

console.log(`${passed} verificações OK, ${failures.length} falhas`);
for (const f of failures) console.log(" ✗ " + f);
process.exit(failures.length ? 1 : 0);
