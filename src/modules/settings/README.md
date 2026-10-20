# Module: settings

> Status: active
> Last updated: 2026-10-11

---

## What it is and what it's for (business perspective)

O **motor de configurações** do Novo RH: as regras (tolerância de entrada,
saída automática, fim de sessão…) definem-se uma vez para toda a empresa e
podem ter exceções por centro, departamento, grupo ou colaborador, sempre com
**data de efeito** e **motivo**, e com histórico de quem mudou o quê.

**The problem it solves:**
Sem versões nem datas de efeito não se sabe que regra valia quando um dia foi
apurado, e uma mudança "silenciosa" altera o passado.

**The flow from the business's point of view:**

```
Admin / RH                                Sistema
──────────────────────                   ──────────────────────
1. Escolhe a regra e o perfil
   (empresa, centro, … ou pessoa)
2. Indica valor, data de efeito, motivo → 3. Valida tipo, limites e dependências
                                          4. Data no passado? Pede permissão
                                             e mostra o impacto
                                          5. Guarda uma versão nova (nunca apaga)
6. Vê, por colaborador, o valor que vale,
   de onde vem e o que herdaria
```

**Key concepts for the business:**

- **Configuração global** — a regra da empresa inteira (uma por área).
- **Segmento** — exceção para um centro, departamento ou grupo.
- **Pessoal** — exceção para um colaborador; ganha sempre.
- **Data de efeito** — a partir de quando a regra vale; uma data no passado é uma alteração retroativa.
- **A validar** — valor proposto que RH/jurídico ainda não confirmou.

---

## Technical purpose

Catálogo de parâmetros em código, perfis com alvos e vigência, valores
append-only e resolução determinística por chave e data (C11). Não guarda as
regras de cada módulo noutro sítio: os módulos do Novo RH leem daqui
(`effectiveFor`).

## Domain concepts

- `SettingDefinition` (`setting-catalog.ts`) — tipo, unidade, limites, valores permitidos, dependências `requires`, `sensitive`, `legal`, `toValidate`.
- `SettingProfile` (global/segment/personal), `SettingTarget` (employee/group/department/location com `validFrom`/`validTo`), `SettingValue` (append-only; `value: null` = deixar de definir).
- Resolução (`setting-resolution.ts`): pessoal > grupo > departamento > centro > global > default (ADR-0024 D3); por chave; empate → alvo mais recente, depois id. Devolve origem e valor herdado.
- Invariantes: motivo obrigatório; uma global por domínio; nomes únicos por domínio; tipo de alvo compatível com o perfil; alvos sem sobreposição; data passada (valor ou alvo) só com `governance.settings_retroactive`; dependências nos dois sentidos (`rule_violation`).

## Ports

### Input (use cases)

- `SettingsPorts` (`SettingsUseCases`) — catálogo, perfis, alvos, valores, pré-visualização de impacto, valores efetivos por colaborador e data, histórico (antes/depois/motivo).

### Output (domain dependencies)

- `SettingsRepositoryPort` — retrato da organização; cria perfis/alvos; acrescenta valores.
- `EmployeeSegmentsPort` — centros/departamentos/grupos do colaborador numa data.
- `SettingsImpactPort` — n.º de colaboradores ativos abrangidos.
- `SettingsClockPort` — hoje no fuso da organização.

## Adapters

### Input

- `SettingsController` → `/api/novo-rh/settings/*` (definitions, profiles, profiles/:id [ETag], targets, values, impact-preview, effective, history, history.csv). Escritas com Idempotency-Key (store persistente) e If-Match; erros RFC 7807 (`rule_violation` 422, `retroactive_not_allowed` 403). Permissão `governance.settings`.

### Output

- `SupabaseSettingsRepository`, `SupabaseEmployeeSegments`, `SupabaseSettingsImpact`, `OrganizationTimezoneClock` (scoped-query). Tabelas `setting_profiles`, `setting_profile_targets`, `setting_values` (trigger append-only), migração `20261012100000`.

## Design decisions (ADR summary)

- Catálogo em código, não na BD: um parâmetro novo é uma alteração revista no git (spec Fase 1, F1-1).
- Dependências validadas contra a "vista do perfil" (o próprio valor, senão o global, senão o default) — aproximação segura para perfis de segmento/pessoais.
- Um alvo com início no passado também é retroativo (muda dias passados).

- **Desempenho** (2026-10-20): a fotografia de perfis/alvos/valores fica 60 s em memória por organização e qualquer escrita deste módulo a limpa (só ele escreve nestas tabelas); `today` também. `everTrue(org, key)` diz se algum perfil alguma vez ligou um parâmetro — para saltar trabalho que nunca se aplica (ex.: validação de excedente nos Pedidos).

## How to test

- Domínio/use cases e HTTP: `npx jest --config jest.config.cjs src/modules/settings`.

## Known gaps / open debt

- Departamentos e grupos vêm do módulo org-structure (pertença direta; subgrupo não herda o grupo-pai).
- `resolved_setting_snapshot` (C11.1) fica para a Fase 4, quando houver apuramento diário.
- Arquivar perfil e terminar vigência de alvo ainda sem endpoint.
