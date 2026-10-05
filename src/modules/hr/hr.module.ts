import { Router } from "express";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import { SupabaseEmployeeRepository } from "./adapters/out/supabase-employee.repository.js";
// Motor de documentos (Base Organizacional, ticket 03) — mesmo padrão cross-module de `locations` (D10):
// o RH usa os adapters do módulo `documents`; a configuração de categorias é exposta por esse módulo.
import { SupabaseDocumentRepository } from "../documents/adapters/out/supabase-document.repository.js";
import { SupabaseDocumentCategoryRepository } from "../documents/adapters/out/supabase-document-category.repository.js";
import { SupabaseHrFileStorageAdapter } from "./adapters/out/supabase-hr-file-storage.adapter.js";
import { SupabaseHrAuditLogAdapter } from "./adapters/out/supabase-hr-audit-log.adapter.js";
import { SupabaseShiftAttendanceReadAdapter } from "./adapters/out/supabase-shift-attendance-read.adapter.js";
import { SupabaseLeaveReadAdapter } from "./adapters/out/supabase-leave-read.adapter.js";
import { SupabasePaymentReadAdapter } from "./adapters/out/supabase-payment-read.adapter.js";
import { SupabaseHolidayReadAdapter } from "./adapters/out/supabase-holiday-read.adapter.js";
import { SupabaseWorkShiftRepository } from "./adapters/out/supabase-work-shift.repository.js";
import { SupabaseBaseScheduleRepository } from "./adapters/out/supabase-base-schedule.repository.js";
import { SupabaseShiftRotationRepository } from "./adapters/out/supabase-shift-rotation.repository.js";
import { SupabaseLocationRepository } from "../locations/adapters/out/supabase-location.repository.js";
import { SupabaseAttendanceWriteAdapter } from "./adapters/out/supabase-attendance-write.adapter.js";
import { SupabaseAttendanceCorrectionRepository } from "./adapters/out/supabase-attendance-correction.repository.js";
import { SupabaseMonthlyClosureRepository } from "./adapters/out/supabase-monthly-closure.repository.js";
import { SupabaseAttendanceRulesRepository } from "./adapters/out/supabase-attendance-rules.repository.js";

import { ListEmployeesUseCase } from "./application/use-cases/list-employees.use-case.js";
import { GetPeopleKpisUseCase } from "./application/use-cases/get-people-kpis.use-case.js";
import { GetEmployeeProfileUseCase } from "./application/use-cases/get-employee-profile.use-case.js";
import { CreateEmployeeUseCase } from "./application/use-cases/create-employee.use-case.js";
import { UpdateEmployeeUseCase } from "./application/use-cases/update-employee.use-case.js";
import {
  CreatePositionUseCase,
  ListPositionsUseCase,
  SetPositionActiveUseCase,
  UpdatePositionUseCase,
} from "./application/use-cases/positions.use-cases.js";
import { SupabasePositionRepository } from "./adapters/out/supabase-position.repository.js";
import { HrPositionsController } from "./adapters/in/hr-positions.controller.js";
import { HrPayslipsController } from "./adapters/in/hr-payslips.controller.js";
import { HrShiftTemplatesController } from "./adapters/in/hr-shift-templates.controller.js";
import { SupabaseShiftTemplateRepository } from "./adapters/out/supabase-shift-template.repository.js";
import {
  CreateShiftTemplateUseCase,
  ListShiftTemplatesUseCase,
  SetShiftTemplateActiveUseCase,
  UpdateShiftTemplateUseCase,
} from "./application/use-cases/shift-templates.use-cases.js";
import { PdfParseTextExtractorAdapter } from "./adapters/out/pdf-parse-text-extractor.adapter.js";
import { ImportPayslipsUseCase, PreviewPayslipImportUseCase } from "./application/use-cases/payslip-import.use-cases.js";
import { SetEmployeeStatusUseCase } from "./application/use-cases/set-employee-status.use-case.js";
import { UploadEmployeePhotoUseCase } from "./application/use-cases/upload-employee-photo.use-case.js";
import { GetEmployeeHistoryUseCase } from "./application/use-cases/get-employee-history.use-case.js";
import { ListEmployeeDocumentsUseCase } from "./application/use-cases/list-employee-documents.use-case.js";
import { UploadEmployeeDocumentUseCase } from "./application/use-cases/upload-employee-document.use-case.js";
import { ReplaceEmployeeDocumentUseCase } from "./application/use-cases/replace-employee-document.use-case.js";
import { RemoveEmployeeDocumentUseCase } from "./application/use-cases/remove-employee-document.use-case.js";
import { GetEmployeeDocumentDownloadUrlUseCase } from "./application/use-cases/get-employee-document-download-url.use-case.js";
import { GetEmployeeDocumentHistoryUseCase } from "./application/use-cases/get-employee-document-history.use-case.js";
import { GetDocumentOverviewUseCase } from "./application/use-cases/get-document-overview.use-case.js";
import { GetHrOverviewUseCase } from "./application/use-cases/get-hr-overview.use-case.js";
import { ListShiftsToReviewUseCase } from "./application/use-cases/list-shifts-to-review.use-case.js";
import { GetShiftToReviewUseCase } from "./application/use-cases/get-shift-to-review.use-case.js";
import { ListWorkShiftsUseCase } from "./application/use-cases/list-work-shifts.use-case.js";
import { CreateWorkShiftUseCase } from "./application/use-cases/create-work-shift.use-case.js";
import { UpdateWorkShiftUseCase } from "./application/use-cases/update-work-shift.use-case.js";
import { DuplicateWorkShiftUseCase } from "./application/use-cases/duplicate-work-shift.use-case.js";
import { DeleteWorkShiftUseCase } from "./application/use-cases/delete-work-shift.use-case.js";
import { PublishWorkShiftsUseCase } from "./application/use-cases/publish-work-shifts.use-case.js";
import { GetBaseScheduleUseCase } from "./application/use-cases/get-base-schedule.use-case.js";
import { UpsertBaseScheduleCellUseCase } from "./application/use-cases/upsert-base-schedule-cell.use-case.js";
import { ApplyBaseScheduleUseCase } from "./application/use-cases/apply-base-schedule.use-case.js";
import { ListShiftRotationsUseCase } from "./application/use-cases/list-shift-rotations.use-case.js";
import { CreateShiftRotationUseCase } from "./application/use-cases/create-shift-rotation.use-case.js";
import { PreviewShiftRotationUseCase } from "./application/use-cases/preview-shift-rotation.use-case.js";
import { ApplyShiftRotationUseCase } from "./application/use-cases/apply-shift-rotation.use-case.js";
import { SetShiftRotationActiveUseCase } from "./application/use-cases/set-shift-rotation-active.use-case.js";
import { GetScheduleAlertsUseCase } from "./application/use-cases/get-schedule-alerts.use-case.js";
import { PreviewWorkShiftSeriesUseCase } from "./application/use-cases/preview-work-shift-series.use-case.js";
import { CreateWorkShiftSeriesUseCase } from "./application/use-cases/create-work-shift-series.use-case.js";
import { UpdateWorkShiftSeriesScopeUseCase } from "./application/use-cases/update-work-shift-series-scope.use-case.js";
import { ClearWorkShiftsUseCase } from "./application/use-cases/clear-work-shifts.use-case.js";
import { PreviewRepeatCalendarWeekUseCase } from "./application/use-cases/preview-repeat-calendar-week.use-case.js";
import { RepeatCalendarWeekUseCase } from "./application/use-cases/repeat-calendar-week.use-case.js";
import { ListAttendanceIssuesUseCase } from "./application/use-cases/list-attendance-issues.use-case.js";
import { GetAttendanceIssueDetailUseCase } from "./application/use-cases/get-attendance-issue-detail.use-case.js";
import { CorrectShiftAttendanceUseCase } from "./application/use-cases/correct-shift-attendance.use-case.js";
import { GetMonthlyClosureStatusUseCase } from "./application/use-cases/get-monthly-closure-status.use-case.js";
import { CloseMonthlyPeriodUseCase } from "./application/use-cases/close-monthly-period.use-case.js";
import { ReopenMonthlyPeriodUseCase } from "./application/use-cases/reopen-monthly-period.use-case.js";
import { GetAttendanceRulesUseCase } from "./application/use-cases/get-attendance-rules.use-case.js";
import { UpdateAttendanceRulesUseCase } from "./application/use-cases/update-attendance-rules.use-case.js";
import { ListAttendanceRuleChangesUseCase } from "./application/use-cases/list-attendance-rule-changes.use-case.js";
import { GetMonthlyAttendanceSummaryUseCase } from "./application/use-cases/get-monthly-attendance-summary.use-case.js";
import { GetAttendanceEmployeeDetailUseCase } from "./application/use-cases/get-attendance-employee-detail.use-case.js";

import { HrPeopleController } from "./adapters/in/hr-people.controller.js";
import { HrOverviewController } from "./adapters/in/hr-overview.controller.js";
import { HrSchedulesController } from "./adapters/in/hr-schedules.controller.js";
import { HrAttendanceController } from "./adapters/in/hr-attendance.controller.js";

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
  const employeeDocumentRepository = new SupabaseDocumentRepository(createScopedQuery);
  const documentCategoryRepository = new SupabaseDocumentCategoryRepository(createScopedQuery);
  const hrFileStorage = new SupabaseHrFileStorageAdapter();
  const auditLog = new SupabaseHrAuditLogAdapter(createScopedQuery);
  const shiftAttendanceRead = new SupabaseShiftAttendanceReadAdapter(createScopedQuery);
  const leaveRead = new SupabaseLeaveReadAdapter(createScopedQuery);
  const paymentRead = new SupabasePaymentReadAdapter(createScopedQuery);
  const holidayRead = new SupabaseHolidayReadAdapter(createScopedQuery);
  const workShiftRepository = new SupabaseWorkShiftRepository(createScopedQuery);
  const baseScheduleRepository = new SupabaseBaseScheduleRepository(createScopedQuery);
  const shiftRotationRepository = new SupabaseShiftRotationRepository(createScopedQuery);
  // Cross-module (D10): resolve locationId → nome amigável para a Visão Geral, sem importar código do módulo `locations` além do seu próprio port/adapter.
  const locationRepository = new SupabaseLocationRepository(createScopedQuery);
  const attendanceWrite = new SupabaseAttendanceWriteAdapter(createScopedQuery);
  const attendanceCorrectionRepository = new SupabaseAttendanceCorrectionRepository(createScopedQuery);
  const monthlyClosureRepository = new SupabaseMonthlyClosureRepository(createScopedQuery);
  const attendanceRulesRepository = new SupabaseAttendanceRulesRepository(createScopedQuery);
  // Base Organizacional — Cargos (ticket 07).
  const positionRepository = new SupabasePositionRepository(createScopedQuery);

  const listEmployees = new ListEmployeesUseCase(
    employeeRepository,
    employeeDocumentRepository,
    hrFileStorage,
    documentCategoryRepository,
  );
  const getPeopleKpis = new GetPeopleKpisUseCase(employeeRepository, employeeDocumentRepository, documentCategoryRepository);
  const getDocumentOverview = new GetDocumentOverviewUseCase(employeeRepository, employeeDocumentRepository, documentCategoryRepository);
  const getEmployeeProfile = new GetEmployeeProfileUseCase(
    employeeRepository,
    employeeDocumentRepository,
    hrFileStorage,
    documentCategoryRepository,
  );
  const createEmployee = new CreateEmployeeUseCase(employeeRepository, auditLog, positionRepository, locationRepository);
  const updateEmployee = new UpdateEmployeeUseCase(employeeRepository, auditLog, positionRepository, locationRepository);
  const setEmployeeStatus = new SetEmployeeStatusUseCase(employeeRepository, auditLog);
  const uploadEmployeePhoto = new UploadEmployeePhotoUseCase(employeeRepository, hrFileStorage, auditLog);
  const getEmployeeHistory = new GetEmployeeHistoryUseCase(auditLog);
  const listEmployeeDocuments = new ListEmployeeDocumentsUseCase(employeeDocumentRepository);
  const uploadEmployeeDocument = new UploadEmployeeDocumentUseCase(
    employeeRepository,
    employeeDocumentRepository,
    hrFileStorage,
    auditLog,
    documentCategoryRepository,
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
    documentCategoryRepository,
    locationRepository,
  );
  const listShiftsToReview = new ListShiftsToReviewUseCase(employeeRepository, shiftAttendanceRead, locationRepository);
  const getShiftToReview = new GetShiftToReviewUseCase(employeeRepository, shiftAttendanceRead, locationRepository);


  const listWorkShifts = new ListWorkShiftsUseCase(workShiftRepository, employeeRepository);
  const createWorkShift = new CreateWorkShiftUseCase(workShiftRepository, employeeRepository, auditLog);
  const updateWorkShift = new UpdateWorkShiftUseCase(workShiftRepository, employeeRepository, auditLog);
  const duplicateWorkShift = new DuplicateWorkShiftUseCase(workShiftRepository, employeeRepository, auditLog);
  const deleteWorkShift = new DeleteWorkShiftUseCase(workShiftRepository, auditLog);
  const publishWorkShifts = new PublishWorkShiftsUseCase(workShiftRepository, employeeRepository, auditLog);
  const getBaseSchedule = new GetBaseScheduleUseCase(baseScheduleRepository);
  const upsertBaseScheduleCell = new UpsertBaseScheduleCellUseCase(baseScheduleRepository, auditLog);
  const applyBaseSchedule = new ApplyBaseScheduleUseCase(
    baseScheduleRepository,
    workShiftRepository,
    employeeRepository,
    leaveRead,
    holidayRead,
    auditLog,
  );
  const listShiftRotations = new ListShiftRotationsUseCase(shiftRotationRepository, employeeRepository);
  const createShiftRotation = new CreateShiftRotationUseCase(shiftRotationRepository, employeeRepository, auditLog);
  const previewShiftRotation = new PreviewShiftRotationUseCase(shiftRotationRepository, employeeRepository);
  const applyShiftRotation = new ApplyShiftRotationUseCase(
    shiftRotationRepository,
    workShiftRepository,
    employeeRepository,
    leaveRead,
    holidayRead,
    auditLog,
  );
  const setShiftRotationActive = new SetShiftRotationActiveUseCase(shiftRotationRepository, employeeRepository, auditLog);
  const getScheduleAlerts = new GetScheduleAlertsUseCase(
    workShiftRepository,
    baseScheduleRepository,
    employeeRepository,
    leaveRead,
    holidayRead,
  );
  const previewWorkShiftSeries = new PreviewWorkShiftSeriesUseCase(workShiftRepository, leaveRead, holidayRead);
  const createWorkShiftSeries = new CreateWorkShiftSeriesUseCase(
    workShiftRepository,
    employeeRepository,
    leaveRead,
    holidayRead,
    auditLog,
  );
  const updateWorkShiftSeriesScope = new UpdateWorkShiftSeriesScopeUseCase(workShiftRepository, employeeRepository, auditLog);
  const clearWorkShifts = new ClearWorkShiftsUseCase(workShiftRepository, auditLog);
  const previewRepeatCalendarWeek = new PreviewRepeatCalendarWeekUseCase(workShiftRepository, employeeRepository, leaveRead, holidayRead);
  const repeatCalendarWeek = new RepeatCalendarWeekUseCase(workShiftRepository, employeeRepository, leaveRead, holidayRead, auditLog);

  const listAttendanceIssues = new ListAttendanceIssuesUseCase(
    employeeRepository,
    shiftAttendanceRead,
    leaveRead,
    locationRepository,
    attendanceRulesRepository,
    attendanceCorrectionRepository,
  );
  const getAttendanceIssueDetail = new GetAttendanceIssueDetailUseCase(
    employeeRepository,
    shiftAttendanceRead,
    leaveRead,
    locationRepository,
    attendanceCorrectionRepository,
    attendanceRulesRepository,
  );
  const correctShiftAttendance = new CorrectShiftAttendanceUseCase(
    attendanceWrite,
    attendanceCorrectionRepository,
    monthlyClosureRepository,
    auditLog,
    getAttendanceIssueDetail,
  );
  const getMonthlyClosureStatus = new GetMonthlyClosureStatusUseCase(
    listAttendanceIssues,
    monthlyClosureRepository,
    shiftAttendanceRead,
    leaveRead,
  );
  const getMonthlyAttendanceSummary = new GetMonthlyAttendanceSummaryUseCase(
    employeeRepository,
    shiftAttendanceRead,
    leaveRead,
    attendanceRulesRepository,
    attendanceCorrectionRepository,
    monthlyClosureRepository,
  );
  const closeMonthlyPeriod = new CloseMonthlyPeriodUseCase(
    getMonthlyClosureStatus,
    monthlyClosureRepository,
    auditLog,
    getMonthlyAttendanceSummary,
  );
  const reopenMonthlyPeriod = new ReopenMonthlyPeriodUseCase(monthlyClosureRepository, auditLog, getMonthlyClosureStatus);
  const getAttendanceRules = new GetAttendanceRulesUseCase(attendanceRulesRepository);
  const updateAttendanceRules = new UpdateAttendanceRulesUseCase(attendanceRulesRepository, auditLog, getAttendanceRules);
  const listAttendanceRuleChanges = new ListAttendanceRuleChangesUseCase(attendanceRulesRepository);
  const getAttendanceEmployeeDetail = new GetAttendanceEmployeeDetailUseCase(
    employeeRepository,
    shiftAttendanceRead,
    leaveRead,
    locationRepository,
    attendanceRulesRepository,
    attendanceCorrectionRepository,
  );

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
    getDocumentOverview,
  );
  const overviewController = new HrOverviewController(getHrOverview, listShiftsToReview, getShiftToReview);
  const schedulesController = new HrSchedulesController(
    listWorkShifts,
    createWorkShift,
    updateWorkShift,
    duplicateWorkShift,
    deleteWorkShift,
    publishWorkShifts,
    getBaseSchedule,
    upsertBaseScheduleCell,
    applyBaseSchedule,
    listShiftRotations,
    createShiftRotation,
    previewShiftRotation,
    applyShiftRotation,
    setShiftRotationActive,
    getScheduleAlerts,
    previewWorkShiftSeries,
    createWorkShiftSeries,
    updateWorkShiftSeriesScope,
    clearWorkShifts,
    previewRepeatCalendarWeek,
    repeatCalendarWeek,
  );
  const attendanceController = new HrAttendanceController(
    listAttendanceIssues,
    getAttendanceIssueDetail,
    correctShiftAttendance,
    getMonthlyClosureStatus,
    closeMonthlyPeriod,
    reopenMonthlyPeriod,
    getAttendanceRules,
    updateAttendanceRules,
    listAttendanceRuleChanges,
    getMonthlyAttendanceSummary,
    getAttendanceEmployeeDetail,
  );

  const positionsController = new HrPositionsController(
    new ListPositionsUseCase(positionRepository, employeeRepository),
    new CreatePositionUseCase(positionRepository, auditLog),
    new UpdatePositionUseCase(positionRepository, employeeRepository, auditLog),
    new SetPositionActiveUseCase(positionRepository, employeeRepository, auditLog),
  );

  const payslipsController = new HrPayslipsController(
    new PreviewPayslipImportUseCase(employeeRepository, employeeDocumentRepository, documentCategoryRepository, new PdfParseTextExtractorAdapter()),
    new ImportPayslipsUseCase(employeeDocumentRepository, documentCategoryRepository, uploadEmployeeDocument, replaceEmployeeDocument),
  );

  const shiftTemplateRepository = new SupabaseShiftTemplateRepository(createScopedQuery);
  const shiftTemplatesController = new HrShiftTemplatesController(
    new ListShiftTemplatesUseCase(shiftTemplateRepository),
    new CreateShiftTemplateUseCase(shiftTemplateRepository, locationRepository, auditLog),
    new UpdateShiftTemplateUseCase(shiftTemplateRepository, locationRepository, auditLog),
    new SetShiftTemplateActiveUseCase(shiftTemplateRepository, auditLog),
  );

  const router = Router();
  router.use(controller.router);
  router.use(shiftTemplatesController.router);
  router.use(positionsController.router);
  router.use(payslipsController.router);
  router.use(overviewController.router);
  router.use(schedulesController.router);
  router.use(attendanceController.router);

  return { router };
}
