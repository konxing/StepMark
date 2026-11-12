/**
 * Research-only, read-only safety boundary between AI-extracted chat claims
 * and habit opportunity evidence. No DB writes, model calls or scoring.
 *
 * An AI proposal NEVER becomes a user self-report merely because a quote is
 * present. The quote/role/tenant checks protect provenance, not truth.
 */
import type {TriState,HabitOpportunityInitiationLevel} from "./habit-opportunity-evidence.ts";

export interface HabitChatMessage {
  id:string;
  authorUserId:string;
  role:"user"|"assistant"|"system"|"tool";
  text:string;
  sentAtMs:number;
}
export interface OwnedHabit {
  id:string;
  ownerUserId:string;
  /** Exact habit name or a user-configured alias must appear in the quote. */
  name:string;
  aliases?:readonly string[];
}
export interface AiHabitClaim {
  targetHabitId:string;
  sourceMessageId:string;
  /** UTF-16 offsets into the *actual user's* message; no reconstructed text. */
  start:number;
  end:number;
  exactQuote:string;
  cueEncountered:TriState;
  eligibleOpportunity:TriState;
  performed:TriState;
  /** AI-deduced 0-4 ratings remain provisional, not a self-report scale. */
  proposedInitiationLevel:HabitOpportunityInitiationLevel|null;
}
export type HabitClaimRejection =
  | "invalid_scoped_input"
  | "not_user_authored"
  | "wrong_owner"
  | "wrong_habit"
  | "unverifiable_quote"
  | "habit_not_anchored"
  | "invalid_measurement";
export interface ProvisionalHabitClaim {
  kind:"provisional_only";
  source:"ai_interpretation";
  ownerUserId:string;
  habitId:string;
  messageId:string;
  quotedText:string;
  quoteStart:number;
  quoteEnd:number;
  /** Message timestamp is NOT the date the habit happened. */
  sourceMessageAtMs:number;
  observedEventAtMs:null;
  cueEncountered:TriState;
  eligibleOpportunity:TriState;
  performed:TriState;
  proposedInitiationLevel:HabitOpportunityInitiationLevel|null;
  requiresEventTimeResolution:true;
  /** Never eligible for direct writes, execution rate or habit progression. */
  userReportConfirmed:false;
  cautionFlags:readonly ("prospective_or_conditional"|"negation_conflict"|"third_party_statement")[];
}
export type HabitClaimPreparation =
 | {accepted:false;reason:HabitClaimRejection}
 | {accepted:true;candidate:ProvisionalHabitClaim};

const keyPattern=/^[A-Za-z0-9_.:-]{1,128}$/;
const isKey=(v:unknown):v is string=>typeof v==="string"&&keyPattern.test(v);
const tri=(v:unknown):v is TriState=>v===true||v===false||v===null;
const rating=(v:unknown):v is HabitOpportunityInitiationLevel|null=>v===null ||
 (typeof v==="number"&&Number.isInteger(v)&&v>=0&&v<=4);
const validName=(v:unknown):v is string=>
 typeof v==="string"&&v.length>=1&&v.length<=100&&v.trim().length>0;
function normalized(s:string):string{return s.trim().toLocaleLowerCase("en");}
/**
 * Only checks that a model proposal is grounded in one concrete user message.
 * The accepted candidate is provisional; it intentionally has NO event time.
 *
 * Future NLP/LLM integrations should pass the authenticated current owner
 * and the server-selected habit here, never let the model choose owner scope.
 */
export function prepareAiHabitChatClaim(
  authenticatedOwnerId:string,
  habit:OwnedHabit,
  message:HabitChatMessage,
  claim:AiHabitClaim
):HabitClaimPreparation {
  if(!isKey(authenticatedOwnerId)||!isKey(habit?.id)||
     !validName(habit?.name)||!isKey(habit?.ownerUserId)||
     !Array.isArray(habit.aliases??[]) ||
     (habit.aliases??[]).length>16||
     !(habit.aliases??[]).every(validName)||
     !isKey(message?.id)||!isKey(message?.authorUserId)||
     typeof message.text!=="string"||message.text.length>8000||
     !Number.isSafeInteger(message.sentAtMs)||message.sentAtMs<0)
    return {accepted:false,reason:"invalid_scoped_input"};
  if(message.role!=="user")
    return {accepted:false,reason:"not_user_authored"};
  if(authenticatedOwnerId!==habit.ownerUserId ||
     authenticatedOwnerId!==message.authorUserId)
    return {accepted:false,reason:"wrong_owner"};
  if(claim?.targetHabitId!==habit.id||claim?.sourceMessageId!==message.id)
    return {accepted:false,reason:"wrong_habit"};
  if(!Number.isSafeInteger(claim.start)||!Number.isSafeInteger(claim.end)||
     claim.start<0||claim.end>message.text.length||claim.start>=claim.end||
     claim.end-claim.start>500||claim.end-claim.start<3||
     typeof claim.exactQuote!=="string"||
     message.text.slice(claim.start,claim.end)!==claim.exactQuote)
    return {accepted:false,reason:"unverifiable_quote"};
  const quote=claim.exactQuote;
  if(![habit.name,...(habit.aliases??[])].some(name=>
    normalized(quote).includes(normalized(name))))
    return {accepted:false,reason:"habit_not_anchored"};
  if(!tri(claim.cueEncountered)||!tri(claim.eligibleOpportunity)||
     !tri(claim.performed)||!rating(claim.proposedInitiationLevel)||
     (claim.proposedInitiationLevel!==null&&claim.performed!==true)||
     (claim.eligibleOpportunity===false&&claim.performed===true))
    return {accepted:false,reason:"invalid_measurement"};

  // Flags are warnings, not reliable natural-language understanding:
  // conservative checks require an actual time and human-evidence pathway.
  const flags:ProvisionalHabitClaim["cautionFlags"][number][]=[];
  if(/明天|下周|打算|计划|希望|如果|假如|假设|可能|想要|准备|tomorrow|next week|planning|plan to|if i |if we |might |would |hope to/i.test(quote))
    flags.push("prospective_or_conditional");
  if(claim.performed===true &&
     /没做|没去|没有做|还没|未完成|没开始|没练|didn't|did not|haven't|have not|not done|never did/i.test(quote))
    flags.push("negation_conflict");
  if(/他说|她说|他做了|她做了|朋友|同事|they did|he did|she did|my friend/i.test(quote))
    flags.push("third_party_statement");

  return {accepted:true,candidate:{
    kind:"provisional_only",source:"ai_interpretation",
    ownerUserId:authenticatedOwnerId,habitId:habit.id,
    messageId:message.id,quotedText:quote,
    quoteStart:claim.start,quoteEnd:claim.end,
    sourceMessageAtMs:message.sentAtMs,observedEventAtMs:null,
    cueEncountered:claim.cueEncountered,
    eligibleOpportunity:claim.eligibleOpportunity,
    performed:claim.performed,
    proposedInitiationLevel:claim.proposedInitiationLevel,
    requiresEventTimeResolution:true,userReportConfirmed:false,
    cautionFlags:flags
  }};
}
