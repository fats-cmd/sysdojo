import { fileURLToPath } from "node:url";
import { FakeAuthAdapter } from "./auth/adapter";
import { loadQuestions } from "./content/load";
import { createApp } from "./server";
import { MemoryStore } from "./store/memory-store";

const port = Number(process.env.PORT ?? 3000);
const jwtSecret = process.env.JWT_SECRET ?? "dev-secret-change-me";
const contentDir =
  process.env.CONTENT_DIR ?? fileURLToPath(new URL("../../../content", import.meta.url));

const questions = loadQuestions(contentDir);

const app = createApp({
  store: new MemoryStore(),
  questions,
  authAdapter: new FakeAuthAdapter(),
  jwtSecret,
});

app.listen(port, () => {
  console.log(`sysdojo api listening on :${port} with ${questions.length} questions`);
});
