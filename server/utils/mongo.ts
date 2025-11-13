import { MongoClient, Db, Collection, Document } from "mongodb";
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

  // Sanitize and validate the connection URI.
  // Trim whitespace (common cause of silent failures when copying from env files)
  let connectUri = uri.trim();

  // If using mongodb+srv, the connection string must not include a port.
  // Some environments accidentally include a port; detect and remove it
  // automatically to avoid runtime failures. This regex handles both
  // forms with and without credentials (e.g. user:pass@host:27017).
  if (connectUri.startsWith("mongodb+srv://")) {
    const orig = connectUri;
    // Replace host:port right after the protocol (and optional userinfo@)
    // Examples handled:
    // - mongodb+srv://host:27017/db
    // - mongodb+srv://user:pass@host:27017/db
    // - mongodb+srv://user@host:27017
    connectUri = connectUri.replace(
      /(mongodb\+srv:\/\/(?:[^@\/]+@)?)([^\/ :]+):\d+(?=(?:\/|$))/,
      "$1$2"
    );

    // If replacement changed the URI, log the sanitization (dev only)
    if (connectUri !== orig && process.dev) {
      // eslint-disable-next-line no-console
      console.warn(
        "Sanitized mongodb+srv URI by removing port number for SRV connection (ports not allowed for +srv):",
        { original: orig, sanitized: connectUri }
      );
    }

    // Quick sanity: ensure there's a host after the protocol (and optional userinfo)
    // e.g. mongodb+srv://username:pass@host
    const hostCheck = connectUri.match(
      /mongodb\+srv:\/\/(?:[^@\/]+@)?([^\/]+)/
    );
    if (!hostCheck || !hostCheck[1]) {
      throw new Error(
        `Mongo connection string appears malformed after sanitization: "${connectUri}". ` +
          "Ensure you set MONGO_URI or MONGODB_URI and that it includes a host (e.g. 'mongodb+srv://user:pass@cluster.example.net/db')."
      );
    }
  }

  if (!globalWithMongo._mongoClientPromise) {
    globalWithMongo._mongoClientPromise = MongoClient.connect(connectUri, {
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

export async function getCollection<TSchema extends Document = Document>(
  name: string
): Promise<Collection<TSchema>> {
  const db = await getDb();
  return db.collection<TSchema>(name);
}
