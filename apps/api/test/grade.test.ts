import { describe, expect, it } from "vitest";
import type { ContentQuestion } from "@sysdojo/shared";
import { grade } from "../src/game/grade";

const question: ContentQuestion = {
  id: "test-question",
  topic: "caching",
  difficulty: 1,
  prompt: "What is a cache?",
  choices: ["A fast lookaside store", "A database", "A queue"],
  answerIndex: 0,
  explanation: "A cache is a fast lookaside store.",
};

describe("grade", () => {
  it("marks the right choice correct and echoes the explanation", () => {
    expect(grade(question, 0)).toEqual({
      correct: true,
      correctChoiceIndex: 0,
      explanation: "A cache is a fast lookaside store.",
    });
  });

  it("marks other choices incorrect but still reveals the answer", () => {
    const result = grade(question, 2);
    expect(result.correct).toBe(false);
    expect(result.correctChoiceIndex).toBe(0);
  });
});
