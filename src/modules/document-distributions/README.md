# Module: document-distributions

> Status: active
> Last updated: 2026-10-12

---

## What it is and what it's for (business perspective)

Novo RH → **Documentos → Enviar a colaboradores** (FE-065): enviar o mesmo
documento (normas de segurança de uma obra, regulamento interno, …) a muitos
trabalhadores de uma vez, com confirmação de leitura quando é preciso.

**The problem it solves:**
Sem isto, o RH tinha de carregar o mesmo ficheiro na ficha de cada pessoa e
não tinha prova de quem o recebeu, abriu e confirmou.

**The flow from the business's point of view:**

```
RH / Gestão                                   Colaborador
──────────────────────────────                ──────────────────────────────
1. Escolhe ficheiro, título e público
   (todos, centros, departamentos, pessoas)
2. Vê quantas pessoas recebem
3. Envia                                  →   4. Recebe aviso na aplicação
                                              5. Abre o documento (fica "aberto")
                                              6. Confirma a leitura (se pedido)
7. Acompanha o progresso, lembra quem
   falta, exporta a prova (CSV), arquiva
```

**Key concepts for the business:**

- **Envio** — um ficheiro + a lista de destinatários fixada no momento do envio.
- **Aberto / Confirmado** — a primeira abertura e a primeira confirmação ficam registadas e nunca mudam.
- **Arquivar** — o envio deixa de aparecer ao colaborador; a prova mantém-se.

---

## Technical purpose

Dono dos envios (`document_distributions`) e dos destinatários
(`document_distribution_recipients`). Guarda o ficheiro **uma vez** no bucket
privado do motor de documentos (`hr-documents`, `{org_id}/distributions/`).
**Não** cria cópias em `hr_employee_documents` nem mexe nos documentos da
ficha (módulos `documents`/`hr`).

## Domain concepts

- `Distribution`, `DistributionRecipient`, `Audience` (`all` | `locations` | `departments` | `employees`).
- `validateNew` — título (≤ 160), público com ≥ 1 id, ficheiro PDF/JPEG/PNG até 20 MB (os mesmos dos documentos de colaborador).
- `isPending` — falta confirmar (se pedido) ou abrir; `recipientStatus`; `proofCsv` (`;`, BOM, fórmulas neutralizadas).

## Ports

### Input (use cases)

- `DistributionsUseCases` — `list` (com progresso), `previewAudience`, `send`, `report`, `remind` (1 por dia, só a quem falta), `archive`, `proof`, `downloadUrl`; colaborador: `mine`, `myDownloadUrl` (marca aberto), `confirm`.

### Output (domain dependencies)

- `DistributionsRepositoryPort` — envios e destinatários (sem apagar).
- `DistributionFilesPort` — guardar o ficheiro e URL assinado.
- `DistributionsContextPort` — público → colaboradores ativos, utilizador ↔ colaborador, nomes, avisos, relógio, auditoria.

## Adapters

### Input

- `createDistributionsRouter` → `/api/novo-rh/document-distributions` (`hr.documents`): `GET` lista, `POST` (multipart: `file`, `title`, `audience` em JSON, `requiresConfirmation`), `POST /audience-preview`, `GET /:id/report`, `POST /:id/remind`, `POST /:id/archive`, `GET /:id/download-url`, `GET /:id/proof.csv`.
- Colaborador (Portal): `GET /api/me/document-distributions`, `GET /:id/download-url`, `POST /:id/confirm`.

### Output

- `SupabaseDistributionsRepository` — leituras paginadas (o PostgREST corta em 1000 linhas).
- `SupabaseDistributionFilesAdapter` — `objectStorage` (URL assinado de 120 s).

## Design decisions (ADR summary)

- **Um ficheiro por envio, não uma cópia por pessoa** (difere da proposta FE-065): copiar para a ficha substituiria documentos da mesma categoria (regra "1 versão atual") e multiplicaria o mesmo ficheiro. A prova fica nas linhas dos destinatários.
- **Destinatários congelados e sem apagar** — trigger na BD impede `delete` (prova de entrega); quem entra depois no centro não recebe.
- **Quem não é destinatário recebe 404** (não revela que o envio existe).
- **`Idempotency-Key` opcional** — o envio é multipart e o cliente de upload não envia chave; o ecrã bloqueia o duplo clique.
- Avisos só na aplicação (D12, ADR-0033).

## How to test

- `npx jest src/modules/document-distributions` (fakes, sem BD; o teste HTTP faz mock do `default` do multer).

## Known gaps / open debt

- Ainda sem ecrã do colaborador (onda 6 — FE-074); as rotas `/api/me/...` já existem.
- Sem pastas gerais/partilhadas com acesso por papel nem eliminar com motivo (resto do FE-065); antivírus no upload depende do FE-022.
- Envio síncrono (sem *job*): para milhares de destinatários pode ser lento.
- Sem teste de integração do adapter Supabase (Supabase local indisponível).
