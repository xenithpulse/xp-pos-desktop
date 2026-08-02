# Migrations

Versioned, tracked, idempotent schema/data migrations for tenant DBs.

## Adding a migration

1. Create `NNNN-short-description.mjs` (next sequential 4-digit number).
2. Export `id`, `description`, `up(conn)`, optional `down(conn)`.
3. The migration MUST be **idempotent**: re-running it must not corrupt data
   (use `updateMany`, `$setOnInsert`, conditional `createIndex`, etc.).
4. Test it locally on a throwaway DB first.

```js
export const id = "0007";
export const description = "Add 'gstNumber' field to bookings";

export async function up(conn) {
  await conn.db.collection("bookings").updateMany(
    { gstNumber: { $exists: false } },
    { $set: { gstNumber: null } }
  );
}
```

## Running

```pwsh
# Status for current tenant (TENANT_DB from .env.local)
node --env-file=.env.local scripts/migrations/_runner.mjs status

# Apply all pending
node --env-file=.env.local scripts/migrations/_runner.mjs up

# Apply up to a specific id
node --env-file=.env.local scripts/migrations/_runner.mjs up --to 0005

# Override tenant
node --env-file=.env.local scripts/migrations/_runner.mjs --tenant chateau status

# Dry run (logs what would happen, applies nothing)
node --env-file=.env.local scripts/migrations/_runner.mjs up --dry-run
```

## State

State lives in each tenant DB in the `_migrations` collection:

```
{ _id: "0001", description, appliedAt, durationMs }
```

Never edit this collection by hand unless you know exactly why.

## Multi-tenant rollout (future)

Once you have a tenant registry, add a wrapper that loops over all tenants:

```pwsh
node scripts/tenant-cli.mjs migrate all
```

For now, run per tenant by setting `TENANT_DB` or passing `--tenant`.
