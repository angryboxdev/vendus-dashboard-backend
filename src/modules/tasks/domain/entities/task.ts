import { TaskTitle } from "./task-title.js";
import { TaskAlreadyDoneError } from "../errors.js";

export type TaskStatus = "pending" | "done";

interface TaskProps {
  id: string;
  title: TaskTitle;
  status: TaskStatus;
  createdAt: Date;
}

export class Task {
  readonly id: string;
  readonly title: TaskTitle;
  readonly createdAt: Date;
  private _status: TaskStatus;

  private constructor(props: TaskProps) {
    this.id = props.id;
    this.title = props.title;
    this._status = props.status;
    this.createdAt = props.createdAt;
  }

  get status(): TaskStatus {
    return this._status;
  }

  /**
   * Marca a tarefa como concluída.
   * Invariante: uma tarefa já concluída não pode ser concluída de novo.
   */
  complete(): void {
    if (this._status === "done") {
      throw new TaskAlreadyDoneError(this.id);
    }
    this._status = "done";
  }

  /** Factory para criação de novas tarefas. */
  static create(rawTitle: string): Task {
    return new Task({
      id: crypto.randomUUID(),
      title: TaskTitle.create(rawTitle),
      status: "pending",
      createdAt: new Date(),
    });
  }

  /**
   * Factory para reconstituir uma tarefa a partir de dados persistidos.
   * Não valida o título novamente — assume que os dados do repositório são
   * válidos (foram validados na criação original).
   */
  static reconstitute(props: TaskProps): Task {
    return new Task(props);
  }
}
