# 03 — Casos de uso e API de emissão

Status: resolved
Fase: F3 · Bloqueado por: 02

Casos de uso: criar série (formação), emitir FT/FS/FR/NC/ND/CM, recibo RC, anular com motivo (bloqueios do Despacho 3.3.7–3.3.9), NC parcial limitada, 2.ª via com dados originais, recuperação de documento manual (M) e de duplicado (D). Rotas `/api/invoicing/*` classificadas em `route-permissions.ts` (`invoicing.read` / `invoicing.manage`), `npm run authz:matrix` com 0 não classificadas.

## Herdado da revisão da F1 (2026-11-03)
- Tabela de taxas de IVA por espaço fiscal (PT, PT-AC, PT-MA × RED/INT/NOR) com fonte oficial; recusar taxas que não constem.
- Menção legal de isenção ligada ao texto da tabela de motivos v4.0 (Despacho 2.2.14, 3.2.6), não texto livre.
- Desconto global do documento (`SettlementAmount` no SAF-T).
- Menções impressas escolhidas pelo modo da série (formação → «Documento emitido para fins de Formação»); confirmar com a AT o campo `R` do QR antes do certificado.
- Configuração do módulo via `src/config/env.ts`; tipos de domínio de `document-totals` para `domain/entities/`.
- Confirmar com a AT: campo do QR das autoliquidações (M30–M46).

## Comments
- 2026-11-03 — Feito: emissão FT/FS/FR/NC/ND/CM, séries (formação; normal só com certificado), código de validação manual, 2.ª via com menções, anulação com motivo fechado, configuração; taxas oficiais por região e menções de isenção v4.0 (ativos M07/M10/M19/M99); FS ≤ 100 € sem IVA; permissão `sales.invoicing`; emissão com Idempotency-Key obrigatório. Ficam para depois: recibos (RC), recuperação de documentos manuais (M/D), desconto global, NC parcial por linha.
