import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', ['customer', 'office_admin']);

export const requestTypeEnum = pgEnum('request_type', ['driver', 'workshop']);

export const requestStatusEnum = pgEnum('request_status', [
  'registered',
  'office_reviewing',
  'needs_customer_info',
  'in_progress',
  'completed',
  'rejected',
  'cancelled',
]);

// 1. Auth Users
export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    username: varchar('username', { length: 20 }).notNull(),
    displayName: varchar('display_name', { length: 150 }).notNull(),
    role: userRoleEnum('role').notNull(),
    passwordHash: text('password_hash').notNull(),
    forcePasswordChange: boolean('force_password_change').notNull().default(true),
    initialPasswordMode: varchar('initial_password_mode', { length: 32 })
      .notNull()
      .default('national_id'),
    isActive: boolean('is_active').notNull().default(true),
    failedLoginCount: integer('failed_login_count').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('users_username_uniq').on(table.username),
    index('users_role_active_idx').on(table.role, table.isActive),
  ],
);

// 2. Server-Managed Sessions
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    csrfToken: varchar('csrf_token', { length: 64 }).notNull(),
    ipAddress: varchar('ip_address', { length: 64 }),
    userAgent: varchar('user_agent', { length: 255 }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('sessions_token_hash_uniq').on(table.tokenHash),
    index('sessions_user_id_idx').on(table.userId),
    index('sessions_expires_at_idx').on(table.expiresAt),
  ],
);

// 3. Customers (Account / Contact Profile managed by Office)
export const customers = pgTable(
  'customers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    fullName: varchar('full_name', { length: 150 }).notNull(),
    mobile: varchar('mobile', { length: 20 }).notNull(),
    nationalId: varchar('national_id', { length: 10 }),
    phone: varchar('phone', { length: 30 }),
    officeNotes: text('office_notes'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('customers_user_id_uniq').on(table.userId),
    uniqueIndex('customers_mobile_uniq').on(table.mobile),
    index('customers_national_id_idx').on(table.nationalId),
    index('customers_full_name_idx').on(table.fullName),
  ],
);

// 4. Drivers (Customer-owned Driver Profiles)
export const drivers = pgTable(
  'drivers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    fullName: varchar('full_name', { length: 150 }).notNull(),
    nationalId: varchar('national_id', { length: 10 }).notNull(),
    reviewState: varchar('review_state', { length: 32 }).notNull().default('pending_office_review'),
    isArchived: boolean('is_archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('drivers_customer_archived_idx').on(table.customerId, table.isArchived),
    index('drivers_national_id_idx').on(table.nationalId),
  ],
);

// 5. Workshops (Customer-owned Employer/Workshop Profiles)
export const workshops = pgTable(
  'workshops',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    workshopName: varchar('workshop_name', { length: 200 }).notNull(),
    workshopCode: varchar('workshop_code', { length: 50 }).notNull(),
    contactFullName: varchar('contact_full_name', { length: 150 }).notNull(),
    contactNationalId: varchar('contact_national_id', { length: 10 }).notNull(),
    reviewState: varchar('review_state', { length: 32 }).notNull().default('pending_office_review'),
    isArchived: boolean('is_archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('workshops_customer_archived_idx').on(table.customerId, table.isArchived),
    index('workshops_code_idx').on(table.workshopCode),
  ],
);

// 6. Insured Employees (Linked to Workshop & Customer)
export const insuredEmployees = pgTable(
  'insured_employees',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workshopId: uuid('workshop_id')
      .notNull()
      .references(() => workshops.id, { onDelete: 'restrict' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    fullName: varchar('full_name', { length: 150 }).notNull(),
    nationalId: varchar('national_id', { length: 10 }).notNull(),
    insuranceNumber: varchar('insurance_number', { length: 30 }).notNull(),
    state: varchar('state', { length: 24 }).notNull().default('introduced'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('insured_employees_workshop_idx').on(table.workshopId),
    index('insured_employees_customer_idx').on(table.customerId),
  ],
);

// 7. Monthly Insurance Service Requests
export const requests = pgTable(
  'requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    referenceCode: varchar('reference_code', { length: 28 }).notNull(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    requestType: requestTypeEnum('request_type').notNull(),
    driverId: uuid('driver_id').references(() => drivers.id, { onDelete: 'restrict' }),
    workshopId: uuid('workshop_id').references(() => workshops.id, { onDelete: 'restrict' }),
    jalaliYear: smallint('jalali_year').notNull(),
    jalaliMonth: smallint('jalali_month').notNull(),
    calendarSystem: varchar('calendar_system', { length: 16 }).notNull().default('jalali'),
    status: requestStatusEnum('status').notNull().default('registered'),
    awaitingCustomerInfo: boolean('awaiting_customer_info').notNull().default(false),
    awaitingCustomerInfoNote: text('awaiting_customer_info_note'),
    cancellationRequested: boolean('cancellation_requested').notNull().default(false),
    cancellationRequestReason: text('cancellation_request_reason'),
    cancellationRequestedAt: timestamp('cancellation_requested_at', { withTimezone: true }),
    cancellationDecision: varchar('cancellation_decision', { length: 20 }),
    cancellationDecisionNote: text('cancellation_decision_note'),
    cancellationDecidedAt: timestamp('cancellation_decided_at', { withTimezone: true }),
    finalAmount: bigint('final_amount', { mode: 'number' }),
    currencyUnit: varchar('currency_unit', { length: 16 }).notNull().default('TOMAN'),
    initialExplanation: text('initial_explanation'),
    hasNewEmployeeSubmission: boolean('has_new_employee_submission').notNull().default(false),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    rejectedAt: timestamp('rejected_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('requests_reference_code_uniq').on(table.referenceCode),
    index('requests_customer_period_idx').on(table.customerId, table.jalaliYear, table.jalaliMonth),
    index('requests_driver_period_idx').on(table.driverId, table.jalaliYear, table.jalaliMonth),
    index('requests_workshop_period_idx').on(table.workshopId, table.jalaliYear, table.jalaliMonth),
    index('requests_status_created_idx').on(table.status, table.createdAt),
    index('requests_period_idx').on(table.jalaliYear, table.jalaliMonth),
    check(
      'requests_profile_type_chk',
      sql`(
        (${table.requestType} = 'driver' AND ${table.driverId} IS NOT NULL AND ${table.workshopId} IS NULL)
        OR
        (${table.requestType} = 'workshop' AND ${table.workshopId} IS NOT NULL AND ${table.driverId} IS NULL)
      )`,
    ),
    check(
      'requests_jalali_month_chk',
      sql`${table.jalaliMonth} >= 1 AND ${table.jalaliMonth} <= 12`,
    ),
    check(
      'requests_final_amount_chk',
      sql`${table.finalAmount} IS NULL OR ${table.finalAmount} >= 0`,
    ),
  ],
);

// 8. Request-Linked Insured Employee Submissions (Snapshots fullName & insuranceNumber at time of request)
export const requestEmployeeSubmissions = pgTable(
  'request_employee_submissions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => requests.id, { onDelete: 'cascade' }),
    insuredEmployeeId: uuid('insured_employee_id')
      .notNull()
      .references(() => insuredEmployees.id, { onDelete: 'restrict' }),
    /**
     * Snapshot fields intentionally stored to preserve exact name & insurance number
     * submitted in that specific monthly request even if the employee record is corrected later.
     */
    fullNameSnapshot: varchar('full_name_snapshot', { length: 150 }).notNull(),
    insuranceNumberSnapshot: varchar('insurance_number_snapshot', { length: 30 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('req_emp_sub_request_idx').on(table.requestId)],
);

// 9. Request Messages / Explanations (Two-way visible thread)
export const requestMessages = pgTable(
  'request_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => requests.id, { onDelete: 'cascade' }),
    authorUserId: uuid('author_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    authorRole: userRoleEnum('author_role').notNull(),
    messageKind: varchar('message_kind', { length: 32 }).notNull().default('explanation'),
    body: text('body').notNull(),
    visibility: varchar('visibility', { length: 20 }).notNull().default('shared'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('request_messages_request_created_idx').on(table.requestId, table.createdAt)],
);

// 10. Private Request Files
export const requestFiles = pgTable(
  'request_files',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => requests.id, { onDelete: 'cascade' }),
    messageId: uuid('message_id').references(() => requestMessages.id, { onDelete: 'set null' }),
    employeeSubmissionId: uuid('employee_submission_id').references(
      () => requestEmployeeSubmissions.id,
      { onDelete: 'set null' },
    ),
    uploaderUserId: uuid('uploader_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    uploaderRole: userRoleEnum('uploader_role').notNull(),
    classification: varchar('classification', { length: 32 }).notNull(),
    storageKey: varchar('storage_key', { length: 255 }).notNull(),
    displayFilename: varchar('display_filename', { length: 255 }).notNull(),
    detectedMimeType: varchar('detected_mime_type', { length: 100 }).notNull(),
    byteSize: integer('byte_size').notNull(),
    sha256Checksum: varchar('sha256_checksum', { length: 64 }).notNull(),
    scanState: varchar('scan_state', { length: 32 }).notNull().default('not_configured'),
    isDeleted: boolean('is_deleted').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('request_files_storage_key_uniq').on(table.storageKey),
    index('request_files_request_idx').on(table.requestId),
  ],
);

// 11. Append-only Audit & Request Events
export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    actorRole: varchar('actor_role', { length: 20 }).notNull(),
    entityType: varchar('entity_type', { length: 40 }).notNull(),
    entityId: uuid('entity_id').notNull(),
    requestId: uuid('request_id').references(() => requests.id, { onDelete: 'cascade' }),
    eventType: varchar('event_type', { length: 64 }).notNull(),
    customerVisible: boolean('customer_visible').notNull().default(false),
    summaryFa: text('summary_fa').notNull(),
    oldValues: jsonb('old_values'),
    newValues: jsonb('new_values'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('audit_events_request_created_idx').on(table.requestId, table.createdAt),
    index('audit_events_entity_idx').on(table.entityType, table.entityId),
    index('audit_events_created_idx').on(table.createdAt),
  ],
);

// 12. Persistent In-App Notifications
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    recipientUserId: uuid('recipient_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    recipientRole: userRoleEnum('recipient_role').notNull(),
    notificationType: varchar('notification_type', { length: 50 }).notNull(),
    requestId: uuid('request_id').references(() => requests.id, { onDelete: 'cascade' }),
    titleFa: varchar('title_fa', { length: 200 }).notNull(),
    bodyFa: text('body_fa').notNull(),
    dedupeKey: varchar('dedupe_key', { length: 160 }),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('notifications_dedupe_key_uniq').on(table.dedupeKey),
    index('notifications_recipient_unread_idx').on(
      table.recipientUserId,
      table.readAt,
      table.createdAt,
    ),
  ],
);
