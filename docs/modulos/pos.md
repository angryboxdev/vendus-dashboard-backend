# Módulo: pos

**Área:** Vendas (caixa do Mezza) · **Estado (README):** active, fase 1 em testes · **Código:** `src/modules/pos/` (backend) e `src/modules/pos/` (frontend, rota `/pos`)

## Objetivo
POS interno do Mezza: vende com o PIN do registo de ponto, emite fatura-recibo e nota de crédito pelo módulo `invoicing` e mostra o painel do dia. Opção por cliente/loja; os POS externos (Vendus, AirMenu, Uber Eats) continuam integrados. Especificação: `.scratch/pos/spec.md` (a partir do protótipo da gerência de 2026-11-04).

## Estado atual
**Fase 1 feita no ramo `faturacao-certificada`** (2026-11-05, por publicar; demonstração a 2026-11-07): produtos importados da exportação do Vendus (CSV), configuração (séries FR/NC de formação e gestores), vendas com descontos e Cartão/Dinheiro/MB Way, talão de 80 mm, documentos do dia, nota de crédito por gestor, painel do dia. Migração `20261221100000_pos_phase1` + rollback (não aplicada; PGlite 15 verificações). Documentos de formação — o Vendus continua oficial.

## Arquitetura
- Backend `src/modules/pos/` (README com portas, adapters e decisões); frontend `src/modules/pos/` (README próprio).
- Faturação por funções do `invoicing` ligadas no `server.ts`; PIN pelo `hr_employees` (só leitura, como o fecho de caixa).

## Dependências
`invoicing` (emissão FR/NC e 2.ª via), `hr_employees` (PIN do quiosque), `src/kernel` (dinheiro, organização), `src/infra` (scoped-db, idempotência). Não toca Vendus, AirMenu, DRE, Gestão de Stock nem menus.

## Problemas conhecidos
Ver «Known gaps» no README do módulo (stock da fase 2, IVA divergente no CSV do Vendus a confirmar com o contabilista, meio de pagamento SAF-T do MB Way).

## Próximos trabalhos
Fase 2: stock por produto (indicadores, aviso «Vender na mesma», movimentos e alertas), vista por omissão definida pelo gestor, código de barras.
