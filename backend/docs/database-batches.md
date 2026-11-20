# Database batch operations

DealFlow uses Drizzle ORM with Neon Serverless HTTP. For a set of predefined,
typed Drizzle query operations that must succeed together, pass the operations
to `executeDatabaseBatch` from `src/services/database-batch.service.js`:

```js
const [listingRows, notificationRows] = await executeDatabaseBatch([
  db.insert(businessListings).values(listing).returning(),
  db.insert(notifications).values(notification).returning(),
]);
```

Build every operation before calling the helper. Drizzle's
`NeonHttpDatabase.batch()` prepares each query and delegates the set to Neon
Serverless's `sql.transaction()` API. Neon documents that API as a single,
non-interactive transaction. A database error rejects the batch; PostgreSQL
transaction semantics roll back the operations in that batch. The returned
array maps each operation to its result, in input order.

Batch operations can use values already known when constructing the queries.
They cannot take a result returned by one query and use it to construct a later
query in JavaScript: the whole query set is prepared before submission. Use a
single SQL statement/CTE for SQL-level dependencies or redesign the write so
needed IDs are known before submission.

Neon HTTP does not provide interactive Drizzle transactions: the installed
Drizzle session's `db.transaction(callback)` throws. Batch also cannot keep a
transaction open across later application work. A lost HTTP response can leave
the client uncertain whether the server committed; retryable operations should
therefore use idempotency constraints or keys. For interactive transactions,
session-level locks, or result-driven multi-step logic, this driver is
insufficient; that requirement needs an explicitly approved architecture
change. Do not emulate it with sequential requests or a JavaScript wrapper.

Use batching when a fixed group of independent or pre-parameterized reads and
writes must commit as one unit, such as creating related records with known
foreign keys. A single ordinary query remains preferable for one operation.
