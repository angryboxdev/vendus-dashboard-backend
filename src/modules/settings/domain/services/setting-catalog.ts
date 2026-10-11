import type { SettingDefinition } from "../entities/setting-definition.js";

/**
 * Catálogo de parâmetros (C11.1 `setting_definition`), versionado em código.
 * Cada fase acrescenta os parâmetros do seu módulo. Regras:
 * - parâmetro legal → `legal: true`, `toValidate: true`, e nunca um valor legal como default (task §4.5);
 * - nomes de chave estáveis (`domínio.área.parâmetro`) — nunca renomear, criar outra.
 */
export const SETTING_CATALOG: SettingDefinition[] = [
  {
    key: "security.session.inactivity_minutes",
    domain: "security",
    type: "duration",
    unit: "minutes",
    label: "Fim de sessão por inatividade",
    description: "Minutos sem atividade até a sessão terminar e ser preciso entrar de novo.",
    defaultValue: 30,
    min: 5,
    max: 480,
    sensitive: false,
    legal: false,
    toValidate: true,
  },
  {
    // D4 (ADR-0025): sem valor legal até o DPO decidir; 0 = não anonimizar automaticamente.
    key: "security.privacy.retention_years_after_termination",
    domain: "security",
    type: "int",
    label: "Retenção de dados após a saída (anos)",
    description: "Anos depois da saída até os dados pessoais serem anonimizados. 0 = desligado até o DPO definir o prazo.",
    defaultValue: 0,
    min: 0,
    max: 30,
    sensitive: false,
    legal: true,
    toValidate: true,
  },
  {
    key: "time_tracking.tolerance.minutes",
    domain: "time_tracking",
    type: "duration",
    unit: "minutes",
    label: "Tolerância de entrada",
    description: "Minutos de atraso que não contam como atraso.",
    defaultValue: 0,
    min: 0,
    max: 120,
    sensitive: false,
    legal: false,
    toValidate: true,
    activeFromPhase: 4,
  },
  {
    key: "time_tracking.auto_close.enabled",
    domain: "time_tracking",
    type: "bool",
    label: "Saída automática",
    description: "Regista a saída automaticamente quando o horário ou a jornada termina e a pessoa se esqueceu.",
    defaultValue: false,
    sensitive: false,
    legal: false,
    toValidate: false,
    activeFromPhase: 4,
  },
  {
    key: "notifications.auto_close_warning.enabled",
    domain: "notifications",
    type: "bool",
    label: "Aviso de saída automática",
    description: "Avisa o colaborador antes de a saída ser registada automaticamente.",
    defaultValue: false,
    requires: [{ key: "time_tracking.auto_close.enabled", equals: true }],
    sensitive: false,
    legal: false,
    toValidate: false,
    activeFromPhase: 4,
  },
];
