import { contentFileSchema, type ContentQuestion } from "@sysdojo/shared";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

/**
 * Load and validate every YAML question file under `${contentDir}/questions`.
 * Fails fast on schema violations or duplicate ids so bad content never
 * reaches users.
 */
export function loadQuestions(contentDir: string): ContentQuestion[] {
  const dir = join(contentDir, "questions");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .sort();

  const questions: ContentQuestion[] = [];
  for (const file of files) {
    const rawFile = parse(readFileSync(join(dir, file), "utf8"));
    const parsedRawFile = contentFileSchema.safeParse(rawFile);
    if (!parsedRawFile.success) {
      throw new Error(`invalid content in ${file}: ${parsedRawFile.error.message}`);
    }
    const fromFile = "questions" in parsedRawFile.data ? parsedRawFile.data.questions : [parsedRawFile.data];
    questions.push(...fromFile);
  }

  const seen = new Set<string>();
  for (const q of questions) {
    if (seen.has(q.id)) throw new Error(`duplicate question id: ${q.id}`);
    seen.add(q.id);
  }

  // Deterministic order so daily selection is stable across restarts.
  return questions.sort((a, b) => a.id.localeCompare(b.id));
}
