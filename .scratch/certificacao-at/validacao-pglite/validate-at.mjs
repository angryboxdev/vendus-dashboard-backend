// Valida a migração da comunicação à AT (F6) num Postgres 17 real (PGlite).
// Uso: node validate-at.mjs <repo-backend>
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyChain } from "./apply-chain.mjs";

const repo = process.argv[2];
const MIG = readFileSync(join(repo, "supabase/migrations/20261220120000_invoicing_at_communication.sql"), "utf8");
const RB = readFileSync(join(repo, "docs/migrations/rollback/20261220120000_invoicing_at_communication.sql"), "utf8");
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
const FS = (await db.query(
  `insert into invoicing_series (org_id, legal_entity_id, document_type, series_id, mode, validation_code, created_by)
   values ($1, $2, 'FS', 'L01-2027', 'training', 'CDF7T5HD', 't') returning id`, [org, le])).rows[0].id;
const line = { line_number: 1, product_code: "PZ01", product_type: "P", unit_of_measure: "UN", description: "Pizza", quantity: "1", unit_price: "12.5", line_amount: "12.5", tax_region: "PT", tax_code: "INT", tax_percentage: "13" };
const taxes = [{ tax_region: "PT", tax_code: "INT", tax_percentage: "13", taxable_base: "11.06", tax_amount: "1.44" }];
const H = (c) => c.repeat(171) + "=";
const doc = (seq, at, hash) => ({
  sequence: seq, document_number: `FS L01-2027/${seq}`, atcud: `CDF7T5HD-${seq}`, document_date: "2027-03-10", tax_point_date: "2027-03-10",
  system_entry_date: "2027-03-10T12:00:00", system_entry_at: at, software_certificate_number: "0", hash, key_version: 1,
  qr_payload: "q", prices_include_tax: true, net_total: "11.06", tax_payable: "1.44", gross_total: "12.50",
  customer: { taxId: "999999990", name: "Consumidor final" }, issuer: { taxId: "599999999", name: "Empresa Fictícia, Lda" },
});
const issue = async (seq, expHash, at, hash) =>
  (await db.query(`select fn_invoicing_issue_document($1, $2, $3, $4, $5, $6, $7, 'u') as id`, [org, FS, seq - 1, expHash, JSON.stringify(doc(seq, at, hash)), JSON.stringify([line]), JSON.stringify(taxes)])).rows[0].id;
const d1 = await issue(1, null, "2027-03-10T12:00:00Z", H("a"));
const d2 = await issue(2, H("a"), "2027-03-10T12:01:00Z", H("b"));

const queue = async (env = "test") => (await db.query(`select * from fn_invoicing_at_queue($1, $2, 100)`, [org, env])).rows;
const comm = (docId, outcome, status = "N", env = "test", op = "register") =>
  db.query(`insert into invoicing_at_communications (org_id, document_id, environment, operation, document_status, outcome, response_code, response_message, actor)
            values ($1, $2, $3, $4, $5, $6, $7, 'msg', 'u')`, [org, docId, env, op, status, outcome, outcome === "accepted" ? 0 : -99]);

let q = await queue();
check("fila: os dois documentos por comunicar", q.length === 2 && q[0].document_id === d1, JSON.stringify(q.map((r) => r.document_number)));
check("fila: produção ignora séries de formação", (await queue("production")).length === 0);

await comm(d1, "failed");
q = await queue();
check("falha conta e mantém na fila", q.find((r) => r.document_id === d1)?.failures === 1 && q.find((r) => r.document_id === d1)?.last_outcome === "failed");
await comm(d1, "accepted");
q = await queue();
check("aceite sai da fila", q.length === 1 && q[0].document_id === d2, JSON.stringify(q.map((r) => r.document_number)));

await db.query(`select fn_invoicing_cancel_document($1, $2, 'Não entregue', 'u')`, [org, d1]);
q = await queue();
const back = q.find((r) => r.document_id === d1);
check("anulado depois de aceite volta à fila para mudança de estado", back?.accepted_status === "N" && back?.status === "A" && back?.failures === 0, JSON.stringify(back));
await comm(d1, "accepted", "A", "test", "change-status");
check("estado A aceite sai da fila", !(await queue()).some((r) => r.document_id === d1));
check("outro ambiente não conta como comunicado", (await db.query(`select count(*)::int n from fn_invoicing_at_queue($1, 'production', 100)`, [org])).rows[0].n === 0);

// Imutabilidade e privilégios
await asRole("service_role", "service_role insere comunicação", `insert into invoicing_at_communications (org_id, document_id, environment, operation, document_status, outcome, actor) values ('${org}','${d2}','test','register','N','failed','u')`);
await asRole("service_role", "service_role não altera comunicação", `update invoicing_at_communications set outcome = 'accepted'`, "permission denied");
await asRole("service_role", "service_role não apaga comunicação", `delete from invoicing_at_communications`, "permission denied");
await asRole("postgres", "dono não altera comunicação (trigger)", `update invoicing_at_communications set outcome = 'accepted'`, "invoicing");
await asRole("authenticated", "browser não insere comunicação", `insert into invoicing_at_communications (org_id, document_id, environment, operation, document_status, outcome, actor) values ('${org}','${d2}','test','register','N','failed','u')`, "permission denied");
await asRole("authenticated", "browser não lê credenciais", `select * from invoicing_at_credentials`, "permission denied");
await asRole("authenticated", "browser não chama a fila", `select * from fn_invoicing_at_queue('${org}', 'test', 10)`, "permission denied");
await asRole("service_role", "service_role grava credenciais", `insert into invoicing_at_credentials (org_id, legal_entity_id, environment, username, password_encrypted, updated_by) values ('${org}','${le}','test','599999999/37','${"x".repeat(40)}','u')`);
await asRole("service_role", "utilizador fora do formato NIF/n.º", `insert into invoicing_at_credentials (org_id, legal_entity_id, environment, username, password_encrypted, updated_by) values ('${org}','${le}','production','admin','${"x".repeat(40)}','u')`, "check constraint");
await asRole("service_role", "comunicação de documento de outra organização", `insert into invoicing_at_communications (org_id, document_id, environment, operation, document_status, outcome, actor) values (gen_random_uuid(),'${d2}','test','register','N','failed','u')`, "foreign key|violates");

// Rollback e reaplicação
try { await db.exec(RB); passed++; } catch (e) { failures.push(`rollback: ${e.message}`); }
const left = (await db.query(`select count(*)::int n from information_schema.tables where table_name like 'invoicing_at_%'`)).rows[0].n;
check("rollback remove as tabelas", left === 0, String(left));
check("rollback mantém os documentos", (await db.query(`select count(*)::int n from invoicing_documents`)).rows[0].n === 2);
try { await db.exec(MIG); passed++; } catch (e) { failures.push(`reaplicar após rollback: ${e.message}`); }

console.log(`${passed} verificações OK, ${failures.length} falhas`);
for (const f of failures) console.log(" ✗ " + f);
process.exit(failures.length ? 1 : 0);
