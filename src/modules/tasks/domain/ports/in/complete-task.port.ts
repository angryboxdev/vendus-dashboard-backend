export interface CompleteTaskCommand {
  taskId: string;
}

export interface CompleteTaskPort {
  execute(command: CompleteTaskCommand): Promise<void>;
}
