/** Erros do motor de configurações. O adapter HTTP converte-os em RFC 7807. */

export class SettingValidationError extends Error {
  readonly code = "validation_error";
  constructor(
    message: string,
    readonly key: string,
  ) {
    super(message);
    this.name = "SettingValidationError";
  }
}

/** TK-7: violação de dependência (`requires`) → 422 `rule_violation`. */
export class SettingRuleViolation extends Error {
  readonly code = "rule_violation";
  constructor(
    message: string,
    readonly key: string,
    readonly requires: { key: string; equals: unknown },
  ) {
    super(message);
    this.name = "SettingRuleViolation";
  }
}

/** TK-6: data de efeito no passado sem a permissão de retroativo. */
export class RetroactiveNotAllowed extends Error {
  readonly code = "retroactive_not_allowed";
  constructor(readonly validFrom: string) {
    super("A data de efeito está no passado: é preciso a permissão de alterações retroativas.");
    this.name = "RetroactiveNotAllowed";
  }
}

export class SettingNotFound extends Error {
  readonly code = "not_found";
  constructor(message: string) {
    super(message);
    this.name = "SettingNotFound";
  }
}
