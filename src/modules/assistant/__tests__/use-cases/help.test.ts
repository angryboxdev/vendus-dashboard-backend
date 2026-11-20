import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { AssistantUseCases, HELP_NOT_FOUND, HELP_UNAVAILABLE } from "../../application/use-cases/assistant.use-cases.js";
import { AssistantError } from "../../domain/entities/assistant.js";
import { HELP_ARTICLES } from "../../domain/services/help-articles.js";
import { queryHelp, searchHelp, tokens, type HelpArticle } from "../../domain/services/help-guide.js";
import { HELP_TOOLS, TOOLS } from "../../domain/services/tools.js";
import { FailingLlm, FakeAudit, FakeScheduling, ScriptedLlm, viewer } from "../fakes/fake-assistant.js";

const GUIDE: HelpArticle[] = [
  { id: "criar", title: "Criar um colaborador", path: "/hr/novo/pessoas", keywords: ["novo funcionário", "adicionar pessoa", "contratar"], steps: ["Abra Colaboradores.", "Clique em «Novo colaborador»."] },
  { id: "ferias", title: "Pedir férias", path: "/hr/novo/ausencias", keywords: ["férias", "ausência", "folga"], steps: ["Abra Ausências.", "Clique em «Novo pedido»."] },
];

const uc = (llm: ConstructorParameters<typeof AssistantUseCases>[0]) => new AssistantUseCases(llm, new FakeScheduling(), new FakeAudit());

describe("Guia de ajuda do RH — pesquisa (pura)", () => {
  test("sem acentos, plurais e palavras vazias", () => {
    expect(tokens("Como posso criar os Funcionários?")).toEqual(["criar", "funcionari"]);
    expect(tokens("colaborador")).toEqual(tokens("colaboradores"));
  });

  test("a pergunta do utilizador encontra o artigo certo; sem palavras em comum → nada", () => {
    expect(searchHelp("como posso criar um funcionário novo?", GUIDE).map((a) => a.id)).toEqual(["criar"]);
    expect(searchHelp("quero marcar férias", GUIDE)[0]?.id).toBe("ferias");
    expect(searchHelp("qual é a previsão do tempo", GUIDE)).toEqual([]);
    expect(searchHelp("", GUIDE)).toEqual([]);
  });

  test("QUERY_HELP devolve os artigos ou diz que o guia não tem resposta", () => {
    expect(queryHelp("adicionar pessoa", GUIDE).articles.map((a) => a.id)).toEqual(["criar"]);
    expect(queryHelp(42, GUIDE)).toEqual({ articles: [], message: expect.any(String) });
  });

  test("conteúdo real: ids únicos, passos e rotas do RH; perguntas comuns encontram o artigo", () => {
    const ids = HELP_ARTICLES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of HELP_ARTICLES) {
      expect(a.steps.length).toBeGreaterThan(0);
      if (a.path) expect(a.path).toMatch(/^\/hr\/novo/);
    }
    expect(searchHelp("como posso criar um funcionário novo?")[0]?.id).toBe("criar-colaborador");
    expect(searchHelp("como peço férias")[0]?.id).toBe("pedir-ausencia");
  });

  test("allowlist: a ajuda só tem QUERY_HELP (sem ferramentas de escrita nem de dados)", () => {
    expect(HELP_TOOLS.map((t) => t.name)).toEqual(["QUERY_HELP"]);
    expect(TOOLS.find((t) => t.name === "QUERY_HELP")?.write).toBe(false);
  });
});

describe("Assistente Mezza — ajuda do RH", () => {
  test("pergunta → QUERY_HELP → resposta com os artigos usados (fontes determinísticas)", async () => {
    const llm = new ScriptedLlm([
      () => ({ tools: [["QUERY_HELP", { question: "criar colaborador novo" }]] }),
      (m) => {
        const r = ScriptedLlm.lastTool(m) as { articles: HelpArticle[] };
        return { text: `1. ${r.articles[0]!.steps[0]}` };
      },
    ]);
    const r = await uc(llm).help([], "Como posso criar um funcionário novo?", "/hr/novo/pessoas");
    expect(r.status).toBe("answer");
    expect(r.sources[0]).toMatchObject({ id: "criar-colaborador" });
    expect(r.text.startsWith("1. ")).toBe(true);
    // Só a ferramenta da ajuda é oferecida, e o ecrã atual vai nas instruções.
    expect(llm.calls[0]![0]).toMatchObject({ role: "system" });
    expect((llm.calls[0]![0] as { content: string }).content).toContain("/hr/novo/pessoas");
  });

  test("ferramentas de Escalas pedidas na ajuda são recusadas (nada é alterado)", async () => {
    const s = new FakeScheduling();
    const llm = new ScriptedLlm([() => ({ tools: [["CREATE_SHIFTS", { items: [{ employee: "Maria", date: "2026-10-15", start: "09:00", end: "17:00" }] }]] }), (m) => ({ text: String(ScriptedLlm.lastTool(m).error) })]);
    const r = await new AssistantUseCases(llm, s, new FakeAudit()).help([], "coloca a Maria amanhã", null);
    expect(r.text).toBe("unknown_tool");
    expect(s.addCalls).toBe(0);
  });

  test("ecrã fora do RH é ignorado; sem texto final → 'não tenho essa resposta'", async () => {
    const llm = new ScriptedLlm([() => ({ text: "" })]);
    const r = await uc(llm).help([], "olá", "https://evil.example/x");
    expect(r.text).toBe(HELP_NOT_FOUND);
    expect((llm.calls[0]![0] as { content: string }).content).not.toContain("evil");
  });

  test("sem fornecedor ou com falha → indisponível; mensagem vazia → erro de validação", async () => {
    expect(await uc(null).help([], "olá", null)).toEqual({ status: "unavailable", text: HELP_UNAVAILABLE, sources: [] });
    expect((await uc(new FailingLlm()).help([], "olá", null)).status).toBe("unavailable");
    await expect(uc(null).help([], "   ", null)).rejects.toBeInstanceOf(AssistantError);
  });

  test("dentro de Escalas, QUERY_HELP também responde (sem permissão de escrita)", async () => {
    const llm = new ScriptedLlm([() => ({ tools: [["QUERY_HELP", { question: "pedir férias" }]] }), (m) => ({ text: (ScriptedLlm.lastTool(m).articles as HelpArticle[])[0]!.id })]);
    const r = await uc(llm).chat(mintOrganizationId("org-a"), viewer({ canWrite: false }), { rosterId: "r1", from: "2026-10-12", to: "2026-10-18" }, [], "Como peço férias?");
    expect(r.text).toBe("pedir-ausencia");
  });
});
