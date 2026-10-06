Status: in-progress (backend feito)
Blocked by: 04

# Geolocalização

Locais (Empresa & Estrutura): latitude/longitude ("Usar a minha localização atual"), raio, política off/warn/block, auditoria em `location_audit_logs`. Serviço de domínio: distância haversine, classificação inside/outside/unverified (precisão > limite, ambíguo, negado, timeout, sem coordenadas). Políticas conforme P10. Alertas `outside`/`unverified` na revisão de assiduidade / Alertas e ações. Frontend: `GeolocationPort` (adapter `navigator.geolocation`, timeout), só pede GPS se política ≠ off, mensagens claras e "Tentar novamente", texto informativo RGPD no 1º pedido.
Testes críticos: dentro, fora (warn/block), impreciso, negado.
