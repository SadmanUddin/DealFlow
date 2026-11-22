const table = (name, fields) => {
  const result = { __name: name };
  for (const field of fields) result[field] = { table: name, field };
  return result;
};

export const modelTables = {
  users: table('users', [
    'id',
    'name',
    'email',
    'password',
    'role',
    'email_verified',
    'is_active',
    'suspension_reason',
    'suspended_at',
    'suspended_by',
    'created_at',
    'updated_at',
  ]),
  authSessions: table('auth_sessions', [
    'id',
    'user_id',
    'csrf_token_hash',
    'expires_at',
    'revoked_at',
    'created_at',
  ]),
  authTokens: table('auth_tokens', [
    'token_hash',
    'user_id',
    'type',
    'expires_at',
    'consumed_at',
    'created_at',
  ]),
  businessListings: table('business_listings', [
    'id',
    'seller_id',
    'title',
    'description',
    'industry',
    'location',
    'website',
    'image_key',
    'image_mime_type',
    'asking_price',
    'annual_revenue',
    'ebitda',
    'currency',
    'status',
    'public_snapshot',
    'rejection_reason',
    'moderation_reason',
    'moderated_by',
    'moderated_at',
    'suspended_at',
    'suspended_by',
    'published_at',
    'created_at',
    'updated_at',
  ]),
  deals: table('deals', [
    'id',
    'listing_id',
    'buyer_id',
    'seller_id',
    'status',
    'accepted_at',
    'created_at',
    'updated_at',
    'deal_uid',
  ]),
  conversations: table('conversations', [
    'id',
    'listing_id',
    'buyer_id',
    'seller_id',
    'status',
    'status_updated_at',
    'created_at',
  ]),
  messages: table('messages', [
    'id',
    'conversation_id',
    'sender_id',
    'content',
    'created_at',
    'read_at',
  ]),
  conversationDocuments: table('conversation_documents', [
    'id',
    'conversation_id',
    'uploaded_by',
    'storage_key',
    'original_filename',
    'mime_type',
    'size_bytes',
    'sha256',
    'status',
    'created_at',
    'updated_at',
    'deleted_at',
  ]),
  favorites: table('favorites', ['id', 'user_id', 'listing_id', 'created_at']),
  notifications: table('notifications', [
    'id',
    'user_id',
    'dedupe_key',
    'type',
    'payload',
    'read_at',
    'created_at',
  ]),
  notificationEmailPreferences: table('notification_email_preferences', [
    'user_id',
    'listing_status',
    'listing_price',
    'listing_details',
    'deal_updates',
    'updated_at',
  ]),
  outboxEvents: table('outbox_events', [
    'id',
    'event_key',
    'type',
    'payload',
    'status',
    'attempts',
    'available_at',
    'locked_at',
    'lock_token',
    'last_error',
    'processed_at',
    'quarantined_at',
    'quarantine_reason',
    'created_at',
  ]),
  moderationReports: table('moderation_reports', [
    'id',
    'reporter_id',
    'listing_id',
    'reported_user_id',
    'category',
    'description',
    'status',
    'moderator_notes',
    'resolution_reason',
    'assigned_to',
    'resolved_by',
    'created_at',
    'updated_at',
    'resolved_at',
  ]),
  adminAuditLogs: table('admin_audit_logs', [
    'id',
    'actor_id',
    'action',
    'target_type',
    'target_id',
    'reason',
    'before_state',
    'after_state',
    'request_id',
    'created_at',
  ]),
};

export const phase6Tables = {
  favorites: modelTables.favorites,
  notifications: modelTables.notifications,
  notificationEmailPreferences: modelTables.notificationEmailPreferences,
  outboxEvents: modelTables.outboxEvents,
  moderationReports: modelTables.moderationReports,
  adminAuditLogs: modelTables.adminAuditLogs,
};

export const databaseState = {
  users: [],
  auth_sessions: [],
  auth_tokens: [],
  business_listings: [],
  deals: [],
  conversations: [],
  messages: [],
  conversation_documents: [],
  favorites: [],
  notifications: [],
  notification_email_preferences: [],
  outbox_events: [],
  moderation_reports: [],
  admin_audit_logs: [],
  nextUserId: 1,
  nextListingId: 1,
  nextConversationId: 1,
  nextMessageId: 1,
  nextDocumentId: 1,
  nextFavoriteId: 1,
  nextNotificationId: 1,
  nextReportId: 1,
  nextAuditId: 1,
  failNext: null,
  failOn: null,
  staleNext: null,
  batchCalls: 0,
};

export const resetDatabase = () => {
  databaseState.users.length = 0;
  databaseState.auth_sessions.length = 0;
  databaseState.auth_tokens.length = 0;
  databaseState.business_listings.length = 0;
  databaseState.deals.length = 0;
  databaseState.conversations.length = 0;
  databaseState.messages.length = 0;
  databaseState.conversation_documents.length = 0;
  databaseState.favorites.length = 0;
  databaseState.notifications.length = 0;
  databaseState.notification_email_preferences.length = 0;
  databaseState.outbox_events.length = 0;
  databaseState.moderation_reports.length = 0;
  databaseState.admin_audit_logs.length = 0;
  databaseState.nextUserId = 1;
  databaseState.nextListingId = 1;
  databaseState.nextConversationId = 1;
  databaseState.nextMessageId = 1;
  databaseState.nextDocumentId = 1;
  databaseState.nextFavoriteId = 1;
  databaseState.nextNotificationId = 1;
  databaseState.nextReportId = 1;
  databaseState.nextAuditId = 1;
  databaseState.failNext = null;
  databaseState.failOn = null;
  databaseState.staleNext = null;
  databaseState.batchCalls = 0;
};

const condition = (operator, column, value) => ({ operator, column, value });
export const drizzleOperators = {
  eq: (column, value) => condition('eq', column, value),
  gt: (column, value) => condition('gt', column, value),
  ne: (column, value) => condition('ne', column, value),
  exists: query => ({ operator: 'exists', query }),
  gte: (column, value) => condition('gte', column, value),
  lte: (column, value) => condition('lte', column, value),
  inArray: (column, values) => condition('inArray', column, values),
  ilike: (column, value) => condition('ilike', column, value),
  isNull: column => condition('isNull', column),
  and: (...conditions) => ({ operator: 'and', conditions }),
  or: (...conditions) => ({ operator: 'or', conditions }),
  desc: column => ({ operator: 'desc', column }),
  asc: column => ({ operator: 'asc', column }),
  sql: Object.assign(
    (strings, ...values) => ({ __sql: strings.join('?'), values }),
    {
      raw: value => ({ __sql: value, values: [] }),
    }
  ),
};

const tableRows = target => databaseState[target.__name];

const valueFor = (rowSet, column) => rowSet[column.table]?.[column.field];

const orderValueFor = (rowSet, order) => {
  if (order.column) return valueFor(rowSet, order.column);
  if (order.__sql?.includes('COALESCE') && rowSet.conversations) {
    const conversation = rowSet.conversations;
    const latestMessage = databaseState.messages
      .filter(message => message.conversation_id === conversation.id)
      .sort((left, right) =>
        right.created_at - left.created_at || right.id - left.id
      )[0];
    return latestMessage?.created_at ?? conversation.created_at;
  }
  return undefined;
};

const matches = (expression, rowSet) => {
  if (!expression) return true;
  if (expression.__sql) {
    const column = expression.values?.find(value => value?.table);
    const value = column ? valueFor(rowSet, column) : undefined;
    if (expression.__sql.includes('now() - interval \'60 seconds\'')) {
      return value instanceof Date && value.getTime() > Date.now() - 60000;
    }
    return false;
  }
  if (expression.operator === 'and') {
    return expression.conditions.every(entry => matches(entry, rowSet));
  }
  if (expression.operator === 'or') {
    return expression.conditions.some(entry => matches(entry, rowSet));
  }
  if (expression.operator === 'exists') {
    return tableRows(expression.query.target).some(row =>
      matches(expression.query.expression, {
        ...rowSet,
        [expression.query.target.__name]: row,
      })
    );
  }
  const value = valueFor(rowSet, expression.column);
  if (expression.operator === 'eq') {
    const expected = expression.value?.table
      ? valueFor(rowSet, expression.value)
      : expression.value;
    if (value instanceof Date && expected instanceof Date)
      return value.getTime() === expected.getTime();
    return value === expected;
  }
  if (expression.operator === 'isNull') return value == null;
  if (expression.operator === 'gt') return value > expression.value;
  if (expression.operator === 'ne') return value !== expression.value;
  if (expression.operator === 'gte')
    return value != null && Number(value) >= Number(expression.value);
  if (expression.operator === 'lte')
    return value != null && Number(value) <= Number(expression.value);
  if (expression.operator === 'inArray')
    return expression.value.includes(value);
  if (expression.operator === 'ilike') {
    if (value == null) return false;
    const pattern = expression.value
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/%/g, '.*')
      .replace(/_/g, '.');
    return new RegExp(`^${pattern}$`, 'i').test(String(value));
  }
  return false;
};

const project = (projection, rowSet, fallback) => {
  if (!projection) return { ...fallback };
  const projectSql = column => {
    const query = column?.__sql ?? column?.query ?? '';
    const values = column?.values ?? [];
    if (query.includes('EXISTS (SELECT 1 FROM favorites')) {
      const listingId = valueFor(rowSet, values.find(value => value?.table));
      const viewerId = values.find(value => !value?.table);
      return databaseState.favorites.some(
        favorite =>
          favorite.listing_id === listingId && favorite.user_id === viewerId
      );
    }
    if (query.includes('SELECT name FROM users')) {
      let userId;
      if (query.includes('CASE WHEN')) {
        const conversation = rowSet.conversations;
        if (values[0]?.table) {
          const viewerId = values[1];
          userId =
            conversation.buyer_id === viewerId
              ? conversation.seller_id
              : conversation.buyer_id;
        } else {
          const [viewerId, buyerId, sellerId] = values;
          userId = viewerId === buyerId ? sellerId : buyerId;
        }
      } else {
        userId = values[0];
      }
      return databaseState.users.find(user => user.id === userId)?.name ?? null;
    }
    return values[0];
  };
  return Object.fromEntries(
    Object.entries(projection).map(([alias, column]) => [
      alias,
      column?.__sql ? projectSql(column) : valueFor(rowSet, column),
    ])
  );
};

class Query {
  constructor(operation, projection, target) {
    this.operation = operation;
    this.projection = projection;
    this.target = target;
  }

  from(target) {
    this.target = target;
    return this;
  }

  innerJoin(target, on) {
    (this.joins ??= []).push({ target, on, left: false });
    return this;
  }

  leftJoin(target, on) {
    (this.joins ??= []).push({ target, on, left: true });
    return this;
  }

  where(expression) {
    this.expression = expression;
    return this;
  }

  limit(limit) {
    this.rowLimit = limit;
    return this;
  }

  offset(offset) {
    this.rowOffset = offset;
    return this;
  }

  orderBy(...ordering) {
    this.ordering = ordering;
    return this;
  }

  values(values) {
    this.valuesToInsert = values;
    return this;
  }

  set(values) {
    this.valuesToSet = values;
    return this;
  }

  returning(projection) {
    this.projection = projection;
    return this;
  }

  select(source) {
    this.source = source;
    return this;
  }

  onConflictDoNothing(options) {
    this.ignoreConflict = true;
    this.conflictTarget = options?.target;
    return this;
  }

  onConflictDoUpdate(options) {
    this.conflictUpdate = options;
    return this;
  }

  delete() {
    this.operation = 'delete';
    return this;
  }

  then(resolve, reject) {
    try {
      return Promise.resolve(this.execute()).then(resolve, reject);
    } catch (error) {
      return Promise.reject(error).then(resolve, reject);
    }
  }

  execute() {
    if (
      databaseState.failNext &&
      (!databaseState.failOn ||
        (databaseState.failOn.table === this.target?.__name &&
          databaseState.failOn.operation === this.operation))
    ) {
      const error = databaseState.failNext;
      databaseState.failNext = null;
      databaseState.failOn = null;
      throw error;
    }
    if (this.operation === 'select') return this.executeSelect();
    if (this.operation === 'insert') return this.executeInsert();
    if (this.operation === 'delete') return this.executeDelete();
    return this.executeUpdate();
  }

  executeSelect() {
    let rowSets = tableRows(this.target).map(row => ({
      [this.target.__name]: row,
    }));
    for (const join of this.joins ?? []) {
      rowSets = rowSets.flatMap(rowSet => {
        const joinedRows = tableRows(join.target)
          .map(joined => ({ ...rowSet, [join.target.__name]: joined }))
          .filter(joined => matches(join.on, joined));
        return joinedRows.length || !join.left
          ? joinedRows
          : [{ ...rowSet, [join.target.__name]: {} }];
      });
    }
    const matching = rowSets.filter(rowSet => matches(this.expression, rowSet));
    for (const order of [...(this.ordering ?? [])].reverse()) {
      matching.sort((left, right) => {
        const a = orderValueFor(left, order);
        const b = orderValueFor(right, order);
        if (a == null || b == null) return a == null ? (b == null ? 0 : 1) : -1;
        let comparison;
        if (a instanceof Date && b instanceof Date) {
          comparison = a.getTime() - b.getTime();
        } else if (typeof a === 'number' && typeof b === 'number') {
          comparison = a - b;
        } else {
          comparison = String(a).localeCompare(String(b), undefined, {
            numeric: true,
          });
        }
        const descending =
          order.operator === 'desc' || order.__sql?.includes('DESC');
        return descending ? -comparison : comparison;
      });
    }
    const selected = matching
      .slice(
        this.rowOffset ?? 0,
        (this.rowOffset ?? 0) + (this.rowLimit ?? matching.length)
      )
      .map(rowSet =>
        this.projection?.count
          ? { count: matching.length }
          : project(this.projection, rowSet, rowSet[this.target.__name])
      );
    return selected;
  }

  executeInsert() {
    const rows = tableRows(this.target);
    if (this.source) {
      if (this.target.__name === 'conversations') {
        const insertColumns = Object.keys(this.target).filter(
          key => key !== '__name'
        );
        const selectedColumns = Object.keys(this.source.projection ?? {});
        if (
          selectedColumns.length !== insertColumns.length ||
          selectedColumns.some(
            (column, index) => column !== insertColumns[index]
          )
        ) {
          throw new Error(
            'Insert select error: selected fields are not the same or are in a different order compared to the table definition'
          );
        }
      }
      this.valuesToInsert = this.source.executeSelect();
      if (!Array.isArray(this.valuesToInsert))
        this.valuesToInsert = [this.valuesToInsert];
    }
    const inserts = Array.isArray(this.valuesToInsert)
      ? this.valuesToInsert
      : [this.valuesToInsert];
    const inserted = [];
    for (const values of inserts) {
      if (!values) continue;
      if (this.conflictUpdate) {
        const conflictColumn = this.conflictUpdate.target;
        const existing = rows.find(
          row => row[conflictColumn.field] === values[conflictColumn.field]
        );
        if (existing) {
          Object.assign(existing, this.conflictUpdate.set);
          inserted.push(existing);
          continue;
        }
      }
      if (
        this.ignoreConflict &&
        ((this.target.__name === 'conversations' &&
          rows.some(
            row =>
              row.listing_id === values.listing_id &&
              row.buyer_id === values.buyer_id
          )) ||
          (this.target.__name === 'favorites' &&
            rows.some(
              row =>
                row.user_id === values.user_id &&
                row.listing_id === values.listing_id
            )) ||
          (this.target.__name === 'notifications' &&
            rows.some(row => row.dedupe_key === values.dedupe_key)))
      ) {
        continue;
      }
      const now = new Date();
      const row = { ...values };
      if (this.target.__name === 'users') {
        if (rows.some(user => user.email === values.email)) {
          const error = new Error('Unique constraint violation');
          error.code = '23505';
          throw error;
        }
        row.id = databaseState.nextUserId++;
        row.role ??= 'buyer';
        row.email_verified ??= false;
        row.is_active ??= true;
        row.created_at = now;
        row.updated_at = now;
      } else if (this.target.__name === 'business_listings') {
        row.id = databaseState.nextListingId++;
        row.created_at = now;
        row.updated_at = now;
        row.status ??= 'draft';
        row.currency ??= 'USD';
        row.industry ??= null;
        row.location ??= null;
        row.asking_price ??= null;
        row.annual_revenue ??= null;
        row.ebitda ??= null;
        row.rejection_reason ??= null;
        row.published_at ??= null;
      } else if (this.target.__name === 'conversations') {
        row.id = databaseState.nextConversationId++;
        row.created_at = now;
        row.status ??= 'pending';
        row.status_updated_at ??= now;
      } else if (this.target.__name === 'messages') {
        row.id = databaseState.nextMessageId++;
        row.created_at = now;
        row.read_at ??= null;
      } else if (this.target.__name === 'conversation_documents') {
        row.id = databaseState.nextDocumentId++;
        row.created_at = now;
        row.updated_at = now;
        row.deleted_at ??= null;
      } else if (this.target.__name === 'favorites') {
        row.id = databaseState.nextFavoriteId++;
        row.created_at = now;
      } else if (this.target.__name === 'notifications') {
        row.id = databaseState.nextNotificationId++;
        row.created_at = now;
        row.read_at ??= null;
      } else if (this.target.__name === 'notification_email_preferences') {
        row.user_id ??= values.user_id;
        row.updated_at = now;
        row.listing_status ??= true;
        row.listing_price ??= true;
        row.listing_details ??= true;
      } else if (this.target.__name === 'moderation_reports') {
        row.id = databaseState.nextReportId++;
        row.created_at = now;
        row.updated_at = now;
        row.status ??= 'pending';
      } else if (this.target.__name === 'admin_audit_logs') {
        row.id = databaseState.nextAuditId++;
        row.created_at = now;
      } else {
        row.created_at = now;
        row.consumed_at ??= null;
        row.revoked_at ??= null;
      }
      rows.push(row);
      inserted.push(row);
    }
    if (!this.projection) return undefined;
    return inserted.map(row =>
      project(this.projection, { [this.target.__name]: row }, row)
    );
  }

  executeUpdate() {
    const rows = tableRows(this.target);
    const updated = [];
    for (const row of rows) {
      const rowSet = { [this.target.__name]: row };
      if (this.join) rowSet[this.join.target.__name] = this.join.row;
      if (!matches(this.expression, rowSet)) continue;
      const values = Object.fromEntries(
        Object.entries(this.valuesToSet).map(([field, value]) => {
          if (value?.__sql === 'now()') return [field, new Date()];
          if (value?.__sql?.includes('now() + ? * interval \'1 millisecond\'')) {
            return [field, new Date(Date.now() + Number(value.values[0]))];
          }
          return [field, value];
        })
      );
      Object.assign(row, values);
      updated.push(project(this.projection, rowSet, row));
    }
    return this.projection ? updated : undefined;
  }

  executeDelete() {
    const rows = tableRows(this.target);
    const removed = [];
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      const row = rows[index];
      if (!matches(this.expression, { [this.target.__name]: row })) continue;
      rows.splice(index, 1);
      removed.unshift(
        project(this.projection, { [this.target.__name]: row }, row)
      );
    }
    return this.projection ? removed : undefined;
  }
}

export const db = {
  select: projection => new Query('select', projection),
  insert: target => new Query('insert', null, target),
  update: target => new Query('update', null, target),
  delete: target => new Query('delete', null, target),
  execute: async statement => {
    const authMarker = statement.__sql?.match(/auth:([a-z-]+)/)?.[1];
    if (authMarker === 'verify-email' || authMarker === 'reset-password') {
      const error = databaseState.failNext;
      const shouldFail =
        error &&
        (!databaseState.failOn ||
          (authMarker === 'verify-email' &&
            databaseState.failOn.table === 'users' &&
            databaseState.failOn.operation === 'update') ||
          (authMarker === 'reset-password' &&
            databaseState.failOn.table === 'auth_sessions' &&
            databaseState.failOn.operation === 'update'));
      if (shouldFail) {
        databaseState.failNext = null;
        databaseState.failOn = null;
        throw error;
      }
      const [tokenHash, passwordHash] = statement.values;
      const type =
        authMarker === 'verify-email' ? 'email_verification' : 'password_reset';
      const token = databaseState.auth_tokens.find(
        row =>
          row.token_hash === tokenHash &&
          row.type === type &&
          row.consumed_at == null &&
          row.expires_at > new Date()
      );
      if (!token) return [];
      const user = databaseState.users.find(row => row.id === token.user_id);
      if (!user) return [];
      token.consumed_at = new Date();
      if (authMarker === 'verify-email') {
        user.email_verified = true;
        user.updated_at = new Date();
        for (const session of databaseState.auth_sessions.filter(
          row => row.user_id === user.id && row.revoked_at == null
        ))
          session.revoked_at = new Date();
      } else {
        user.password = passwordHash;
        user.updated_at = new Date();
        for (const session of databaseState.auth_sessions.filter(
          row => row.user_id === user.id && row.revoked_at == null
        ))
          session.revoked_at = new Date();
      }
      return [{ id: user.id }];
    }
    const marker = statement.__sql?.match(/phase7:([a-z-]+)/)?.[1];
    if (!marker)
      throw new Error(
        'Mock database received an unsupported raw SQL statement'
      );
    if (
      !statement.__sql.includes('INSERT INTO admin_audit_logs') ||
      (marker === 'session-revoke'
        ? !statement.__sql.includes('EXISTS (SELECT 1 FROM changed)')
        : !statement.__sql.includes('FROM changed'))
    ) {
      throw new Error(
        'Phase 7 audit insert must be sourced from the conditional update CTE'
      );
    }
    const payload = JSON.parse(statement.values[0]);
    const targetTable = marker.startsWith('user-')
      ? 'users'
      : marker.startsWith('listing-')
        ? 'business_listings'
        : marker === 'report-status'
          ? 'moderation_reports'
          : 'auth_sessions';
    const targetId = payload.targetId ?? payload.id;
    if (
      databaseState.staleNext?.table === targetTable &&
      (databaseState.staleNext.id === targetId ||
        databaseState.staleNext.anyTarget)
    ) {
      const selectedRow = databaseState[targetTable].find(
        row => row.id === databaseState.staleNext.id
      );
      if (selectedRow)
        Object.assign(selectedRow, databaseState.staleNext.patch);
      databaseState.staleNext = null;
    }
    const fault =
      databaseState.failNext &&
      (!databaseState.failOn ||
        (databaseState.failOn.table === 'admin_audit_logs' &&
          databaseState.failOn.operation === 'insert') ||
        (databaseState.failOn.table === targetTable &&
          databaseState.failOn.operation === 'update'));
    if (fault) {
      const error = databaseState.failNext;
      databaseState.failNext = null;
      databaseState.failOn = null;
      throw error;
    }
    const insertAudit = ({
      action,
      targetType,
      id,
      reason,
      before,
      after,
      actorId,
      requestId,
    }) => {
      const row = {
        actor_id: actorId,
        action,
        target_type: targetType,
        target_id: String(id),
        reason,
        before_state: before,
        after_state: after,
        request_id: requestId,
        created_at: new Date(),
        id: databaseState.nextAuditId++,
      };
      databaseState.admin_audit_logs.push(row);
      return row.id;
    };
    if (marker === 'user-status') {
      const user = databaseState.users.find(row => row.id === payload.targetId);
      if (
        !user ||
        user.is_active !== payload.expectedIsActive ||
        user.role !== payload.before.role
      )
        return [];
      if (
        user.role === 'admin' &&
        user.is_active &&
        !payload.active &&
        databaseState.users.filter(row => row.role === 'admin' && row.is_active)
          .length <= 1
      )
        return [];
      user.is_active = payload.active;
      user.suspension_reason = payload.active ? null : payload.reason;
      user.suspended_at = payload.active ? null : new Date();
      user.suspended_by = payload.active ? null : payload.actorId;
      user.updated_at = new Date();
      if (!payload.active)
        for (const session of databaseState.auth_sessions.filter(
          row => row.user_id === user.id && row.revoked_at == null
        ))
          session.revoked_at = new Date();
      const after = { id: user.id, role: user.role, isActive: user.is_active };
      const auditId = insertAudit({
        actorId: payload.actorId,
        action: payload.action,
        targetType: 'user',
        id: user.id,
        reason: payload.reason,
        before: payload.before,
        after,
        requestId: payload.requestId,
      });
      return [
        { id: user.id, role: user.role, isActive: user.is_active, auditId },
      ];
    }
    if (marker === 'user-role') {
      const user = databaseState.users.find(row => row.id === payload.targetId);
      if (
        !user ||
        user.role !== payload.expectedRole ||
        user.is_active !== payload.expectedIsActive
      )
        return [];
      if (
        user.role === 'admin' &&
        user.is_active &&
        payload.role !== 'admin' &&
        databaseState.users.filter(row => row.role === 'admin' && row.is_active)
          .length <= 1
      )
        return [];
      user.role = payload.role;
      user.updated_at = new Date();
      for (const session of databaseState.auth_sessions.filter(
        row => row.user_id === user.id && row.revoked_at == null
      ))
        session.revoked_at = new Date();
      const after = { id: user.id, role: user.role, isActive: user.is_active };
      const auditId = insertAudit({
        actorId: payload.actorId,
        action: payload.action,
        targetType: payload.targetType,
        id: user.id,
        reason: payload.reason,
        before: payload.before,
        after,
        requestId: payload.requestId,
      });
      return [{ id: user.id, role: user.role, auditId }];
    }
    if (marker === 'session-revoke') {
      const sessions = databaseState.auth_sessions.filter(
        row => row.user_id === payload.targetId && row.revoked_at == null
      );
      for (const session of sessions) session.revoked_at = new Date();
      if (sessions.length)
        insertAudit({
          actorId: payload.actorId,
          action: 'user.sessions_revoked',
          targetType: 'user',
          id: payload.targetId,
          reason: payload.reason,
          before: { activeSessions: sessions.length },
          after: { activeSessions: 0 },
          requestId: payload.requestId,
        });
      return [
        { revokedCount: sessions.length, auditCount: sessions.length ? 1 : 0 },
      ];
    }
    if (marker === 'listing-moderation' || marker === 'listing-availability') {
      const listing = databaseState.business_listings.find(
        row => row.id === payload.id
      );
      if (
        !listing ||
        listing.status !== payload.expectedStatus ||
        listing.moderated_by !== payload.before.moderatedBy
      )
        return [];
      listing.status = payload.status;
      listing.moderation_reason = payload.reason;
      listing.moderated_by = payload.actorId;
      listing.moderated_at = new Date();
      listing.updated_at = new Date();
      if (marker === 'listing-moderation') {
        listing.published_at =
          payload.status === 'published' ? new Date() : null;
        listing.rejection_reason =
          payload.status === 'rejected' ? payload.reason : null;
      } else {
        listing.suspended_by =
          payload.status === 'suspended' ? payload.actorId : null;
        listing.suspended_at =
          payload.status === 'suspended' ? new Date() : null;
        if (payload.status === 'published') listing.published_at = new Date();
      }
      const after = {
        status: listing.status,
        moderatedBy: listing.moderated_by,
      };
      const auditId = insertAudit({
        actorId: payload.actorId,
        action: payload.action ?? payload.eventType,
        targetType: 'listing',
        id: listing.id,
        reason: payload.reason,
        before: payload.before,
        after,
        requestId: payload.requestId,
      });
      return [
        {
          id: listing.id,
          status: listing.status,
          title: listing.title,
          publishedAt: listing.published_at,
          rejectionReason: listing.rejection_reason,
          moderationReason: listing.moderation_reason,
          moderatedBy: listing.moderated_by,
          moderatedAt: listing.moderated_at,
          auditId,
        },
      ];
    }
    if (marker === 'report-status') {
      const report = databaseState.moderation_reports.find(
        row => row.id === payload.id
      );
      if (
        !report ||
        report.status !== payload.expectedStatus ||
        (report.assigned_to ?? null) !== (payload.before.assignedTo ?? null) ||
        (report.resolved_by ?? null) !== (payload.before.resolvedBy ?? null)
      )
        return [];
      report.status = payload.status;
      report.moderator_notes = payload.moderatorNotes ?? null;
      report.resolution_reason = ['resolved', 'dismissed'].includes(
        payload.status
      )
        ? payload.reason
        : null;
      report.assigned_to = payload.actorId;
      report.resolved_by = ['resolved', 'dismissed'].includes(payload.status)
        ? payload.actorId
        : null;
      report.resolved_at = report.resolved_by ? new Date() : null;
      report.updated_at = new Date();
      const after = {
        status: report.status,
        assignedTo: report.assigned_to,
        resolvedBy: report.resolved_by,
      };
      const auditId = insertAudit({
        actorId: payload.actorId,
        action: `report.${report.status}`,
        targetType: 'report',
        id: report.id,
        reason: payload.reason,
        before: payload.before,
        after,
        requestId: payload.requestId,
      });
      return [
        {
          id: report.id,
          status: report.status,
          assignedTo: report.assigned_to,
          resolvedBy: report.resolved_by,
          resolvedAt: report.resolved_at,
          auditId,
        },
      ];
    }
    throw new Error(`Unknown Phase 7 mock statement ${marker}`);
  },
  batch: async operations => {
    databaseState.batchCalls += 1;
    const snapshot = Object.fromEntries(
      Object.entries(databaseState).map(([key, value]) => [
        key,
        Array.isArray(value)
          ? value.map(row =>
            Object.fromEntries(
              Object.entries(row).map(([field, fieldValue]) => [
                field,
                fieldValue instanceof Date
                  ? new Date(fieldValue)
                  : fieldValue,
              ])
            )
          )
          : value,
      ])
    );
    try {
      return operations.map(operation => operation.execute());
    } catch (error) {
      const failedBatch = databaseState.failNext;
      for (const key of Object.keys(databaseState)) {
        if (Array.isArray(databaseState[key])) {
          databaseState[key].splice(
            0,
            databaseState[key].length,
            ...snapshot[key]
          );
        } else {
          databaseState[key] = snapshot[key];
        }
      }
      if (failedBatch) {
        databaseState.failNext = null;
        databaseState.failOn = null;
      }
      throw error;
    }
  },
};
