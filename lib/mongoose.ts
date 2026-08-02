import mongoose, { Connection } from "mongoose";

const TENANT_DB = process.env.TENANT_DB!;
if (!TENANT_DB) throw new Error("TENANT_DB missing");
const BASE_URI = process.env.MONGODB_URI!;
if (!BASE_URI) throw new Error("MONGODB_URI missing");

let cachedConn: Connection | null = null;

export async function mongooseConnect(): Promise<Connection> {
  if (cachedConn) return cachedConn;

  const clusterConn = await mongoose.createConnection(BASE_URI, {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 30000,
  }).asPromise();

  const tenantConn = clusterConn.useDb(TENANT_DB, { useCache: true });

  if (!tenantConn.db) {
    throw new Error(`Failed to initialize database: ${TENANT_DB}`);
  }

  const collections = await tenantConn.db.listCollections().toArray();

  if (!collections) {
    throw new Error(`Unable to list collections for database: ${TENANT_DB}`);
  }

  if (collections.length === 0) {
    const result = await tenantConn.db.createCollection("init_collection");
    if (!result) {
      throw new Error(`Failed to create initial collection in ${TENANT_DB}`);
    }
    console.log(`Created initial collection in ${TENANT_DB}`);
  }

  const testColl = tenantConn.db.collection("init_collection");
  try {
    await testColl.insertOne({ sanityCheck: true });
    await testColl.deleteOne({ sanityCheck: true });
  } catch (err) {
    throw new Error(`Database integrity check failed for ${TENANT_DB}: ${err}`);
  }

  cachedConn = tenantConn;
  console.log(`Mongo connected → ${TENANT_DB}`);
  return tenantConn;
}
