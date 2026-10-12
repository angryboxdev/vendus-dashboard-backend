import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { missingRequired, validateAnswers, validateForm, validateTask, visiblePresence, WorkspaceError, type RequestFormInput, type TaskInput } from "../../domain/entities/workspace.js";
import type { WorkspaceContextPort, WorkspaceRepositoryPort } from "../../domain/ports/out/workspace.ports.js";

export interface Actor {
  userId: string;
  email: string;
}

let itemSeq = 0;
const itemId = () => `i${Date.now().toString(36)}${(itemSeq++).toString(36)}`;

export class WorkspaceUseCases {
  constructor(
    private readonly repo: WorkspaceRepositoryPort,
    private readonly ctx: WorkspaceContextPort,
  ) {}

  private async me(org: OrganizationId, actor: Actor) {
    const e = await this.ctx.employeeForUser(org, actor.userId);
    if (!e) throw new WorkspaceError("Esta conta não está ligada a uma ficha de colaborador.", "not_found");
    return e;
  }

  // ── Tarefas operacionais ────────────────────────────────────────────
  listTasks(org: OrganizationId, status?: "open" | "done" | "cancelled") {
    return this.repo.listTasks(org, status ? { status } : {});
  }

  async createTask(org: OrganizationId, actor: Actor, input: TaskInput) {
    validateTask(input);
    const t = await this.repo.createTask(
      org,
      {
        title: input.title.trim(),
        description: input.description?.trim() || null,
        assigneeEmployeeId: input.assigneeEmployeeId,
        locationId: input.locationId,
        dueAt: input.dueAt,
        checklist: input.checklist.map((i) => ({ id: itemId(), text: i.text.trim(), required: i.required, done: false, doneBy: null, doneAt: null })),
      },
      actor.email,
    );
    if (t.assigneeEmployeeId) {
      const user = await this.ctx.userOfEmployee(org, t.assigneeEmployeeId);
      if (user) await this.ctx.notify(org, [user], { title: `Tarefa nova: ${t.title}`, body: t.dueAt ? `Prazo: ${t.dueAt.slice(0, 16).replace("T", " ")}.` : "Sem prazo.", link: "/hr/novo/tarefas", dedupeKey: `task:${t.id}` });
    }
    await this.ctx.audit(org, { actor: actor.email, action: "workspace.task.create", resourceId: t.id, after: t, reason: null });
    return t;
  }

  /** A gestão ou a pessoa atribuída marcam itens; tarefa fechada não muda. */
  async toggleItem(org: OrganizationId, actor: Actor, taskId: string, itemIdValue: string, done: boolean, isManager: boolean) {
    const t = await this.repo.getTask(org, taskId);
    if (!t) throw new WorkspaceError("Tarefa não encontrada.", "not_found");
    if (!isManager && t.assigneeEmployeeId !== (await this.ctx.employeeForUser(org, actor.userId))) throw new WorkspaceError("Esta tarefa não é sua.", "forbidden");
    if (t.status !== "open") throw new WorkspaceError("A tarefa já não está aberta.", "invalid_state");
    if (!t.checklist.some((i) => i.id === itemIdValue)) throw new WorkspaceError("Item não encontrado.", "not_found");
    const now = this.ctx.now();
    const checklist = t.checklist.map((i) => (i.id === itemIdValue ? { ...i, done, doneBy: done ? actor.email : null, doneAt: done ? now : null } : i));
    const updated = await this.repo.updateTask(org, taskId, "open", { checklist });
    if (!updated) throw new WorkspaceError("A tarefa mudou entretanto.", "invalid_state");
    return updated;
  }

  async completeTask(org: OrganizationId, actor: Actor, taskId: string, isManager: boolean) {
    const t = await this.repo.getTask(org, taskId);
    if (!t) throw new WorkspaceError("Tarefa não encontrada.", "not_found");
    if (!isManager && t.assigneeEmployeeId !== (await this.ctx.employeeForUser(org, actor.userId))) throw new WorkspaceError("Esta tarefa não é sua.", "forbidden");
    const missing = missingRequired(t);
    if (missing.length) throw new WorkspaceError(`Falta concluir: ${missing.map((i) => i.text).join(", ")}.`, "invalid_state");
    const updated = await this.repo.updateTask(org, taskId, "open", { status: "done", completedBy: actor.email, completedAt: this.ctx.now() });
    if (!updated) throw new WorkspaceError("A tarefa já não está aberta.", "invalid_state");
    await this.ctx.audit(org, { actor: actor.email, action: "workspace.task.complete", resourceId: taskId, after: updated, reason: null });
    return updated;
  }

  async cancelTask(org: OrganizationId, actor: Actor, taskId: string, reason: string) {
    if (!reason?.trim()) throw new WorkspaceError("Indique o motivo.", "validation", "reason");
    const updated = await this.repo.updateTask(org, taskId, "open", { status: "cancelled", completedBy: actor.email, completedAt: this.ctx.now() });
    if (!updated) throw new WorkspaceError("A tarefa já não está aberta.", "invalid_state");
    await this.ctx.audit(org, { actor: actor.email, action: "workspace.task.cancel", resourceId: taskId, after: updated, reason: reason.trim() });
    return updated;
  }

  async myTasks(org: OrganizationId, actor: Actor) {
    return this.repo.listTasks(org, { assigneeEmployeeId: await this.me(org, actor) });
  }

  // ── Solicitações personalizadas (C6.3) ──────────────────────────────
  listForms(org: OrganizationId) {
    return this.repo.listForms(org);
  }

  async createForm(org: OrganizationId, actor: Actor, input: RequestFormInput) {
    validateForm(input);
    const f = await this.repo.createForm(org, { ...input, title: input.title.trim() }, actor.email);
    await this.ctx.audit(org, { actor: actor.email, action: "workspace.form.create", resourceId: f.id, after: f, reason: null });
    return f;
  }

  async archiveForm(org: OrganizationId, actor: Actor, id: string) {
    if (!(await this.repo.listForms(org)).some((f) => f.id === id && !f.archived)) throw new WorkspaceError("Formulário não encontrado.", "not_found");
    await this.repo.archiveForm(org, id);
    await this.ctx.audit(org, { actor: actor.email, action: "workspace.form.archive", resourceId: id, after: null, reason: null });
  }

  async submit(org: OrganizationId, actor: Actor, formId: string, answers: Record<string, unknown>) {
    const employeeId = await this.me(org, actor);
    const form = (await this.repo.listForms(org)).find((f) => f.id === formId && !f.archived);
    if (!form) throw new WorkspaceError("Formulário não encontrado.", "not_found");
    const clean = validateAnswers(form, answers);
    const dueAt = form.responseDays ? new Date(Date.parse(this.ctx.now()) + form.responseDays * 86_400_000).toISOString() : null;
    const r = await this.repo.createRequest(org, { formId, employeeId, requestedByUserId: actor.userId, answers: clean, dueAt });
    await this.ctx.audit(org, { actor: actor.email, action: "workspace.request.submit", resourceId: r.id, after: { formId }, reason: null });
    return r;
  }

  async myRequests(org: OrganizationId, actor: Actor) {
    return this.repo.listRequests(org, { employeeId: await this.me(org, actor) });
  }

  listRequests(org: OrganizationId, status?: "pending" | "approved" | "rejected") {
    return this.repo.listRequests(org, status ? { status } : {});
  }

  /** Decide a gestão; nunca o próprio; recusar exige motivo. */
  async decide(org: OrganizationId, actor: Actor, id: string, decision: "approve" | "reject", comment: string | null) {
    const r = await this.repo.getRequest(org, id);
    if (!r) throw new WorkspaceError("Pedido não encontrado.", "not_found");
    if (r.requestedByUserId === actor.userId || (await this.ctx.employeeForUser(org, actor.userId)) === r.employeeId) throw new WorkspaceError("Não pode decidir o seu próprio pedido.", "forbidden");
    if (decision === "reject" && !comment?.trim()) throw new WorkspaceError("Indique o motivo da recusa.", "validation", "comment");
    const updated = await this.repo.decideRequest(org, id, { status: decision === "approve" ? "approved" : "rejected", decidedBy: actor.email, comment: comment?.trim() || null });
    if (!updated) throw new WorkspaceError("Este pedido já foi decidido.", "invalid_state");
    await this.ctx.notify(org, [r.requestedByUserId], { title: decision === "approve" ? "Pedido aprovado" : "Pedido recusado", body: comment?.trim() ?? "", link: "/hr/novo/pedidos", dedupeKey: `custom-request:${id}` });
    await this.ctx.audit(org, { actor: actor.email, action: `workspace.request.${decision}`, resourceId: id, after: updated, reason: comment });
    return updated;
  }

  // ── Quem está (C6.7, CF-15) ─────────────────────────────────────────
  async whosIn(org: OrganizationId, actor: Actor) {
    const employeeId = await this.me(org, actor);
    const [rows, locations, scope] = await Promise.all([this.ctx.presentNow(org), this.ctx.employeeLocations(org, employeeId), this.ctx.whosInScope(org, employeeId)]);
    // Só nome, estado e desde quando — sem contactos (minimização).
    return { scope, people: visiblePresence(rows, locations, scope).map((p) => ({ employeeId: p.employeeId, name: p.name, state: p.state, since: p.since })) };
  }
}
