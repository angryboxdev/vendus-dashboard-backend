# Spec — Faturação certificada AT (módulo `invoicing`)

Status: F1–F5 concluídas e F4/F5 em produção; F6 feita no ramo (2026-11-04, falta o teste real contra a AT); próxima F7 · Ramo: `faturacao-certificada` (worktree `vendus-dashboard-backend-faturacao`)
Base: [plano.md](plano.md), [pesquisa-tecnico.md](pesquisa-tecnico.md), [pesquisa-juridico-processo.md](pesquisa-juridico-processo.md)

## Objetivo

Construir dentro do Mezza o motor de faturação que cumpre os requisitos da AT (Portaria 363/2010, Despacho 8632/2014, DL 28/2019, Portaria 195/2020, Portaria 302/2016), e uma área «Vendas» para o testar, até ao pedido de certificação (Modelo 24).

## Fora de âmbito (decisão do utilizador, 2026-11-03)

- **Não toca em nenhum canal existente:** Vendus, AirMenu, KDS, DRE, fluxo de caixa, custos, stock, conferência de vendas, plataformas de delivery, fechos de caixa. Nenhum desses módulos lê nem escreve as tabelas novas; o módulo `invoicing` não importa nenhum deles.
- POS de sala (mesas, impressoras térmicas) — fase posterior.
- Documentos de transporte (GR/GT…) — não se aplicam à restauração nesta fase.

## Regras de isolamento e segurança

1. **Antes do n.º de certificado, só documentos de formação.** Sem `INVOICING_CERTIFICATE_NUMBER` configurado, o domínio só aceita séries de formação (`tipoSerie = F`), imprime «Documento emitido para fins de Formação» e nada é comunicado à AT de produção. É proibido usar o Mezza para faturar a clientes reais antes da certificação (DL 28/2019, art. 4.º; RGIT art. 128.º).
2. **Chave privada** só em variável de ambiente (`INVOICING_SIGNING_PRIVATE_KEY`, PEM; `INVOICING_SIGNING_KEY_VERSION`). Nunca no repositório nem na BD. Testes usam o par de exemplo público da AT.
3. **Menu «Vendas»** visível só com as permissões novas `invoicing.read` / `invoicing.manage`.
4. **Migrações** novas, idempotentes, com rollback; **não aplicar em produção** sem aprovação explícita (o backend local usa a BD de produção).

## Decisões de desenho

| # | Decisão | Porquê |
|---|---|---|
| D1 | Domínio puro calcula a mensagem a assinar, ATCUD, QR, totais e regras; a assinatura entra por `SignerPort` | Testável com os vetores oficiais da AT; chave fora do domínio |
| D2 | Dinheiro com `kernel/money/decimal` (bigint), cálculo com mais de 2 casas, totais a 2 casas | Despacho 3.2.3; sem erros de vírgula flutuante |
| D3 | Preços com IVA incluído (restauração): total por taxa fixo, IVA = total × taxa / (100 + taxa), base = total − IVA | O cliente paga exatamente o preço do menu |
| D4 | Emissão por compare-and-swap na série (RPC): ler estado → assinar na app → gravar só se a série não mudou | Sem buracos, sem bifurcar a cadeia, chave fora da BD, compatível com supabase-js |
| D5 | Emitente = entidade legal (NIF), não a organização; série por entidade + estabelecimento + tipo | Cada NIF é um sujeito passivo |
| D6 | `SystemEntryDate` na hora legal de Lisboa (Europe/Lisbon), ao segundo — decisão do utilizador 2026-11-03 | Formato sem fuso; servidor em UTC |
| D7 | Documentos emitidos imutáveis (triggers); anulação muda o estado com motivo | Despacho 1.11, 2.1; Portaria 363/2010 art. 3.º d) |

## Fases (uma de cada vez; relatório e autorização entre fases)

| Fase | Tarefa | Ficheiro |
|---|---|---|
| F1 | Domínio fiscal puro + assinador RSA + vetores AT | [issues/01-dominio-fiscal.md](issues/01-dominio-fiscal.md) |
| F2 | Persistência imutável e emissão compare-and-swap | [issues/02-persistencia-imutavel.md](issues/02-persistencia-imutavel.md) |
| F3 | Casos de uso e API de emissão | [issues/03-emissao-api.md](issues/03-emissao-api.md) |
| F4 | Área «Vendas» no frontend (testes) + PDF com ATCUD/QR | [issues/04-area-vendas-frontend.md](issues/04-area-vendas-frontend.md) |
| F5 | SAF-T (PT) 1.04_01 | [issues/05-saft.md](issues/05-saft.md) |
| F6 | Webservices AT (ambiente de testes) | [issues/06-webservices-at.md](issues/06-webservices-at.md) |
| F7 | Dossiê de certificação (Modelo 24) | [issues/07-dossie-certificacao.md](issues/07-dossie-certificacao.md) |

## Processo de qualidade

- `tdd` (test-first) em domínio e casos de uso; vetores oficiais da AT no CI.
- No fim de cada fase: `code-review` (normas do repo + esta spec) e, nas fases com chave/rede, `security-review`.
- Decisões locais no README do módulo; decisões arquiteturais em `docs/adr/`.
