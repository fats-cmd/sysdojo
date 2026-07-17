import type { ContentQuestion } from "@sysdojo/shared";

export interface GradeResult {
  correct: boolean;
  correctChoiceIndex: number;
  explanation: string;
}

export function grade(question: ContentQuestion, choiceIndex: number): GradeResult {
  return {
    correct: choiceIndex === question.answerIndex,
    correctChoiceIndex: question.answerIndex,
    explanation: question.explanation,
  };
}
