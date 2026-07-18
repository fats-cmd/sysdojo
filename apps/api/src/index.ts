import { fileURLToPath } from "node:url";
import { FakeAuthAdapter } from "./auth/adapter";
import { loadQuestions } from "./content/load";
import { syncQuestions } from "./content/sync";
import { createApp } from "./server";
import { MemoryStore } from "./store/memory-store";
import { createPrismaClient, PrismaStore } from "./store/prisma-store";
import type { Store } from "./store/store";

const port = Number(process.env.PORT ?? 3000);
const jwtSecret = process.env.JWT_SECRET ?? "dev-secret-change-me";
const contentDir =
  process.env.CONTENT_DIR ?? fileURLToPath(new URL("../../../content", import.meta.url));

const questions = loadQuestions(contentDir);

// DATABASE_URL selects Postgres persistence; without it the API falls back
// to the in-memory dev store (data resets on restart).
const databaseUrl = process.env.DATABASE_URL;
let store: Store;
if (databaseUrl) {
  const db = createPrismaClient(databaseUrl);
  await syncQuestions(db, questions);
  store = new PrismaStore(db);
} else {
  store = new MemoryStore();
}

const app = createApp({
  store,
  questions,
  authAdapter: new FakeAuthAdapter(),
  jwtSecret,
});

app.listen(port, () => {
  console.log(
    `sysdojo api listening on :${port} with ${questions.length} questions ` +
      `(${databaseUrl ? "postgres" : "in-memory"} store)`,
  );
});
