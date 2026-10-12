import { mintOrganizationId } from "../../../kernel/organization-id.js";
import { DistributionsUseCases } from "../application/use-cases/distributions.use-cases.js";
import type { Audience } from "../domain/entities/distribution.js";
import { FakeCtx, FakeFiles, FakeRepo } from "./fakes.js";

const ORG = mintOrganizationId("org-a");
const ADMIN = { userId: "u-admin", email: "rh@demo.invalid" };
const ANA = { userId: "u-e1", email: "ana@demo.invalid" };
const RUI = { userId: "u-e3", email: "rui@demo.invalid" };

function setup() {
  const repo = new FakeRepo();
  const files = new FakeFiles();
  const ctx = new FakeCtx();
  return { repo, files, ctx, uc: new DistributionsUseCases(repo, files, ctx) };
}
const PDF = { buffer: Buffer.from("%PDF"), name: "normas-seguranca.pdf", mimeType: "application/pdf", size: 4 };

describe("Envio de documentos (FE-065)", () => {
  test("um ficheiro, vários destinatários congelados; avisa só quem tem conta", async () => {
    const { uc, repo, files, ctx } = setup();
    expect(await uc.previewAudience(ORG, { type: "locations", ids: ["porto"] })).toEqual({ recipients: 2, withoutAccount: 1 });
    const d = await uc.send(ORG, ADMIN, { title: " Normas de segurança ", audience: { type: "locations", ids: ["porto"] }, requiresConfirmation: true, file: PDF });
    expect(d).toMatchObject({ title: "Normas de segurança", stats: { recipients: 2, read: 0, confirmed: 0 }, withoutAccount: 1 });
    expect(files.stored).toEqual(["normas-seguranca.pdf"]);
    expect(repo.rows.map((r) => r.employeeId)).toEqual(["e1", "e2"]);
    expect(ctx.sent[0]).toMatchObject({ userIds: ["u-e1"], dedupeKey: `distribution:${d.id}` });
    expect(ctx.audits).toContain("documents.distribute");
    // Quem entra depois no centro não recebe este envio.
    ctx.people.push({ employeeId: "e4", userId: "u-e4", location: "porto" });
    expect((await uc.report(ORG, d.id)).totals.recipients).toBe(2);
  });

  test("validações: título, público, tipo e tamanho do ficheiro; público vazio não envia", async () => {
    const { uc, files } = setup();
    const base = { title: "Regulamento", audience: { type: "all" } as Audience, requiresConfirmation: false, file: PDF };
    await expect(uc.send(ORG, ADMIN, { ...base, title: " " })).rejects.toMatchObject({ field: "title" });
    await expect(uc.send(ORG, ADMIN, { ...base, audience: { type: "locations", ids: [] } })).rejects.toMatchObject({ field: "audience" });
    await expect(uc.send(ORG, ADMIN, { ...base, file: null })).rejects.toMatchObject({ field: "file" });
    await expect(uc.send(ORG, ADMIN, { ...base, file: { ...PDF, mimeType: "application/zip" } })).rejects.toMatchObject({ field: "file" });
    await expect(uc.send(ORG, ADMIN, { ...base, file: { ...PDF, size: 21 * 1024 * 1024 } })).rejects.toMatchObject({ field: "file" });
    await expect(uc.send(ORG, ADMIN, { ...base, audience: { type: "employees", ids: ["ninguem"] } })).rejects.toMatchObject({ field: "audience" });
    // Nada foi guardado quando falha a validação.
    expect(files.stored).toEqual([]);
  });

  test("colaborador: vê só os seus, abrir marca aberto, confirma; quem não é destinatário recebe 404", async () => {
    const { uc } = setup();
    const d = await uc.send(ORG, ADMIN, { title: "Normas", audience: { type: "employees", ids: ["e1"] }, requiresConfirmation: true, file: PDF });
    expect((await uc.mine(ORG, ANA)).map((x) => x.id)).toEqual([d.id]);
    expect(await uc.mine(ORG, RUI)).toEqual([]);
    await expect(uc.myDownloadUrl(ORG, RUI, d.id)).rejects.toMatchObject({ code: "not_found" });
    expect((await uc.myDownloadUrl(ORG, ANA, d.id)).url).toContain("normas-seguranca.pdf");
    let r = await uc.report(ORG, d.id);
    expect(r.rows[0]).toMatchObject({ employeeId: "e1", status: "read", readAt: "2026-10-12T11:00:00.000Z" });
    await uc.confirm(ORG, ANA, d.id);
    r = await uc.report(ORG, d.id);
    expect(r.totals).toEqual({ recipients: 1, read: 1, confirmed: 1 });
    expect((await uc.forEmployee(ORG, "e1")).map((x) => ({ id: x.id, confirmedAt: x.confirmedAt }))).toEqual([{ id: d.id, confirmedAt: "2026-10-12T11:00:00.000Z" }]);
    // Arquivado deixa de aparecer ao colaborador; a prova fica.
    await uc.archive(ORG, ADMIN, d.id);
    expect(await uc.mine(ORG, ANA)).toEqual([]);
    expect((await uc.report(ORG, d.id)).rows).toHaveLength(1);
  });

  test("confirmar só quando pedido; lembrete só a quem falta (1 por dia); prova CSV neutraliza fórmulas", async () => {
    const { uc, ctx } = setup();
    const info = await uc.send(ORG, ADMIN, { title: "Info", audience: { type: "employees", ids: ["e1"] }, requiresConfirmation: false, file: PDF });
    await expect(uc.confirm(ORG, ANA, info.id)).rejects.toMatchObject({ code: "confirmation_not_required" });
    const d = await uc.send(ORG, ADMIN, { title: "Regras", audience: { type: "all" }, requiresConfirmation: true, file: PDF });
    await uc.confirm(ORG, ANA, d.id);
    expect(await uc.remind(ORG, ADMIN, d.id)).toEqual({ pending: 2, notified: 1, withoutAccount: 1 });
    expect(ctx.sent.at(-1)).toMatchObject({ userIds: ["u-e3"], dedupeKey: `distribution:${d.id}:remind:2026-10-12` });
    const list = await uc.list(ORG);
    expect(list.find((x) => x.id === d.id)!.stats).toEqual({ recipients: 3, read: 1, confirmed: 1 });
    const proof = await uc.proof(ORG, d.id);
    expect(proof.fileName).toBe("prova-documento-Regras.csv");
    const lines = proof.content.slice(1).split("\r\n");
    expect(lines[0]).toBe("Colaborador;Entregue;Aberto;Confirmado");
    expect(lines[1]!.startsWith(`"'=Bruno Demo"`)).toBe(true);
    await uc.archive(ORG, ADMIN, d.id);
    await expect(uc.remind(ORG, ADMIN, d.id)).rejects.toMatchObject({ code: "invalid_state" });
  });
});
