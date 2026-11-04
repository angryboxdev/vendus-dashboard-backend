// Valida a migração da faturação certificada num Postgres 17 real (PGlite).
// Uso: node validate-invoicing.mjs <repo-backend>
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyChain } from "./apply-chain.mjs";

const repo = process.argv[2];
const MIG = readFileSync(join(repo, "supabase/migrations/20261220100000_invoicing_certified_documents.sql"), "utf8");
const RB = readFileSync(join(repo, "docs/migrations/rollback/20261220100000_invoicing_certified_documents.sql"), "utf8");
const db = new PGlite();
let passed = 0;
const failures = [];

async function ok(name, sql, params) {
  try { const r = await db.query(sql, params); passed++; return r; }
  catch (e) { failures.push(`${name}: esperava sucesso, deu «${e.message}»`); return null; }
}
async function fails(name, sql, pattern, params) {
  try { await db.query(sql, params); failures.push(`${name}: esperava erro /${pattern}/, passou`); }
  catch (e) { if (new RegExp(pattern, "i").test(e.message)) passed++; else failures.push(`${name}: erro errado «${e.message}» (esperava /${pattern}/)`); }
}
async function asService(name, sql, pattern) {
  const wrapped = `begin; set local role service_role; ${sql}; commit;`;
  try { await db.exec(wrapped); if (pattern) failures.push(`${name}: esperava erro /${pattern}/, passou`); else passed++; }
  catch (e) { await db.exec("rollback;").catch(() => {}); if (pattern && new RegExp(pattern, "i").test(e.message)) passed++; else failures.push(`${name}: «${e.message}»`); }
}
const check = (name, cond, detail = "") => (cond ? passed++ : failures.push(`${name} ${detail}`));

await applyChain(db, join(repo, "supabase/migrations"));
try { await db.exec(MIG); passed++; } catch (e) { failures.push(`reaplicar: ${e.message}`); }

const org = (await db.query(`insert into organizations (name, nif) values ('Org Teste', '599999999') returning id`)).rows[0].id;
const le = (await db.query(
  `insert into legal_entities (org_id, name, country, tax_id_type, tax_id, social_security_id, billing_email, street, postal_code, city, region, created_by)
   values ($1, 'Empresa Fictícia, Lda', 'PT', 'nif', '599999999', '20000000000', 'f@example.invalid', 'Rua A', '4000-001', 'Porto', 'Porto', 't') returning id`, [org])).rows[0].id;
const series = async (type, id) => (await db.query(
  `insert into invoicing_series (org_id, legal_entity_id, document_type, series_id, mode, validation_code, created_by)
   values ($1, $2, $3, $4, 'training', 'CDF7T5HD', 't') returning id`, [org, le, type, id])).rows[0].id;
const FS = await series("FS", "L01-2027"), NC = await series("NC", "L01-2027"), CM = await series("CM", "L01-2027"), FT = await series("FT", "L01-2027");

const H = (c) => c.repeat(171) + "=";
const line = { line_number: 1, product_code: "PZ01", product_type: "P", unit_of_measure: "UN", description: "Pizza", quantity: "1", unit_price: "12.5", line_amount: "12.5", tax_region: "PT", tax_code: "INT", tax_percentage: "13" };
const taxes = [{ tax_region: "PT", tax_code: "INT", tax_percentage: "13", taxable_base: "11.06", tax_amount: "1.44" }];
const doc = (type, seq, at, extra = {}) => ({
  sequence: seq, document_number: `${type} L01-2027/${seq}`, atcud: `CDF7T5HD-${seq}`, document_date: "2027-03-10", tax_point_date: "2027-03-10",
  system_entry_date: "2027-03-10T12:00:00", system_entry_at: at, software_certificate_number: "0", hash: H("a"), key_version: 1,
  qr_payload: "q", prices_include_tax: true, net_total: "11.06", tax_payable: "1.44", gross_total: "12.50",
  customer: { taxId: "999999990", name: "Consumidor final" }, issuer: { taxId: "599999999", name: "Empresa Fictícia, Lda" }, ...extra,
});
const issue = (s, expSeq, expHash, d, l = [line], t = taxes) =>
  db.query(`select fn_invoicing_issue_document($1, $2, $3, $4, $5, $6, $7, 'u') as id`, [org, s, expSeq, expHash, JSON.stringify(d), JSON.stringify(l), JSON.stringify(t)]);

// Emissão e compare-and-swap
const d1 = (await issue(FS, 0, null, doc("FS", 1, "2027-03-10T12:00:00Z")).catch((e) => failures.push(`emitir FS 1: ${e.message}`)))?.rows?.[0]?.id;
check("emitir FS 1", !!d1);
const s1 = (await db.query(`select last_sequence, last_hash, hash_control from invoicing_series s join invoicing_documents d on d.series_ref = s.id where s.id = $1`, [FS])).rows[0];
check("série avança e HashControl = 0 sem certificado", s1?.last_sequence === 1 && s1?.last_hash === H("a") && s1?.hash_control === "0", JSON.stringify(s1));
await fails("estado esperado desatualizado", `select fn_invoicing_issue_document($1,$2,0,null,$3,$4,$5,'u')`, "stale_series", [org, FS, JSON.stringify(doc("FS", 1, "2027-03-10T12:00:01Z")), JSON.stringify([line]), JSON.stringify(taxes)]);
await fails("número que não é o seguinte", `select fn_invoicing_issue_document($1,$2,1,$3,$4,$5,$6,'u')`, "number_mismatch", [org, FS, H("a"), JSON.stringify(doc("FS", 3, "2027-03-10T12:00:01Z")), JSON.stringify([line]), JSON.stringify(taxes)]);
await fails("instante anterior ao último da série", `select fn_invoicing_issue_document($1,$2,1,$3,$4,$5,$6,'u')`, "entry_before_last", [org, FS, H("a"), JSON.stringify(doc("FS", 2, "2027-03-10T11:59:59Z")), JSON.stringify([line]), JSON.stringify(taxes)]);
await fails("NIF do emitente diferente", `select fn_invoicing_issue_document($1,$2,1,$3,$4,$5,$6,'u')`, "issuer_mismatch", [org, FS, H("a"), JSON.stringify(doc("FS", 2, "2027-03-10T12:00:01Z", { issuer: { taxId: "500000000" } })), JSON.stringify([line]), JSON.stringify(taxes)]);
await fails("impostos não batem com os totais", `select fn_invoicing_issue_document($1,$2,1,$3,$4,$5,$6,'u')`, "totals_mismatch", [org, FS, H("a"), JSON.stringify(doc("FS", 2, "2027-03-10T12:00:01Z")), JSON.stringify([line]), JSON.stringify([{ ...taxes[0], taxable_base: "11.00" }])]);
await fails("sem linhas", `select fn_invoicing_issue_document($1,$2,1,$3,$4,null,$5,'u')`, "no_lines", [org, FS, H("a"), JSON.stringify(doc("FS", 2, "2027-03-10T12:00:01Z")), JSON.stringify(taxes)]);
// Mudança de hora: SystemEntryDate local repete-se, o instante UTC avança → aceite.
const dst = await issue(FS, 1, H("a"), doc("FS", 2, "2027-03-10T12:00:01Z", { hash: H("b"), system_entry_date: "2027-03-10T11:30:00", software_certificate_number: "2125" })).catch((e) => failures.push(`hora local repetida: ${e.message}`));
check("hora local repetida com instante a avançar é aceite", !!dst?.rows?.[0]?.id);
const hc = (await db.query(`select hash_control from invoicing_documents where series_ref = $1 and sequence = 2`, [FS])).rows[0]?.hash_control;
check("HashControl = versão da chave com certificado", hc === "1", hc);

// Escrita direta como service_role (o que o backend usa) — sem privilégios
await asService("service_role: UPDATE documento", `update invoicing_documents set gross_total = 1 where id = '${d1}'`, "permission denied");
await asService("service_role: DELETE documento", `delete from invoicing_documents where id = '${d1}'`, "permission denied");
await asService("service_role: TRUNCATE", `truncate invoicing_document_lines`, "permission denied");
await asService("service_role: INSERT com sinalizador", `select set_config('invoicing.rpc','on',true); insert into invoicing_events (org_id, actor, action) values ('${org}','x','teste.evento'); insert into invoicing_document_taxes (org_id, document_id, tax_region, tax_code, tax_percentage, taxable_base, tax_amount) values ('${org}','${d1}','PT','INT',13,1,1)`, "permission denied");
await asService("service_role: avançar a série à mão", `update invoicing_series set last_sequence = 3, last_hash = 'x' where id = '${FS}'`, "fim da cadeia");
await asService("service_role: apagar série", `delete from invoicing_series where id = '${FS}'`, "permission denied");
await asService("service_role: série a nascer com cadeia", `insert into invoicing_series (org_id, legal_entity_id, document_type, series_id, mode, last_sequence, last_hash, created_by) values ('${org}','${le}','FT','X2','training',5,'h','t')`, "nasce ativa e vazia");
await asService("service_role: alterar código de validação", `update invoicing_series set validation_code = 'ZZZZZZZZ' where id = '${FS}'`, "código de validação");
await asService("service_role: preencher código numa série sem código", `insert into invoicing_series (org_id, legal_entity_id, document_type, series_id, mode, created_by) values ('${org}','${le}','FT','X3','training','t'); update invoicing_series set validation_code = 'ABCDEFGH' where series_id = 'X3'`);
// Mesmo como dono (fora das funções), os triggers recusam
await fails("dono: UPDATE documento", `update invoicing_documents set gross_total = 1 where id = $1`, "só as funções", [d1]);
await fails("dono: DELETE documento", `delete from invoicing_documents where id = $1`, "não se apagam", [d1]);
await fails("dono: TRUNCATE", `truncate invoicing_documents cascade`, "imutável");
await fails("dono: DELETE linhas", `delete from invoicing_document_lines`, "imutável");
await fails("dono: INSERT documento fora da função", `insert into invoicing_documents (org_id) values ($1)`, "só se escreve pela emissão", [org]);

// NC e anulação (Despacho 3.3.7–3.3.8)
const ref = [{ document_id: d1, document_number: "FS L01-2027/1", reason: "Devolução" }];
const nc = (await issue(NC, 0, null, doc("NC", 1, "2027-03-10T13:00:00Z", { references_to: ref })).catch((e) => failures.push(`emitir NC: ${e.message}`)))?.rows?.[0]?.id;
check("emitir NC sobre FS ativa", !!nc);
await fails("NC sem referências", `select fn_invoicing_issue_document($1,$2,1,$3,$4,$5,$6,'u')`, "references_required", [org, NC, H("a"), JSON.stringify(doc("NC", 2, "2027-03-10T13:00:01Z")), JSON.stringify([line]), JSON.stringify(taxes)]);
await fails("anular FS com NC ativa", `select fn_invoicing_cancel_document($1,$2,'Erro','u')`, "has_active_rectifications", [org, d1]);
await fails("anular sem motivo", `select fn_invoicing_cancel_document($1,$2,'  ','u')`, "reason_required", [org, nc]);
await ok("anular a NC", `select fn_invoicing_cancel_document($1,$2,'NC errada','u')`, [org, nc]);
await ok("anular a FS depois da NC", `select fn_invoicing_cancel_document($1,$2,'NIF errado','u')`, [org, d1]);
await fails("anular duas vezes", `select fn_invoicing_cancel_document($1,$2,'De novo','u')`, "not_cancellable", [org, d1]);
await fails("NC sobre documento anulado", `select fn_invoicing_issue_document($1,$2,1,$3,$4,$5,$6,'u')`, "invalid_reference", [org, NC, H("a"), JSON.stringify(doc("NC", 2, "2027-03-10T13:00:02Z", { references_to: ref })), JSON.stringify([line]), JSON.stringify(taxes)]);
const st = (await db.query(`select status, status_reason from invoicing_documents where id = $1`, [d1])).rows[0];
check("estado A com motivo", st?.status === "A" && st?.status_reason === "NIF errado", JSON.stringify(st));
const ev = (await db.query(`select count(*)::int n from invoicing_events where action = 'document.cancelled'`)).rows[0].n;
check("eventos de anulação registados", ev === 2, String(ev));
const mode = (await db.query(`select series_mode from invoicing_documents where id = $1`, [d1])).rows[0]?.series_mode;
check("modo da série gravado no documento", mode === "training", mode);

// NC: não credita mais do que o documento (a BD confere com os documentos bloqueados) nem para outro cliente
const fs2 = dst.rows[0].id;
const ref2 = [{ document_id: fs2, document_number: "FS L01-2027/2", reason: "Devolução" }];
await fails("NC para outro cliente", `select fn_invoicing_issue_document($1,$2,1,$3,$4,$5,$6,'u')`, "invalid_reference", [org, NC, H("a"), JSON.stringify(doc("NC", 2, "2027-03-10T13:00:03Z", { references_to: ref2, customer: { taxId: "123456789", name: "Outro" } })), JSON.stringify([line]), JSON.stringify(taxes)]);
await ok("NC total sobre a FS 2", `select fn_invoicing_issue_document($1,$2,1,$3,$4,$5,$6,'u')`, [org, NC, H("a"), JSON.stringify(doc("NC", 2, "2027-03-10T13:00:03Z", { references_to: ref2, hash: H("c") })), JSON.stringify([line]), JSON.stringify(taxes)]);
await fails("segunda NC acima do valor por creditar", `select fn_invoicing_issue_document($1,$2,2,$3,$4,$5,$6,'u')`, "credit_exceeds_remaining", [org, NC, H("c"), JSON.stringify(doc("NC", 3, "2027-03-10T13:00:04Z", { references_to: ref2 })), JSON.stringify([line]), JSON.stringify(taxes)]);

// Consultas de mesa (CM → F; não se faturam duas vezes)
const cm = (await issue(CM, 0, null, doc("CM", 1, "2027-03-10T14:00:00Z")).catch((e) => failures.push(`emitir CM: ${e.message}`)))?.rows?.[0]?.id;
const orders = [{ document_id: cm, document_number: "CM L01-2027/1" }];
await ok("faturar a CM", `select fn_invoicing_issue_document($1,$2,0,null,$3,$4,$5,'u')`, [org, FT, JSON.stringify(doc("FT", 1, "2027-03-10T14:05:00Z", { order_references: orders })), JSON.stringify([line]), JSON.stringify(taxes)]);
const cmStatus = (await db.query(`select status from invoicing_documents where id = $1`, [cm])).rows[0]?.status;
check("CM passa a F", cmStatus === "F", cmStatus);
await fails("faturar a mesma CM outra vez", `select fn_invoicing_issue_document($1,$2,1,$3,$4,$5,$6,'u')`, "order_already_invoiced", [org, FT, H("a"), JSON.stringify(doc("FT", 2, "2027-03-10T14:06:00Z", { order_references: orders })), JSON.stringify([line]), JSON.stringify(taxes)]);
const ftCm = (await db.query(`select id from invoicing_documents where series_ref = $1 and sequence = 1`, [FT])).rows[0]?.id;
await ok("anular a fatura da CM", `select fn_invoicing_cancel_document($1,$2,'Não entregue','u')`, [org, ftCm]);
const cmBack = (await db.query(`select status from invoicing_documents where id = $1`, [cm])).rows[0]?.status;
check("anular a fatura devolve a CM a N", cmBack === "N", cmBack);
await fails("CM não pode referir CM", `select fn_invoicing_issue_document($1,$2,1,$3,$4,$5,$6,'u')`, "order_references_not_allowed", [org, CM, H("a"), JSON.stringify(doc("CM", 2, "2027-03-10T14:07:00Z", { order_references: orders })), JSON.stringify([line]), JSON.stringify(taxes)]);

// Rollback e reaplicação
try { await db.exec(RB); passed++; } catch (e) { failures.push(`rollback: ${e.message}`); }
const left = (await db.query(`select count(*)::int n from information_schema.tables where table_name like 'invoicing_%'`)).rows[0].n;
check("rollback remove as tabelas", left === 0, String(left));
try { await db.exec(MIG); passed++; } catch (e) { failures.push(`reaplicar após rollback: ${e.message}`); }

console.log(`${passed} verificações OK, ${failures.length} falhas`);
for (const f of failures) console.log(" ✗ " + f);
process.exit(failures.length ? 1 : 0);
