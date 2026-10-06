# Catálogo de permissões — proposta (ticket 01)

Levantamento de 2026-10-06: **437 rotas** montadas (inventário completo feito
rota a rota em `src/server.ts` + routers/controllers). Produção: 1
organização, **6 Admin, 2 Manager, 0 Visualizador RH, 0 Colaborador**.

Regra geral: `READ` = pedidos GET (e pré-visualizações sem efeito);
`MANAGE` = escritas. Permissões especiais só para operações sensíveis.

## Módulos e funcionalidades

| Módulo | Funcionalidade | Rotas (resumo) |
|---|---|---|
| **Vendas** | Painel & documentos | `/api/vendus/*`, `/api/analytics/*`, `/api/documents*` (legado), `/api/reports/monthly-summary` |
| | Resultados | `/api/sales-summary*` |
| | Fechos de caixa | `/api/cash-closings` (gestão) |
| | Air Menu | `/api/air-menu/*` (gestão) |
| **DRE** | Demonstrativo | `/api/reports/dre/receita-bruta`, `/kpis` |
| | Custos fixos | `/api/reports/dre/custos-fixos*` |
| | Custos variáveis | `/api/reports/dre/custos-variaveis*` |
| **Financeiro** | Centros de custo | `/api/financial-base/cost-center-*`, `/channels`, `/cost-centers/seed` |
| | Fornecedores | `/api/financial-base/suppliers*` |
| | Faturas | `/api/invoices*` |
| | Contas a pagar | `/api/payable-entries*` |
| | Recorrências | `/api/payable-recurrences*` |
| | Bancos & conciliação | `/api/bank-accounts*`, `/api/bank-statements*` |
| | Contabilidade | `/api/accounting/*` |
| **Stock** | Artigos & categorias | `/api/stock/categories*`, `/api/stock/items*` |
| | Movimentos | `/api/stock/movements*`, `/api/stock/items/:id/movements`, `/api/reports/ingredient-consumption` |
| | Importação de faturas | `/api/stock/invoice-imports*` |
| | Compras por rever | `/api/stock-purchase-reviews*` |
| | Contagens | `/api/stock-count/*` |
| | Planeamento | `/api/stock-planning/*` |
| | Pizzas & preparações | `/api/pizzas*`, `/api/preparations*` |
| **CRM** | Clientes & encomendas | `/api/crm/customers*`, `/customer-table`, `/orders*`, `/dashboard`, `/actions*`, `/tags*` |
| | Contactos | `/api/crm/contacts*` |
| | Configuração | `/api/crm/scripts*`, `/parameters*`, `/action-types*` |
| **Recursos Humanos** | Visão Geral | `/api/hr/overview*` |
| | Colaboradores | `/api/hr/people*` (dados, foto, estado, histórico), `/api/hr/employees*` (legado), acesso ao Portal |
| | Documentos dos colaboradores | `/api/hr/people/:id/documents*`, `/api/hr/document-overview`, legado `/employees/:id/documents*` |
| | Escalas & Turnos | `/api/hr/schedules/*` (turnos, modelos, automatizações, rotações, escala base), legado `/api/hr/shifts*` |
| | Assiduidade | `/api/hr/attendance/issues*`, `/rules*`, `/summary`, `/employee/:id`, legado `/shifts/:id/attendance` |
| | Fecho mensal | `/api/hr/attendance/closure` (+ `/close`) |
| | Férias & Ausências | `/api/hr/leave/*`, `/employees/:id/leave*` |
| | Pagamentos | `/api/hr/employees/:id/payments`, `/api/hr/payments/*` (legado) |
| | Histórico | `/api/hr/audit-logs` |
| **Empresa & Estrutura** | Empresa | `/api/organization*` |
| | Locais | `/api/locations*` (inclui zona de picagem) |
| | Cargos | `/api/hr/positions*` |
| | Documentos da Empresa | `/api/company-documents*`, `/api/document-categories*` (e `/api/hr/document-categories*`) |
| | Calendário & Eventos | `/api/calendar`, `/upcoming`, `/events*` |
| | Feriados | `/api/calendar/holidays*`, legado `/api/hr/leave/holidays` (escrita) |
| | Dispositivos | `/api/location-credentials/*` (gestão de emparelhamento) |
| **Utilizadores** 🔒 | Utilizadores · Perfis de acesso | só Admin (não configurável) |

### Permissões especiais (poucas, só operações sensíveis)

| Módulo | Permissão especial | Hoje |
|---|---|---|
| RH | Ver dados sensíveis (NIF, IBAN, NISS, CC) | Manager vê; Visualizador RH mascarado |
| RH | Reabrir mês fechado | só Admin |
| RH | Importar recibos em massa | só Admin |
| RH | Definir PIN do quiosque | só Admin |
| Stock | Confirmar contagens / forçar sobreposição / valor manual | só Admin |
| Stock | Operações de previsão (backfill, correr previsão, desvios) | só Admin |
| Empresa | Documentos confidenciais (visibilidade "Admin") | só Admin |

### Leituras de base (não configuráveis)

Qualquer utilizador da área de gestão (não o Colaborador) lê a lista de
Locais, o perfil da Empresa, as categorias de documentos e o calendário
filtrado — são usados por seletores em todo o sistema. Hoje já é assim.

## Perfis iniciais (proposta de valores)

| Módulo | Admin | Manager (= hoje) | RH | Financeiro | Colaborador |
|---|---|---|---|---|---|
| Vendas | Gerir | Gerir | — | Ver | — |
| DRE | Gerir | Gerir | — | Gerir | — |
| Financeiro | Gerir | Gerir | — | Gerir | — |
| Stock | Gerir | Gerir | — | Ver (Compras por rever, Importação) | — |
| CRM | Gerir | Gerir | — | — | — |
| RH | Gerir | Gerir (exceto Reabrir mês, Importar recibos, PIN) | Gerir (+ dados sensíveis; sem Reabrir mês) | Ver Pagamentos | — |
| Empresa | Gerir | Ver Empresa/Locais/Feriados/Dispositivos; Gerir Cargos, Documentos, Calendário | Ver; Gerir Cargos | Ver | — |
| Especiais | todas | Ver dados sensíveis | Ver dados sensíveis, Importar recibos | — | — |
| Utilizadores | ✔ | — | — | — | — |

Colaborador: só Portal (ligado à ficha).

## Achados do levantamento

1. **Bug atual:** as montagens `app.use("/api", requireMinRole("manager"), …)`
   (server.ts:285+) aplicam o gate de manager a TODO o `/api` que vem depois
   — o Visualizador RH leva 403 em todas as rotas de RH, apesar de o código
   dizer o contrário (confirmado com teste). Sem utilizadores afetados (0
   contas). O motor novo corrige isto.
2. **Rotas sem autenticação** (fora deste âmbito, a tratar à parte):
   `GET /api/hr/kiosk/daily-token`, `GET /api/air-menu/webhook/stream`, e
   `POST /api/air-menu/webhook/receive` se `AIRMENU_WEBHOOK_SECRET` não
   estiver definido.
3. GET legado `/api/hr/employees[/:id]` não mascara dados sensíveis.
4. Visualizador RH: **sem contas** → proposta de não o criar como perfil.

## Decisões do utilizador (2026-10-06) — catálogo VALIDADO

- Hoje "todos fazem tudo"; os perfis passam a separar Financeiro, RH e um
  Manager **operacional** (substitui a coluna "Manager (= hoje)" acima):
  Vendas Ver · DRE — · Financeiro — · Stock Gerir (sem especiais) · CRM Gerir ·
  RH: Gerir Escalas & Turnos, Assiduidade, Férias & Ausências; Ver Visão Geral,
  Colaboradores, Documentos; sem Pagamentos, Fecho mensal, Histórico, dados
  sensíveis · Empresa Ver.
- RH não participa nas escalas: perfil RH com **Escalas & Turnos = Ver**.
- **Sem perfil Visualizador RH** (0 contas; cria-se como perfil personalizado se preciso).
- Contas atuais: `gabriel@angrybox.pt` (gestor) → **Manager**, ligado à sua ficha
  pelo Editar utilizador (a ficha tem o email pessoal — não se altera);
  `gabrielle@angrybox.pt` (gestor) → migra como Manager e o Admin muda para
  **RH** no ecrã novo. 6 Admin → Admin.
- Não usar "Dar acesso ao Portal" na ficha do Gabriel até existir a ligação
  por seleção de conta (criaria 2.ª conta pelo email da ficha).
