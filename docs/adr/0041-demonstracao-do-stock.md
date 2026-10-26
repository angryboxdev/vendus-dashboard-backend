# ADR-0041 — Demonstração do Stock com organizações fictícias próprias

- Estado: aceite (2026-10-26)
- Contexto: pedido do utilizador — três cenários fictícios (Comida brasileira, Hamburgueria, Bar) para conhecer o
  Stock; «a demonstração vai ser independente para cada módulo, o de RH fica lá individualmente»; «só Admin».

## Contexto

O RH já tem uma organização de demonstração (ADR-0034): `organizations.is_demo` + `demo_of`, com índice único
em `demo_of` (uma demo por empresa) e um middleware que troca a organização só em `/api/novo-rh/*`. O Stock
precisa de três demos por empresa e não pode alterar o RH. As vendas do Stock vêm da Vendus com uma chave
**global**: numa demo apareceriam vendas reais.

## Decisão

1. Organizações fictícias do Stock são `is_demo = true` com `demo_of = null` (os crons e listagens já excluem
   `is_demo`). A ligação empresa real → cenário vive numa tabela nova, `stock_demo_organizations`
   (migração só aditiva). Nada do RH muda: nem o índice de `demo_of`, nem a procura da sua demo.
2. Modo Demonstração próprio (`X-Stock-Demo: <cenário>`), só nas rotas da Gestão de Stock, só Admin.
3. Vendas: «CaixaFlow POS» — POS **fictício** (nome inventado para não sugerir integração com software real),
   com «API» simulada e determinística dentro do Mezza. Os leitores de vendas do Stock (planeamento e consumo de
   ingredientes) perguntam primeiro ao POS fictício; numa demo nunca chamam a Vendus.

## Consequências

- Três organizações extra por empresa que use a demonstração; invisíveis fora do Stock em modo Demonstração.
- Um ecrã novo do Stock que leia vendas tem de passar pela mesma fonte (documentado no README de `stock-demo`).
- Rollback: remover `stock_demo_organizations`; as organizações fictícias ficam órfãs e invisíveis.
