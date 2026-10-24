# Leitor inteligente de faturas (QR → artigos → categorias → Stock)

Origem: TASK V2 do utilizador (2026-10-24) + anexo de auditoria de 3 faturas Makro + fixture. **Os originais (PDF, anexo, fixture) contêm dados reais e ficam fora do repositório**, em `C:\Users\Bruno Fontes\faturas-teste-privado\` (máquina do Bruno). Antecede o resto do Financeiro/Stock v1.2 (F3/F4 em `.scratch/financeiro-stock-v1-2/`).

**Regra de ouro:** o QR dá identidade e totais fiscais; o PDF dá os artigos; as regras aprovadas dão as categorias/Stock; a IA só resolve dúvidas e nunca corrige valores em silêncio.

## Decisões do utilizador (2026-10-24)
- «Centro de custo» passa a **«Categoria»** no Financeiro (grupo → Categoria, subcategoria → Subcategoria). **Só textos do ecrã**: tabelas/campos/rotas (`cost_center_*`, `/financial/cost-centers`) ficam iguais.
- Dependência `jsqr` autorizada (QR local, sem IA).
- O catálogo de categorias que existe hoje «está mal»: o novo catálogo é definido na E2 com o utilizador (nada é criado sem aprovação).
- Talão TPA anexo à fatura: ignorado por agora; mais tarde pode servir para dizer com que cartão foi pago (nunca guardar dados do cartão no Stock).
- Faturas sem layout conhecido / sem QR: caminho de IA, sempre em revisão.

## Etapas
| Etapa | Âmbito | Estado |
|---|---|---|
| E0 | Textos «Centro de custo» → «Categoria/Subcategoria» (frontend, 12 ficheiros) | feito, por commitar |
| E1 | Leitor determinístico (QR AT + layout Makro + motor de valores), prova offline | feito, por commitar |
| E2 | Catálogo de categorias v2 (evoluído, sem reclassificar) + classificação por linha: depósito → histórico confirmado → palavras-chave → IA só nas que sobram (IDs reais) | feito, por commitar; **migração por aplicar** |
| E3 | Ligar ao `ImportInvoiceUseCase` (leitor determinístico primeiro, IA como recurso), **migração** com os campos novos das linhas (código do fornecedor, página/ordem, pack, código IVA, promoção, tipo de linha, ligação depósito → artigo) e do QR na fatura; ecrã de revisão; métricas | por fazer — migração precisa de aprovação |
| E4 | Várias faturas de uma vez + processamento em segundo plano | depois |
| — | Leitor genérico de tabelas para outros fornecedores + IA só no texto do troço que falhou, validada contra o QR | depois da E3 |

## E1 — resultado (2026-10-24)
- Código: `src/modules/invoices/domain/services/reading/` (`fiscal-qr.ts`, `pdf-rows.ts`, `invoice-layout.ts`, `makro-layout.ts`, `invoice-reader.service.ts`), entidade `domain/entities/invoice-reading.ts`, porta `PdfContentReaderPort`, adapter `PdfjsContentReaderAdapter`.
- Prova offline (sem IA, sem rede): as 3 faturas de referência ficam **100% iguais ao fixture** — 56 linhas de produto + 3 depósitos, 142 unidades, descontos 2,49 €, bases 936,79 €, IVA 150,58 €, total 1.087,37 €; QR lido localmente nas 3. Mais **41 faturas Makro reais** (2026-06 a 2026-10) todas prontas e reconciliadas ao cêntimo. Tempo: ~0,1–0,8 s por fatura (a maior parte a abrir o PDF/imagens), 0 chamadas à IA.
- Dois casos reais apanhados e corrigidos durante a prova: descontos numa página de continuação sem cabeçalho da tabela; promoção impressa só como `valor IVA MOT`, sem texto.
- Testes no repositório (sintéticos): `__tests__/domain/reading/` — 21 casos (QR, layout, arredondamento por taxa, depósito/IEC, sem QR, QR contraditório, linha que não fecha, IVA desconhecido, descontos sem referência, linha não reconhecida, nº de artigos, layout desconhecido).

## E2 — resultado (2026-10-24)
- Decisões do utilizador: evoluir o catálogo atual sem reclassificar faturas; nada mais a mudar.
- Migração `20261105100000_cost_center_catalog_v2` (+ rollback), **não aplicada**: Ingredientes (era «CMV / Ingredientes»), Embalagens e descartáveis, Limpeza & Higiene passa a Operação Direta (OPD.08, custo variável, mesmo ID), novas OPD.09 Consumíveis operacionais e EST.07 Utensílios e pequeno equipamento, FDR.05 «Adiantamentos, depósitos e cauções», política de Stock por omissão (Ingredientes/Bebidas geram revisão; Embalagens/Limpeza decide o fornecedor; resto sem Stock) só onde estava por definir. Respeita personalizações. Validada em PGlite: aplicar, reexecutar sem alterações, rollback igual ao estado inicial, reaplicar. Seed das organizações novas atualizado.
- Classificação por linha: `domain/services/classification/` + `ClassifyInvoiceLinesUseCase` (portas de catálogo, histórico e IA; adapters na E3). Offline sem histórico nem IA: fixture 58/59 (a diferença é «etiquetas»: Consumíveis na proposta aprovada, Embalagens no fixture); 41 faturas Makro: 601/661 linhas com sugestão, 60 iriam à IA. Falsos positivos encontrados e corrigidos na revisão: armário refrigerado (REFRIG), alho em saco (SACO), colher de molho (MOLHO).
- Efeito ao aplicar a migração: faturas novas classificadas em Ingredientes/Bebidas passam a gerar Compra por rever (política da categoria); relatórios por tipo financeiro passam a contar Limpeza como custo variável (inclui o histórico dessa subcategoria — 1 fatura, 7 linhas).

## V4 — documentos de cobrança AT/SS e códigos de barras 1D (2026-10-24, por commitar)
- Estado real antes da V4 (a task assumia mais): leitor determinístico e classificação existem, mas **não estavam ligados ao import** (E3 por fazer); o import continua a usar só a IA para faturas.
- Feito (sem migração): deteção AT/SS no próprio `POST /invoices/import` (antes do fluxo de faturas, que fica inalterado), leitores AT/SS pelo texto, CODE128 local (vetorial ou raster), procura de obrigações já registadas (faturas + contas a pagar), revisão no frontend (`PaymentDocumentReview` dentro de `ImportInvoiceModal`) com «Abrir» o registo existente e «Lançar pelo fluxo atual».
- Prova com os 2 PDFs reais (fora do repo): todos os campos da V4 iguais; AT CODE128 41 dígitos, referência 15 dígitos separada; SS sem código; 0 chamadas à IA; ~1,3 s (AT, inclui rasterizar) e ~0,6 s (SS). As duas obrigações **já estavam lançadas em produção** (pelo leitor antigo, como faturas pagas; a AT com 2 dígitos trocados no número) — ambas encontradas como «forte».
- Regressão: fixture Makro 100% igual; 41 faturas Makro detetadas como faturas comerciais; outros PDFs da SS (certidão, faturas) seguem o fluxo normal.
- Bug encontrado e corrigido: leitura pendurada em certos PDFs (imagem que o pdfjs nunca resolvia) — limite de 1,5 s por imagem + 8 s na deteção.
- Por decidir (precisa de migração): rascunho próprio de obrigação (`document_kind` + referência/período/entidade MB) para não passar pelo fluxo de faturas; ligação explícita a uma obrigação existente; categoria proposta pelo histórico do fornecedor.

## Riscos / pendências
- O leitor ainda não está ligado ao fluxo real (E3): o import continua a usar só a IA.
- `pdfjs-dist` e `@napi-rs/canvas` são usados diretamente mas vêm como dependências do `pdf-parse`/`pdf-to-img` (versão do pdfjs fixada em `overrides`). Se quiserem, declarar `pdfjs-dist` em `dependencies` (mesma versão).
- Layout Makro só testado com faturas «invoice_copy_main» Makro PT; notas de crédito Makro ainda não vistas.
- QR agrega depósitos não sujeitos (`0 D`) em `I2` (isenta): a linha guarda o indicador `D` do PDF; o tratamento contabilístico da caução está por confirmar.
