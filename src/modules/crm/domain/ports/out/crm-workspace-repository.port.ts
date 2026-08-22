export type CustomerRow = {
  id: string; firstName: string; lastName: string | null; phone: string | null;
  email: string | null; preferredChannel: "WhatsApp" | "Email" | "SMS"; birthday: string | null;
  howFound: "Indicação" | "Redes Sociais" | "Walk-in" | "Passagem" | "Outro" | null;
  optIn: "Pendente" | "Sim" | "Não"; notes: string | null; referredBy: string | null; seg07Path: "A" | "B" | null;
  inactive: boolean; registeredAt: string; eatzRegisteredAt: string | null;
  eatzLastOrderDate: string | null; eatzOrderCount: number | null;
  eatzTotalSpent: number | null; eatzAvgTicket: number | null; eatzSegment: "Novo" | "Inativo" | "Recorrente" | null;
  eatzMarketingOptIn: boolean | null; eatzSnapshotAt: string | null; manualFollowupDate: string | null;
  createdAt: string; updatedAt: string;
};
export type OrderRow = { id: string; customerId: string; orderDate: string; amount: number; status: "concluído" | "cancelado"; notes: string | null; createdAt: string };
export type ContactRow = { id: string; customerId: string; contactedAt: string; channel: "WhatsApp" | "Email" | "SMS" | null; scriptCode: string | null; direction: "Enviado" | "Recebido"; status: any; response: any; notes: string | null; segmentAtTime: string | null; tagsAdded: string[]; tagsRemoved: string[]; createdAt: string };
export type ActionRow = {
  id: string; customerId: string; actionTypeCode: string; actionTypeName: string; actionTypeColor: string;
  status: "pending" | "completed" | "cancelled"; scheduledFor: string | null;
  completedAt: string | null; notes: string | null; scriptCode: string | null; createdAt: string;
};
export type TagRow = { name: string; label: string; color: string; category: string; active: boolean };
export type ActionTypeRow = { code: string; name: string; color: string; active: boolean; system: boolean };
export type WorkspaceDataset = {
  customers: CustomerRow[]; orders: OrderRow[]; contacts: ContactRow[]; actions: ActionRow[];
  tags: TagRow[]; assignments: { customerId: string; tagName: string }[];
  scripts: { code: string; name: string }[]; parameters: Record<string, string>;
};

export type CreateActionInput = {
  customerIds: string[]; actionTypeCode: string; status: "pending" | "completed";
  scheduledFor: string | null; completedAt: string | null; notes: string | null;
  scriptCode: string | null; createdBy: string;
};

export interface CrmWorkspaceRepositoryPort {
  loadDataset(): Promise<WorkspaceDataset>;
  listActionTypes(): Promise<ActionTypeRow[]>;
  createActionType(input: Omit<ActionTypeRow, "system">): Promise<ActionTypeRow>;
  updateActionType(code: string, input: { name: string; color?: string | undefined }): Promise<ActionTypeRow>;
  createActions(input: CreateActionInput): Promise<ActionRow[]>;
  completeAction(id: string, completedAt: string): Promise<ActionRow>;
  completeActions(actions: { id: string; completedAt: string }[]): Promise<ActionRow[]>;
  listCustomerActions(customerId: string, limit: number, offset: number): Promise<{ pending: ActionRow | null; history: ActionRow[]; total: number }>;
  createTag(input: { name: string; label: string; color: string; category: string }): Promise<TagRow>;
  updateTags(customerIds: string[], add: string[], remove: string[]): Promise<void>;
  setInactive(customerIds: string[], inactive: boolean): Promise<void>;
}
