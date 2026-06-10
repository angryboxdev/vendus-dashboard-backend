# Módulo: tasks

> Status: ativo
> Última atualização: 2026-06-10

## Propósito

Módulo de referência da arquitetura hexagonal deste projecto. Gere tarefas simples
(criar, listar, concluir) e serve de **molde para todos os módulos novos**:
demonstra, de forma completa e idiomática, todos os padrões da arquitectura.
Não é responsabilidade deste módulo: autenticação, notificações reais (usa apenas
um adapter de console), ou persistência em base de dados (o adapter Postgres é um
stub).

## Conceitos do domínio

- **Task** — entidade principal com `id`, `title` (VO), `status` e `createdAt`.
  Invariante: uma task já concluída não pode ser concluída de novo
  (`TaskAlreadyDoneError`).
- **TaskTitle** — value object que valida e normaliza o título (trim, tamanho
  máximo 200 caracteres). Construtores privados garantem que só existem instâncias
  válidas.
- **TaskStatus** — `"pending"` | `"done"`. Transição só permitida de pending → done.

## Ports

### Entrada (use cases)

- `CreateTaskPort` — cria uma nova task a partir de um título raw; persiste e
  dispara notificação.
- `CompleteTaskPort` — marca uma task como done; lança `TaskNotFoundError` se o id
  não existir, `TaskAlreadyDoneError` se já estava concluída.
- `ListTasksPort` — devolve todas as tasks como DTOs simples (sem internals do VO).

### Saída (dependências do domínio)

- `TaskRepositoryPort` — persistência: `save`, `findById`, `findAll`.
- `NotificationPort` — gateway de notificação: `notifyTaskCreated`. Demonstra que
  o domínio pode declarar dependências de qualquer tipo externo via interface, sem
  saber como são implementadas.

## Adapters

### Entrada

- `TaskController` → expõe os três use cases via REST:
  - `POST /tasks` — cria tarefa
  - `PATCH /tasks/:id/complete` — conclui tarefa (409 se já done, 404 se não existe)
  - `GET /tasks` — lista todas as tarefas

### Saída

- `InMemoryTaskRepository` → implementa `TaskRepositoryPort` com um `Map` em
  memória. Usado por defeito no composition root.
- `PostgresTaskRepository` → implementa `TaskRepositoryPort` com queries SQL
  (stub com TODOs — estrutura pronta, queries por implementar).
- `ConsoleNotificationAdapter` → implementa `NotificationPort` com `console.log`.

## Decisões de design (ADR resumido)

### Repositório injectado por interface

O domínio e os use cases conhecem apenas `TaskRepositoryPort` (interface). Nunca
importam `InMemoryTaskRepository` nem `PostgresTaskRepository`. Isto significa que:

1. **Trocar de provedor de persistência requer mudar exactamente uma linha** —
   no `tasks.module.ts` (composition root), substituir
   `new InMemoryTaskRepository()` por `new PostgresTaskRepository(client)`.
2. **Os testes unitários usam `FakeTaskRepository`** — um fake definido nos
   próprios testes, que implementa a mesma interface. Sem banco, sem rede, sem
   setup.
3. **O domínio nunca importa libs de infra** — garantido estaticamente pelo
   `dependency-cruiser` (regra `domain-puro-sem-infra`).

### Dois adapters para o mesmo output port

`InMemoryTaskRepository` e `PostgresTaskRepository` implementam o mesmo
`TaskRepositoryPort`. São completamente intercambiáveis do ponto de vista dos
use cases. Esta é a demonstração central do padrão "plug and play" de adapters.

### Composition root como único ponto de montagem

`tasks.module.ts` é o único ficheiro do módulo que sabe quais concretos usar.
Em produção, monta os adapters reais; em teste, os fakes são injectados
directamente nos construtores dos use cases — sem passar pelo module.

### Task.reconstitute separado de Task.create

`create()` gera um novo id e valida o título. `reconstitute()` recebe dados já
persistidos e não re-valida, assumindo que foram validados na criação original.
Esta separação é importante para o `PostgresTaskRepository`: ao ler da base de
dados, usa `reconstitute` em vez de `create`.

## Como testar

- Domínio/use cases: `npm run test:tasks` (rápido, sem banco nem rede).
- Todos os testes: `npm test`.
- Lint de fronteiras: `npx depcruise src/modules/tasks --config .dependency-cruiser.cjs`.

## Pontos de atenção / dívidas conhecidas

- `PostgresTaskRepository` é um stub — as queries SQL estão marcadas com TODO.
- `ConsoleNotificationAdapter` é apenas para desenvolvimento; em produção deveria
  enviar emails/webhooks/etc. via um adapter concreto diferente.
- O controller não tem validação com Zod — num módulo de produção, o body de
  `POST /tasks` deveria ser validado com um schema.
