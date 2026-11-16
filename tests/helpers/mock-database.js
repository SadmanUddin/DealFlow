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
    'asking_price',
    'annual_revenue',
    'ebitda',
    'currency',
    'status',
    'rejection_reason',
    'published_at',
    'created_at',
    'updated_at',
  ]),
  conversations: table('conversations', [
    'id',
    'listing_id',
    'buyer_id',
    'seller_id',
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
};

export const databaseState = {
  users: [],
  auth_sessions: [],
  auth_tokens: [],
  business_listings: [],
  conversations: [],
  messages: [],
  nextUserId: 1,
  nextListingId: 1,
  nextConversationId: 1,
  nextMessageId: 1,
  failNext: null,
};

export const resetDatabase = () => {
  databaseState.users.length = 0;
  databaseState.auth_sessions.length = 0;
  databaseState.auth_tokens.length = 0;
  databaseState.business_listings.length = 0;
  databaseState.conversations.length = 0;
  databaseState.messages.length = 0;
  databaseState.nextUserId = 1;
  databaseState.nextListingId = 1;
  databaseState.nextConversationId = 1;
  databaseState.nextMessageId = 1;
  databaseState.failNext = null;
};

const condition = (operator, column, value) => ({ operator, column, value });
export const drizzleOperators = {
  eq: (column, value) => condition('eq', column, value),
  gt: (column, value) => condition('gt', column, value),
  ne: (column, value) => condition('ne', column, value),
  exists: query => ({ operator: 'exists', query }),
  gte: (column, value) => condition('gte', column, value),
  lte: (column, value) => condition('lte', column, value),
  ilike: (column, value) => condition('ilike', column, value),
  isNull: column => condition('isNull', column),
  and: (...conditions) => ({ operator: 'and', conditions }),
  or: (...conditions) => ({ operator: 'or', conditions }),
  desc: column => ({ operator: 'desc', column }),
  asc: column => ({ operator: 'asc', column }),
  sql: (strings, ...values) => ({ __sql: strings.join('?'), values }),
};

const tableRows = target => databaseState[target.__name];

const valueFor = (rowSet, column) => rowSet[column.table]?.[column.field];

const matches = (expression, rowSet) => {
  if (!expression) return true;
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
  return Object.fromEntries(
    Object.entries(projection).map(([alias, column]) => [
      alias,
      column?.__sql ? column.values?.[0] : valueFor(rowSet, column),
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
    this.join = { target, on };
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

  onConflictDoNothing() {
    this.ignoreConflict = true;
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
    if (databaseState.failNext) {
      const error = databaseState.failNext;
      databaseState.failNext = null;
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
    if (this.join) {
      rowSets = rowSets.flatMap(rowSet =>
        tableRows(this.join.target)
          .map(joined => ({
            ...rowSet,
            [this.join.target.__name]: joined,
          }))
          .filter(joined => matches(this.join.on, joined))
      );
    }
    const matching = rowSets.filter(rowSet => matches(this.expression, rowSet));
    for (const order of [...(this.ordering ?? [])].reverse()) {
      matching.sort((left, right) => {
        const a = valueFor(left, order.column);
        const b = valueFor(right, order.column);
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
        return order.operator === 'desc' ? -comparison : comparison;
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
      if (
        this.ignoreConflict &&
        this.target.__name === 'conversations' &&
        rows.some(
          row =>
            row.listing_id === values.listing_id &&
            row.buyer_id === values.buyer_id
        )
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
      } else if (this.target.__name === 'messages') {
        row.id = databaseState.nextMessageId++;
        row.created_at = now;
        row.read_at ??= null;
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
      Object.assign(row, this.valuesToSet);
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
};
