import { InvalidPositionError } from "../errors.js";
import type { JobRole } from "./employee.js";

export interface PositionProps {
  id: string;
  name: string;
  description: string | null;
  /**
   * Categoria operacional transitória (spec D4): os mesmos 3 valores da antiga
   * "Função" (`JobRole`). As Escalas (rotações) e as categorias de documentos
   * ainda filtram por ela; o `jobRole` de cada colaborador acompanha sempre a
   * categoria do seu cargo até essas áreas migrarem para o cargo.
   */
  operationalCategory: JobRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PositionDetails {
  name: string;
  description: string | null;
  operationalCategory: JobRole;
}

const OPERATIONAL_CATEGORIES: JobRole[] = ["manager", "prep", "service"];
const MAX_NAME_LENGTH = 80;

/**
 * Mesma normalização da coluna gerada `hr_positions.normalized_name`
 * (minúsculas, espaços colapsados) — usada para detetar duplicados antes de
 * gravar; a restrição única na BD continua a ser a garantia final.
 */
export function normalizePositionName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function clean(details: PositionDetails): PositionDetails {
  const name = details.name.trim().replace(/\s+/g, " ");
  if (name.length === 0) throw new InvalidPositionError("Nome do cargo é obrigatório");
  if (name.length > MAX_NAME_LENGTH) throw new InvalidPositionError(`Nome do cargo: máximo ${MAX_NAME_LENGTH} caracteres`);
  if (!OPERATIONAL_CATEGORIES.includes(details.operationalCategory)) {
    throw new InvalidPositionError("Categoria operacional inválida");
  }
  const description = details.description?.trim() || null;
  return { name, description, operationalCategory: details.operationalCategory };
}

/**
 * Cargo profissional de um colaborador (ex.: "Gerente de Loja"). Não é uma
 * permissão — o acesso ao Hub continua a ser decidido só pelo RBAC
 * (`org_members.role`). Imutável; nunca é apagado, só inativado (cargos já
 * usados historicamente ficam referenciados).
 */
export class Position {
  private constructor(private readonly props: PositionProps) {}

  get id(): string {
    return this.props.id;
  }
  get name(): string {
    return this.props.name;
  }
  get description(): string | null {
    return this.props.description;
  }
  get operationalCategory(): JobRole {
    return this.props.operationalCategory;
  }
  get active(): boolean {
    return this.props.active;
  }
  get normalizedName(): string {
    return normalizePositionName(this.props.name);
  }

  static create(id: string, details: PositionDetails, now: Date): Position {
    const iso = now.toISOString();
    return new Position({ id, ...clean(details), active: true, createdAt: iso, updatedAt: iso });
  }

  static reconstitute(props: PositionProps): Position {
    return new Position({ ...props });
  }

  update(changes: Partial<PositionDetails>, now: Date): Position {
    const merged = clean({
      name: changes.name ?? this.props.name,
      description: changes.description !== undefined ? changes.description : this.props.description,
      operationalCategory: changes.operationalCategory ?? this.props.operationalCategory,
    });
    return new Position({ ...this.props, ...merged, updatedAt: now.toISOString() });
  }

  setActive(active: boolean, now: Date): Position {
    return new Position({ ...this.props, active, updatedAt: now.toISOString() });
  }

  toProps(): PositionProps {
    return { ...this.props };
  }
}
