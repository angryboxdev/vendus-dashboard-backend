import { describe, it, expect } from "@jest/globals";
import { normalizeMovement } from "../../domain/services/movement-normalizer.service.js";

// Descritivos no formato do Millennium BCP (referências e nomes fictícios).
describe("normalizeMovement", () => {
  it.each([
    ["CREDITO TPA BCP 1234567 MOV N 92", "credit", "Vendas TPA (terminal 1234567)", "sales"],
    ["STICHTING CUSTODIAN UBER PAYMENTS", "credit", "Recebimento Uber Eats", "sales"],
    ["BOLT OPERATIONS OU", "credit", "Recebimento Bolt", "sales"],
    ["STRIPE", "credit", "Recebimento Stripe", "sales"],
    ["TRF. P/O GlovoApp", "credit", "Recebimento Glovo", "sales"],
    ["TRF. P/O UNICRE", "credit", "Recebimento Unicre", "sales"],
    ["DEP NUM MTM12345", "credit", "Depósito em numerário", "deposit"],
    ["TRF DE CLIENTE EXEMPLO LDA", "credit", "Transferência de Cliente Exemplo Lda", "transfer_in"],
    ["DEVOL PAG SERV ENT/REF 50470/000000123", "credit", "Devolução — Pag Serv Ent/Ref", "reversal"],
    ["OPDE DEVOL COM. PACOT PACOTE M EMPRESA", "credit", "Devolução de comissão bancária", "reversal"],
    ["REVER PT18100002 Generali Tra 70636451021", "credit", "Reversão de débito direto — Generali Tra", "reversal"],
  ] as const)("%s (%s) → %s · %s", (desc, type, normalized, kind) => {
    expect(normalizeMovement(desc, type)).toMatchObject({ normalizedDescription: normalized, kind });
  });

  it.each([
    ["TRF P/ FORNECEDOR EXEMPLO LDA", "Transferência para Fornecedor Exemplo Lda", "transfer_out"],
    ["DD EDP COMERCIAL 16010014578660 PT34100781", "Débito direto — Edp Comercial", "utilities"],
    ["DD NOS Comunicacoes 12345 PT1234", "Débito direto — Nos Comunicacoes", "utilities"],
    ["DD Generali Tranq 123456", "Débito direto — Generali Tranq", "insurance"],
    ["DD PROSEGUR ACTIV 1-2-5000002822 PT57100173", "Débito direto — Prosegur Activ", "supplier"],
    ["PAGSERV FORMIFRI EQ 11989/030603491 IFTHENPAY", "Pagamento de serviço — Formifri Eq Ifthenpay", "supplier"],
    ["PAGSERV GENERALI SEGUROS, SA 11111/2222", "Pagamento de serviço — Generali Seguros, Sa", "insurance"],
    ["PAGSERV INSTITUTO GESTAO FINANC 20394/1", "Pagamento ao Estado — Instituto Gestao Financ", "tax_state"],
    ["PAG.DUC -123456789012345", "Pagamento ao Estado (DUC)", "tax_state"],
    ["MDB9880 WWW.AMAZON* 50.15EUR", "Compra com cartão — Amazon", "card_purchase"],
    ["MDB1639880 SUPERMERCADO EXEMPLO", "Compra com cartão — Supermercado Exemplo", "card_purchase"],
    ["COM.MAN.CONTA PACOTE M EMPRESA 102025", "Comissão de manutenção de conta", "bank_fee"],
    ["IMPOSTO SELO ART 17.3.4", "Imposto do selo", "bank_fee"],
    ["MENSAL. FICH. FECHOS TPA - 518902609", "Mensalidade do terminal TPA", "bank_fee"],
    ["TARIFA MENSAL / COMPLEMENTAR 002995409", "Tarifa bancária", "bank_fee"],
    ["PAGAMENTO VENCIMENTOS -GROUP0,1 160", "Pagamento de vencimentos", "payroll"],
    ["BUS PAGAMENTO CARTAO 1234", "Pagamento do cartão de crédito", "internal_transfer"],
    ["LOJA EXEMPLO PORTO", "Compra com cartão — Loja Exemplo Porto", "card_purchase"],
    ["PAG SERV 22255/101132900 EUPAGO INSTITUICAO PAG", "Pagamento de serviço — Eupago Instituicao Pag", "supplier"],
    ["PAG.IGCP -156280670255858", "Pagamento ao Estado (IGCP)", "tax_state"],
    ["PTU-TAXA SOCIAL UNICA 123", "Segurança Social (TSU)", "tax_state"],
    ["LEV NUM MTM9492", "Levantamento em numerário", "internal_transfer"],
  ] as const)("%s (débito) → %s · %s", (desc, normalized, kind) => {
    expect(normalizeMovement(desc, "debit")).toEqual({ normalizedDescription: normalized, kind });
  });

  it("marca as liquidações das plataformas de entrega (Uber, Glovo, Bolt) e não as do TPA/Stripe", () => {
    expect(normalizeMovement("STICHTING CUSTODIAN UBER PAYMENTS", "credit").platform).toBe("uber_eats");
    expect(normalizeMovement("TRF. P/O GlovoApp", "credit").platform).toBe("glovo");
    expect(normalizeMovement("BOLT OPERATIONS OU", "credit").platform).toBe("bolt_food");
    expect(normalizeMovement("STRIPE", "credit").platform).toBeUndefined();
    expect(normalizeMovement("CREDITO TPA BCP 1234567 MOV N 92", "credit").platform).toBeUndefined();
  });
});
