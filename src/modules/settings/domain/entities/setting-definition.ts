/**
 * Definição de um parâmetro configurável (Configurações C11.1,
 * `setting_definition`). O catálogo vive em código (versionado no git) —
 * ver `services/setting-catalog.ts`.
 */

export type SettingType = "bool" | "int" | "duration" | "enum" | "time" | "list" | "json";

/** Valor guardado (JSON). `duration` em minutos; `time` em "HH:MM". */
export type SettingData = boolean | number | string | string[] | { [k: string]: unknown };

export type SettingDomain = "security" | "time_tracking" | "notifications" | "legal";

export interface SettingRequirement {
  /** Chave de que este parâmetro depende. */
  key: string;
  /** Valor que essa chave tem de ter para este poder ficar ativo. */
  equals: SettingData;
}

export interface SettingDefinition {
  key: string;
  domain: SettingDomain;
  type: SettingType;
  label: string;
  description: string;
  unit?: "minutes" | "days" | "meters";
  /**
   * Valor de sistema quando nenhum perfil define a chave. `null` = não
   * definido (parâmetros legais sem valor — ADR-0026): a regra não se aplica.
   */
  defaultValue: SettingData | null;
  min?: number;
  max?: number;
  allowed?: string[];
  /** Listas: mínimo de elementos (ex.: pelo menos 1 método de identificação no quiosque — CF-4). */
  minItems?: number;
  /**
   * Dependências (C9): só se aplicam quando ESTE parâmetro tem um valor
   * "ativo" (bool true; nos outros tipos, qualquer valor diferente do
   * default). Ex.: aviso de fecho automático requer o fecho automático.
   */
  requires?: SettingRequirement[];
  /** Sensível: valor não aparece em logs nem exportações sem permissão. */
  sensitive: boolean;
  /** Parâmetro legal (descanso, limites, férias…): nunca tem valor legal por defeito (task §4.5). */
  legal: boolean;
  /** O default ainda não foi validado por RH/jurídico (`a_validar`). */
  toValidate: boolean;
  /** Fase em que o parâmetro passa a ter efeito (informativo para a UI). */
  activeFromPhase?: number;
}
