// scripts/migrations/0001-init-migrations-collection.mjs
// First migration: ensure the _migrations collection exists with an index.
// This is a no-op for older tenants because insertOne in the runner already
// creates it implicitly, but having an explicit migration anchors the chain.

export const id = "0001";
export const description = "Initialize _migrations collection";

export async function up(conn) {
  const exists = await conn.db
    .listCollections({ name: "_migrations" })
    .hasNext();
  if (!exists) {
    await conn.db.createCollection("_migrations");
  }
  // _id is already unique; no extra index needed. This migration is a marker.
}

export async function down(conn) {
  // Intentionally no-op. We never drop the migrations collection.
}
