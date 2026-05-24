import { z } from "zod";

// ─── Enums ────────────────────────────────────────────────────────────────────

export type CrmSegment =
  | "SEG-01"
  | "SEG-02"
  | "SEG-03"
  | "SEG-04"
  | "SEG-05"
  | "SEG-06"
  | "SEG-07"
  | "INATIVO";

export type CrmChannel = "WhatsApp" | "Email" | "SMS";
export type CrmOptIn = "Pendente" | "Sim" | "Não";
export type CrmHowFound = "Indicação" | "Redes Sociais" | "Walk-in" | "Passagem" | "Outro";
export type CrmContactDirection = "Enviado" | "Recebido";
export type CrmContactStatus =
  | "Enviado"
  | "Entregue"
  | "Lido"
  | "Respondeu"
  | "Sem resposta"
  | "Não Respondeu";
export type CrmContactResponse = "Positivo" | "Neutro" | "Negativo" | "Sem Resposta";
export type CrmOrderStatus = "concluído" | "cancelado";
export type CrmSeg07Path = "A" | "B";

// ─── Entidades ────────────────────────────────────────────────────────────────

export type CrmCustomer = {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  preferredChannel: CrmChannel;
  birthday: string | null;   // YYYY-MM-DD
  howFound: CrmHowFound | null;
  optIn: CrmOptIn;
  notes: string | null;
  inactive: boolean;
  referredBy: string | null;
  seg07Path: CrmSeg07Path | null;
  registeredAt: string;      // YYYY-MM-DD
  manualFollowupDate: string | null; // YYYY-MM-DD — override manual da data de follow-up
  createdAt: string;
  updatedAt: string;
};

/** Cliente com campos calculados — retornado pela API */
export type CrmCustomerEnriched = CrmCustomer & {
  segment: CrmSegment;
  orderCount: number;
  ltv: number;
  avgTicket: number;
  firstOrderDate: string | null;
  lastOrderDate: string | null;
  daysSinceLastOrder: number | null;
  tags: string[];
  nextFollowUp: CrmNextFollowUp | null;
};

export type CrmOrder = {
  id: string;
  customerId: string;
  orderDate: string;   // YYYY-MM-DD
  amount: number;
  status: CrmOrderStatus;
  notes: string | null;
  createdAt: string;
};

export type CrmContact = {
  id: string;
  customerId: string;
  contactedAt: string; // ISO timestamp
  channel: CrmChannel | null;
  scriptCode: string | null;
  direction: CrmContactDirection;
  status: CrmContactStatus | null;
  response: CrmContactResponse | null;
  notes: string | null;
  segmentAtTime: string | null;
  tagsAdded: string[];
  tagsRemoved: string[];
  createdAt: string;
};

export type CrmScriptVariant = {
  label: string;
  body: string;
};

export type CrmScript = {
  code: string;
  name: string;
  segment: string | null;
  body: string;
  variants: CrmScriptVariant[] | null;
  channel: string | null;
  triggerTiming: string | null;
  oneShot: boolean;
  cooldownDays: number | null;
  active: boolean;
};

export type CrmTag = {
  name: string;
  description: string | null;
  color: string;
  category: string;
};

export type CrmParameter = {
  key: string;
  value: string;
  description: string | null;
  category: string;
};

/** Parâmetros já tipados — lidos de crm_parameters e convertidos */
export type CrmParams = {
  // Segmentação
  seg01MaxDays: number;
  seg02MaxDays: number;
  seg03MaxDays: number;
  seg04MaxDays: number;
  seg05MaxDays: number;
  vipMinOrders: number;
  vipMinLtv: number;
  // Régua SEG-01
  seg01Days212: number;
  seg01Days213: number;
  seg01DaysTransition: number;
  // Régua SEG-02
  seg02Days221: number;
  seg02Days222: number;
  seg02DaysTransition: number;
  // Régua SEG-03
  seg03CycleDays: number;
  // Régua SEG-04
  seg04CheckinDays: number;
  seg04RiskDays: number;
  // Régua SEG-05
  seg05Days251: number;
  seg05Days251Vip: number;
  seg05Days252Rec: number;
  seg05Days252Vip: number;
  seg05DaysTransition: number;
  // Régua SEG-06
  seg06Days261: number;
  seg06SleepDays: number;
  // Régua SEG-07
  seg07DaysFirst: number;
  seg07Days272: number;
  seg07InactiveDays: number;
};

export type CrmNextFollowUp = {
  date: string;        // YYYY-MM-DD — quando contactar
  scriptCode: string;  // ex: '2.1.2', '→SEG-05', 'dormir'
  reason: string;      // descrição legível
  isOverdue: boolean;
  daysUntil: number;   // negativo se atrasado
};

// ─── Zod schemas (validação de input da API) ──────────────────────────────────

export const crmChannelSchema = z.enum(["WhatsApp", "Email", "SMS"]);
export const crmOptInSchema = z.enum(["Pendente", "Sim", "Não"]);
export const crmHowFoundSchema = z.enum(["Indicação", "Redes Sociais", "Walk-in", "Passagem", "Outro"]);
export const crmOrderStatusSchema = z.enum(["concluído", "cancelado"]);
export const crmContactDirectionSchema = z.enum(["Enviado", "Recebido"]);
export const crmContactStatusSchema = z.enum([
  "Enviado", "Entregue", "Lido", "Respondeu", "Sem resposta", "Não Respondeu",
]);
export const crmContactResponseSchema = z.enum(["Positivo", "Neutro", "Negativo", "Sem Resposta"]);

export const customerCreateBodySchema = z.object({
  firstName:        z.string().min(1),
  lastName:         z.string().optional().nullable(),
  email:            z.string().email().optional().nullable(),
  phone:            z.string().optional().nullable(),
  preferredChannel: crmChannelSchema.optional().default("WhatsApp"),
  birthday:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  howFound:         crmHowFoundSchema.optional().nullable(),
  optIn:            crmOptInSchema.optional().default("Pendente"),
  notes:            z.string().optional().nullable(),
  referredBy:       z.string().optional().nullable(),
  seg07Path:        z.enum(["A", "B"]).optional().nullable(),
  registeredAt:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type CustomerCreateBody = z.infer<typeof customerCreateBodySchema>;
export type CustomerUpdateBody = Partial<CustomerCreateBody> & {
  inactive?: boolean;
  optIn?: CrmOptIn;
  manualFollowupDate?: string | null;
};

export const orderCreateBodySchema = z.object({
  orderDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount:      z.number().min(0),
  status:      crmOrderStatusSchema.optional().default("concluído"),
  notes:       z.string().optional().nullable(),
});

export type OrderCreateBody = z.infer<typeof orderCreateBodySchema>;

export const contactCreateBodySchema = z.object({
  customerId:   z.string(),
  contactedAt:  z.string().optional(),                   // ISO timestamp ou YYYY-MM-DD; omitir = agora
  channel:      crmChannelSchema.optional().nullable(),
  scriptCode:   z.string().optional().nullable(),
  direction:    crmContactDirectionSchema.optional().default("Enviado"),
  status:       crmContactStatusSchema.optional().nullable(),
  response:     crmContactResponseSchema.optional().nullable(),
  notes:        z.string().optional().nullable(),
  segmentAtTime:z.string().optional().nullable(),
  tagsToAdd:    z.array(z.string()).optional(),
  tagsToRemove: z.array(z.string()).optional(),
});

export type ContactCreateBody = z.infer<typeof contactCreateBodySchema>;
