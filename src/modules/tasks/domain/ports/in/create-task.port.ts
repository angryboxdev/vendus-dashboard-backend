export interface CreateTaskCommand {
  title: string;
}

export interface CreateTaskResult {
  id: string;
  title: string;
  status: string;
  createdAt: Date;
}

export interface CreateTaskPort {
  execute(command: CreateTaskCommand): Promise<CreateTaskResult>;
}
