import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { ImportPlatformDocumentsUseCase } from "../../application/use-cases/import-platform-documents.use-case.js";
import { ListPlatformStatementsUseCase } from "../../application/use-cases/list-platform-statements.use-case.js";
import type { PlatformStatement } from "../../domain/entities/platform-statement.js";
import { InvalidStatementPeriodError } from "../../domain/errors.js";
import type { PlatformStatementRepositoryPort, StoredPlatformStatement } from "../../domain/ports/out/platform-statement-repository.port.js";
import { GLOVO_STATEMENT_TEXT, UBER_MONTHLY_TEXT } from "../fixtures/statement-texts.js";

const organizationId = mintOrganizationId("org-a");
const enc = (s: string) => new TextEncoder().encode(s);

/** Repositório em memória: (plataforma, número) identifica o extrato, como o índice único da tabela. */
function memoryRepo() {
  const rows = new Map<string, StoredPlatformStatement>();
  const repo: PlatformStatementRepositoryPort = {
    async save(_o, s: PlatformStatement, meta) {
      const key = `${s.platform}:${s.documentNumber}`;
      const replaced = rows.has(key);
      rows.set(key, { ...s, id: key, fileName: meta.fileName, importedBy: meta.importedBy, importedAt: "2026-10-28T10:00:00Z" });
      return { replaced };
    },
    async listOverlapping(_o, from, to) {
      return [...rows.values()].filter((r) => r.periodFrom <= to && r.periodTo >= from);
    },
  };
  return { repo, rows };
}

/** O «PDF» dos testes é o próprio texto; um ficheiro sem texto devolve null. */
const textOf = { extract: async (_name: string, content: Uint8Array) => (content.length ? new TextDecoder().decode(content) : null) };

describe("ImportPlatformDocumentsUseCase", () => {
  it("importa a Uber e a Glovo; rejeita o que não reconhece ou não confere; reimportar substitui", async () => {
    const { repo, rows } = memoryRepo();
    const uc = new ImportPlatformDocumentsUseCase(textOf, repo);
    const broken = GLOVO_STATEMENT_TEXT.replace("Valor a transferir para o Parceiro 1.129,97 €", "Valor a transferir para o Parceiro 1.000,00 €");

    const first = await uc.execute({
      organizationId,
      importedBy: "gestor@exemplo.pt",
      files: [
        { name: "uber.pdf", content: enc(UBER_MONTHLY_TEXT) },
        { name: "glovo.pdf", content: enc(GLOVO_STATEMENT_TEXT) },
        { name: "outra-coisa.pdf", content: enc("Fatura de um fornecedor qualquer") },
        { name: "vazio.pdf", content: new Uint8Array() },
        { name: "glovo-errado.pdf", content: enc(broken.replace("I26TESTE0000001", "I26TESTE0000002")) },
      ],
    });
    expect(first.imported.map((i) => [i.fileName, i.platform, i.documentNumber, i.replaced])).toEqual([
      ["uber.pdf", "uber_eats", "ABC123XY", false],
      ["glovo.pdf", "glovo", "I26TESTE0000001", false],
    ]);
    expect(first.rejected).toEqual([
      { fileName: "outra-coisa.pdf", reason: "Documento não reconhecido" },
      { fileName: "vazio.pdf", reason: "Documento não reconhecido" },
      { fileName: "glovo-errado.pdf", reason: "as linhas lidas não somam o total a transferir (diferença de 12997 cêntimos)" },
    ]);

    const again = await uc.execute({ organizationId, importedBy: null, files: [{ name: "uber (1).pdf", content: enc(UBER_MONTHLY_TEXT) }] });
    expect(again.imported[0]).toMatchObject({ documentNumber: "ABC123XY", replaced: true });
    expect(rows.size).toBe(2);
  });
});

describe("ListPlatformStatementsUseCase", () => {
  it("devolve os extratos que tocam o mês, com os totais por natureza", async () => {
    const { repo } = memoryRepo();
    await new ImportPlatformDocumentsUseCase(textOf, repo).execute({
      organizationId,
      importedBy: null,
      files: [
        { name: "uber.pdf", content: enc(UBER_MONTHLY_TEXT) },
        { name: "glovo.pdf", content: enc(GLOVO_STATEMENT_TEXT) },
      ],
    });
    const list = new ListPlatformStatementsUseCase(repo);
    const march = await list.execute({ organizationId, year: 2026, month: 3 });
    expect(march.map((s) => s.platform)).toEqual(["glovo", "uber_eats"]);
    expect(march[1]).toMatchObject({ salesCents: 130_000, promotionsCents: 3_000, commissionCents: 43_974, marketingCents: 2_583, refundsCents: 499, netPayoutCents: 79_946 });
    expect(march[0]).toMatchObject({ cashCents: 1_500, feesVatCents: 2_291, ordersCount: 2 });
    expect(await list.execute({ organizationId, year: 2026, month: 4 })).toEqual([]);
    await expect(list.execute({ organizationId, year: 2026, month: 13 })).rejects.toBeInstanceOf(InvalidStatementPeriodError);
  });
});
