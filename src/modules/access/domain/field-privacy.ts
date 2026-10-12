/**
 * Privacidade por campo (Configurações C3.6, Eng. Reversa 9.2): por perfil,
 * cada campo pessoal tem Ver/Editar. Catálogo em código; um campo sem regra
 * no perfil usa `defaultView`/`defaultEdit` (seguro: dados sensíveis
 * escondidos por omissão). Admin vê e edita tudo.
 */
export interface FieldPrivacyDef {
  key: string;
  group: "personal" | "identification" | "work";
  label: string;
  /** Categoria sensível (task §4.3): nunca visível por omissão. */
  sensitive: boolean;
  defaultView: boolean;
  defaultEdit: boolean;
}

export const FIELD_PRIVACY_CATALOG: FieldPrivacyDef[] = [
  { key: "personal.birth_date", group: "personal", label: "Data de nascimento", sensitive: false, defaultView: false, defaultEdit: false },
  { key: "personal.gender", group: "personal", label: "Género", sensitive: false, defaultView: false, defaultEdit: false },
  { key: "personal.nationality", group: "personal", label: "Nacionalidade", sensitive: false, defaultView: false, defaultEdit: false },
  { key: "personal.address", group: "personal", label: "Morada", sensitive: true, defaultView: false, defaultEdit: false },
  { key: "personal.phone", group: "personal", label: "Telefone pessoal", sensitive: false, defaultView: true, defaultEdit: false },
  { key: "personal.email", group: "personal", label: "E-mail pessoal", sensitive: false, defaultView: true, defaultEdit: false },
  { key: "identification.id_document", group: "identification", label: "Documento de identificação", sensitive: true, defaultView: false, defaultEdit: false },
  { key: "identification.nif", group: "identification", label: "NIF", sensitive: true, defaultView: false, defaultEdit: false },
  { key: "identification.niss", group: "identification", label: "NISS", sensitive: true, defaultView: false, defaultEdit: false },
  { key: "identification.iban", group: "identification", label: "IBAN", sensitive: true, defaultView: false, defaultEdit: false },
  { key: "work.salary", group: "work", label: "Remuneração", sensitive: true, defaultView: false, defaultEdit: false },
  { key: "work.contract", group: "work", label: "Dados do contrato", sensitive: false, defaultView: true, defaultEdit: false },
];

export interface FieldRule {
  fieldKey: string;
  canView: boolean;
  canEdit: boolean;
}

export interface FieldAccess {
  view: boolean;
  edit: boolean;
}

/** Ver/Editar efetivo de um campo para um perfil. Campo desconhecido → nada. */
export function fieldAccess(isAdmin: boolean, rules: FieldRule[], fieldKey: string): FieldAccess {
  const def = FIELD_PRIVACY_CATALOG.find((f) => f.key === fieldKey);
  if (!def) return { view: false, edit: false };
  if (isAdmin) return { view: true, edit: true };
  const rule = rules.find((r) => r.fieldKey === fieldKey);
  const view = rule ? rule.canView : def.defaultView;
  const edit = view && (rule ? rule.canEdit : def.defaultEdit);
  return { view, edit };
}
