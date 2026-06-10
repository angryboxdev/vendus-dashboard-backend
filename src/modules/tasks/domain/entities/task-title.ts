/**
 * Value Object: TaskTitle
 *
 * Encapsula a validação e normalização do título de uma tarefa.
 * Construtores são privados — use TaskTitle.create() para garantir que só
 * existem instâncias válidas.
 */
export class TaskTitle {
  static readonly MAX_LENGTH = 200;

  readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  static create(raw: string): TaskTitle {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      throw new Error("Task title cannot be empty");
    }
    if (trimmed.length > TaskTitle.MAX_LENGTH) {
      throw new Error(`Task title cannot exceed ${TaskTitle.MAX_LENGTH} characters`);
    }
    return new TaskTitle(trimmed);
  }
}
