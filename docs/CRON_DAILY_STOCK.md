# Cron: consumo diário → movimentos de stock

Todos os dias (por omissão **01:30**, fuso **Europe/Lisbon** no servidor com `node-cron`), o job:

1. Considera o dia alvo **`since = until = ontem`** (calendário de Lisboa) — ou seja, à **01:30 de hoje** debita o consumo do **dia civil completo anterior** (ex.: madrugada de 6→7 debita o dia 5). Podes forçar outra data com `TARGET_DATE` ou `target_date` no body HTTP.
2. **Apaga** movimentos anteriores deste job para esse mesmo dia (idempotência — podes reexecutar sem duplicar saídas).
3. Calcula o consumo como em `GET /api/reports/ingredient-consumption` (Vendus + receitas + mapeamentos).
4. **Insere** em `stock_movements` uma linha por item com:
   - `type` = `consumption`
   - `quantity` = **negativa** (saída na `base_unit` do item)
   - `reason` = `CRON_VENDUS:YYYY-MM-DD`
   - `created_by` = `cron-ingredient-consumption`
   - `reference` = `vendus-sales:YYYY-MM-DD`
   - `movement_date` = fim do dia civil em Lisboa (UTC), alinhado aos relatórios

O stock atual continua a ser **`SUM(quantity)`** por item; não há coluna separada de saldo.

---

## Opção A — Script (Render Cron Job / servidor)

```bash
npm run build
npm run cron:daily-vendus-consumption
```

Variáveis de ambiente (as mesmas do backend: `VENDUS_*`, `SUPABASE_*`):

| Variável | Descrição |
|----------|-----------|
| `TARGET_DATE` | Opcional. `YYYY-MM-DD` a processar (ex.: correr manualmente um dia em falta). |
| `CRON_DRY_RUN` | `1` ou `true` — só calcula e mostra JSON; **não** apaga nem insere. |

Desenvolvimento sem build:

```bash
npx tsx src/jobs/runDailyVendusConsumption.ts
```

### Render (Blueprint `render.yaml`)

O repositório inclui um serviço **`type: cron`** (`vendus-daily-vendus-consumption`) que corre `npm run cron:daily-vendus-consumption` após o mesmo `build` que a API.

1. Faz **push** do código e no Render abre o **Blueprint** / **Sync** para criar ou atualizar serviços.
2. No serviço cron, em **Environment**, confirma as mesmas variáveis `VENDUS_*` e `SUPABASE_*` que a API (o Render pede valores `sync: false` na primeira vez).
3. **Cron no Render não é plano gratuito** — o `render.yaml` usa `plan: starter` para esse job. O Web Service pode continuar em free.
4. O **schedule** no Blueprint está em **UTC** (`30 1 * * *` = 01:30 UTC). Em Portugal no **inverno** (UTC+0) isso é **01:30 Lisboa**. No **verão** (UTC+1), para manter **01:30 Lisboa** altera no dashboard para **`30 0 * * *`** (00:30 UTC) ou ajusta em março/outubro.

**crontab** noutro servidor: define `TZ=Europe/Lisbon` ou a hora UTC equivalente.

---

## Opção B — Agendamento dentro do processo Node (`node-cron`)

Útil com **uma única instância** do servidor (várias instâncias = várias execuções — evita).

```env
ENABLE_DAILY_CONSUMPTION_CRON=true
DAILY_CONSUMPTION_CRON_SCHEDULE=30 1 * * *
```

- `DAILY_CONSUMPTION_CRON_SCHEDULE`: 5 campos (minuto hora dia mês dia-da-semana), timezone fixo **`Europe/Lisbon`**.
- Por omissão já é **01:30** todos os dias (debita o dia anterior).

---

## Opção C — HTTP (cron externo com URL)

1. Define um segredo forte:

   ```env
   CRON_SECRET=<gera_um_token_longo_aleatório>
   ```

2. O servidor expõe (só se `CRON_SECRET` estiver definido):

   `POST /api/internal/cron/daily-vendus-consumption`  
   Header: `Authorization: Bearer <CRON_SECRET>`  
   Body JSON opcional: `{ "target_date": "2025-02-04", "dry_run": false }`

3. Usa um serviço de cron HTTPS que faça POST com esse header.

---

## Segurança

- **Não commits** `CRON_SECRET` nem chaves Supabase.
- Em produção, considera **service role** do Supabase só para este job (e políticas RLS mais restritas para `anon`); hoje o projeto usa `anon` com políticas permissivas — alinha com a tua postura de segurança.
- A rota interna só existe com `CRON_SECRET`; usa token de alta entropia.

---

## Comportamento / limitações

- Itens sem consumo no dia não geram linha (nada a debitar).
- Reexecução no **mesmo** `target_date` substitui as linhas deste cron para esse dia (não acumula duplicado).
- O consumo depende da **mesma lógica** que o painel (mapeamentos, receitas, documentos Vendus no intervalo).
