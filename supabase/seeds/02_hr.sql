-- Local dev fixtures: HR data (employees, shifts, attendance, leave).
--
-- All names, contact details, NIFs, IBANs and social security numbers below
-- are invented -- deliberately, since this project locks real salary and
-- employee data behind the service role (migrations 028/032 in
-- supabase/migrations/_archive/). Nothing here should resemble a real
-- person.
--
-- org_id/location_id below are Angrybox's/Arcozelo's fixed UUIDs
-- (20260822143602_tenant_root_tables.sql). Ticket 21 dropped both column
-- defaults, so every insert here now names them explicitly -- these
-- fixtures are a write path like any other.

-- ---------------------------------------------------------------------
-- hr_employees
-- ---------------------------------------------------------------------
insert into hr_employees (
  org_id, full_name, email, phone, role_or_notes, status, hired_at, ended_at,
  employment_type, job_role, salary_type, base_salary, hourly_rate,
  nif, iban, address, birth_date, social_security_number, id_card_number,
  nationality, emergency_contact_name, emergency_contact_phone
) values
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'Ana Ferreira Costa', 'ana.costa@example.com', '+351911111111', 'Gerente de loja', 'active',
   current_date - interval '3 years', null, 'permanent', 'manager', 'fixed', 1450.00, null,
   '231456789', 'PT50000000001111222233344', 'Rua das Flores 10, 4400-001 Vila Nova de Gaia',
   '1988-04-12', '11223344556', '98765432', 'PT', 'Sofia Costa', '+351911111112'),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'Bruno Miguel Santos', 'bruno.santos@example.com', '+351922222222', 'Chefe de cozinha', 'active',
   current_date - interval '2 years', null, 'permanent', 'prep', 'fixed', 1150.00, null,
   '231567890', 'PT50000000002222333344455', 'Rua do Mercado 5, 4400-002 Vila Nova de Gaia',
   '1991-09-03', '22334455667', '98765433', 'PT', 'Rita Santos', '+351922222223'),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'Carla Sofia Pinto', 'carla.pinto@example.com', '+351933333333', 'Atendimento ao balcão', 'active',
   current_date - interval '18 months', null, 'permanent', 'service', 'hourly', null, 7.50,
   '231678901', 'PT50000000003333444455566', 'Rua Central 22, 4400-003 Vila Nova de Gaia',
   '1999-01-20', '33445566778', '98765434', 'PT', 'Marta Pinto', '+351933333334'),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'Diogo Alexandre Rocha', 'diogo.rocha@example.com', '+351944444444', 'Estafeta / apoio sala', 'active',
   current_date - interval '6 months', null, 'extra', 'service', 'hourly', null, 7.00,
   '231789012', 'PT50000000004444555566677', 'Travessa Nova 3, 4400-004 Vila Nova de Gaia',
   '2002-06-15', '44556677889', '98765435', 'PT', 'Paulo Rocha', '+351944444445'),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'Eduarda Filipa Marques', 'eduarda.marques@example.com', '+351955555555', 'Apoio de cozinha', 'active',
   current_date - interval '1 year', null, 'contract', 'prep', 'fixed', 1000.00, null,
   '231890123', 'PT50000000005555666677788', 'Rua da Escola 7, 4400-005 Vila Nova de Gaia',
   '1996-11-30', '55667788990', '98765436', 'PT', 'João Marques', '+351955555556'),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'Filipe André Nunes', 'filipe.nunes@example.com', '+351966666666', 'Ex-colaborador de sala', 'inactive',
   current_date - interval '4 years', current_date - interval '2 months', 'permanent', 'service', 'hourly', null, 7.80,
   '231901234', 'PT50000000006666777788899', 'Largo do Rossio 1, 4400-006 Vila Nova de Gaia',
   '1994-03-08', '66778899001', '98765437', 'PT', 'Inês Nunes', '+351966666667');

-- ---------------------------------------------------------------------
-- hr_work_shifts
-- ---------------------------------------------------------------------
insert into hr_work_shifts (org_id, location_id, employee_id, work_date, start_time, end_time, location_or_station) values
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'c11d9146-fe16-4afb-9877-75e75bb2f52a', (select id from hr_employees where full_name = 'Ana Ferreira Costa'), current_date - 1, '09:00', '17:00', 'Loja'),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'c11d9146-fe16-4afb-9877-75e75bb2f52a', (select id from hr_employees where full_name = 'Bruno Miguel Santos'), current_date - 1, '10:00', '18:00', 'Cozinha'),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'c11d9146-fe16-4afb-9877-75e75bb2f52a', (select id from hr_employees where full_name = 'Carla Sofia Pinto'), current_date - 1, '12:00', '20:00', 'Sala'),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'c11d9146-fe16-4afb-9877-75e75bb2f52a', (select id from hr_employees where full_name = 'Diogo Alexandre Rocha'), current_date - 1, '18:00', '23:00', 'Delivery'),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'c11d9146-fe16-4afb-9877-75e75bb2f52a', (select id from hr_employees where full_name = 'Ana Ferreira Costa'), current_date - 2, '09:00', '17:00', 'Loja'),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'c11d9146-fe16-4afb-9877-75e75bb2f52a', (select id from hr_employees where full_name = 'Bruno Miguel Santos'), current_date - 2, '10:00', '18:00', 'Cozinha'),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'c11d9146-fe16-4afb-9877-75e75bb2f52a', (select id from hr_employees where full_name = 'Carla Sofia Pinto'), current_date - 2, '12:00', '20:00', 'Sala'),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'c11d9146-fe16-4afb-9877-75e75bb2f52a', (select id from hr_employees where full_name = 'Eduarda Filipa Marques'), current_date - 2, '09:00', '15:00', 'Cozinha'),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'c11d9146-fe16-4afb-9877-75e75bb2f52a', (select id from hr_employees where full_name = 'Diogo Alexandre Rocha'), current_date, '18:00', '23:00', 'Delivery'),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'c11d9146-fe16-4afb-9877-75e75bb2f52a', (select id from hr_employees where full_name = 'Carla Sofia Pinto'), current_date, '12:00', '20:00', 'Sala');

-- ---------------------------------------------------------------------
-- hr_shift_attendance
-- ---------------------------------------------------------------------
insert into hr_shift_attendance (org_id, location_id, work_shift_id, status, actual_start_time, actual_end_time, late_minutes, registration_source) values
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'c11d9146-fe16-4afb-9877-75e75bb2f52a',
   (select id from hr_work_shifts where employee_id = (select id from hr_employees where full_name = 'Ana Ferreira Costa') and work_date = current_date - 1),
   'worked_as_planned', '09:05', '17:00', 5, 'dashboard'),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'c11d9146-fe16-4afb-9877-75e75bb2f52a',
   (select id from hr_work_shifts where employee_id = (select id from hr_employees where full_name = 'Bruno Miguel Santos') and work_date = current_date - 1),
   'worked_as_planned', '10:00', '18:10', 0, 'employee_qr'),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'c11d9146-fe16-4afb-9877-75e75bb2f52a',
   (select id from hr_work_shifts where employee_id = (select id from hr_employees where full_name = 'Carla Sofia Pinto') and work_date = current_date - 1),
   'late', '12:20', '20:00', 20, 'dashboard'),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'c11d9146-fe16-4afb-9877-75e75bb2f52a',
   (select id from hr_work_shifts where employee_id = (select id from hr_employees where full_name = 'Diogo Alexandre Rocha') and work_date = current_date - 1),
   'left_early', '18:00', '22:00', 0, 'dashboard'),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'c11d9146-fe16-4afb-9877-75e75bb2f52a',
   (select id from hr_work_shifts where employee_id = (select id from hr_employees where full_name = 'Ana Ferreira Costa') and work_date = current_date - 2),
   'worked_as_planned', '09:00', '17:00', 0, 'employee_qr'),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'c11d9146-fe16-4afb-9877-75e75bb2f52a',
   (select id from hr_work_shifts where employee_id = (select id from hr_employees where full_name = 'Eduarda Filipa Marques') and work_date = current_date - 2),
   'cancelled', null, null, null, 'dashboard');

-- ---------------------------------------------------------------------
-- hr_leave_balances (employee_id is text, no FK -- see migration)
-- ---------------------------------------------------------------------
insert into hr_leave_balances (org_id, employee_id, year, days_entitled, days_carried_over, notes) values
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', (select id::text from hr_employees where full_name = 'Ana Ferreira Costa'), extract(year from current_date)::int, 22, 3, null),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', (select id::text from hr_employees where full_name = 'Bruno Miguel Santos'), extract(year from current_date)::int, 22, 0, null),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', (select id::text from hr_employees where full_name = 'Carla Sofia Pinto'), extract(year from current_date)::int, 22, 2, null),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', (select id::text from hr_employees where full_name = 'Diogo Alexandre Rocha'), extract(year from current_date)::int, 10, 0, 'Contrato extra, dias proporcionais'),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', (select id::text from hr_employees where full_name = 'Eduarda Filipa Marques'), extract(year from current_date)::int, 22, 0, null);

-- ---------------------------------------------------------------------
-- hr_leave_requests (employee_id is text, no FK -- see migration)
-- ---------------------------------------------------------------------
insert into hr_leave_requests (org_id, employee_id, type, start_date, end_date, working_days, notes) values
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', (select id::text from hr_employees where full_name = 'Ana Ferreira Costa'), 'vacation', current_date + 10, current_date + 14, 5, 'Férias de verão'),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', (select id::text from hr_employees where full_name = 'Bruno Miguel Santos'), 'sick_leave', current_date - 5, current_date - 3, 3, null),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', (select id::text from hr_employees where full_name = 'Carla Sofia Pinto'), 'justified', current_date - 20, current_date - 20, 1, 'Consulta médica'),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', (select id::text from hr_employees where full_name = 'Diogo Alexandre Rocha'), 'unjustified', current_date - 30, current_date - 30, 1, null),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', (select id::text from hr_employees where full_name = 'Eduarda Filipa Marques'), 'compensatory', current_date + 2, current_date + 2, 1, 'Troca de folga');
