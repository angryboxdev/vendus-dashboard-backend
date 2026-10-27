# Angry Box App Hub — visão geral

Backoffice ("Mezza ERP") para restauração, nascido para a pizzaria Angry Box e em evolução para SaaS multi-organização. Este repositório é o **backend** (API Express/TypeScript sobre Supabase). O frontend (React) vive num repositório irmão com as mesmas regras de arquitetura (ver `CLAUDE.md`).

Glossário do domínio (Organization, Location, Location Token…): `CONTEXT.md`.

## Objetivos
- Centralizar a operação: caixa, vendas, faturas de fornecedores, contas a pagar, conciliação bancária, stock e RH.
- Isolamento por organização (`org_id` em todas as tabelas; ADR-0005/0007/0008) e lojas como entidade de primeira classe (ADR-0002).
- Novo RH completo (pessoas, tempo, assiduidade, ausências, banco de horas, escalas, fecho de período).
- Integridade financeira (task Financeiro/Stock v1.2): um documento fiscal = uma identidade, valores exatos, uma obrigação por documento.

## Módulos (`src/modules`, 51) — um documento cada em `docs/modulos/`
- **Financeiro:** [invoices](modulos/invoices.md), [financial-base](modulos/financial-base.md), [fiscal-documents](modulos/fiscal-documents.md), [payable-entries](modulos/payable-entries.md), [payable-recurrences](modulos/payable-recurrences.md), [bank-accounts](modulos/bank-accounts.md), [bank-statements](modulos/bank-statements.md), [accounting](modulos/accounting.md), [cash-closings](modulos/cash-closings.md), [sales-declaration](modulos/sales-declaration.md), [sales-summary](modulos/sales-summary.md), [cash-flow](modulos/cash-flow.md)
- **Stock:** [stock-purchase-review](modulos/stock-purchase-review.md), [stock-count](modulos/stock-count.md), [stock-planning](modulos/stock-planning.md) (+ stock legado em [legado](modulos/legado.md))
- **Vendas e integrações:** [vendus](modulos/vendus.md), [air-menu](modulos/air-menu.md), [kds](modulos/kds.md), [crm](modulos/crm.md)
- **Plataforma:** [access](modulos/access.md), [organization](modulos/organization.md), [locations](modulos/locations.md), [location-credentials](modulos/location-credentials.md), [legal-entities](modulos/legal-entities.md), [invitations](modulos/invitations.md), [settings](modulos/settings.md), [audit](modulos/audit.md), [notifications](modulos/notifications.md), [demo-data](modulos/demo-data.md), [tasks](modulos/tasks.md) (módulo de referência)
- **RH (Base Organizacional / RH antigo):** [hr](modulos/hr.md), [documents](modulos/documents.md), [calendar](modulos/calendar.md)
- **Novo RH:** [people](modulos/people.md), [org-structure](modulos/org-structure.md), [time-base](modulos/time-base.md), [attendance](modulos/attendance.md), [absences](modulos/absences.md), [time-bank](modulos/time-bank.md), [rosters](modulos/rosters.md), [periods](modulos/periods.md), [reports](modulos/reports.md), [alerts](modulos/alerts.md), [announcements](modulos/announcements.md), [document-distributions](modulos/document-distributions.md), [inbox](modulos/inbox.md), [reminders](modulos/reminders.md), [workspace](modulos/workspace.md), [overview](modulos/overview.md), [dashboard](modulos/dashboard.md), [assistant](modulos/assistant.md), [google-reviews](modulos/google-reviews.md)
- **Legado** (`src/routes` + `src/services`): [legado](modulos/legado.md)

## Integrações externas
Vendus (POS/faturação), AirMenu (agregador de delivery), Supabase (Postgres, Auth com MFA TOTP, Storage), OpenAI ou Google Gemini (extração de faturas, Assistente Mezza — fornecedor por variável de ambiente), Google Places (avaliações). Alojamento: Render (API, região Frankfurt) e Vercel (frontend); subprocessadores na UE (ADR-0019).
