# Módulo: CRM

> Status: em refactor
> Última atualização: 2026-08-22

---

## O que é e para que serve (perspectiva de negócio)

O módulo CRM centraliza a operação diária sobre clientes: identificar a situação atual de cada pessoa, planejar o próximo contacto, registrar ações concluídas e organizar a base com tags. A listagem operacional já usa este módulo; dashboard e detalhe do cliente ainda pertencem ao CRM legado.

**O problema que resolve:**

Sem uma visão única, dados comerciais do CRM, histórico da eatz e follow-ups manuais ficavam misturados. O módulo cria um read model consistente e uma timeline nova, na qual última e próxima ação possuem significado inequívoco.

**O fluxo do ponto de vista do negócio:**

```text
Utilizador do CRM                         Sistema
────────────────────────────────────     ────────────────────────────────────
1. Pesquisa ou filtra clientes       →   2. Consolida CRM + snapshot eatz
3. Agenda uma próxima ação           →   4. Registra uma pendência com data
5. Executa e confirma a ação         →   6. Move a ação para o histórico
7. Agenda o passo seguinte           →   8. Mantém apenas uma pendência ativa
9. Adiciona ou remove tags           →  10. Atualiza a classificação dos clientes
```

**Conceitos-chave para o negócio:**

- **Estado de relacionamento** — classificação automática em `new`, `recurring` ou `vip`, baseada em pedidos e LTV.
- **Inativo** — indicador independente e acumulável; um VIP também pode estar inativo.
- **Próxima ação** — única ação pendente do cliente. Sua data agendada é a data de follow-up.
- **Última ação** — ação concluída mais recentemente na timeline nova.
- **Histórico de ações** — ações concluídas ou canceladas, carregadas sob demanda.
- **Tag** — classificação criada pelo utilizador e atribuível a um ou vários clientes.
- **Snapshot eatz** — fotografia histórica da plataforma externa, usada quando o CRM ainda não possui pedidos concluídos.
- **Último script** — informação temporária derivada de contactos enviados; não é uma ação.

---

## Propósito técnico

O módulo constrói o read model paginado da tabela de clientes e coordena comandos de ações, tipos de ação, tags e inatividade. O domínio calcula estados sem conhecer Express ou Supabase; a aplicação depende exclusivamente de `CrmWorkspaceRepositoryPort`.

O módulo não é responsável pela página de detalhe, dashboard, criação geral de clientes nem pelos fluxos antigos de contactos e follow-ups.

## Conceitos do domínio

### Métricas efetivas

Para cada cliente:

1. Se existem pedidos `concluído` em `crm_orders`, eles determinam quantidade, LTV, ticket médio e último pedido.
2. Pedidos `cancelado` não participam das métricas.
3. Sem pedidos concluídos, são usados `eatz_order_count`, `eatz_total_spent`, `eatz_avg_ticket` e `eatz_last_order_date`.
4. Sem nenhuma das fontes, as métricas são zero e a origem é `none`.

O read model informa a origem em `metricsSource`: `crm_orders`, `eatz_snapshot` ou `none`.

### Estado do cliente

- `new`: 0 ou 1 pedido efetivo.
- `recurring`: 2 ou mais pedidos, sem atingir um limite VIP.
- `vip`: quantidade de pedidos maior ou igual a `vip_min_orders`, ou LTV maior ou igual a `vip_min_ltv`.
- `inactive`: calculado separadamente e pode coexistir com qualquer relacionamento.

Motivos de inatividade, por prioridade:

1. `manual`: o campo `crm_customers.inactive` está ativo.
2. `no_order`: nenhum pedido e cadastro há mais de `crm_new_no_order_days` dias.
3. `one_order`: um pedido e último pedido há mais de `crm_new_one_order_days` dias.
4. `repeat`: dois ou mais pedidos e último pedido há mais de `crm_inactive_repeat_days` dias.

Os valores padrão são, respectivamente, 21, 30 e 60 dias. A comparação é “maior que”; o cliente continua ativo exatamente no dia limite.

### Timeline de ações

- A timeline vive em `crm_customer_actions` e começa vazia.
- Agendamento cria sempre uma ação `pending`; o utilizador não escolhe o estado.
- `scheduled_for` é obrigatório no endpoint de criação.
- A próxima ação é a pendência com menor `scheduled_for`.
- Concluir altera a mesma entidade para `completed` e exige `completed_at`.
- A última ação é a concluída com maior `completed_at`.
- Existe no máximo uma ação pendente por cliente, garantida por índice único parcial.
- `crm_contacts`, `manual_followup_date` e scripts legados nunca alimentam essa timeline.

### Tipos de ação e tags

- O catálogo de tipos começa vazio e é construído pelos utilizadores.
- O `code` do tipo é uma identidade imutável normalizada; `name` é uma label editável.
- Como as ações referenciam o `code` e a leitura resolve a label atual, renomear um tipo atualiza sua exibição histórica.
- Tags também recebem identidade normalizada a partir da label.
- Atualização em massa separa explicitamente as listas `add` e `remove`.

## Ports

### Entrada (casos de uso da aplicação)

Expostos por `CrmWorkspaceService`:

- `listCustomers` — constrói, filtra, ordena e pagina o read model da tabela.
- `listTags` / `createTag` — consulta e amplia o catálogo de tags.
- `listActionTypes` / `createActionType` / `updateActionType` — gerencia tipos de ação.
- `createActions` — agenda ações individuais ou em massa.
- `completeAction` / `completeActions` — conclui uma ou várias pendências.
- `listCustomerActions` — devolve próxima ação e histórico paginado por cursor.
- `updateTags` — adiciona e remove tags de vários clientes.
- `setInactive` — altera o indicador manual de inatividade.

### Saída (dependências do domínio/aplicação)

`CrmWorkspaceRepositoryPort` define:

- `loadDataset` — carrega clientes, pedidos, contactos, ações, tags, scripts e parâmetros necessários ao read model.
- Operações de catálogo para tags e tipos de ação.
- Persistência e conclusão de ações.
- Consulta paginada do histórico.
- Associação/desassociação de tags.
- Atualização da inatividade manual.

## Adapters

### Entrada

`CrmWorkspaceController` expõe rotas REST autenticadas sob `/api`:

| Método | Rota | Responsabilidade |
| --- | --- | --- |
| `GET` | `/crm/customer-table` | Lista clientes com filtros, ordenação e paginação. |
| `GET` | `/crm/action-types` | Lista tipos de ação. |
| `POST` | `/crm/action-types` | Cria um tipo; código explícito é opcional. |
| `PATCH` | `/crm/action-types/:code` | Edita label e, opcionalmente, cor. |
| `POST` | `/crm/actions` | Agenda ações `pending`; exige `scheduledFor`. |
| `PATCH` | `/crm/actions/:id/complete` | Conclui uma ação pendente. |
| `PATCH` | `/crm/actions/complete-bulk` | Conclui de 1 a 100 ações, cada uma com sua data/hora. |
| `GET` | `/crm/customers/:customerId/actions` | Carrega pendência e histórico; limite máximo 50. |
| `GET` | `/crm/tags` | Lista tags. |
| `POST` | `/crm/tags` | Cria tag. |
| `PATCH` | `/crm/customers/tags` | Adiciona/remove tags de até 1.000 clientes. |
| `PATCH` | `/crm/customers/inactive` | Altera inatividade manual de até 1.000 clientes. |

Parâmetros de `GET /crm/customer-table`:

- Pesquisa: `search` em código, nome ou telefone.
- Estado: `status` e `activity`.
- Tags: `tags` separadas por vírgula e `tagMode=any|all`.
- Ações: `lastActionType` e `nextActionType`.
- Follow-up: `followUpFrom`, `followUpTo` e `followUpState`.
- Ordenação: `sortBy` e `sortDirection`.
- Paginação: `page` e `pageSize`; padrão 10, máximo 100.

### Saída

`SupabaseCrmWorkspaceRepository` implementa o port usando service role e acessa:

- `crm_customers`
- `crm_orders`
- `crm_contacts`
- `crm_customer_actions`
- `crm_action_types`
- `crm_tags`
- `crm_customer_tags`
- `crm_scripts`
- `crm_parameters`

`crm.module.ts` é o composition root: obtém o client Supabase, cria repository, service e controller. Nenhuma outra camada instancia o adapter concreto.

## Migrations relacionadas

As migrations são preparadas pelo projeto, mas aplicadas manualmente pelo responsável do banco.

| Migration | Papel |
| --- | --- |
| `084_crm_eatz_snapshot.sql` | Adiciona os campos `eatz_*`, importa o snapshot de 2026-08-15, atualiza registros canônicos e insere 59 clientes `C231–C289`. Mantém `C160` em quarentena e não apaga duplicados. |
| `085_crm_customer_table_actions.sql` | Evolui tags, cria catálogos/timeline, índices e parâmetros de inatividade. Não faz backfill legado. |
| `086_crm_remove_legacy_action_backfill.sql` | Remove somente ações criadas por versões iniciais que importavam contactos/follow-ups legados. |
| `087_crm_reset_customer_actions.sql` | Limpa a timeline antes da entrada em uso do fluxo definitivo. |
| `088_crm_reset_action_types.sql` | Limpa timeline e catálogo de tipos padrão para começar com catálogo criado pelo utilizador. |
| `089_crm_single_pending_action.sql` | Deduplica pendências antigas e cria índice único para uma pendência por cliente. |

## Decisões de design (ADR resumido)

- **Estado composto em vez de enum único:** relacionamento e inatividade respondem a perguntas diferentes e podem coexistir.
- **Pedidos CRM têm precedência sobre eatz:** o snapshot é fallback histórico, não uma segunda fonte acumulada.
- **Timeline nova sem backfill:** contactos, scripts e follow-ups antigos tinham semânticas diferentes e gerariam dados falsos em “Última ação”.
- **Follow-up deriva da próxima ação:** não existe uma segunda data capaz de divergir de `scheduled_for`.
- **Código do tipo imutável e label mutável:** preserva referências e permite renomear o catálogo sem reescrever ações.
- **Histórico sob demanda:** evita aumentar o payload principal da tabela.
- **Read model montado na aplicação:** mantém regras testáveis sem Express ou Supabase.
- **IDs em massa limitados:** controllers impõem limites de 100 ações e 1.000 clientes para evitar comandos acidentais sem limite.

## Como testar

- Módulo CRM: `npm test -- --runInBand --testPathPattern=src/modules/crm`
- Suíte completa: `npm test -- --runInBand`
- Build: `npm run build`

Cobertura unitária atual:

- Regras e limites do estado do cliente.
- Precedência CRM/eatz e exclusão de pedidos cancelados.
- Seleção da última/próxima ação e independência do legado.
- Pesquisa, tags, follow-up, ordenação e paginação.
- Normalização de tipos/tags e cursor do histórico.

## Pontos de atenção / dívidas conhecidas

- Dashboard e detalhe continuam no CRM legado; os contratos convivem durante a migração.
- O adapter carrega o dataset necessário e filtra/pagina em memória. Deve ser reavaliado se o volume crescer significativamente.
- Não há testes de integração do controller Express nem do repository Supabase; a cobertura atual usa fakes do port.
- `Último script` é temporário e ainda depende de `crm_contacts`/`crm_scripts`.
- `setInactive` permanece disponível no contrato, embora a ação em massa tenha sido removida da tabela atual.
- A migration `084` é uma importação pontual, inclui dados gerados e utiliza staging persistente para tolerar execução interrompida no SQL Editor.
