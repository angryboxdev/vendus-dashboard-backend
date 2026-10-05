import type { DocumentVisibility } from "../entities/document.js";
import type { DocumentViewerRole } from "../ports/in/company-document.ports.js";

/**
 * D11 — quem vê um documento da Empresa:
 * - `management` (Gestão): gestores e administradores;
 * - `admin` (Só administração): só administradores.
 * O perfil só-leitura de RH (`hr_viewer`) nunca vê documentos da Empresa.
 */
export function canViewCompanyDocument(visibility: DocumentVisibility | null, role: DocumentViewerRole): boolean {
  if (role === "admin") return true;
  if (role === "manager") return visibility !== "admin";
  return false;
}
