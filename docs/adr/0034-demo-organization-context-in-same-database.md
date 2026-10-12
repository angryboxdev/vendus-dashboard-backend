# Organização de demonstração na mesma base de dados, como contexto do Novo RH

Decidido pelo utilizador em 2026-10-12: a organização fictícia fica na mesma
base de dados de produção; o botão "Demonstração" do Novo RH mostra-a (e
deixa alterá-la); em "Real" não é visível. Substitui, para este caso, a
regra do ADR-0020/ADR-0021 de só existir em local/staging.

## Decisões

- **Sem membros.** A organização de demonstração não tem ninguém em
  `org_members`. A sessão continua a ter exatamente uma organização (regra do
  `custom_access_token_hook`) — o login não muda. Nenhum token tem o id da
  organização de demonstração.
- **Ligada à real.** `organizations.is_demo = true` e
  `organizations.demo_of = <organização real>` (no máximo uma por organização
  real). O id da demo nunca vem do browser.
- **Troca só no Novo RH.** Com o cabeçalho `X-Novo-RH-Mode: demo`, os pedidos
  `/api/novo-rh/*` de um **Admin da organização real** passam a correr na
  organização de demonstração ligada. A troca acontece **depois** dos guardas
  de sessão, perfil, permissões e MFA (que validam a conta real). As outras
  áreas da aplicação e o Portal (`/api/me/*`) ignoram o cabeçalho.
- **Invisível no resto.** As listagens de organizações e de pares
  organização/centro usadas pelos crons (débitos diretos, consumos Vendus,
  automações) excluem `is_demo`.
- **Criada pelo utilizador.** "Criar organização de demonstração" (Admin) cria
  a organização e carrega os dados do gerador `demo-data` (centros, cargos,
  horários, colaboradores e marcações fictícias, e-mails `@demo.invalid`, sem
  NIF/NISS/IBAN). Antes de cada escrita confirma-se `is_demo = true`.
  Os feriados nacionais de PT entram como "a confirmar".
- **Acessos.** Utilizadores e perfis são das contas reais; em demonstração o
  separador Acessos não mostra utilizadores.
- **Gate da segunda organização (ADR-0020).** Os pontos em aberto (RLS por
  claim nas tabelas antigas, dados-modelo) protegem utilizadores que entram
  *noutra* organização. Aqui ninguém entra na demo e o backend usa sempre o
  filtro por organização; ficam como melhoria, não como bloqueio.

## Consequências

- O que se altera em demonstração fica na organização de demonstração
  (incluindo auditoria) e nunca aparece em "Real", relatórios, exportações
  ou crons.
- Os registos append-only (marcações, saldos, auditoria) também não se
  apagam na demonstração; "recomeçar" seria criar outra organização.
