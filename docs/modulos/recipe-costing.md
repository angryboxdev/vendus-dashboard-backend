# Módulo: recipe-costing

**Área:** Stock · **Estado (README):** ativo · **Código:** 9 ficheiros, 2 ficheiros de teste

## Objetivo
Custo do prato (pizza) por tamanho a partir das fichas técnicas e do preço atual dos ingredientes — última compra importada; sem compra, preço manual. Alerta dos ingredientes sem preço.

## Estado atual
Em produção desde 2026-10-25 (#120/#94). Frontend: secção «Custo das fichas técnicas» na página de Pizzas (`src/modules/recipe-costing` no frontend). Na ficha técnica («Ver receita»): custo de cada ingrediente/preparo por tamanho e custo total do prato (s/ IVA, com o PVP ao lado); botão «Inativar/Reativar» por pizza (legacy `PUT /api/pizzas/:id { is_active }`) — a pizza inativa sai do custo das fichas, mas a receita continua a descontar stock se for vendida.

## Arquitetura
- Código: `src/modules/recipe-costing/`; composição: `recipe-costing.module.ts`; documentação: `src/modules/recipe-costing/README.md`.
- Endpoints (1, sob `/api`): `GET /recipe-costing` (`stock.recipes`).

## Dependências
Nenhuma de outros módulos; lê tabelas legacy de pizzas/receitas/preparos/stock.

## Regras de negócio
Ver «Decisões de design» no README do módulo (a fatura é a fonte da verdade; s/ IVA; perda incluída).

## Problemas conhecidos
Em 2026-10-25, na organização com receitas: 45 ingredientes, 0 com preço de fatura, 34 manuais, 11 sem preço.

## Próximos trabalhos
- Margem / food cost % (precisa de decidir a taxa de IVA da venda).
