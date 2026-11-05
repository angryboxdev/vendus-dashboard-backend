# 06 — Webservices AT (ambiente de testes)

Status: publicado e desligado (2026-11-04) — decisão do utilizador: modelo tradicional (SAF-T pelo contabilista; séries no Portal). Não ligar sem nova decisão.
Fase: F6 · Bloqueado por: 03

SeriesWS (registar/anular/finalizar/consultar) e e-Fatura (RegisterInvoice/ChangeInvoiceStatus/RegisterWork) nas portas de teste; mTLS com certificado do produtor; outbox com reenvios e alerta antes do dia 5. Credenciais WFA/WSE por organização (decisão RGPD pendente). `security-review` obrigatório.

## Feito (2026-11-04)
- Protocolo a partir das fontes oficiais: WSDL `Fatcorews.wsdl` e `Comunicacao_Series.wsdl` (em `__tests__/fixtures/at/`), manuais e-Fatura v3.0 (out. 2025). Mensagens validadas contra o esquema dos WSDL (0 erros) com `validacao-saft/validar-wsdl.ps1`.
- e-Fatura: RegisterInvoice/RegisterWork e ChangeInvoiceStatus/ChangeWorkStatus; outbox derivada do registo append-only (`fn_invoicing_at_queue`); −10 conta como aceite; repetição com espera; prazo do dia 5; cron de 10 min; «Comunicar agora» e «Repetir recusados».
- Séries: registarSerie (guarda o código de validação devolvido), finalizarSerie, anularSerie — credenciais WSE no momento, nunca guardadas.
- mTLS com o `.pfx` do produtor; WS-Security (AES-128 por pedido, RSA com a chave pública da AT).
- Credenciais WFA por emitente cifradas (AES-256-GCM, `CREDENTIALS_ENCRYPTION_KEY`); tabela sem acesso do browser.
- Revisão de segurança feita (independente): 0 altas; corrigidas as médias (envio duplicado em concorrência → uma execução por organização; `force` não insiste com credenciais recusadas) e as baixas (mensagens de rede genéricas, tempo limite total). Fica: falha a meio de uma execução aborta essa organização (a seguinte retoma; o registo repete-se como −10).

## Por fazer
- Pedir à AT (email `asi-cd@at.gov.pt`, modelo no manual Aspetos genéricos §2.1.1) o certificado SSL de testes e a chave pública do Sistema de Autenticação; criar subutilizadores WFA e WSE; configurar `INVOICING_AT_TLS_PFX`, `INVOICING_AT_TLS_PASSPHRASE`, `INVOICING_AT_AUTH_PUBLIC_KEY`.
- Confirmar no ambiente de testes: padding RSA do Nonce, formato do Created, país do consumidor final, aceitação de documentos de formação, códigos de sucesso das séries.
- Decisão RGPD sobre guardar a credencial WFA (encarregado de proteção de dados).
- Recibos (RegisterPayment), DeleteInvoice, mês sem documentos, alerta por email antes do dia 5, alerta de renovação do certificado.
