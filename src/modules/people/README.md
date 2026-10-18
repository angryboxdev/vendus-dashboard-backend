# Module: people

> Status: active
> Last updated: 2026-10-11

---

## What it is and what it's for (business perspective)

Novo RH → **Pessoas**: a ficha de cada colaborador (dados pessoais e de
trabalho), contratos com vigência, responsáveis e validadores, complementos e
benefícios, campos personalizados da empresa, desativação, importação e
exportação. Cada pessoa vê só os campos que o seu perfil permite e só os
colaboradores do seu âmbito.

**The problem it solves:**
Dados pessoais espalhados e sem controlo de quem vê o quê; contratos sem
histórico; exportações que levam IBAN/NIF para quem não devia.

**Key concepts for the business:**

- **Ficha** — a mesma do RH atual (uma pessoa = uma ficha); obrigatórios: nome, apelido, NIF, data de admissão, centro principal (D4).
- **A completar** — fichas antigas a que falta algum obrigatório.
- **Contrato** — tipo, início/fim, período experimental, horas semanais, FTE, convénio; não se sobrepõem.
- **Responsáveis** — direto e validadores (ponto e férias), até 3 níveis, com datas.
- **Complemento / benefício** — só para quem tem a mesma moeda (e, no benefício, o mesmo período de pagamento).

---

## Technical purpose

Use cases sobre `hr_employees` (ADR-0025) e tabelas novas (migração
`20261013100000`). Privacidade por campo, âmbitos e permissões especiais
chegam num `Viewer` montado pelo `server.ts` a partir do módulo access.

## Domain concepts

- `Employee`, `normalizeInput` (normaliza NIF/IBAN, valida e-mails/datas), `requireMandatory` (RE-1 + D4), `PRIVACY_KEY` (campo → privacidade), `SENSITIVE_FIELDS` (alterar exige motivo).
- `Contract` + `contractOverlaps` (TK-9), `validateManager`, `compensationRuleViolation` (CF-14), campos personalizados com opções.
- Auditoria sem valores sensíveis (`[registado]`).
- O centro principal não muda por edição: usa-se a transferência (`org-structure.transfer`, TK-10).

## Ports

### Input (use cases)

- `PeopleUseCases` — listar/abrir (âmbito + máscara), criar, editar (If-Match, motivo em sensíveis), desativar/reativar (RE-4), exportar CSV (RE-3, RE-34), importar CSV (simulação, erros por linha, tudo-ou-nada).
- `EmploymentUseCases` — contratos, convénios, responsáveis, complementos/benefícios, campos personalizados.

### Output (domain dependencies)

- `PeopleRepositoryPort` (inclui `listContractsStartedBy` — contratos ativos já iniciados, de todos, para as horas semanais da lista), `PeopleAccountPort` (desativar conta ligada), `PeopleAuditPort`, `PeopleClockPort`.
- `PeoplePhotoPort` — URLs de leitura das fotos (`photo_storage_path`), um pedido por lista; opcional (sem ele, `photoUrl` é null).

## Adapters

### Input

- `PeopleController` → `/api/novo-rh/people/*` (`hr.employees`; `export.csv` = especial `hr.people_export`) e `/api/novo-rh/catalog/*` (`company.structure`; inclui `catalog/locations` e `catalog/positions` — centros e cargos ativos, usados pelo Novo RH também em modo Demonstração).

### Output

- `SupabasePeopleRepository`.
- `SupabasePeoplePhotoAdapter` — URLs assinados (1 h) no bucket privado `hr-photos`; caminhos `demo-avatars/…` (só a organização de demonstração) apontam para ficheiros estáticos do frontend.

## Design decisions (ADR summary)

- Uma só ficha (`hr_employees`), tabelas novas à volta — ADR-0025.
- NIF obrigatório só nas escritas do Novo RH (não parte o RH atual); índice único parcial na BD.
- Contratos: sobreposição recusada na aplicação (409) e por trigger na BD.
- Foto: a lista e a ficha devolvem `photoUrl` (assinado, curta duração), nunca o caminho guardado; uma foto que falhe a assinar fica só sem foto (a lista não parte). O carregamento da foto continua no RH atual.
- Lista com `weeklyHours` (2026-10-18): horas semanais do contrato vigente hoje, numa leitura (`listContractsStartedBy`) + escolha pura `weeklyHoursOn` (ativo, já iniciado, não terminado; o mais recente) — sem pedido por pessoa. Só na lista; os contratos não têm privacidade por campo (quem vê a pessoa vê o contrato). As horas de hoje e o horário do dia vêm de `GET /novo-rh/overview` (mesma fonte da Visão geral), não deste módulo.

## How to test

- `npx jest --config jest.config.cjs src/modules/people`.

## Known gaps / open debt

- "Jornada ≤ máximos legais configurados" fica para a Fase 3 (parâmetros legais D6).
- Exportação síncrona (até algumas centenas de linhas); assíncrona com link a expirar quando crescer.
- Recalcular férias ao criar contrato: Fase 5.
