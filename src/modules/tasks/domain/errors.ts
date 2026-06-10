export class TaskAlreadyDoneError extends Error {
  constructor(taskId: string) {
    super(`Task "${taskId}" is already done`);
    this.name = "TaskAlreadyDoneError";
  }
}

export class TaskNotFoundError extends Error {
  constructor(taskId: string) {
    super(`Task "${taskId}" not found`);
    this.name = "TaskNotFoundError";
  }
}
