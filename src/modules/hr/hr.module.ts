import { Router } from "express";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import { SupabaseEmployeeRepository } from "./adapters/out/supabase-employee.repository.js";
import { SupabaseEmployeeDocumentRepository } from "./adapters/out/supabase-employee-document.repository.js";
import { SupabaseHrFileStorageAdapter } from "./adapters/out/supabase-hr-file-storage.adapter.js";
import { SupabaseHrAuditLogAdapter } from "./adapters/out/supabase-hr-audit-log.adapter.js";
import { SupabaseShiftAttendanceReadAdapter } from "./adapters/out/supabase-shift-attendance-read.adapter.js";
import { SupabaseLeaveReadAdapter } from "./adapters/out/supabase-leave-read.adapter.js";
import { SupabasePaymentReadAdapter } from "./adapters/out/supabase-payment-read.adapter.js";

import { ListEmployeesUseCase } from "./application/use-cases/list-employees.use-case.js";
import { GetPeopleKpisUseCase } from "./application/use-cases/get-people-kpis.use-case.js";
import { GetEmployeeProfileUseCase } from "./application/use-cases/get-employee-profile.use-case.js";
import { CreateEmployeeUseCase } from "./application/use-cases/create-employee.use-case.js";
import { UpdateEmployeeUseCase } from "./application/use-cases/update-employee.use-case.js";
import { SetEmployeeStatusUseCase } from "./application/use-cases/set-employee-status.use-case.js";
import { UploadEmployeePhotoUseCase } from "./application/use-cases/upload-employee-photo.use-case.js";
import { GetEmployeeHistoryUseCase } from "./application/use-cases/get-employee-history.use-case.js";
import { ListEmployeeDocumentsUseCase } from "./application/use-cases/list-employee-documents.use-case.js";
import { UploadEmployeeDocumentUseCase } from "./application/use-cases/upload-employee-document.use-case.js";
import { ReplaceEmployeeDocumentUseCase } from "./application/use-cases/replace-employee-document.use-case.js";
import { RemoveEmployeeDocumentUseCase } from "./application/use-cases/remove-employee-document.use-case.js";
import { GetEmployeeDocumentDownloadUrlUseCase } from "./application/use-cases/get-employee-document-download-url.use-case.js";
import { GetEmployeeDocumentHistoryUseCase } from "./application/use-cases/get-employee-document-history.use-case.js";
import { GetHrOverviewUseCase } from "./application/use-cases/get-hr-overview.use-case.js";
import { ListShiftsToReviewUseCase } from "./application/use-cases/list-shifts-to-review.use-case.js";

import { HrPeopleController } from "./adapters/in/hr-people.controller.js";
import { HrOverviewController } from "./adapters/in/hr-overview.controller.js";

/**
 * Composition root do módulo `hr` (RH-02, Pessoas & Documentos).
 *
 * Coexiste, de propósito, com as rotas legacy em `src/routes/hrRoutes.ts`
 * (turnos, pagamentos, kiosk, férias continuam lá) — ver "Estratégia de
 * coexistência" no README. Este módulo é a fonte nova para
 * colaboradores+documentos; nada aqui apaga ou substitui o legacy
 * automaticamente.
 */
export function createHrModule(): { router: Router } {
  const employeeRepository = new SupabaseEmployeeRepository(createScopedQuery);
  const employeeDocumentRepository = new SupabaseEmployeeDocumentRepository(createScopedQuery);
  const hrFileStorage = new SupabaseHrFileStorageAdapter();
  const auditLog = new SupabaseHrAuditLogAdapter(createScopedQuery);
  const shiftAttendanceRead = new SupabaseShiftAttendanceReadAdapter(createScopedQuery);
  const leaveRead = new SupabaseLeaveReadAdapter(createScopedQuery);
  const paymentRead = new SupabasePaymentReadAdapter(createScopedQuery);

  const listEmployees = new ListEmployeesUseCase(employeeRepository, employeeDocumentRepository, hrFileStorage);
  const getPeopleKpis = new GetPeopleKpisUseCase(employeeRepository, employeeDocumentRepository);
  const getEmployeeProfile = new GetEmployeeProfileUseCase(employeeRepository, employeeDocumentRepository, hrFileStorage);
  const createEmployee = new CreateEmployeeUseCase(employeeRepository, auditLog);
  const updateEmployee = new UpdateEmployeeUseCase(employeeRepository, auditLog);
  const setEmployeeStatus = new SetEmployeeStatusUseCase(employeeRepository, auditLog);
  const uploadEmployeePhoto = new UploadEmployeePhotoUseCase(employeeRepository, hrFileStorage, auditLog);
  const getEmployeeHistory = new GetEmployeeHistoryUseCase(auditLog);
  const listEmployeeDocuments = new ListEmployeeDocumentsUseCase(employeeDocumentRepository);
  const uploadEmployeeDocument = new UploadEmployeeDocumentUseCase(
    employeeRepository,
    employeeDocumentRepository,
    hrFileStorage,
    auditLog,
  );
  const replaceEmployeeDocument = new ReplaceEmployeeDocumentUseCase(
    employeeRepository,
    employeeDocumentRepository,
    hrFileStorage,
    auditLog,
  );
  const removeEmployeeDocument = new RemoveEmployeeDocumentUseCase(employeeDocumentRepository, auditLog);
  const getEmployeeDocumentDownloadUrl = new GetEmployeeDocumentDownloadUrlUseCase(
    employeeDocumentRepository,
    hrFileStorage,
  );
  const getEmployeeDocumentHistory = new GetEmployeeDocumentHistoryUseCase(employeeDocumentRepository);
  const getHrOverview = new GetHrOverviewUseCase(
    employeeRepository,
    employeeDocumentRepository,
    shiftAttendanceRead,
    leaveRead,
    paymentRead,
  );
  const listShiftsToReview = new ListShiftsToReviewUseCase(employeeRepository, shiftAttendanceRead);

  const controller = new HrPeopleController(
    listEmployees,
    getPeopleKpis,
    getEmployeeProfile,
    createEmployee,
    updateEmployee,
    setEmployeeStatus,
    uploadEmployeePhoto,
    getEmployeeHistory,
    listEmployeeDocuments,
    uploadEmployeeDocument,
    replaceEmployeeDocument,
    removeEmployeeDocument,
    getEmployeeDocumentDownloadUrl,
    getEmployeeDocumentHistory,
  );
  const overviewController = new HrOverviewController(getHrOverview, listShiftsToReview);

  const router = Router();
  router.use(controller.router);
  router.use(overviewController.router);

  return { router };
}
