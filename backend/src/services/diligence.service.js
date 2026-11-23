import { sql } from 'drizzle-orm';
import { db } from '#config/database.js';
import { executeDealWrite } from '#services/deal.service.js';
import { AppError } from '#utils/app-error.js';

const pageSize = 20;
const readScope = (dealId, userId) => sql`
  SELECT id, buyer_id, seller_id, status FROM deals
  WHERE id = ${dealId} AND ${userId} IN (buyer_id, seller_id)`;
const writeScope = (dealId, userId) =>
  sql`${readScope(dealId, userId)} FOR UPDATE`;
const writable = sql`scope.status NOT IN ('completed', 'cancelled', 'rejected')`;
const utcToday = sql`(now() AT TIME ZONE 'UTC')::date`;
const rows = result => (Array.isArray(result) ? result : result.rows);
const notFound = () =>
  new AppError(404, 'DEAL_NOT_FOUND', 'Deal was not found');

export const getDiligence = async (dealId, userId, filters) => {
  const assignment =
    filters.assignment === 'mine'
      ? sql`item.assigned_to = CASE WHEN scope.buyer_id = ${userId} THEN 'buyer' ELSE 'seller' END`
      : sql`item.assigned_to <> CASE WHEN scope.buyer_id = ${userId} THEN 'buyer' ELSE 'seller' END`;
  const [result] = rows(
    await db.execute(sql`
    WITH scope AS (${readScope(dealId, userId)}),
    tasks AS (
      SELECT item.*, (item.status <> 'completed' AND coalesce(item.due_date < ${utcToday}, false)) AS overdue
      FROM deal_checklist_items item JOIN scope ON item.deal_id = scope.id
    ), filtered AS (
      SELECT item.* FROM tasks item CROSS JOIN scope
      WHERE true
      ${filters.category ? sql`AND item.category = ${filters.category}` : sql.empty()}
      ${filters.status ? sql`AND item.status = ${filters.status}` : sql.empty()}
      ${filters.assignment ? sql`AND ${assignment}` : sql.empty()}
    ), task_page AS (
      SELECT * FROM filtered ORDER BY id DESC LIMIT ${pageSize} OFFSET ${(filters.page - 1) * pageSize}
    ), requests AS (
      SELECT request.*, document.original_filename AS document_filename
      FROM deal_document_requests request JOIN scope ON request.deal_id = scope.id
      LEFT JOIN conversation_documents document ON document.id = request.document_id
        AND document.status = 'available' AND document.deleted_at IS NULL
    ), request_page AS (
      SELECT * FROM requests ORDER BY id DESC LIMIT ${pageSize} OFFSET ${(filters.requestPage - 1) * pageSize}
    )
    SELECT
      coalesce((SELECT jsonb_agg(to_jsonb(task_page) - 'creation_key' ORDER BY id DESC) FROM task_page), '[]'::jsonb) AS checklist,
      coalesce((SELECT jsonb_agg(to_jsonb(request_page) - 'creation_key' ORDER BY id DESC) FROM request_page), '[]'::jsonb) AS requests,
      (SELECT count(*)::int FROM filtered) AS "checklistTotal",
      (SELECT count(*)::int FROM requests) AS "requestTotal",
      (SELECT jsonb_build_object(
        'total', count(*),
        'completed', count(*) FILTER (WHERE status = 'completed'),
        'pending', count(*) FILTER (WHERE status = 'pending'),
        'inProgress', count(*) FILTER (WHERE status = 'in_progress'),
        'blocked', count(*) FILTER (WHERE status = 'blocked'),
        'overdue', count(*) FILTER (WHERE overdue),
        'outstandingRequests', (SELECT count(*) FROM requests WHERE status <> 'accepted')
      ) FROM tasks) AS progress,
      (SELECT min(created_at) FROM deal_activities WHERE deal_id = scope.id AND
        (event_type IN ('deal.checklist_created', 'deal.document_requested') OR
          (event_type = 'deal.status_changed' AND metadata ->> 'to' = 'due_diligence'))) AS "startedAt",
      (SELECT min(created_at) FROM deal_activities WHERE deal_id = scope.id
        AND event_type = 'deal.document_accepted') AS "firstDocumentAcceptedAt"
    FROM scope`)
  );
  if (!result) throw notFound();
  return { ...result, pageSize };
};

// Every emitted activity and notification depends on the same successful write.
const finishWrite = async ({ statement, events, dealId, userId, failure }) => {
  const [result] = rows(
    await executeDealWrite(sql`
    WITH ${statement},
    events AS (${events}),
    recorded AS (
      INSERT INTO deal_activities(deal_id, actor_id, event_type, metadata)
      SELECT ${dealId}, ${userId}, name, metadata FROM events RETURNING id, event_type
    ), deliveries AS (
      SELECT recorded.id, recorded.event_type, events.recipient
      FROM recorded JOIN events ON recorded.event_type = events.name WHERE events.recipient <> ${userId}
    ), notices AS (
      INSERT INTO notifications(user_id, dedupe_key, type, payload)
      SELECT recipient, 'deal:activity:' || id, event_type,
        jsonb_build_object('dealId', ${dealId}::int)
      FROM deliveries ON CONFLICT (dedupe_key) DO NOTHING
    ), emails AS (
      INSERT INTO outbox_events(event_key, type, payload)
      SELECT 'deal:activity:' || id, event_type,
        jsonb_build_object('dealId', ${dealId}::int, 'recipientIds', jsonb_build_array(recipient))
      FROM deliveries ON CONFLICT (event_key) DO NOTHING
    )
    SELECT (SELECT id FROM changed) AS id, EXISTS (SELECT 1 FROM scope) AS visible,
      ${failure ?? sql`false`} AS denied
  `)
  );
  if (!result.visible) throw notFound();
  if (result.denied)
    throw new AppError(
      403,
      'DILIGENCE_ACTION_FORBIDDEN',
      'Only the designated participant may take this action'
    );
  if (result.id === null)
    throw new AppError(
      409,
      'DILIGENCE_CONFLICT',
      'The record changed, the document is unavailable, or the deal is closed. Refresh and try again.'
    );
  return { id: result.id };
};

export const createChecklistItem = async (dealId, userId, input) =>
  finishWrite({
    dealId,
    userId,
    statement: sql`scope AS (${writeScope(dealId, userId)}), changed AS (
    INSERT INTO deal_checklist_items(deal_id, created_by, creation_key, title, description, category, assigned_to, due_date)
    SELECT scope.id, ${userId}, ${input.creationKey}, ${input.title}, ${input.description}, ${input.category}, ${input.assignedTo}, ${input.dueDate}
    FROM scope WHERE ${writable} ON CONFLICT (deal_id, created_by, creation_key) DO NOTHING RETURNING *
  )`,
    events: sql`
    SELECT 'deal.checklist_created' AS name, jsonb_build_object('checklistItemId', id) AS metadata, NULL::int AS recipient FROM changed
    UNION ALL
    SELECT 'deal.task_assigned', jsonb_build_object('checklistItemId', changed.id, 'assignedTo', changed.assigned_to),
      CASE WHEN changed.assigned_to = 'buyer' THEN scope.buyer_id ELSE scope.seller_id END
    FROM changed CROSS JOIN scope`,
  });

export const updateChecklistItem = async (dealId, userId, recordId, input) =>
  finishWrite({
    dealId,
    userId,
    statement: sql`scope AS (${writeScope(dealId, userId)}), target AS (
    SELECT item.* FROM scope JOIN deal_checklist_items item ON item.deal_id = scope.id
    WHERE item.id = ${recordId} AND ${writable}
  ), changed AS (
    UPDATE deal_checklist_items item SET
      title = coalesce(${input.title ?? null}, item.title),
      description = coalesce(${input.description ?? null}, item.description),
      category = coalesce(${input.category ?? null}, item.category),
      assigned_to = coalesce(${input.assignedTo ?? null}, item.assigned_to),
      due_date = ${input.dueDate === undefined ? sql`item.due_date` : sql`${input.dueDate}::date`},
      status = coalesce(${input.status ?? null}, item.status),
      completed_at = CASE WHEN coalesce(${input.status ?? null}, item.status) = 'completed'
        THEN coalesce(item.completed_at, now()) ELSE NULL END,
      revision = item.revision + 1, updated_at = now()
    FROM target WHERE item.id = target.id AND item.revision = ${input.revision}
    RETURNING item.*, target.assigned_to AS previous_assignment, target.status AS previous_status
  )`,
    events: sql`
    SELECT 'deal.checklist_updated' AS name, jsonb_build_object('checklistItemId', id, 'from', previous_status, 'to', status) AS metadata, NULL::int AS recipient FROM changed
    UNION ALL
    SELECT 'deal.task_assigned', jsonb_build_object('checklistItemId', changed.id, 'assignedTo', changed.assigned_to),
      CASE WHEN changed.assigned_to = 'buyer' THEN scope.buyer_id ELSE scope.seller_id END
    FROM changed CROSS JOIN scope WHERE changed.assigned_to <> changed.previous_assignment
    UNION ALL
    SELECT 'deal.task_completed', jsonb_build_object('checklistItemId', id), NULL::int FROM changed
    WHERE status = 'completed' AND previous_status <> 'completed'`,
  });

export const createDocumentRequest = async (dealId, userId, input) =>
  finishWrite({
    dealId,
    userId,
    statement: sql`scope AS (${writeScope(dealId, userId)}), changed AS (
    INSERT INTO deal_document_requests(deal_id, requested_by, responsible_id, creation_key, title, description, due_date)
    SELECT scope.id, ${userId}, CASE WHEN scope.buyer_id = ${userId} THEN scope.seller_id ELSE scope.buyer_id END,
      ${input.creationKey}, ${input.title}, ${input.description}, ${input.dueDate}
    FROM scope WHERE ${writable} ON CONFLICT (deal_id, requested_by, creation_key) DO NOTHING RETURNING *
  )`,
    events: sql`
    SELECT 'deal.document_requested' AS name, jsonb_build_object('documentRequestId', id) AS metadata, responsible_id AS recipient FROM changed`,
  });

const requestActions = {
  submit: {
    next: 'submitted',
    actor: sql`responsible_id`,
    previous: sql`('requested','changes_requested')`,
  },
  review: {
    next: 'under_review',
    actor: sql`requested_by`,
    previous: sql`('submitted')`,
  },
  accept: {
    next: 'accepted',
    actor: sql`requested_by`,
    previous: sql`('under_review')`,
  },
  request_changes: {
    next: 'changes_requested',
    actor: sql`requested_by`,
    previous: sql`('under_review')`,
  },
};

export const updateDocumentRequest = async (
  dealId,
  userId,
  recordId,
  input
) => {
  const { next, actor, previous } = requestActions[input.action];
  const submitting = input.action === 'submit';
  return finishWrite({
    dealId,
    userId,
    statement: sql`scope AS (${writeScope(dealId, userId)}), target AS (
      SELECT request.* FROM scope JOIN deal_document_requests request ON request.deal_id = scope.id
      WHERE request.id = ${recordId} AND ${writable}
    ), eligible_file AS (
      SELECT file.id FROM target
      JOIN deal_documents linked ON linked.deal_id = target.deal_id
      JOIN conversation_documents file ON file.id = linked.conversation_document_id
      WHERE file.id = ${submitting ? sql`${input.documentId}` : sql`target.document_id`}
        AND file.status = 'available' AND file.deleted_at IS NULL
        ${submitting ? sql`AND file.uploaded_by = ${userId}` : sql.empty()}
      FOR SHARE OF file
    ), changed AS (
      UPDATE deal_document_requests request SET
        status = ${next},
        document_id = ${submitting ? sql`(SELECT id FROM eligible_file)` : sql`request.document_id`},
        reviewed_by = ${submitting ? sql`NULL` : sql`${userId}`},
        reviewed_at = ${submitting ? sql`NULL` : sql`now()`},
        feedback = ${submitting ? null : input.feedback || null},
        revision = request.revision + 1, updated_at = now()
      FROM target
      WHERE request.id = target.id AND request.revision = ${input.revision}
        AND target.${actor} = ${userId} AND target.status IN ${previous}
        ${submitting || input.action === 'accept' ? sql`AND EXISTS (SELECT 1 FROM eligible_file)` : sql.empty()}
      RETURNING request.*
    )`,
    failure: sql`EXISTS (SELECT 1 FROM target WHERE ${actor} <> ${userId})`,
    events: sql`
      SELECT ${'deal.document_' + next}::text AS name,
        jsonb_strip_nulls(jsonb_build_object('documentRequestId', id, 'documentId', document_id, 'feedback', feedback)) AS metadata,
        ${input.action === 'review' ? sql`NULL::int` : submitting ? sql`requested_by` : sql`responsible_id`} AS recipient
      FROM changed`,
  });
};
