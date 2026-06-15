# CLAUDE.md

Diretrizes deste projeto. Valem para **todo** trabalho de código. Não desenvolva
fora delas. Em caso de conflito entre um pedido e estas regras, pare e me avise
antes de prosseguir.

## Repositórios (back + front)

Este produto vive em dois repositórios separados, e **as regras deste arquivo
valem igualmente para os dois** — mesma arquitetura hexagonal, mesma estrutura de
`src/modules/`, mesmo lint de fronteiras, mesma disciplina de testes e
documentação.

- **Backend** — este repositório, onde você está sendo executado.
- **Frontend** — repositório separado. Caminho local (setup da minha máquina):
  `/Users/raulafonso/Documents/r4ff/vendus-dashboard/vendus-dashboard-frontend`

A arquitetura é a mesma; o que muda é a **natureza dos adapters** e as **libs
proibidas no domínio** de cada repo:

|           | Adapter de entrada             | Adapter de saída                           | Domínio NÃO pode importar                 |
| --------- | ------------------------------ | ------------------------------------------ | ----------------------------------------- |
| **Back**  | controller HTTP, CLI, consumer | repositório de banco, gateway de API, fila | ORM, client de banco, SDK HTTP            |
| **Front** | componente/hook de UI          | client HTTP/API, storage, etc.             | React, `fetch`/axios, APIs de DOM/browser |

Regras adicionais ao trabalhar no front:

1. **Leia o `CLAUDE.md` do próprio frontend** e o módulo de referência dele antes
   de codar. Cada repo tem seu próprio módulo de referência e sua própria lista de
   módulos migrados.
2. **Mantenha o contrato back/front em sincronia:** ao mudar endpoints, formatos
   de request/response ou tipos compartilhados de um lado, ajuste o outro lado na
   mesma tarefa e me avise se algo ficar incompatível.

## Estado do projeto: migração em andamento

Este **backend** está em **migração gradual** para a arquitetura hexagonal
descrita abaixo. Hoje convivem dois padrões:

- **Padrão novo** (hexagonal): a referência para TODO trabalho novo.
- **Padrão legado**: a maior parte do código ainda está aqui. Está sendo migrado
  aos poucos, um módulo por vez.

**Regra crítica:** a maioria do código ao redor é legada. Isso **não** é endosso.
Nunca imite a estrutura de um módulo legado ao escrever código novo. A fonte de
verdade do padrão é: (1) estas regras e (2) o módulo de referência indicado
abaixo — nunca o código vizinho. Se você não tem certeza se um módulo segue o
padrão novo, abra o `README.md` dele e veja o campo `Status`; sem README ou com
`Status: legado`, trate-o como legado e não o copie.

### Módulos já no padrão novo

<!-- Mantenha esta lista atualizada. É a fonte de verdade de quem já migrou. -->

- `tasks` (módulo de referência)
- `cash-closings`

## Stack

Antes de escrever código, leia o `package.json` (e configs como `tsconfig.json`,
`jest.config`, `.eslintrc`) para identificar framework, libs e convenções já em
uso, e siga-as. Não introduza dependências novas sem me perguntar.

## Arquitetura: hexagonal (ports & adapters)

Todo módulo novo segue esta estrutura, dentro de `src/modules/<modulo>/`:

```
domain/
  entities/      entidades e value objects — SEM dependência externa
  ports/in/      input ports: interfaces dos use cases
  ports/out/     output ports: interfaces de repos/gateways
  services/      lógica de negócio pura
application/
  use-cases/     implementam os input ports, orquestram o domínio
adapters/
  in/            http, cli, consumers de eventos (chamam o domínio)
  out/           implementações concretas: db, apis, filas
<modulo>.module.ts   composition root: monta o módulo e injeta os adapters
README.md            documentação do módulo (ver template abaixo)
```

**Módulo de referência:** use `src/modules/tasks` como modelo de estrutura e
estilo. Quando em dúvida sobre onde algo mora, copie o padrão dele. É a única
referência de padrão — nunca use um módulo legado como modelo.

### Regras de dependência (inegociáveis)

1. **`domain/` não importa de `adapters/` nem de libs de infra.** Nada de
   client de banco, SDK HTTP, ORM etc. dentro de `domain/`. Se o domínio precisa
   de algo externo, ele declara um **output port** (interface) e alguém de fora
   implementa.
2. **Dependências cruzam por interface, nunca por implementação concreta.** Use
   cases recebem os output ports pelo construtor (injeção de dependência).
3. **O composition root (`<modulo>.module.ts`) é o único lugar que conhece os
   adapters concretos.** É lá que se "pluga" qual implementação entra. Em teste,
   plugam-se fakes no lugar.

As setas de dependência apontam sempre para o domínio.

## Antes de alterar um módulo (comportamento padrão, sem eu pedir)

1. **Identifique o padrão do módulo.** Consulte a lista "Módulos já no padrão
   novo" e o campo `Status` do README. Se for **legado**: não estenda nem replique
   o padrão antigo. Faça a alteração mínima pedida e, se a mudança for grande,
   sugira migrar o módulo para o padrão novo antes (ver "Refactor de módulos
   legados"). Pergunte-me antes de iniciar uma migração.
2. **Leia o `README.md` do módulo** antes de qualquer mudança. Preste atenção
   especial à seção "Decisões de design" — não desfaça escolhas propositais.
3. Identifique se a mudança toca domínio, ports ou adapters, e respeite as
   regras de dependência acima.

## Depois de alterar um módulo (comportamento padrão, sem eu pedir)

1. **Rode os testes do módulo** e garanta que passam antes de considerar a
   tarefa concluída. Se um hook não tiver rodado, rode com o comando da seção
   "Como testar" do README do módulo.
2. **Atualize o `README.md`** se a mudança alterou ports, adapters, conceitos do
   domínio ou alguma decisão de design. Doc desatualizada é pior que doc nenhuma.
3. Toda lógica nova de domínio/use case vem com teste unitário (com fakes dos
   output ports). Adapter novo vem com teste de integração quando aplicável.

## Testes

- Runner: **Jest**.
- Domínio e use cases: testes rápidos, isolados, usando fakes dos output ports.
  Não suba banco nem rede para testar regra de negócio.
- Adapters: testes de integração separados.

## Documentação de módulo — template do README.md

Todo módulo tem um `README.md` na raiz da sua pasta seguindo exatamente este
formato:

```markdown
# Módulo: <nome>

> Status: ativo | em refactor | legado
> Última atualização: <data>

## Propósito

O que resolve (2-3 frases). O que é e o que NÃO é responsabilidade dele.

## Conceitos do domínio

Entidades / value objects principais e regras de negócio invariantes.

## Ports

### Entrada (use cases)

- `NomeDoUseCase` — o que faz, quando é chamado.

### Saída (dependências do domínio)

- `NomeDoRepo` / `NomeGateway` — o que o domínio espera dessa interface.

## Adapters

### Entrada

- `HttpController` → expõe os use cases via REST em `/rota`.

### Saída

- `PostgresXRepo` → implementa `NomeDoRepo` usando <tecnologia>.

## Decisões de design (ADR resumido)

Decisões não óbvias e o PORQUÊ.

## Como testar

- Domínio/use cases: `<comando>` (rápido, com fakes).
- Adapters: `<comando de integração>`.

## Pontos de atenção / dívidas conhecidas

O que ainda não está ideal (sobretudo em módulos legados).
```

## Refactor de módulos legados

O refactor é **gradual**, módulo a módulo, nunca um big-bang. Ao migrar um
módulo antigo para este padrão: marque o `README` como `em refactor`, cubra com
testes antes de mover código, e migre por camadas (extrair domínio → definir
ports → mover infra para adapters). Não altere o comportamento externo do módulo
durante o refactor sem me avisar.
