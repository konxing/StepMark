/** Future merger seam: connect AI Chat Web using an identity mapping, not shared cookies. */
export type IdentityProvider = "local" | "wechat" | "aichat";
export interface AuthenticatedPrincipal {
  /** Stable StepMark-local user id, never a client-supplied query parameter. */
  userId: string;
  provider: IdentityProvider;
  providerSubject: string;
  scopes: readonly string[];
}
export interface IdentityResolver {
  resolve(request: Request): Promise<AuthenticatedPrincipal | null>;
}
export interface AssessmentEvaluationRequest {
  constructCode: string;
  taskVersion: string;
  rubricVersion: string;
  responseText: string;
}
export interface AssessmentEvaluationResult {
  provisional: true;
  dimensionLevels: Readonly<Record<string, 0 | 1 | 2 | 3 | 4>>;
  supportingEvidence: readonly string[];
  modelId: string;
  promptVersion: string;
  requiresReview: boolean;
}
export interface AIJudge {
  evaluate(request: AssessmentEvaluationRequest): Promise<AssessmentEvaluationResult>;
}
/** Untrusted model output cannot directly modify a validated ability estimate. */
export interface AssessmentRepository {
  saveProvisionalJudgement(principal: AuthenticatedPrincipal, request: AssessmentEvaluationRequest,
    output: AssessmentEvaluationResult): Promise<string>;
}
