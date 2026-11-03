# Mezza como software de faturação certificado pela AT — plano

Estado: proposta para decisão (2026-11-03). Nada implementado.
Base: [pesquisa-juridico-processo.md](pesquisa-juridico-processo.md) e [pesquisa-tecnico.md](pesquisa-tecnico.md) (cada afirmação com fonte nesses ficheiros).
Natureza: apoio técnico e rascunho. Tudo o que é fiscal, legal ou contratual tem de ser validado por contabilista certificado e/ou jurista antes de uso oficial.

Legenda: **[F]** facto com fonte primária · **[S]** fonte secundária · **[R]** recomendação nossa · **[?]** por confirmar.

---

## 1. Resposta direta: a Angry Box pode ser a produtora com o CAE atual?

**Sim.** [F] Nenhum diploma (Portaria 363/2010, Despacho 8632/2014, DL 28/2019) exige CAE de informática para certificar. A certificação depende de: cumprir os requisitos técnicos, entregar a declaração **Modelo 24** no Portal das Finanças e enviar a **chave pública RSA**. Há restaurantes na lista pública da AT como produtores (ex.: Restaurante Malheiro, n.º 2125; Pompeu dos Frangos, n.º 1997).

Nuances:

| Cenário | CAE / atividade | Observações |
|---|---|---|
| Só uso próprio (Angry Box fatura as suas vendas) | Nada a alterar [R] | Certificação obrigatória na mesma: a exceção do software interno foi revogada (Portaria 340/2013) [F]. |
| Vender o Mezza (SaaS) a outros restaurantes | Declaração de alterações em 15 dias, CAE secundário (ex.: 62100 ou 58290, CAE-Rev.4 do DL 9/2025) [F]; confirmar objeto social [?] | IVA 23 % [F]; a produtora responde por coimas do RGIT art. 128.º, n.º 3 (1 500–18 750 €) [F]; subcontratante RGPD [F]. |

**Situação da Angry Box (certidão, 2026-11-03):**
- **Objeto social** já inclui «Atividades de consultoria informática. Desenvolvimento e comercialização de soluções informáticas para clientes empresariais e consumidores finais» → cobre vender o Mezza [F: certidão].
- **CAE:** principal 56111 (restaurantes tipo tradicional); secundários 49320, 47811 e **62201 «Atividades de consultoria em informática»** [F: DL 9/2025, anexo].
- O 62201 é consultoria, não edição/licenciamento de software próprio. Para vender o Mezza como produto/SaaS, o código mais rigoroso tende a ser **58290 «Edição de outros programas informáticos»** ou **62100 «Atividades de programação informática»** [R — decisão do contabilista]. Acrescentá-lo é uma declaração de alterações (CIVA art. 32.º, 15 dias desde o início da atividade); o objeto social não precisa de mudar.

**A decisão que tem de ser tomada antes do Modelo 24:** quem é a produtora. O certificado fica ligado ao NIF de quem o pede e **não confirmámos que se possa transferir** para outra empresa [?]. Se o plano a médio prazo é vender o Mezza, criar já a empresa produtora (ex.: «Mezza, Lda») evita recertificar e migrar as séries de todos os clientes mais tarde [R]. Se for só para a Angry Box, a Angry Box serve.

---

## 2. Mapa completo dos passos

### A. Empresa, jurídico e contabilidade (em paralelo com o desenvolvimento)

1. **Decidir a entidade produtora** (Angry Box vs empresa nova) — com contabilista; ver §1.
2. Se SaaS: declaração de alterações (CAE secundário), objeto social, contabilidade/IVA do serviço.
3. **Perguntas à AT via e-Balcão** (Outras Obrigações › Certif Softw › Questões técnicas):
   - transmissibilidade do certificado entre NIF;
   - se novas versões exigem atualização do Modelo 24;
   - se as consultas de mesa já têm de ser comunicadas mensalmente;
   - se os documentos de modo formação se comunicam ao e-Fatura.
4. **Validar com o contabilista** (lista completa em `pesquisa-juridico-processo.md`): limite da fatura simplificada na restauração (100 € por ser prestação de serviços?), quando anular vs. emitir nota de crédito, fuso do `SystemEntryDate`, coimas atuais.
5. Se SaaS: **contrato SaaS** (conformidade fiscal, SLA, apoio em inspeções, exportação do SAF-T, acesso aos dados 10 anos mesmo após o fim do contrato), **acordo de subcontratação RGPD** (art. 28.º), **seguro** de RC profissional/ciber [R].
6. **Contingência em papel:** cada restaurante precisa de livros de faturas de **tipografia autorizada** para quando o sistema estiver em baixo; depois recuperam-se no Mezza numa série própria (DL 28/2019, art. 4.º, n.º 4) [F].

### B. Processo de certificação na AT

1. Gerar o par de chaves RSA 1024 (só a produtora conhece a privada) [F].
2. Autoteste com as ferramentas da AT: validador de assinaturas/SAF-T, par de chaves e SAF-T de exemplo [F].
3. Preparar o dossiê [F]/[S]: descrição da aplicação, tipos de documentos, um exemplar de cada, layout de impressão, SAF-T de teste com todos os documentos, **documentação técnica e dicionário de dados** (DL 28/2019, art. 11.º, n.º 3).
4. **Submeter o Modelo 24** no Portal com a chave pública (.txt PEM).
5. Testes de conformidade da AT: fase documental e depois verificação (relatos [S]); o prazo legal de 30 dias suspende-se durante os testes [F]. Sem taxa conhecida [?].
6. Recebe o **n.º de certificado** → passa a imprimir `XXXX-Processado por programa certificado n.º NNNN/AT`.
7. Aderir como **produtor de software no e-Fatura** e obter o **certificado SSL da AT** para os webservices [F].

### C. Arranque em cada restaurante (Angry Box primeiro)

1. Criar no Portal das Finanças um **subutilizador** com os perfis WFA (faturas) e WSE (séries) e configurá-lo no Mezza.
2. **Comunicar as séries** (o Mezza faz isto por webservice) e receber o código de validação do ATCUD.
3. Indicar a localização do arquivo eletrónico (UE) na declaração de alterações (DL 28/2019, art. 20.º, n.º 5) [F].
4. Passar a faturar no Mezza; comunicar faturas em tempo real ou até ao **dia 5 do mês seguinte** [F/S].
5. Conservar tudo **10 anos**, em Estado-Membro da UE [F].

---

## 3. Requisitos técnicos (resumo — detalhe e fontes em `pesquisa-tecnico.md`)

- **Assinatura:** RSA-1024 + SHA-1, PKCS#1 v1.5, Base64 de 172 caracteres sobre
  `InvoiceDate;SystemEntryDate;InvoiceNo;GrossTotal(2 casas);HashAnterior` — hash anterior da mesma série e tipo; vazio no 1.º documento. Imprimir caracteres 1, 11, 21 e 31. `HashControl` = versão da chave.
- **Assinam-se:** faturas (FT, FS, FR), notas de crédito/débito, guias e **consultas de mesa (CM)**. Recibos não, mas levam «Emitido por programa certificado n.º…».
- **Inalterabilidade:** nada se apaga nem altera depois de assinado; anulação marca estado; NIF, nome e descrições bloqueados após emissão.
- **Numeração:** contínua por série, só dígitos; séries próprias para **formação** e **recuperação** (manual M, duplicado D, integrado I).
- **Relógio:** alertas se a data/hora retroceder; `SystemEntryDate` sem milissegundos.
- **IVA:** por linha; isenção com código M (tabela v4.0, 18-06-2026); consumidor final NIF 999999990.
- **ATCUD** `código-número` acima do **QR** (spec AT v1.1: ECC M, versão ≥ 9, ≥ 30×30 mm, campos A–S).
- **SAF-T (PT) 1.04_01** (Portaria 302/2016): exportação mensal e integral, validada pelo XSD e pelo validador da AT. Consulta de mesa em `WorkingDocuments` com `WorkType="CM"`.
- **Webservices AT (SOAP + mTLS):** séries (SeriesWS) e faturas (e-Fatura, manuais v3.0 de out. 2025), senha cifrada em AES com chave por pedido cifrada com a chave pública da AT; ambiente de testes em portas próprias.
- **Fatura eletrónica:** PDF simples aceite até 31-12-2026 [F]; prorrogação a 2027 está na proposta do OE 2027 [S]. Depois, enviar PDF por email como fatura exige **selo eletrónico qualificado** (QTSP) ou EDI.

---

## 4. Arquitetura no Mezza

### 4.1 Ponto de partida

- Hoje **não há registo próprio de vendas**: Vendus e AirMenu são o sistema de registo (ver `docs/MULTI_TENANCY_SAAS_DESIGN.md` §3.3). O motor fiscal passa a ser a origem das vendas que emitir.
- Reaproveitável: cadeia de hash append-only feita na BD (`audit`), entidades fiscais com NIF (`legal-entities`), validação de NIF e identidade fiscal (`fiscal-documents`), ecrãs por loja (`location-credentials`), PDF (`pdfkit` já é dependência).

### 4.2 Módulo novo `invoicing` (hexagonal, molde `src/modules/tasks`)

```
domain/
  entities/   FiscalDocument (FT/FS/FR/NC/ND), WorkingDocument (CM), Receipt (RC),
              DocumentSeries, DocumentLine, TaxSummary, CustomerSnapshot, IssuerSnapshot
  services/   signature-message (texto exato a assinar), printed-hash, atcud, qr-payload,
              totals/rounding/IVA, exemption-codes, document-state-machine, clock-guard
  ports/in/   IssueDocument, CancelDocument, IssueCreditNote, RecoverManualDocument,
              CommunicateSeries, ExportSaft, ReprintDocument
  ports/out/  FiscalDocumentStore, SignerPort, ClockPort, AtSeriesGateway,
              AtInvoiceGateway, DocumentRenderer, AtCredentialsStore
application/use-cases/
adapters/in/  http (backoffice + POS), cron (reenvios, SAF-T mensal)
adapters/out/ supabase (store + RPC), rsa-signer (node:crypto), at-soap (SeriesWS, e-Fatura),
              pdf/termal, saft-xml
```

Regras:
- **Domínio puro** (texto da assinatura, ATCUD, QR, totais) testado com os **vetores oficiais da AT** no CI: SAF-T de demonstração + chave pública da AT (cadeia 36/36 já verificada com `node:crypto` na pesquisa).
- **Emissor = entidade legal (NIF), não a organização.** Séries e documentos ligam a `legal_entity_id` + `location_id` + `org_id` (RLS).
- **Nada de dados fiscais editáveis:** snapshots do emitente e do cliente gravados no documento.

### 4.3 Base de dados (migrações com rollback, registo em `table-registry.ts`, RLS por `org_id`)

- `fiscal_series` (por entidade legal, tipo, estabelecimento; estado, código de validação AT, último número, último hash, último `SystemEntryDate`, modo: normal/formação/recuperação).
- `fiscal_documents`, `fiscal_document_lines`, `fiscal_document_taxes`, `fiscal_receipts`, `fiscal_working_documents` (CM).
- `at_communications` (outbox: pedido, resposta, tentativas, estado).
- `fiscal_events` (auditoria append-only, padrão do módulo `audit`).
- **Triggers** que recusam UPDATE/DELETE em documentos emitidos (só a transição para «anulado» com motivo).

### 4.4 Emissão sem buracos nem cadeias partidas — decisão central

Restrição: o backend fala com o Postgres pelo supabase-js (REST), sem transações longas, e **a chave privada não pode ir para a BD**. Proposta [R]:

1. Ler o estado da série (último número, último hash, último `SystemEntryDate`).
2. Montar o documento n+1 e **assinar na aplicação**.
3. Gravar por **RPC com compare-and-swap**: a função só insere se a série ainda estiver em (n, hash, data) e atualiza-a na mesma transação. Em conflito (outro terminal emitiu primeiro), repetir desde o passo 1.

Assim, o número só existe quando gravado (sem buracos), a cadeia nunca bifurca e a chave fica fora da BD. Recomenda-se uma série por terminal/estabelecimento para reduzir conflitos.

### 4.5 Chave privada

- Uma só chave para o produto (é da produtora, não de cada cliente), com versão.
- Guardada como segredo do Render (nunca no repositório nem na BD); assinatura num único adapter com acesso auditado.
- [?] Os KMS de cloud provavelmente não aceitam RSA-1024 — confirmar antes de escolher.
- [?] Confirmar que o OpenSSL do runtime do Render aceita assinaturas SHA-1 (funciona no Node 24 local).
- Se a Angry Box for produtora e utilizadora: só a equipa técnica acede ao segredo; os perfis do restaurante nunca.

### 4.6 Integrações com a AT

- **Séries:** comunicar/anular por SeriesWS na criação da série.
- **Faturas:** envio em tempo real pelo webservice e-Fatura através da outbox, com reenvio automático e alerta antes do dia 5; alternativa de recurso: upload do SAF-T mensal.
- **Credenciais por organização** (subutilizador WFA/WSE): cifradas em repouso. Os manuais da AT contradizem-se sobre guardar estas credenciais no programa — decidir com o encarregado de proteção de dados [?].
- Certificado mTLS do produtor: renovar antes de expirar (12 ou 24 meses [?]) — alerta automático.

### 4.7 Restauração e POS

- **Hoje o POS é o Vendus.** Certificar o motor não substitui o POS: para a sala é preciso mesas, pedidos, consultas de mesa, pagamentos/TPA e impressoras térmicas (ESC/POS). Isto é o maior bloco de trabalho e vem depois do motor.
- **Sem internet não há emissão** (a chave não pode ir para os terminais) → contingência = livros de tipografia + série de recuperação; recomendável internet de reserva (4G) por loja.
- **Coexistência com Vendus/AirMenu:** séries novas e distintas; o Mezza não reassina documentos de outros programas (se os integrar, `SourceBilling="I"` com o hash original).

### 4.8 Dependências novas (pedir aprovação antes)

- Biblioteca de **geração de QR** (o projeto só tem `jsqr`, que lê).
- Possivelmente um cliente SOAP/XML (ou XML escrito à mão com `node:https` + mTLS — preferível se for simples).
- Validação XSD do SAF-T: `xmllint` só no CI, ou uma biblioteca.

---

## 5. Fases de desenvolvimento (uma de cada vez, com relatório e autorização entre fases)

| Fase | Conteúdo | Sai quando |
|---|---|---|
| **F0** | Decisões: entidade produtora, âmbito (só Angry Box vs SaaS), perguntas à AT e ao contabilista | Respostas registadas num ADR |
| **F1** | Domínio puro: texto da assinatura, assinatura, 4 caracteres, ATCUD, QR, totais/IVA/isenções, máquina de estados | Vetores oficiais da AT verdes no CI |
| **F2** | BD imutável: séries, documentos, triggers, RPC compare-and-swap, auditoria, outbox | Testes de concorrência (sem buracos, sem bifurcação) |
| **F3** | Emissão no backoffice: FT, FR, FS, NC, ND, RC, CM; anulação; 2.ª via; modo formação; recuperação M/D; PDF com ATCUD+QR | Bateria de casos da secção 2.14 da pesquisa técnica |
| **F4** | SAF-T 1.04_01 (mensal e integral) | Valida no XSD e no validador da AT |
| **F5** | Webservices AT em ambiente de testes: séries e e-Fatura, outbox, alertas | Envio e anulação OK em testes |
| **F6** | Dossiê de certificação: documentação técnica, dicionário de dados, exemplares, SAF-T de teste → **Modelo 24** | Certificado emitido |
| **F7** | POS de sala: mesas, consultas de mesa, pagamentos, impressoras térmicas, contingência | Piloto numa loja |
| **F8** | Piloto Angry Box (substituir o Vendus), depois onboarding SaaS | Operação estável |

F1–F6 chegam para o **certificado** (motor + backoffice). F7–F8 são o que permite **deixar o Vendus** na sala.

---

## 6. Riscos principais

1. **Certificado na entidade errada** → recertificar e migrar séries de todos os clientes. Mitigação: decidir em F0.
2. **Cadeia de assinaturas partida** (concorrência, retries, edição na BD) → motivo de revogação (caso real: CR Mais/WinPlus, 2016). Mitigação: §4.4, triggers e testes.
3. **Revogação atinge todos os clientes de uma vez** (SaaS). Mitigação: processo de release com checklist de conformidade por versão e documentação técnica por versão (DL 28/2019, art. 11.º, n.º 4).
4. **Indisponibilidade** (Render/Supabase/internet) pára a faturação na sala. Mitigação: contingência em papel + série de recuperação; SLA e monitorização.
5. **Falha de comunicação à AT** → coima ao cliente (RGIT art. 117.º, n.º 9: 200–10 000 €). Mitigação: outbox com alertas antes do dia 5.
6. **Fatura eletrónica em PDF após 2026/2027** exigirá selo qualificado — acompanhar o OE 2027.
7. **Dados fora da UE** (backups, logs, CDN) exigem autorização da AT. Mitigação: confirmar regiões de Supabase, Render e Vercel.

---

## 7. Próximo passo proposto

F0: reunião com o contabilista (decisão da entidade produtora + lista de perguntas) e envio das perguntas à AT pelo e-Balcão. Em paralelo, se aprovado, F1 (domínio puro com os vetores da AT), que não depende dessas respostas.
