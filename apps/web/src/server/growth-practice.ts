import {z} from "zod";
import {growthDimensions,growthLimits,hasGrowthReview} from "@/lib/growth-practice";

function boundedText(limit:number,min=0){
  return z.string().trim().min(min).max(limit).refine(value=>!value.includes("\u0000"));
}

const planFields={
  dimension:z.enum(growthDimensions),
  title:boundedText(growthLimits.title),
  question:boundedText(growthLimits.question,2),
  nextAction:boundedText(growthLimits.nextAction,2),
  successCriteria:boundedText(growthLimits.successCriteria,2)
};

function withDisplayTitle<T extends {title:string;question:string}>(input:T):T{
  const firstLine=input.question.split(/\r\n?|\n/u,1)[0]?.trim()||input.question;
  return {...input,title:input.title||Array.from(firstLine).slice(0,80).join("")};
}

export const createGrowthPractice=z.object({...planFields,requestId:z.uuid()}).strict().transform(withDisplayTitle);
export const updateGrowthPractice=z.object({
  ...planFields,
  evidence:boundedText(growthLimits.evidence),
  reflection:boundedText(growthLimits.reflection),
  nextQuestion:boundedText(growthLimits.nextQuestion),
  revision:z.number().int().min(0).max(2147483646),
  complete:z.boolean()
}).strict().refine(input=>!input.complete||hasGrowthReview(input),{
  message:"Completing a practice requires observed evidence and a reflection"
}).transform(withDisplayTitle);

export const growthPracticeId=z.uuid();
export const growthPracticeSelect={
  id:true,dimension:true,title:true,question:true,nextAction:true,successCriteria:true,
  evidence:true,reflection:true,nextQuestion:true,revision:true,
  createdAt:true,updatedAt:true,completedAt:true
} as const;

export const growthAiInput=z.discriminatedUnion("mode",[
  z.strictObject({mode:z.literal("plan"),question:planFields.question,consentToAI:z.literal(true)}),
  z.strictObject({
    mode:z.literal("review"),question:planFields.question,nextAction:planFields.nextAction,
    successCriteria:planFields.successCriteria,evidence:boundedText(growthLimits.evidence,2),
    consentToAI:z.literal(true)
  })
]);

export const growthPlanDraft=z.object({
  dimension:planFields.dimension,
  title:boundedText(growthLimits.title,2),
  nextAction:planFields.nextAction,
  successCriteria:planFields.successCriteria
}).strict();

export const growthReviewDraft=z.object({
  reflection:boundedText(growthLimits.reflection,2),
  nextQuestion:boundedText(growthLimits.nextQuestion,2)
}).strict();
