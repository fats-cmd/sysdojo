import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadQuestions } from "../src/content/load";

const contentDir = fileURLToPath(new URL("../../../content", import.meta.url));

describe("content pack", () => {
  it("loads, validates, and contains a usable pool", () => {
    const questions = loadQuestions(contentDir);
    expect(questions.length).toBeGreaterThanOrEqual(10);
    for (const q of questions) {
      expect(q.answerIndex).toBeLessThan(q.choices.length);
    }
  });

  it("has unique ids", () => {
    const questions = loadQuestions(contentDir);
    const ids = new Set(questions.map((q) => q.id));
    expect(ids.size).toBe(questions.length);
  });
});
