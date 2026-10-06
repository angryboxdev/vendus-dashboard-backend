# Módulo: sales-declaration

> Status: ativo
> Última atualização: 2026-10-06

---

## O que é e para que serve (perspectiva de negócio)

O **Mercado Bom Sucesso** (centro comercial onde a Angry Box tem a loja L027) exige uma declaração semanal do valor faturado, num ficheiro Excel com formato fixo (`SalesReport_<início>_<fim>.xlsx`, folha `SalesDeclaration`).

**O problema que resolve:**
Montar esse ficheiro à mão a partir do Vendus e do AirMenu dava trabalho e valores que não batiam com a contabilidade. Os **SAF-T** (Vendus e AirMenu) são o registo fiscal exato — este módulo lê-os diretamente.

**O fluxo do ponto de vista do negócio:**

```
Gestor                                   Dashboard
──────────────────────────               ───────────────────────────────────
1. Exporta os SAF-T do Vendus e
   do AirMenu (back-office)
2. Abre "Declaração de vendas"
3. Escolhe os ficheiros .xml         →   4. Soma, por dia, o valor sem IVA
5. Clica "Gerar Excel"                   6. Devolve o .xlsx pronto a enviar
7. Envia o ficheiro ao Mercado
```

**Conceitos-chave para o negócio:**

- **Normal** — única coluna de valor do ficheiro: faturação do dia **sem IVA**, já líquida de notas de crédito.
- **Período** — o que vem declarado nos SAF-T (`StartDate`/`EndDate`); dias sem vendas aparecem com 0.
- **Vários SAF-T** — somam-se (ex.: Vendus + AirMenu). O mesmo documento enviado duas vezes conta uma só vez.

---

## Propósito técnico

Recebe SAF-T (PT 1.04_01) por upload, soma o `NetTotal` dos documentos de venda por dia e gera o `.xlsx`. Não chama o Vendus nem o AirMenu, não guarda nada (sem cache nem BD) e não depende de outros módulos.

## Domínio

- **SaftSalesDocument** — `{ number, date, netCents }`; `netCents` negativo nas notas de crédito.
- **parseSaftSales** (serviço puro) — lê `SalesInvoices/Invoice`: `InvoiceDate`, `InvoiceType`, `InvoiceStatus`, `DocumentTotals/NetTotal`. Ignora estado `A` (anulado). Rejeita ficheiros sem `AuditFile`/`SalesInvoices` ou com documentos ilegíveis (`InvalidSaftFileError`, com o nome do ficheiro).
- **mergeSaftSales / declarationPeriod / buildSalesDeclarationRows** — junta ficheiros sem duplicar documentos (por `InvoiceNo`), define o período (cabeçalhos, alargado a documentos fora deles) e gera uma linha por dia.
- **SalesDeclarationStore** — colunas fixas do ficheiro (`BOM_SUCESSO_STORE` em `sales-declaration.module.ts`).

## Ports

### Entrada (use cases)

- `GenerateSalesDeclarationPort` — recebe os SAF-T (texto) e devolve `{ fileName, content }`. Erros: `InvalidSaftFileError`, `InvalidSalesDeclarationRequestError` (sem ficheiros / datas impossíveis) → 400.

### Saída (dependências do domínio)

- `SalesDeclarationFileWriterPort` — serializa as linhas no ficheiro final.

## Adapters

### Entrada

- `SalesDeclarationController` → `POST /api/sales-declaration/export` (`multipart/form-data`, campo `files`, até 10 ficheiros de 25 MB; role mínima `manager`). Decodifica os bytes em `latin1` (SAF-T declaram UTF-8 ou Windows-1252; só interessam tags e números). Expõe `Content-Disposition` para o front ler o nome.

### Saída

- `XlsxSalesDeclarationWriterAdapter` → escreve o `.xlsx` com a biblioteca `xlsx` (data como data Excel `m/d/yy`, contrato como texto para manter zeros à esquerda, valor em euros).

## Design decisions (ADR summary)

- **SAF-T em vez das APIs** (decisão de 2026-10-06): a primeira versão somava Vendus + AirMenu via API, mas o líquido do AirMenu depende do catálogo de menu (taxa de IVA por PLU) e divergia do fiscal (ex.: 27/09/2026: 166,21 na página vs 169,48 no SAF-T), e o Vendus dependia de regras de emparelhamento FS/NC. O SAF-T é o registo fiscal — sem aproximações. Como efeito, o módulo também deixou de depender de `vendus`, `air-menu` e do limite de 1 pedido/2 s da API AirMenu.
- **Valor = `NetTotal` do documento**, não a soma das linhas: é o líquido fiscal por documento (bate com o Vendus ao cêntimo; o cabeçalho do SAF-T usa as linhas sem arredondar, por isso o total pode diferir uns cêntimos).
- **Notas de crédito subtraem na data da NC**; documentos anulados (`A`) não contam. Não se emparelham FS/NC — o SAF-T já traz ambos.
- **Sem limite de dias**: o custo não depende de APIs externas.
- **Dedupe por `InvoiceNo`**: enviar o mesmo ficheiro duas vezes não duplica valores. Assume numerações únicas entre os ficheiros (séries do Vendus e do back-office AirMenu são distintas).

## Como testar

- Domínio, use case e writer (fixtures XML mínimas, sem rede nem BD): `npx jest src/modules/sales-declaration --no-coverage`

Integração manual:
```
curl -X POST http://localhost:<porta>/api/sales-declaration/export \
  -H "Authorization: Bearer <token>" \
  -F files=@Vendus-saft.xml -F files=@saft_bo.xml -o SalesReport.xlsx
```

## Dívidas conhecidas

- Identificação da loja e contrato estão em código (`BOM_SUCESSO_STORE`); passar para config por localização se surgirem outras lojas/centros.
- Sem teste automático do controller (sem supertest no projeto); foi verificado manualmente com os SAF-T de 10–30/09/2026 (resultado idêntico ao Excel de referência).
- Aceita qualquer SAF-T de vendas: não confirma que pertence à loja certa.
