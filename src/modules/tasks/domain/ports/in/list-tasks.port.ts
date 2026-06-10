export interface TaskDto {
  id: string;
  title: string;
  status: string;
  createdAt: Date;
}

export interface ListTasksPort {
  execute(): Promise<TaskDto[]>;
}
