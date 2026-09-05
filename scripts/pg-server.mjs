import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import path from "path";
import fs from "fs";

const dataDir = path.resolve(process.cwd(), ".pglite_data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

console.log("Initializing PGlite with dataDir:", dataDir);
const db = new PGlite(dataDir);
await db.waitReady;

const server = new PGLiteSocketServer({
  db,
  port: 5432,
  host: "127.0.0.1",
  maxConnections: 100,
  debug: true,
});

await server.start();
console.log("PGlite Postgres server listening on 127.0.0.1:5432 (maxConnections: 100)");

process.on("SIGINT", async () => {
  console.log("Shutting down PGlite...");
  await server.stop();
  await db.close();
  process.exit(0);
});
