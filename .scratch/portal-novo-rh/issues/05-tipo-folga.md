# Tipo de ausência «Folga»

Status: resolved
Fase: 1

Pedir folga à chefia como tipo de ausência com aprovação pela chefia direta; predefinição ou passo de configuração.

## Answer
Decisão do utilizador: predefinição. `absences.ensureDayOffType` (idempotente): fluxo «Chefia direta» (papel managers; sem chefia → recurso = administradores) + tipo «Folga» (código FOLGA, valores seguros ADR-0028, editável). Será chamado pelo interruptor da Fase 2.
