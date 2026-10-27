# Conferência de vendas (Vendus × banco) e DRE com delivery em bruto

> Ramo: `financeiro-conferencia-vendas` (backend e frontend), a partir de `financeiro`.
> Aberto em 2026-10-27.

## Objetivo

Saber se a empresa dá lucro, mês a mês, e conferir o dinheiro que entra no banco com o que foi
faturado.

## Decisões do utilizador (2026-10-27)

- **Entradas do banco por nome:** Uber → «Venda plataforma Uber», Glovo → «Venda plataforma Glovo»,
  Bolt → «Venda plataforma Bolt», TPA → «Venda restaurante cartão», depósito → «Venda restaurante
  dinheiro».
- **Venda restaurante:** competência pelo Vendus (IVA exato por documento); o banco serve para
  conferir. Diferença de um dia entre venda e entrada no banco é aceitável.
- **TPA:** taxa contratada ≈ 1% — conferir pela diferença cartão vendido × crédito TPA.
- **Delivery:** IVA das vendas ≈ 15% (comida 13% + bebida 23%, média pelo volume), parametrizável
  por mês. A plataforma retém a comissão (≈ 30%) **com IVA a 23% por cima** e o marketing. A DRE
  mostra o **bruto** primeiro.
- **Marketing das plataformas:** valor lançado à mão por plataforma e mês.
- **AirMenu:** deixa de ser usado na DRE (o delivery reconstitui-se pelo banco).
- **IVA dos gastos:** real (fatura conciliada) → média das últimas 10 faturas da **categoria** (ex.: Ingredientes ≈ Makro; a saída sem fatura não tem fornecedor) →
  teórico pela categoria (serviços 23%) → por confirmar.

## Fórmula do delivery (por plataforma e mês)

R = recebido no banco; M = marketing sem IVA (manual); c = comissão; t = IVA da comissão (23%);
v = IVA médio das vendas (15%).

- Venda bruta (com IVA): G = (R + M·(1+t)) ÷ (1 − c·(1+t))
- Venda sem IVA: G ÷ (1+v); IVA da venda: G − G ÷ (1+v)
- Comissão sem IVA: c·G (gasto); IVA dedutível: c·t·G
- Marketing sem IVA: M (gasto); IVA dedutível: t·M

Exemplo: R = 631 €, M = 0 → G = 1000 €, venda sem IVA 869,57 €, comissão 300 € (+69 € IVA).

**Por confirmar com um extrato real da Uber** (fontes públicas insuficientes): se a comissão incide
sobre a venda com ou sem IVA e se o marketing leva IVA. Validar com o contabilista.

## Fases

1. **F1 — Vendus por método de pagamento** ✅ (sem migração) — `analytics.byPaymentMethod` e
   `analytics.dailyPayments` em `GET /api/vendus/summary`; tipo espelhado no frontend.
2. **F2 — Conferência Vendus × banco** ✅ backend (sem migração; `GET /api/reports/dre/conferencia-vendas`) — vista diária: cartão vendido × crédito TPA (cada crédito
   cobre os dias desde o anterior; diferença, taxa implícita vs 1%); numerário vendido × depósitos.
   Novos nomes das entradas do banco.
3. **F3 — Parâmetros mensais + DRE** ✅ (migração `20261204100000_dre_monthly_parameters`, por aplicar; `GET|PUT /api/reports/dre/parametros`; base da comissão e IVA do marketing ficaram parâmetros) — tabela de parâmetros por mês (IVA delivery,
   comissão, IVA comissão, taxa TPA, IVA teórico de serviços) e marketing manual por plataforma;
   delivery em bruto sem AirMenu; receita separada por linha; IVA dos gastos por prioridade.
4. **F4 — Frontend** — conferência, lançamento de parâmetros/marketing, DRE com margem por plataforma.

## Perguntas em aberto

1. A comissão incide sobre a venda com ou sem IVA?
2. O marketing é lançado sem IVA (a plataforma acrescenta 23%)?
3. ~~Depósitos~~ → todos contam como «venda restaurante dinheiro» (frase do utilizador; confirmar).
4. Unicre → tratada como cartão (adquirente TPA; confirmar). Stripe → fica «Recebimento Stripe», fora da conferência.
5. Nomes reais dos métodos de pagamento no Vendus (para confirmar a classificação da F1).
