/**
 * Cenário completo: fatura Uber Eats com duas linhas.
 * Cobre os critérios de aceite:
 *  - Classificar "Taxa de Serviço Uber Eats" como OPD.04 + canal Uber Eats
 *  - Classificar "Taxa de Publicidade Uber Eats" como MKT.05 + canal Uber Eats
 *  - Duas linhas → duas regras separadas, sem colisão
 *  - Suggest devolve a categoria e canal corretos para cada descrição
 *  - dreValue / cashflowValue calculados corretamente
 */
import { ClassifyInvoiceLineUseCase } from "../../application/use-cases/classify-invoice-line.use-case.js";
import { SuggestLineClassificationUseCase } from "../../application/use-cases/suggest-line-classification.use-case.js";
import { FakeInvoiceRepository } from "../fakes/fake-invoice-repository.js";
import { FakeInvoiceLineRepository } from "../fakes/fake-invoice-line-repository.js";
import { FakeClassificationRuleRepository } from "../fakes/fake-classification-rule-repository.js";
import { FakeCostCenterCategoryReader } from "../fakes/fake-cost-center-category-reader.js";
import { Invoice } from "../../domain/entities/invoice.js";
import { InvoiceLine } from "../../domain/entities/invoice-line.js";

const SUPPLIER_UBER_EATS = "supplier-uber-eats";
const CH_UBER_EATS = "ch-uber-eats";
const CAT_OPD04 = "cat-opd04";
const CAT_MKT05 = "cat-mkt05";

describe("Cenário Uber Eats — fatura com 2 linhas", () => {
  let invoiceRepo: FakeInvoiceRepository;
  let lineRepo: FakeInvoiceLineRepository;
  let ruleRepo: FakeClassificationRuleRepository;
  let categoryReader: FakeCostCenterCategoryReader;
  let classifyUseCase: ClassifyInvoiceLineUseCase;
  let suggestUseCase: SuggestLineClassificationUseCase;

  const invoice = Invoice.create({
    supplierId: SUPPLIER_UBER_EATS,
    supplierName: "Uber Eats BV",
    invoiceNumber: "UE-2026-001",
    invoiceDate: new Date("2026-07-01"),
    subtotalWithoutVat: 5000,
    totalVat: 1150,
    totalWithVat: 6150,
  });

  // Taxa de Serviço: 3000 sem IVA, 690 IVA, 3690 total
  const lineServico = InvoiceLine.create({
    invoiceId: invoice.id,
    description: "Taxa de Serviço Uber Eats",
    quantity: 1,
    unitCostWithoutVat: 3000,
    vatRate: 23,
    vatAmount: 690,
    totalWithVat: 3690,
  });

  // Taxa de Publicidade: 2000 sem IVA, 460 IVA, 2460 total
  const linePublicidade = InvoiceLine.create({
    invoiceId: invoice.id,
    description: "Taxa de Publicidade Uber Eats",
    quantity: 1,
    unitCostWithoutVat: 2000,
    vatRate: 23,
    vatAmount: 460,
    totalWithVat: 2460,
  });

  beforeEach(async () => {
    invoiceRepo = new FakeInvoiceRepository();
    lineRepo = new FakeInvoiceLineRepository();
    ruleRepo = new FakeClassificationRuleRepository();
    categoryReader = new FakeCostCenterCategoryReader();

    // OPD.04 — custos operacionais de plataformas (ex: Taxa de Serviço)
    categoryReader.seed({
      id: CAT_OPD04,
      financialType: "variable_cost",
      affectsDre: true,
      affectsCashflow: true,
      affectsProfitability: true,
      requiresChannel: true,
      requiresAllocation: false,
    });

    // MKT.05 — anúncios por marketplace (ex: Taxa de Publicidade)
    categoryReader.seed({
      id: CAT_MKT05,
      financialType: "marketing",
      affectsDre: true,
      affectsCashflow: true,
      affectsProfitability: true,
      requiresChannel: true,
      requiresAllocation: false,
    });

    classifyUseCase = new ClassifyInvoiceLineUseCase(invoiceRepo, lineRepo, ruleRepo, categoryReader);
    suggestUseCase = new SuggestLineClassificationUseCase(ruleRepo);

    await invoiceRepo.save(invoice);
    await lineRepo.saveAll([lineServico, linePublicidade]);
  });

  // ── Classificação individual ──────────────────────────────────────────────

  it("classifica Taxa de Serviço como OPD.04 com canal Uber Eats e herda financialType", async () => {
    const dto = await classifyUseCase.execute({
      invoiceId: invoice.id,
      lineId: lineServico.id,
      classify: { costCenterCategoryId: CAT_OPD04, channelId: CH_UBER_EATS },
    });
    expect(dto.costCenterCategoryId).toBe(CAT_OPD04);
    expect(dto.channelId).toBe(CH_UBER_EATS);
    expect(dto.financialType).toBe("variable_cost");
    expect(dto.requiresChannel).toBe(true);
  });

  it("classifica Taxa de Publicidade como MKT.05 com canal Uber Eats e herda financialType", async () => {
    const dto = await classifyUseCase.execute({
      invoiceId: invoice.id,
      lineId: linePublicidade.id,
      classify: { costCenterCategoryId: CAT_MKT05, channelId: CH_UBER_EATS },
    });
    expect(dto.costCenterCategoryId).toBe(CAT_MKT05);
    expect(dto.channelId).toBe(CH_UBER_EATS);
    expect(dto.financialType).toBe("marketing");
    expect(dto.requiresChannel).toBe(true);
  });

  it("lança erro ao classificar linha Uber Eats sem canal (requiresChannel=true)", async () => {
    await expect(
      classifyUseCase.execute({
        invoiceId: invoice.id,
        lineId: lineServico.id,
        classify: { costCenterCategoryId: CAT_OPD04 },
      }),
    ).rejects.toThrow("Canal obrigatório");
  });

  // ── dreValue / cashflowValue ──────────────────────────────────────────────

  it("dreValue usa valor sem IVA e cashflowValue usa valor total com IVA", async () => {
    const dtoServico = await classifyUseCase.execute({
      invoiceId: invoice.id,
      lineId: lineServico.id,
      classify: { costCenterCategoryId: CAT_OPD04, channelId: CH_UBER_EATS },
    });
    const dtoPublicidade = await classifyUseCase.execute({
      invoiceId: invoice.id,
      lineId: linePublicidade.id,
      classify: { costCenterCategoryId: CAT_MKT05, channelId: CH_UBER_EATS },
    });

    // 3690 − 690 = 3000
    expect(dtoServico.dreValue).toBe(3000);
    expect(dtoServico.cashflowValue).toBe(3690);

    // 2460 − 460 = 2000
    expect(dtoPublicidade.dreValue).toBe(2000);
    expect(dtoPublicidade.cashflowValue).toBe(2460);
  });

  // ── saveAsRule — duas regras separadas ───────────────────────────────────

  it("duas linhas criam duas regras separadas sem colisão", async () => {
    await classifyUseCase.execute({
      invoiceId: invoice.id,
      lineId: lineServico.id,
      classify: { costCenterCategoryId: CAT_OPD04, channelId: CH_UBER_EATS },
      saveAsRule: true,
    });
    await classifyUseCase.execute({
      invoiceId: invoice.id,
      lineId: linePublicidade.id,
      classify: { costCenterCategoryId: CAT_MKT05, channelId: CH_UBER_EATS },
      saveAsRule: true,
    });

    const ruleServico = await ruleRepo.findBySupplierIdAndDescription(SUPPLIER_UBER_EATS, "Taxa de Serviço Uber Eats");
    const rulePublicidade = await ruleRepo.findBySupplierIdAndDescription(SUPPLIER_UBER_EATS, "Taxa de Publicidade Uber Eats");

    expect(ruleServico).not.toBeNull();
    expect(rulePublicidade).not.toBeNull();
    expect(ruleServico!.id).not.toBe(rulePublicidade!.id);
    expect(ruleServico!.defaultCostCenterCategoryId).toBe(CAT_OPD04);
    expect(rulePublicidade!.defaultCostCenterCategoryId).toBe(CAT_MKT05);
    expect(ruleServico!.channelId).toBe(CH_UBER_EATS);
    expect(rulePublicidade!.channelId).toBe(CH_UBER_EATS);
  });

  // ── Suggest devolve a regra certa para cada descrição ────────────────────

  it("suggest devolve OPD.04 + canal para 'Taxa de Serviço Uber Eats' após saveAsRule", async () => {
    await classifyUseCase.execute({
      invoiceId: invoice.id,
      lineId: lineServico.id,
      classify: { costCenterCategoryId: CAT_OPD04, channelId: CH_UBER_EATS },
      saveAsRule: true,
    });

    const suggestion = await suggestUseCase.execute(SUPPLIER_UBER_EATS, "Taxa de Serviço Uber Eats");
    expect(suggestion).not.toBeNull();
    expect(suggestion!.costCenterCategoryId).toBe(CAT_OPD04);
    expect(suggestion!.channelId).toBe(CH_UBER_EATS);
  });

  it("suggest devolve MKT.05 + canal para 'Taxa de Publicidade Uber Eats' após saveAsRule", async () => {
    await classifyUseCase.execute({
      invoiceId: invoice.id,
      lineId: linePublicidade.id,
      classify: { costCenterCategoryId: CAT_MKT05, channelId: CH_UBER_EATS },
      saveAsRule: true,
    });

    const suggestion = await suggestUseCase.execute(SUPPLIER_UBER_EATS, "Taxa de Publicidade Uber Eats");
    expect(suggestion).not.toBeNull();
    expect(suggestion!.costCenterCategoryId).toBe(CAT_MKT05);
    expect(suggestion!.channelId).toBe(CH_UBER_EATS);
  });

  it("suggest não mistura as duas regras — OPD.04 para Serviço, MKT.05 para Publicidade", async () => {
    await classifyUseCase.execute({
      invoiceId: invoice.id,
      lineId: lineServico.id,
      classify: { costCenterCategoryId: CAT_OPD04, channelId: CH_UBER_EATS },
      saveAsRule: true,
    });
    await classifyUseCase.execute({
      invoiceId: invoice.id,
      lineId: linePublicidade.id,
      classify: { costCenterCategoryId: CAT_MKT05, channelId: CH_UBER_EATS },
      saveAsRule: true,
    });

    const forServico = await suggestUseCase.execute(SUPPLIER_UBER_EATS, "Taxa de Serviço Uber Eats");
    const forPublicidade = await suggestUseCase.execute(SUPPLIER_UBER_EATS, "Taxa de Publicidade Uber Eats");

    expect(forServico!.costCenterCategoryId).toBe(CAT_OPD04);
    expect(forPublicidade!.costCenterCategoryId).toBe(CAT_MKT05);
  });
});
