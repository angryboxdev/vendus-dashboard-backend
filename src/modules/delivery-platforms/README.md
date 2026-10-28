# Módulo: delivery-platforms

> Status: active
> Last updated: 2026-10-28

---

## O que é e para que serve (perspetiva do negócio)

O restaurante vende pela Uber Eats, Glovo e Bolt Food. Cada plataforma retém comissões, promoções e anúncios e transfere o resto. Este módulo lê os extratos que as plataformas emitem e guarda, por documento, o que se vendeu e o que se pagou à plataforma.

**O problema que resolve:**
Sem os extratos, só se vê o que chega ao banco — não se sabe quanto se vendeu, quanto custaram as promoções e o marketing, nem a margem real de cada plataforma.

**O fluxo do ponto de vista do negócio:**

```
Gestor                                   Sistema
──────────────────────                  ──────────────────────
1. Descarrega os extratos (PDF)
   da Uber e da Glovo
2. Envia-os todos de uma vez        →   3. Reconhece a plataforma, lê os totais
                                            e confere que batem com o transferido
                                        4. Mostra os importados e os rejeitados
5. Vê os extratos do mês            →   6. Totais por natureza, por plataforma
```

**Conceitos-chave para o negócio:**

- **Extrato** — documento da plataforma para um período (Uber: mês civil; Glovo: quinzena), com número próprio.
- **Vendas** — o que o cliente pagou pelos artigos (com IVA), mais gorjetas e taxas cobradas ao cliente.
- **Promoções** — descontos suportados pelo restaurante (incluindo «compre um, leve outro»), pelo valor que a plataforma indica.
- **Comissão / Marketing / Outras taxas** — o que a plataforma cobra, com IVA.
- **Líquido transferido** — o que a plataforma paga ao restaurante.

---

## Propósito técnico

Converte o texto de um extrato (PDF) numa `PlatformStatement` (linhas por natureza com valor bruto e IVA, transferências e líquido) e guarda-a por organização. Não lança faturas, não concilia com o banco (F4) nem calcula a margem (F3, a partir destes dados).

## Conceitos de domínio

- `PlatformStatement` — plataforma, tipo de documento, número, período, data de emissão, nº de pedidos, `lines`, `payouts`, `netPayoutCents`.
- `StatementLine` — `kind` (`sales|promotion|commission|marketing|other_fee|refund|cash|adjustment`), `grossCents` (reduções positivas) e `vatCents`.
- Invariante: vendas − restantes linhas = líquido do documento, com tolerância de 2 cêntimos (`computedPayoutCents`); se não bater, o documento é rejeitado.
- Um extrato é único por (organização, plataforma, número): reimportar substitui.

## Portas

### Entrada (casos de uso)

- `ImportPlatformDocumentsPort` — importa vários ficheiros; cada um é tratado à parte (importado ou rejeitado com motivo).
- `ListPlatformStatementsPort` — extratos cujo período toca um mês, com totais por natureza (`summarizeStatement`).

### Saída (dependências do domínio)

- `DocumentTextPort` — texto de um ficheiro (null se não houver texto).
- `PlatformStatementRepositoryPort` — `save` (upsert, diz se substituiu) e `listOverlapping`.

## Adapters

### Entrada

- `DeliveryPlatformsController` → `POST /api/delivery-platforms/import` (multipart, `files`, até 20, 15 MB cada) e `GET /api/delivery-platforms/statements?year&month`; permissão `dre.statement`.

### Saída

- `DocumentTextAdapter` → `pdf-parse` para PDF; UTF-8 para `.csv`/`.txt`.
- `SupabasePlatformStatementRepository` → tabela `delivery_platform_statements` via `createScopedQuery`.

## Decisões de design

- **Só o essencial:** guardam-se totais por natureza e transferências; nunca as linhas por pedido, nomes ou notas de clientes (RGPD).
- **Promoções como custo** pelo valor da plataforma, sem estimar o custo real do artigo oferecido (decisão do utilizador, 2026-10-28).
- **Taxas com IVA:** Uber — o extrato traz as taxas com IVA (23%), o IVA é calculado; Glovo — o IVA do documento é repartido pelas taxas em proporção, arredondamento na última.
- **Glovo:** as linhas de detalhe «Taxa de serviço da plataforma/estafetas» são ignoradas (já estão na comissão); a soma das taxas tem de dar o subtotal.
- **Validação ao cêntimo** contra o líquido do documento antes de guardar: um leitor que se engane rejeita em vez de gravar valores errados.
- **Faturas das plataformas não entram no módulo de faturas** — o extrato é a fonte da DRE.

## Como testar

- Domínio/casos de uso: `npx jest src/modules/delivery-platforms` (textos fictícios em `__tests__/fixtures`).
- Adapters: sem teste de integração (sem stack Supabase local nesta máquina).

## Lacunas conhecidas / dívida

- Bolt Food (CSV de pedidos + faturas semanais) e SAF-T do AirMenu: F2.
- Um período que atravessa meses (quinzena da Glovo) aparece nos dois meses; a repartição é da F3.
