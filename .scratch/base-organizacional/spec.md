# Spec — Base Organizacional 1.0

Status: in-progress
Origem: `Task_Base_Organizacional_1_0_Compacta.md` (enviada pelo utilizador em 2026-10-04).
Branch: `branch-rh` (backend + frontend).

## Objetivo

Criar a fundação organizacional transversal (Empresa & Estrutura) e evoluir
RH → "Pessoas" para "Colaboradores" (Lista | Cargos | Documentos), antes de
evoluir Escalas, Férias e Assiduidade — que **não mudam** nesta task.

## Decisões (confirmadas com o utilizador em 2026-10-04)

- **D1 — Empresa = `Organization` existente.** Expande-se a tabela
  `organizations`; nenhuma entidade "Company" nova (CONTEXT.md: _avoid_
  Company). Multiempresa por tenant não é implementado; quando for, exige
  ADR (contradiz a definição atual de Organization = 1 NIF).
- **D2 — Motor documental num novo módulo `documents`.** Generaliza
  `hr_employee_documents`/`hr_document_categories` (dados preservados) com
  `owner_type` (COMPANY|EMPLOYEE) + `owner_id` e âmbito nas categorias
  (Empresa|Colaborador|Ambos). O `hr` e a Empresa consomem via ports.
- **D3 — Auditoria: tabela própria por módulo** (padrão já usado por
  accounting/stock-review/stock-count). Alterações do colaborador
  (cargo/local) continuam em `hr_audit_logs`.
- **D4 — Cargos com mapeamento transitório.** Nova entidade Cargo; cada
  Cargo tem uma "categoria operacional" (manager|prep|service) usada pelas
  Escalas (rotações) até estas migrarem. O enum `hr_employees.job_role`
  mantém-se em paralelo até validação (task §17).
- **D5 — Feriados PT calculados no código** (fixos + móveis via Páscoa),
  sem dependência externa. Lista a validar pelo utilizador antes de
  produção. Municipais são manuais.
- **D6 — Feriados por Local não afetam as Escalas nesta fase:** o
  `HolidayReadPort` do `hr` passa a ler só feriados de âmbito Empresa
  (comportamento atual preservado).
- **D7 — Local ↔ centro de custo: fora desta fase.** Os `cost_center_*`
  do `financial-base` são classificação de despesa, não centros de custo
  por loja; a task marca o campo como opcional e proíbe preparar UI sem
  funcionalidade.
- **D8 — Estado da Empresa é só leitura na UI** (ativar/desativar o
  tenant é um assunto de provisioning/faturação, não de configuração).

## Fases (ver `issues/`)

A — Empresa & Estrutura: 01 Empresa · 02 Locais · 03 Documentos (motor) ·
04 Calendário & Eventos (+ feriados) · 05 Documento → prazo no calendário.
B — Colaboradores: 06 Renomear Pessoas → Colaboradores (+ resumo/onboarding) ·
07 Cargos + migração Função → Cargo · 08 Local principal ·
09 Documentos consolidados (âmbito, obrigatoriedade por cargo) ·
10 Recibos de vencimento + importação em massa.

## Fora de âmbito

Ver task §28 (departamentos, equipas, organograma, onboarding, assinatura,
alterações a Escalas/Férias/Assiduidade, OCR/IA própria, etc.).
