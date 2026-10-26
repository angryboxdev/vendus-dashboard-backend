# Módulo: stock-demo

**Área:** Stock · **Estado (README):** active · **Código:** `src/modules/stock-demo/`

## Objetivo
Demonstração da Gestão de Stock com três cenários fictícios (Comida brasileira, Hamburgueria, Bar), independente
da demonstração do RH. Só Admins. Vendas do POS fictício «CaixaFlow POS» (50 000–70 000 € / mês por cenário).

## Estado atual
Fases 1 e 2 (2026-10-26, ramo `financeiro`, por publicar; migração `20261201100000_stock_demo_organizations`
por aplicar): tabela de ligação, modo Demonstração nas rotas do Stock, POS fictício, leitores de vendas do Stock a
usá-lo numa demo, gerador dos 3 cenários e criar/recomeçar (`POST /api/stock-demo/:scenario[/reset]`). Especificação e fases: `.scratch/stock-demonstracao/spec.md`.

## Arquitetura
- Endpoints: `GET /api/stock-demo`, `GET /api/stock-demo/pos/sales` (`stock.items`, Admin no módulo).
- Ligações em `server.ts`: `createStockPlanningModule(…, demoPosSales)` e `setDemoProductsSource` (consumo).
- Decisão: ADR-0041.

## Próximos trabalhos
- Fase 2: gerador dos 3 cenários (artigos, fornecedores, compras aplicadas, fichas, PVP, mapeamentos, contagens,
  baixas pelas vendas) + criar/recomeçar.
- Fase 3: botão «Demonstração» em Artigos e ingredientes e faixa no topo.
- Fase 4: QA, capturas e publicação.
