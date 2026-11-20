import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

/** Embedding size. gemini-embedding-001 supports 768 via Matryoshka truncation. */
export const EMBEDDING_DIMENSIONS = 768;

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });

// ─── Enums ──────────────────────────────────────────────────────────────────

export const roleEnum = pgEnum('role', ['student', 'staff', 'admin']);
/** open → in_progress → resolved; closed = won't fix / invalid / merged into another issue. */
export const issueStatusEnum = pgEnum('issue_status', ['open', 'in_progress', 'resolved', 'closed']);
export const channelEnum = pgEnum('channel', ['web', 'whatsapp', 'email']);
export const eventTypeEnum = pgEnum('event_type', [
  'created',
  'report_added',
  'status_changed',
  'assigned',
  'reclassified',
  'comment',
  'merged',
  'escalated',
]);
export const outboxStatusEnum = pgEnum('outbox_status', ['pending', 'sent', 'failed']);

// ─── Taxonomy (who fixes what) ──────────────────────────────────────────────

export const departments = pgTable('departments', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  /** Where the daily digest and urgent alerts go. */
  email: text('email'),
  /** Sensitive departments (grievance / anti-ragging) get restricted visibility. */
  isSensitive: boolean('is_sensitive').notNull().default(false),
  createdAt: createdAt(),
});

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  /** Shown to the classifier. Say what belongs here AND what doesn't. */
  description: text('description').notNull(),
  departmentId: uuid('department_id')
    .notNull()
    .references(() => departments.id),
  requiresLocation: boolean('requires_location').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  active: boolean('active').notNull().default(true),
});

export const subcategories = pgTable(
  'subcategories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    active: boolean('active').notNull().default(true),
  },
  (t) => [uniqueIndex('subcategories_category_slug_uq').on(t.categoryId, t.slug)],
);

export const locations = pgTable('locations', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  /** Other names students use ("H-B", "boys hostel 2", "canteen"). Fed to the classifier. */
  aliases: text('aliases').array().notNull().default(sql`'{}'::text[]`),
  active: boolean('active').notNull().default(true),
});

// ─── People ─────────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name'),
  image: text('image'),
  role: roleEnum('role').notNull().default('student'),
  /** Staff belong to one department and see its queue. */
  departmentId: uuid('department_id').references(() => departments.id),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
  lastLoginAt: ts('last_login_at'),
});

// ─── Issues & reports ───────────────────────────────────────────────────────

export type IssueSignals = {
  severity: 'low' | 'medium' | 'high';
  safetyRisk: boolean;
  affectsMany: boolean;
  timeSensitive: boolean;
};

/**
 * An issue is one real-world problem ("Wi-Fi down in Hostel B").
 * Many reports (one per student) can point at the same issue.
 */
export const issues = pgTable(
  'issues',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Human-facing number, shown as DP-1001. */
    number: integer('number').notNull().unique().generatedAlwaysAsIdentity({ startWith: 1001 }),
    title: text('title').notNull(),
    summary: text('summary').notNull(),
    /** null = the classifier couldn't decide; issue waits in the triage queue. */
    categoryId: uuid('category_id').references(() => categories.id),
    subcategoryId: uuid('subcategory_id').references(() => subcategories.id),
    locationId: uuid('location_id').references(() => locations.id),
    locationDetail: text('location_detail'),
    departmentId: uuid('department_id').references(() => departments.id),
    status: issueStatusEnum('status').notNull().default('open'),
    urgency: integer('urgency').notNull(),
    signals: jsonb('signals').$type<IssueSignals>().notNull(),
    isSensitive: boolean('is_sensitive').notNull().default(false),
    /** Reporter asked for it to stay off the public board. */
    isConfidential: boolean('is_confidential').notNull().default(false),
    needsTriage: boolean('needs_triage').notNull().default(false),
    reporterCount: integer('reporter_count').notNull().default(0),
    assigneeId: uuid('assignee_id').references(() => users.id),
    /** Set when a reporter chose "new issue" although a similar open issue existed. Staff can merge. */
    possibleDuplicateOfId: uuid('possible_duplicate_of_id').references((): AnyPgColumn => issues.id),
    mergedIntoId: uuid('merged_into_id').references((): AnyPgColumn => issues.id),
    embedding: vector('embedding', { dimensions: EMBEDDING_DIMENSIONS }),
    dueAt: ts('due_at'),
    escalatedAt: ts('escalated_at'),
    resolvedAt: ts('resolved_at'),
    resolutionNote: text('resolution_note'),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('issues_department_status_idx').on(t.departmentId, t.status),
    index('issues_category_status_idx').on(t.categoryId, t.status),
    index('issues_due_idx').on(t.dueAt),
  ],
);

/** What the classifier said at the time of reporting. Kept verbatim: it is the training data. */
export type ReportAi = {
  model: string | null;
  categorySlug: string | null;
  subcategorySlug: string | null;
  locationSlug: string | null;
  confidence: number | null;
  isSensitive: boolean;
  tripwire: string[];
  error?: string;
  /** Classified later by the backfill job because the AI was down at submit time. */
  backfilled?: boolean;
};

export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    issueId: uuid('issue_id')
      .notNull()
      .references(() => issues.id),
    reporterId: uuid('reporter_id')
      .notNull()
      .references(() => users.id),
    channel: channelEnum('channel').notNull(),
    /** Original text. null for a plain "me too" on an existing issue. */
    text: text('text'),
    /** Reporter's identity is hidden from staff in the app. */
    isAnonymous: boolean('is_anonymous').notNull().default(false),
    ai: jsonb('ai').$type<ReportAi>(),
    /** The reporter changed the category the AI suggested. */
    categoryCorrected: boolean('category_corrected').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    // One report per student per issue: repeated reports don't inflate counts.
    uniqueIndex('reports_issue_reporter_uq').on(t.issueId, t.reporterId),
    index('reports_reporter_idx').on(t.reporterId),
  ],
);

/** Audit log. Public events are shown to reporters; the rest are staff-only. */
export const issueEvents = pgTable(
  'issue_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    issueId: uuid('issue_id')
      .notNull()
      .references(() => issues.id),
    /** null = system. */
    actorId: uuid('actor_id').references(() => users.id),
    type: eventTypeEnum('type').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    isPublic: boolean('is_public').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('issue_events_issue_idx').on(t.issueId, t.createdAt)],
);

/**
 * A report that has been analysed but not yet submitted. Holds the server-side AI result so the
 * client can't tamper with it, and expires so a stale follow-up can't attach to the wrong thing.
 */
export const drafts = pgTable(
  'drafts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reporterId: uuid('reporter_id')
      .notNull()
      .references(() => users.id),
    channel: channelEnum('channel').notNull(),
    text: text('text').notNull(),
    analysis: jsonb('analysis').notNull(),
    expiresAt: ts('expires_at').notNull(),
    consumedAt: ts('consumed_at'),
    createdAt: createdAt(),
  },
  (t) => [index('drafts_reporter_created_idx').on(t.reporterId, t.createdAt)],
);

/** Emails are written here in the same transaction as the change, then delivered with retries. */
export const outbox = pgTable(
  'outbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    toEmail: text('to_email').notNull(),
    subject: text('subject').notNull(),
    body: text('body').notNull(),
    status: outboxStatusEnum('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: ts('sent_at'),
    createdAt: createdAt(),
  },
  (t) => [index('outbox_pending_idx').on(t.status, t.nextAttemptAt)],
);

// ─── Relations (for db.query.*) ─────────────────────────────────────────────

export const departmentsRelations = relations(departments, ({ many }) => ({
  categories: many(categories),
  users: many(users),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  department: one(departments, { fields: [categories.departmentId], references: [departments.id] }),
  subcategories: many(subcategories),
}));

export const subcategoriesRelations = relations(subcategories, ({ one }) => ({
  category: one(categories, { fields: [subcategories.categoryId], references: [categories.id] }),
}));

export const usersRelations = relations(users, ({ one }) => ({
  department: one(departments, { fields: [users.departmentId], references: [departments.id] }),
}));

export const issuesRelations = relations(issues, ({ one, many }) => ({
  category: one(categories, { fields: [issues.categoryId], references: [categories.id] }),
  subcategory: one(subcategories, { fields: [issues.subcategoryId], references: [subcategories.id] }),
  location: one(locations, { fields: [issues.locationId], references: [locations.id] }),
  department: one(departments, { fields: [issues.departmentId], references: [departments.id] }),
  assignee: one(users, { fields: [issues.assigneeId], references: [users.id] }),
  reports: many(reports),
  events: many(issueEvents),
}));

export const reportsRelations = relations(reports, ({ one }) => ({
  issue: one(issues, { fields: [reports.issueId], references: [issues.id] }),
  reporter: one(users, { fields: [reports.reporterId], references: [users.id] }),
}));

export const issueEventsRelations = relations(issueEvents, ({ one }) => ({
  issue: one(issues, { fields: [issueEvents.issueId], references: [issues.id] }),
  actor: one(users, { fields: [issueEvents.actorId], references: [users.id] }),
}));

export type Department = typeof departments.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Subcategory = typeof subcategories.$inferSelect;
export type Location = typeof locations.$inferSelect;
export type User = typeof users.$inferSelect;
export type Issue = typeof issues.$inferSelect;
export type Report = typeof reports.$inferSelect;
export type IssueEvent = typeof issueEvents.$inferSelect;
export type IssueStatus = (typeof issueStatusEnum.enumValues)[number];
export type Role = (typeof roleEnum.enumValues)[number];
export type Channel = (typeof channelEnum.enumValues)[number];
