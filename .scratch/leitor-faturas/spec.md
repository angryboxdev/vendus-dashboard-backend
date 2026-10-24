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
| E2 | Catálogo de categorias novo (com o utilizador) + classificação por linha: regra confirmada → alias aprovado → nome normalizado → IA só nas ambíguas (IDs reais) | por fazer |
| E3 | Ligar ao `ImportInvoiceUseCase` (leitor determinístico primeiro, IA como recurso), **migração** com os campos novos das linhas (código do fornecedor, página/ordem, pack, código IVA, promoção, tipo de linha, ligação depósito → artigo) e do QR na fatura; ecrã de revisão; métricas | por fazer — migração precisa de aprovação |
| E4 | Várias faturas de uma vez + processamento em segundo plano | depois |
| — | Leitor genérico de tabelas para outros fornecedores + IA só no texto do troço que falhou, validada contra o QR | depois da E3 |

## E1 — resultado (2026-10-24)
- Código: `src/modules/invoices/domain/services/reading/` (`fiscal-qr.ts`, `pdf-rows.ts`, `invoice-layout.ts`, `makro-layout.ts`, `invoice-reader.service.ts`), entidade `domain/entities/invoice-reading.ts`, porta `PdfContentReaderPort`, adapter `PdfjsContentReaderAdapter`.
- Prova offline (sem IA, sem rede): as 3 faturas de referência ficam **100% iguais ao fixture** — 56 linhas de produto + 3 depósitos, 142 unidades, descontos 2,49 €, bases 936,79 €, IVA 150,58 €, total 1.087,37 €; QR lido localmente nas 3. Mais **41 faturas Makro reais** (2026-06 a 2026-10) todas prontas e reconciliadas ao cêntimo. Tempo: ~0,1–0,8 s por fatura (a maior parte a abrir o PDF/imagens), 0 chamadas à IA.
- Dois casos reais apanhados e corrigidos durante a prova: descontos numa página de continuação sem cabeçalho da tabela; promoção impressa só como `valor IVA MOT`, sem texto.
- Testes no repositório (sintéticos): `__tests__/domain/reading/` — 21 casos (QR, layout, arredondamento por taxa, depósito/IEC, sem QR, QR contraditório, linha que não fecha, IVA desconhecido, descontos sem referência, linha não reconhecida, nº de artigos, layout desconhecido).

## Riscos / pendências
- O leitor ainda não está ligado ao fluxo real (E3): o import continua a usar só a IA.
- `pdfjs-dist` e `@napi-rs/canvas` são usados diretamente mas vêm como dependências do `pdf-parse`/`pdf-to-img` (versão do pdfjs fixada em `overrides`). Se quiserem, declarar `pdfjs-dist` em `dependencies` (mesma versão).
- Layout Makro só testado com faturas «invoice_copy_main» Makro PT; notas de crédito Makro ainda não vistas.
- QR agrega depósitos não sujeitos (`0 D`) em `I2` (isenta): a linha guarda o indicador `D` do PDF; o tratamento contabilístico da caução está por confirmar.
