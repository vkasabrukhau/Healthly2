import { MongoClient, Db, Collection } from "mongodb";
import { useRuntimeConfig } from "#imports";

type GlobalWithMongo = typeof globalThis & {
  _mongoClientPromise?: Promise<MongoClient>;
};

const globalWithMongo = globalThis as GlobalWithMongo;

async function getMongoClient(): Promise<MongoClient> {
  const config = useRuntimeConfig();
  const uri = config.mongoUri as string | undefined;

  if (!uri) {
    throw new Error(
      "Mongo connection string missing. Set MONGODB_URI or MONGO_URI in your environment."
    );
  }

  if (!globalWithMongo._mongoClientPromise) {
    globalWithMongo._mongoClientPromise = MongoClient.connect(uri, {
      maxPoolSize: 10,
    });
  }

  return globalWithMongo._mongoClientPromise;
}

export async function getDb(): Promise<Db> {
  const config = useRuntimeConfig();
  const dbName = (config.mongoDbName as string | undefined) || "healthly";
  const client = await getMongoClient();
  return client.db(dbName);
}

export async function getCollection<TSchema = any>(
  name: string
): Promise<Collection<TSchema>> {
  const db = await getDb();
  return db.collection<TSchema>(name);
}
