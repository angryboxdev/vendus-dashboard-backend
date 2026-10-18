# Módulo: financial-base

**Área:** Financeiro · **Estado (README):** ativo (2026-09-29) · **Código:** 68 ficheiros, 27 ficheiros de teste

## Objetivo
A Angrybox tem custos que vêm de muitos sítios diferentes — fornecedores de ingredientes, serviços de limpeza, rendas, plataformas de marketing, software. Sem uma estrutura que organize esses custos, é impossível responder a perguntas simples como "quanto gastámos em operações este mês?" ou "este custo entra na DRE ou é CAPEX?".

## Estado atual
Implementado (fornecedores, grupos/subcategorias de CC, canais, identidade da organização, calendário de entregas). F2 §2.1 no ramo `financeiro`.

**Funcionalidades relevantes** (`[ramo financeiro]` = commits locais/ramo não integrado em `main`):
- [ramo financeiro] Ficha do fornecedor: modo financeiro preferido, destino habitual (loja), tipo financeiro editável, política «Decidir no documento» (`default_stock_policy = decide_per_document`).
- [ramo financeiro] Exceções por loja (`supplier_location_rules`): política de Stock e/ou CC; `GET/PUT/DELETE /financial-base/suppliers/:id/location-rules[/:locationId]`.
- [ramo financeiro] Validação no servidor: subcategoria ativa e do grupo; loja da organização e ativa (erros 400).

## Arquitetura
- Código: `src/modules/financial-base/` (domain, application, adapters); composição: `financial-base.module.ts`; documentação detalhada: `src/modules/financial-base/README.md`.
- Endpoints (26, sob `/api`): `DELETE /financial-base/suppliers/:id/location-rules/:locationId`, `GET /financial-base/channels`, `GET /financial-base/cost-center-categories`, `GET /financial-base/cost-center-categories/:id`, `GET /financial-base/cost-center-groups`, `GET /financial-base/cost-center-groups/:id`, `GET /financial-base/cost-center-groups/financial-types`, `GET /financial-base/suppliers`, `GET /financial-base/suppliers/:id`, `GET /financial-base/suppliers/:id/delivery-schedule`, `GET /financial-base/suppliers/:id/detail`, `GET /financial-base/suppliers/:id/location-rules`, `GET /financial-base/suppliers/:id/statement-pdf`, `GET /financial-base/suppliers/kpis`, … — lista completa e permissões em `docs/matriz-autorizacao.md`.

## Dependências
Sem dependências diretas de outros módulos (integrações via portas no composition root / `src/server.ts`).

## Regras de negócio
- Rótulos da política: inherit=«Seguir a subcategoria», usually_creates_review=«Enviar por defeito», usually_skips_review=«Não enviar», decide_per_document=«Decidir no documento».

## Problemas conhecidos
Ver «Pontos de atenção» no README do módulo.

## Próximos trabalhos
- Frontend F2: SupplierDrawer já tem os campos (não commitado); falta testar e integrar.
