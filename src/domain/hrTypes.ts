import { z } from "zod";

export type EmployeeStatus = "active" | "inactive";

/** Efetivo | Contrato (a termo) | Extra — alinhado com o frontend. */
export type EmploymentType = "permanent" | "contract" | "extra";

/** Função na loja: Gerente | Preparador | Serviço. */
export type JobRole = "manager" | "prep" | "service";

/** Segunda = 0 … domingo = 6 (hora local da loja). */
export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type WeeklyScheduleSegment = {
  startTime: string;
  endTime: string;
};

export type WeeklyScheduleDay = {
  weekday: WeekdayIndex;
  segments: WeeklyScheduleSegment[];
};

/** Esqueleto semanal; dias omitidos ou com segments vazio = sem trabalho nesse dia. */
export type WeeklySchedule = {
  days: WeeklyScheduleDay[];
};

export type HrEmployee = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  roleOrNotes: string | null;
  employmentType: EmploymentType;
  jobRole: JobRole;
  /** Null se nunca foi definida na BD. */
  weeklySchedule: WeeklySchedule | null;
  status: EmployeeStatus;
  hiredAt: string | null;
  endedAt: string | null;
  /** Salário base mensal em EUR. Null se não definido. */
  baseSalary: number | null;
  /** "fixed" = salário mensal fixo; "hourly" = pago à hora. */
  salaryType: "fixed" | "hourly";
  /** Valor por hora em EUR (só usado quando salaryType = "hourly"). */
  hourlyRate: number | null;
  /** True se o funcionário tem um PIN de kiosk configurado. */
  hasKioskPin: boolean;
  /** NIF português (9 dígitos). Null se não definido. */
  nif: string | null;
  /** IBAN para pagamentos. Null se não definido. */
  iban: string | null;
  /** Morada completa. Null se não definida. */
  address: string | null;
  /** Data de nascimento (YYYY-MM-DD). Null se não definida. */
  birthDate: string | null;
  /** Número de Segurança Social. Null se não definido. */
  socialSecurityNumber: string | null;
  /** Número de Cartão de Cidadão / BI. Null se não definido. */
  idCardNumber: string | null;
  /** Nacionalidade. Null se não definida. */
  nationality: string | null;
  /** Nome do contacto de emergência. Null se não definido. */
  emergencyContactName: string | null;
  /** Telemóvel do contacto de emergência. Null se não definido. */
  emergencyContactPhone: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Conferência planeado vs realizado (sem linha na BD = pendente no UI).
 *  Ausências (férias, baixa, faltas justificadas/injustificadas) são
 *  geridas exclusivamente via hr_leave_requests. */
export type ShiftAttendanceStatus =
  | "worked_as_planned"
  | "late"
  | "left_early"
  | "cancelled";

export type RegistrationSource = "dashboard" | "employee_qr" | "import";

export type HrShiftAttendance = {
  id: string;
  workShiftId: string;
  status: ShiftAttendanceStatus;
  actualStartTime: string | null;
  actualEndTime: string | null;
  lateMinutes: number | null;
  notes: string | null;
  registrationSource: RegistrationSource;
  registeredByEmployeeId: string | null;
  registeredAt: string;
  updatedAt: string;
};

export type HrWorkShift = {
  id: string;
  employeeId: string;
  workDate: string;
  startTime: string;
  endTime: string;
  locationOrStation: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  /** Null = conferência ainda não registada. */
  attendance: HrShiftAttendance | null;
};

export type PaymentType = "salary" | "bonus" | "deduction" | "other";

export type HrEmployeePayment = {
  id: string;
  employeeId: string;
  paymentDate: string;
  amount: number;
  paymentType: PaymentType;
  salaryPeriodYear: number | null;
  salaryPeriodMonth: number | null;
  isPaid: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

const uuid = z.string().uuid();

export const dateYmdSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data esperada YYYY-MM-DD");

/** Hora HH:mm ou HH:mm:ss */
export const timeHmSchema = z
  .string()
  .regex(
    /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/,
    "Hora esperada HH:mm ou HH:mm:ss",
  );

/** Comparação para validação (mesmo dia civil; sem atravessar meia-noite). */
export function timeToSortableSeconds(t: string): number {
  const m = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(t.trim());
  if (!m) return Number.NaN;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const sec = m[3] != null ? Number(m[3]) : 0;
  return h * 3600 + min * 60 + sec;
}

/** Normaliza para HH:mm (API única); segundos só se não forem :00. */
export function formatWeeklyTime(t: string): string {
  const m = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(t.trim());
  if (!m) return t.trim();
  if (m[3] != null && m[3] !== "00") {
    return `${m[1]}:${m[2]}:${m[3]}`;
  }
  return `${m[1]}:${m[2]}`;
}

const weeklySegmentSchema = z
  .object({
    startTime: timeHmSchema,
    endTime: timeHmSchema,
  })
  .superRefine((seg, ctx) => {
    const a = timeToSortableSeconds(seg.startTime);
    const b = timeToSortableSeconds(seg.endTime);
    if (Number.isNaN(a) || Number.isNaN(b) || a >= b) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Em cada segmento, startTime deve ser anterior a endTime (sem atravessar meia-noite)",
        path: ["endTime"],
      });
    }
  });

const weeklyDaySchema = z.object({
  weekday: z.number().int().min(0).max(6),
  segments: z.array(weeklySegmentSchema),
});

export const weeklyScheduleSchema = z
  .object({
    days: z.array(weeklyDaySchema),
  })
  .superRefine((ws, ctx) => {
    const keys = ws.days.map((d) => d.weekday);
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "O mesmo weekday (0–6) não pode aparecer duas vezes em weeklySchedule.days",
      });
    }
  });

/** Ordena dias por weekday e segmentos por startTime; normaliza horas para HH:mm. */
export function finalizeWeeklySchedule(ws: WeeklySchedule): WeeklySchedule {
  const days = [...ws.days]
    .map((d) => ({
      weekday: d.weekday as WeekdayIndex,
      segments: [...d.segments]
        .map((s) => ({
          startTime: formatWeeklyTime(s.startTime),
          endTime: formatWeeklyTime(s.endTime),
        }))
        .sort(
          (a, b) =>
            timeToSortableSeconds(a.startTime) - timeToSortableSeconds(b.startTime),
        ),
    }))
    .sort((a, b) => a.weekday - b.weekday);
  return { days };
}

export const employeeCreateBodySchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  roleOrNotes: z.string().optional().nullable(),
  employmentType: z.enum(["permanent", "contract", "extra"]).optional(),
  jobRole: z.enum(["manager", "prep", "service"]).optional(),
  weeklySchedule: weeklyScheduleSchema.nullish().optional(),
  status: z.enum(["active", "inactive"]).optional(),
  hiredAt: z.string().datetime().optional().nullable(),
  endedAt: z.string().datetime().optional().nullable(),
  baseSalary: z.number().min(0).optional().nullable(),
  salaryType: z.enum(["fixed", "hourly"]).optional(),
  hourlyRate: z.number().min(0).optional().nullable(),
  nif: z.string().optional().nullable(),
  iban: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  birthDate: z.string().optional().nullable(),
  socialSecurityNumber: z.string().optional().nullable(),
  idCardNumber: z.string().optional().nullable(),
  nationality: z.string().optional().nullable(),
  emergencyContactName: z.string().optional().nullable(),
  emergencyContactPhone: z.string().optional().nullable(),
});

export const employeeUpdateBodySchema = employeeCreateBodySchema.partial();

export const shiftsQuerySchema = z.object({
  from: dateYmdSchema,
  to: dateYmdSchema,
  employeeId: uuid.optional(),
});

export const shiftCreateBodySchema = z.object({
  employeeId: uuid,
  workDate: dateYmdSchema,
  startTime: timeHmSchema,
  endTime: timeHmSchema,
  locationOrStation: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const shiftUpdateBodySchema = shiftCreateBodySchema
  .omit({ employeeId: true })
  .partial()
  .extend({
    employeeId: uuid.optional(),
  });

export const shiftAttendanceUpsertBodySchema = z
  .object({
    status: z.enum([
      "worked_as_planned",
      "late",
      "left_early",
      "cancelled",
    ]),
    actualStartTime: timeHmSchema.optional().nullable(),
    actualEndTime: timeHmSchema.optional().nullable(),
    lateMinutes: z.number().int().min(0).optional().nullable(),
    notes: z.string().optional().nullable(),
    registrationSource: z
      .enum(["dashboard", "employee_qr", "import"])
      .optional()
      .default("dashboard"),
    registeredByEmployeeId: uuid.optional().nullable(),
  })
  .superRefine((body, ctx) => {
    const a =
      body.actualStartTime != null
        ? timeToSortableSeconds(body.actualStartTime)
        : null;
    const b =
      body.actualEndTime != null
        ? timeToSortableSeconds(body.actualEndTime)
        : null;
    if (
      a != null &&
      b != null &&
      !Number.isNaN(a) &&
      !Number.isNaN(b) &&
      a >= b
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "actualStartTime deve ser anterior a actualEndTime (mesmo dia civil)",
        path: ["actualEndTime"],
      });
    }
  });

export const employeesListQuerySchema = z.object({
  status: z.enum(["active", "inactive", "all"]).optional().default("all"),
  limit: z.coerce.number().int().min(1).max(500).optional().default(200),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export const paymentsListQuerySchema = z
  .object({
    from: dateYmdSchema.optional(),
    to: dateYmdSchema.optional(),
    year: z.coerce.number().int().min(2000).max(2100).optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
  })
  .superRefine((q, ctx) => {
    const ymPair = q.year != null && q.month != null;
    const ymPartial = (q.year != null) !== (q.month != null);
    const rangePair = q.from != null && q.to != null;
    const rangePartial = (q.from != null) !== (q.to != null);
    if (ymPartial) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "year e month são obrigatórios em conjunto",
      });
    }
    if (rangePartial) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "from e to são obrigatórios em conjunto",
      });
    }
    if (ymPair && rangePair) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Não combines year/month com from/to no mesmo pedido",
      });
    }
  });

export const paymentCreateBodySchema = z.object({
  paymentDate: dateYmdSchema,
  amount: z.number().finite(),
  paymentType: z.enum(["salary", "bonus", "deduction", "other"]),
  notes: z.string().optional().nullable(),
  salaryPeriodYear: z.number().int().min(2000).max(2100).optional().nullable(),
  salaryPeriodMonth: z.number().int().min(1).max(12).optional().nullable(),
  isPaid: z.boolean().optional(),
});

export const paymentUpdateBodySchema = paymentCreateBodySchema.partial();

export type EmployeeCreateBody = z.infer<typeof employeeCreateBodySchema>;
export type EmployeeUpdateBody = z.infer<typeof employeeUpdateBodySchema>;
export type ShiftCreateBody = z.infer<typeof shiftCreateBodySchema>;
export type ShiftUpdateBody = z.infer<typeof shiftUpdateBodySchema>;
export type ShiftAttendanceUpsertBody = z.infer<
  typeof shiftAttendanceUpsertBodySchema
>;
export type PaymentCreateBody = z.infer<typeof paymentCreateBodySchema>;
export type PaymentUpdateBody = z.infer<typeof paymentUpdateBodySchema>;

// ---------- Kiosk ----------

export const setKioskPinBodySchema = z.object({
  pin: z.string().regex(/^\d{4}$/, "PIN deve ter exactamente 4 dígitos numéricos"),
});

export const kioskScanBodySchema = z.object({
  token: z.string().min(1, "token obrigatório"),
  date: dateYmdSchema,
  pin: z.string().regex(/^\d{4}$/, "PIN deve ter exactamente 4 dígitos numéricos"),
});

export type SetKioskPinBody = z.infer<typeof setKioskPinBodySchema>;
export type KioskScanBody = z.infer<typeof kioskScanBodySchema>;

export type KioskAction = "check_in" | "check_out";

export type KioskScanResult = {
  action: KioskAction;
  employee: { id: string; fullName: string };
  time: string; // HH:mm em hora de Lisboa
  shift: { startTime: string; endTime: string };
};
