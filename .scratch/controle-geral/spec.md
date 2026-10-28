# Controle geral do mês (pedido de 2026-10-28)

> Fase 1 feita (frontend): coluna recolhível de **saldo acumulado** na demonstração de resultados do Mapa
> de rentabilidade — cada linha mostra o saldo depois de somar a receita / subtrair o custo; os subtotais
> batem com o saldo. Fase 2 por fazer (este documento).

## Fase 2 — página «Controle geral» (modelo da folha do utilizador)

> **Feita (2026-10-28), a rever com o utilizador:** página `/dre/controle-geral` aberta pelo botão da DRE
> (sem aba à parte); agrupamento proposto em `controle-geral.ts` do frontend (ver README do `cash-flow`);
> tudo com IVA (DIVA = IVA a entregar); DE nos parâmetros do mês (migração `20261208100000_dre_loan_expense`);
> clicar num grupo abre a lista de pagamentos da DRE. As perguntas abaixo continuam em aberto.

Página nova, no modelo da folha «Controle Geral / 2025 — Mês projetado» que o utilizador usa hoje
(captura de ecrã enviada na conversa; valores reais ficam fora do repositório).

### Blocos

1. **Despesas por grupo** (€ e % do total de despesas), com gráfico circular:
   - **DC** — despesa colaborador: salários e encargos.
   - **DF** — despesa fixa.
   - **DV** — despesa variável.
   - **DP** — despesa publicidade.
   - **DI** — insumos: CMV (mercadoria, ingredientes) e embalagens.
   - **DIVA** — despesa de IVA.
   - **DE** — despesa empréstimo: **lançada à mão** (empréstimos fora da operação que não aparecem no banco).
   - Total.
   Os nomes ainda vão ser revistos pelo utilizador.
2. **IVA**: IVA a reduzir (dedutível) e IVA a pagar, com %.
3. **Resumo**: faturação, despesas totais (com e sem algum grupo — na folha aparecem duas linhas), variável
   renda, saldo e margem de lucro.

### Por decidir com o utilizador antes de começar

- Correspondência exata entre os grupos e as linhas/categorias da DRE (pessoal → DC; estrutura → DF;
  custos variáveis → DV; marketing → DP; CMV → DI; …) e onde entram «administrativo», «outros», «financeiro».
- O que é «DIVA» (IVA pago ao Estado no mês? saldo do IVA?) e a diferença entre as duas «Despesas totais».
- ~~O que é «Variável renda».~~ Resolvido: 8% do valor da faturação acima de 19 000 € (parâmetros do mês).
- DE: um valor por mês, ou uma lista de empréstimos com prestação mensal.
- Faturação com ou sem IVA.
