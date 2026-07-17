import { z } from "zod";

/**
 * Schema for a single question authored as YAML in content/questions/.
 * Content is data: the API validates and seeds these at startup; question
 * text must never be hardcoded in app code.
 */
export const contentQuestionSchema = z.object({
  /** Stable slug, unique across the content pack. */
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "id must be a kebab-case slug"),
  topic: z.string().min(1),
  /** 1 = fundamentals, 2 = intermediate, 3 = advanced. Drives XP. */
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  prompt: z.string().min(1),
  choices: z.array(z.string().min(1)).min(2).max(6),
  answerIndex: z.number().int().nonnegative(),
  explanation: z.string().min(1),
}).superRefine((q, ctx) => {
  if (q.answerIndex >= q.choices.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `answerIndex ${q.answerIndex} out of range for ${q.choices.length} choices`,
      path: ["answerIndex"],
    });
  }
});

export type ContentQuestion = z.infer<typeof contentQuestionSchema>;

/** A content file may hold one question or a list under `questions:`. */
export const contentFileSchema = z.union([
  contentQuestionSchema,
  z.object({ questions: z.array(contentQuestionSchema).min(1) }),
]);

export type ContentFile = z.infer<typeof contentFileSchema>;
