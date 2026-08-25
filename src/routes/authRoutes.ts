import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { getSupabaseServiceRole } from "../infra/supabaseClient.js";

export const authRoutes = Router();

function jsonError(res: Response, status: number, message: string) {
  res.status(status).json({ error: message });
}

const createUserSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(8, "Password deve ter pelo menos 8 caracteres"),
  role: z.enum(["admin", "manager", "hr_viewer"]),
});

const updateUserSchema = z.object({
  role: z.enum(["admin", "manager", "hr_viewer"]).optional(),
  password: z.string().min(8).optional(),
});

// GET /api/auth/me — utilizador autenticado actual
authRoutes.get("/me", (req: Request, res: Response) => {
  res.json({
    id: req.auth!.sub,
    email: req.auth!.email,
    role: req.auth!.orgRole,
  });
});

// GET /api/auth/users — lista utilizadores
authRoutes.get("/users", async (_req: Request, res: Response) => {
  try {
    const supabase = getSupabaseServiceRole();
    if (!supabase) { jsonError(res, 503, "Supabase indisponível"); return; }

    const { data, error } = await supabase
      .from("app_users")
      .select("id, email, role, created_at, updated_at")
      .order("created_at", { ascending: true });

    if (error) { jsonError(res, 500, error.message); return; }
    res.json(data ?? []);
  } catch (e: unknown) {
    jsonError(res, 500, e instanceof Error ? e.message : "Erro ao listar utilizadores");
  }
});

// POST /api/auth/users — criar utilizador
authRoutes.post("/users", async (req: Request, res: Response) => {
  try {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      jsonError(res, 400, parsed.error.issues.map((i) => i.message).join("; "));
      return;
    }
    const { email, password, role } = parsed.data;
    const supabase = getSupabaseServiceRole();
    if (!supabase) { jsonError(res, 503, "Supabase indisponível"); return; }

    // Criar na Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (authError) {
      const status = authError.message.toLowerCase().includes("already") ? 409 : 500;
      jsonError(res, status, authError.message);
      return;
    }

    const userId = authData.user.id;

    // Inserir na tabela app_users
    const { data, error } = await supabase
      .from("app_users")
      .insert({ id: userId, email, role })
      .select("id, email, role, created_at, updated_at")
      .single();

    if (error) {
      // Tentar limpar o utilizador criado no Auth para não deixar órfãos
      await supabase.auth.admin.deleteUser(userId);
      jsonError(res, 500, error.message);
      return;
    }
    res.status(201).json(data);
  } catch (e: unknown) {
    jsonError(res, 500, e instanceof Error ? e.message : "Erro ao criar utilizador");
  }
});

// PATCH /api/auth/users/:id — actualizar role e/ou password
authRoutes.patch("/users/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params["id"] as string;
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      jsonError(res, 400, parsed.error.issues.map((i) => i.message).join("; "));
      return;
    }
    const { role, password } = parsed.data;
    if (!role && !password) {
      jsonError(res, 400, "Indica role e/ou password para actualizar");
      return;
    }
    const supabase = getSupabaseServiceRole();
    if (!supabase) { jsonError(res, 503, "Supabase indisponível"); return; }

    // Actualizar password se fornecida
    if (password) {
      const { error: pwError } = await supabase.auth.admin.updateUserById(id, { password });
      if (pwError) { jsonError(res, 500, pwError.message); return; }
    }

    // Actualizar role se fornecido
    if (role) {
      const { data, error } = await supabase
        .from("app_users")
        .update({ role, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("id, email, role, created_at, updated_at")
        .single();

      if (error) {
        const status = error.code === "PGRST116" ? 404 : 500;
        jsonError(res, status, error.code === "PGRST116" ? "Utilizador não encontrado" : error.message);
        return;
      }
      res.json(data);
      return;
    }

    // Só actualizou password — buscar e devolver o utilizador
    const { data, error } = await supabase
      .from("app_users")
      .select("id, email, role, created_at, updated_at")
      .eq("id", id)
      .single();

    if (error) { jsonError(res, 404, "Utilizador não encontrado"); return; }
    res.json(data);
  } catch (e: unknown) {
    jsonError(res, 500, e instanceof Error ? e.message : "Erro ao actualizar utilizador");
  }
});

// DELETE /api/auth/users/:id — eliminar utilizador (cascata para app_users)
authRoutes.delete("/users/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params["id"] as string;

    // Não permitir auto-eliminação
    if (id === req.auth!.sub) {
      jsonError(res, 400, "Não podes eliminar a tua própria conta");
      return;
    }

    const supabase = getSupabaseServiceRole();
    if (!supabase) { jsonError(res, 503, "Supabase indisponível"); return; }

    const { error } = await supabase.auth.admin.deleteUser(id);
    if (error) {
      const status = error.message.toLowerCase().includes("not found") ? 404 : 500;
      jsonError(res, status, error.message);
      return;
    }
    res.status(204).send();
  } catch (e: unknown) {
    jsonError(res, 500, e instanceof Error ? e.message : "Erro ao eliminar utilizador");
  }
});
