import { z } from "zod";

export const apiVersion = "v1" as const;
export const evidenceKindSchema = z.enum(["objective", "rubric", "self_report", "ai_assisted"]);
export const observationSchema = z.object({
  habitId: z.uuid(),
  opportunityKey: z.string().min(1).max(100),
  eligible: z.boolean(),
  completed: z.boolean(),
  occurredAt: z.iso.datetime({offset:true}),
  /** Never accept personal location by default. */
  contextTag: z.string().max(80).optional()
}).strict();
export const automaticityCheckSchema = z.object({
  habitId: z.uuid(),
  /** Four 1-7 responses; validated local-language instrument TBD. */
  answers: z.tuple([z.int().min(1).max(7), z.int().min(1).max(7), z.int().min(1).max(7), z.int().min(1).max(7)]),
  instrumentVersion: z.string().min(1).max(40)
}).strict();
export const assessmentSubmissionSchema = z.object({
  constructCode: z.string().regex(/^[a-z][a-z0-9_.-]{2,63}$/),
  taskId: z.uuid(),
  taskVersion: z.string().max(40),
  /** Only transient evidence for now; raw media is not accepted by this contract. */
  responseText: z.string().min(1).max(10000).optional()
}).strict();
export type ObservationInput = z.infer<typeof observationSchema>;
export type AutomaticityCheckInput = z.infer<typeof automaticityCheckSchema>;
export type AssessmentSubmission = z.infer<typeof assessmentSubmissionSchema>;
