# Módulo: calendar

> Status: active
> Última atualização: 2026-10-06

---

## O que é e para que serve (perspectiva de negócio)

O **calendário corporativo único** (Empresa & Estrutura → Calendário &
Eventos): feriados, eventos da empresa e prazos de documentos num só
sítio, com a vista "Próximos eventos importantes". O Dashboard futuro deve
ler daqui — nunca montar outro calendário.

**O problema que resolve:**
Os feriados só existiam como lista técnica usada pelas Escalas, sem tipo
nem local; eventos da empresa (auditorias, renovações) e validades de
documentos não tinham onde aparecer.

**O fluxo do ponto de vista do negócio:**

```
Admin                                  Gestor                         Todos
──────────────────────────────         ──────────────────────────     ─────────────────────────
1. Importa os feriados de PT           3. Cria eventos (auditoria,    5. Consultam mês/semana e
   do ano (pré-visualiza antes;           formação…) com prioridade      os próximos importantes
   repetir nunca duplica)                 e visibilidade
2. Cria feriados municipais/           4. Cancela (nunca apaga)
   personalizados, empresa ou local
```

**Key concepts for the business:**

- **Feriado** — conceito laboral: Nacional, Municipal/Local ou
  Personalizado; para a empresa inteira ou um Local. Nunca é um evento.
- **Evento empresarial** — informativo; nunca mexe em escalas, férias,
  assiduidade ou remuneração.
- **Prazo** — validade de um documento da Empresa, gerado
  automaticamente.

---

## Technical purpose

Lê e escreve feriados na tabela **já existente** `hr_public_holidays`
(D6 — nunca uma estrutura paralela), gere `company_events`, e monta a
lista unificada de itens (feriados + eventos + prazos) com filtros e
visibilidade. Não gere documentos (lê os prazos via `documents`) nem
Locais (valida via `locations`).

## Domain concepts

- **`Holiday`** — data, nome, `type` (`national|municipal|custom`),
  `locationId` (`null` = empresa). `key` = data + tipo + âmbito — a chave
  de deduplicação da task (§6) e do índice único
  `hr_public_holidays_dedupe_idx`.
- **`CompanyEvent`** — título, data, dia inteiro ou hora início/fim,
  categoria fixa (`meeting|audit|training|maintenance|inspection|deadline|other`),
  Local opcional, prioridade (`normal|important|critical`), responsável
  (texto), visibilidade (`all|management`), `cancel()` em vez de apagar.
- **`portugueseNationalHolidays(year)`** — 13 feriados (10 fixos + Sexta
  Santa, Páscoa, Corpo de Deus pela Páscoa). Conferido contra os feriados
  de 2024–2027 já em produção (datas e nomes iguais).
- **`calendar-items.service.ts`** — `CalendarItem` (`holiday|event|deadline`),
  filtros (tipo, Local — inclui os da empresa —, prioridade),
  visibilidade (`hr_viewer` não vê prazos nem eventos só da gestão),
  `upcomingImportant` (feriados, prazos e eventos importantes/críticos) e
  `deadlinePriority` (≤ 15 dias crítico, ≤ 45 importante).

## Ports

### Input (use cases)

- `ListCalendarPort` (intervalo ≤ ~1 ano + filtros), `ListUpcomingImportantPort`
  (60 dias, 10 itens).
- Feriados: `CreateHolidayPort`, `UpdateHolidayPort`, `DeleteHolidayPort`
  (auditado com o registo completo antes de remover),
  `PreviewHolidayImportPort`, `ImportHolidaysPort` (só os novos;
  idempotente).
- Eventos: `CreateCompanyEventPort`, `UpdateCompanyEventPort`,
  `CancelCompanyEventPort`.

### Output (domain dependencies)

- `HolidayRepositoryPort`, `CompanyEventRepositoryPort`,
  `CalendarAuditLogPort`.
- `DocumentDeadlineReadPort` (ticket 05), `CalendarLocationReadPort` —
  implementados sobre os input ports de `documents`/`locations`.

## Adapters

### Input

- `CalendarController` → `GET /api/calendar`, `GET /api/calendar/upcoming`
  (qualquer role, com visibilidade); `/api/calendar/holidays*` (admin —
  afetam as Escalas); `/api/calendar/events*` (manager+). 409 em feriado
  duplicado.

### Output

- `SupabaseHolidayRepository` → `hr_public_holidays` (escreve `is_national`
  coerente com o tipo, para o legacy).
- `SupabaseCompanyEventRepository` → `company_events`.
- `SupabaseCalendarAuditLogAdapter` → `calendar_audit_logs`.
- `CompanyDocumentDeadlineReadAdapter` → `ListCompanyDocumentsPort`;
  `LocationsCalendarReadAdapter` → `ListLocationsPort`.

## Design decisions (ADR summary)

- **Feriados na tabela existente (D6)** — migração
  `20261006110000_calendar_holidays_events.sql` acrescenta `type`/
  `location_id`; troca `unique (org_id, date)` pela chave da task; um
  trigger preenche `type` nos inserts do legacy (que só enviam
  `is_national`). Escalas (`SupabaseHolidayReadAdapter` do `hr`) e Férias
  (legacy) passam a ler só feriados da empresa inteira — feriados de um
  Local ainda não afetam escalas/férias (fora desta fase, task §28).
- **Prazos derivados, não persistidos (ticket 05)** — a task pede
  `source_type=DOCUMENT`/`source_id`, atualização ao mudar a validade,
  inativação ao substituir e nenhuma duplicação ao reprocessar. Ler sempre
  as versões atuais dos documentos da Empresa cumpre as quatro por
  construção; o item leva `source: { type: "document", id }`.
- **Eventos sem efeitos laborais** — o módulo não tem nenhuma dependência
  de escalas/férias/assiduidade.
- **Feriados só admin, eventos manager** — um feriado muda as Escalas.
- **Importação só PT (D5)** — calculada no código; municipais à mão.

## How to test

- `npx jest src/modules/calendar` (fakes, sem BD) — inclui os testes
  críticos "Feriado importado duas vezes" e a deduplicação por âmbito.

## Known gaps / open debt

- Feriados de um Local não afetam ainda Escalas/Férias (D6).
- Sem integração Google/Outlook (fora de âmbito, task §28).
- Sem teste de integração dos adapters (Supabase local indisponível).
