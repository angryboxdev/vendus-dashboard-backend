# Spec — Portal do Colaborador + Picagem por Geolocalização (MVP)

Status: in-progress
Origem: `Task_Portal_Colaborador_Picagem_Geolocalizacao_MVP.md` (enviada pelo
utilizador em 2026-10-06). Arquitetura apresentada e aprovada no mesmo dia
("ok às recomendações").
Branch: `branch-rh` (backend + frontend).

## Objetivo

Portal mobile-first (`/portal`, PWA instalável) onde o colaborador consulta
o próximo turno, regista Entrada/Saída (com geolocalização só no momento da
picagem), vê a sua escala, quem trabalha consigo, os seus documentos,
recibos e ausências. **Não é um segundo sistema**: lê e escreve nas
entidades do Hub (Colaborador → Local → Turnos → Assiduidade → Documentos →
Férias/Ausências).

## Estado atual (auditoria 2026-10-06)

- **Login:** Supabase Auth; o token traz `org_id` + `org_role` via
  `custom_access_token_hook` (lê `org_members`, exatamente 1 membership).
  Papéis `admin|manager|hr_viewer` (`ROLE_LEVEL` 3/2/1), check constraint
  em `org_members.role`. Contas criadas pelo admin (`POST /api/auth/users`,
  email + palavra-passe). Sem convites nem envio de email.
- **Sem ligação Utilizador ↔ Colaborador** (`hr_employees` só tem `email`).
- **Picagem:** só o quiosque legado (`hrKioskService.kioskScan`: QR diário
  + PIN → `hr_shift_attendance`). Problemas: não filtra turnos publicados,
  não confere o local, duplo toque no mesmo minuto dá 500, saída depois da
  meia-noite não encontra o turno noturno, sem idempotência.
- `hr_shift_attendance`: 1 linha por turno (entrada+saída, `time` de
  parede), `registration_source dashboard|employee_qr|import`.
- **Locais:** sem latitude/longitude/raio.
- **Documentos:** motor documental, bucket privado, URL assinada (120 s)
  por endpoint; recibos = categoria `recibo_vencimento`/`recibo_verde` +
  `period`.
- **Ausências:** legacy, factos registados pelo gestor (sem estado).
- **Notificações, PWA, feature flags:** não existem.
- **CORS:** origens fixas no `server.ts` (localhost + `*.vercel.app`).

## Decisões

| # | Decisão |
|---|---|
| P1 | Papel novo **`employee`** abaixo de `hr_viewer` (nível 0): todas as rotas de gestão (≥ `hr_viewer`) recusam-no automaticamente. |
| P2 | Ligação **`hr_employees.user_id`** (único por org). O colaborador é sempre resolvido a partir da sessão, nunca de um id enviado pelo cliente. |
| P3 | Gestor que também é colaborador: mantém a conta e o papel; só se liga à ficha. Nunca segunda conta nem segundo colaborador. |
| P4 | Ativação "Dar acesso ao Portal" na ficha: liga conta existente (mesmo email na org) ou cria conta `employee` com palavra-passe temporária, mudança obrigatória no 1º login. Convite por email fica para depois. |
| P5 | Módulo novo `employee-portal` (backend e frontend, padrão hexagonal), rotas `/api/me/*`, lê os módulos existentes por portas. |
| P6 | Picagem escreve em **`hr_shift_attendance`** (origem `employee_portal`) + **tabela de evidência `hr_attendance_punch_events`** (1 linha por toque: hora do servidor `timestamptz`, lat/lng, precisão, distância, estado da zona, `idempotency_key` único). Não é uma segunda assiduidade. |
| P7 | Hora oficial = servidor. Idempotência por chave gerada no cliente por intenção. Turno elegível: publicado, de hoje, ou noturno de ontem ainda aberto. **Sem turno → recusa** (como o quiosque). Janela de entrada = `pre_shift_window_minutes` das regras de assiduidade. |
| P8 | Geofence no **Local**: `latitude`, `longitude`, `geofence_radius_m` (100), `geofence_policy off|warn|block` (por omissão **off**). Com `off` o GPS nem é pedido. |
| P9 | Classificação no backend: `inside` / `outside` / `unverified` (precisão > limite, caso ambíguo, permissão negada, timeout, local sem coordenadas). GPS impreciso nunca é `outside`. |
| P10 | `block` recusa `outside`; **`unverified` é aceite com alerta** (ninguém fica impedido por mau sinal). `warn` aceita tudo e alerta `outside`/`unverified`. |
| P11 | Teste no telemóvel via túnel HTTPS (`cloudflared`, no PC) + origens CORS configuráveis por env. A migração tem de estar aplicada (o backend local usa a BD de produção). |
| P12 | Colaborador de teste: ficha **BRUNO ALMEIDA DE FONTES** (criada pelo utilizador em 2026-10-06, Mercado Bom Sucesso), com conta `employee` própria. |
| P13 | Fora do MVP: notificações/Web Push, pedidos de férias, picagem offline, app nativa, tracking. Sem tabela de feature flags: rollout por colaborador (acesso) e por loja (política GPS). |

## Privacidade (RGPD)

Localização recolhida só no toque de Entrada/Saída e só se a política do
local não for `off`; guardada apenas no evento de picagem. Texto
informativo antes do 1º pedido de GPS. Arquitetura preparada para retenção
configurável. **Base legal e prazo de retenção a validar por um
responsável/jurista antes do uso com colaboradores reais.**

## Tickets

1. `01-migracao-fundacao` — migração única (papel, ligação, geofence, origem, eventos).
2. `02-conta-e-acesso` — papel `employee`, "Dar acesso ao Portal", 1º login, redirecionamento.
3. `03-portal-shell-pwa` — `/portal`, navegação, `/me`, Início, PWA.
4. `04-picagem` — Entrada/Saída idempotente na Assiduidade.
5. `05-geolocalizacao` — configuração no Local, validação, políticas, alertas.
6. `06-teste-no-telemovel` — CORS por env, túnel, guia.
7. `07-escala-e-colegas`
8. `08-documentos-e-recibos`
9. `09-ausencias`
10. `10-notificacoes` — adiado.
