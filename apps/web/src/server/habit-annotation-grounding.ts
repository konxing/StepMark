/** Conservative provenance checks, not a replacement for a validated habit scale. */
const sentenceBoundary=/[。！？!?；;\r\n]+|\.(?=\s|$)/u;
const clauseBoundary=/[，,。！？!?；;\r\n]+|\.(?=\s|$)/u;
const quotationPairs=new Map([["“","”"],["「","」"],["『","』"],['"','"']]);
const prospective=/(?:如果|假如|假设|例如|比如|明天|后天|下周|将来|打算|希望|准备(?:去|做|开始)|尚未|还(?:没|没有)|未曾)|\b(?:if|suppose|tomorrow|will|would|hope|plan to|going to)\b/iu;
const attributed=/(?:同事|朋友|家人|别人|他|她)(?:说|表示|提到|已经|每次|不用|看到|开始|能|会|很|总是|一|就)|(?:书里|书中|文中|示例中|例子里|举例|引用|转述|原文)|\b(?:he|she|they|my friend|my colleague)\b/iu;
const firstPerson=/(?:^|[\s，,：:])我(?:[^们]|$)|\bI\b/u;
const initiation=/(?:开始|启动|拿起|翻开|打开|动手|着手|迈出|起步|做起来|练起来|读起来)|(?:下意识|自然而然|不假思索)[^。！？!?]{0,12}(?:做|读|练|写|拿|翻|打)|\b(?:start|begin|initiat\w*)\b/iu;
const effort=/(?:抗拒|强迫|逼自己|纠结|犹豫|费劲|费力|挣扎|刻意|反复考虑|提醒)|\b(?:resist\w*|forc\w*|hesitat\w*|deliberat\w*|effort\w*|remind\w*)\b/iu;
const natural=/(?:自然|顺手|自发|下意识|不假思索|自动)|(?:不|无)(?:用|需|须|必|要)[^，,。！？!?]{0,8}(?:思考|考虑|提醒)|(?:没|没有)[^，,。！？!?]{0,5}(?:思考|考虑)|\b(?:automatic\w*|naturally|spontaneous\w*|without thinking)\b/iu;
const automatic=/(?:下意识|不假思索|自然而然|不经思考|自动就|自动开始)|(?:不|无)(?:用|需|须|必|要)[^，,。！？!?]{0,5}(?:思考|考虑)|(?:没|没有)[^，,。！？!?]{0,5}(?:思考|考虑)|\b(?:automatically|without (?:thinking|conscious|deliberation))\b/iu;
const negatedNatural=/(?:并?不是|并非|谈不上|算不上|做不到|还不能|不能|不再|并不|没有|没)\s*(?:做到)?(?:那么|这么|很|真的|真正|完全)?\s*(?:不用|无需|自然|自发|自动|下意识|不假思索|没(?:有)?(?:经过)?(?:思考|考虑))|\b(?:not|never|cannot)\s+(?:automatic\w*|natural\w*|spontaneous\w*)/iu;

function insideQuotation(text:string,offset:number){
  const endings:string[]=[];
  for(const character of text.slice(0,offset)){
    if(character===endings.at(-1)){endings.pop();continue;}
    const ending=quotationPairs.get(character);
    if(ending)endings.push(ending);
  }
  return endings.length>0;
}

export function groundedHabitInitiationQuote(note:string,quote:string,level:number):boolean{
  const start=note.indexOf(quote),end=start+quote.length;
  if(start<0||quote.length<3||note.indexOf(quote,start+1)>=0||insideQuotation(note,start)||
    quote.split(sentenceBoundary).filter(part=>part.trim()).length!==1||/[？?]/u.test(quote))return false;
  const before=note.slice(0,start),after=note.slice(end);
  const endsSentence=/[。.!！；;\r\n]\s*$/u.test(quote);
  const endsClause=endsSentence||/[，,]\s*$/u.test(quote);
  const prefix=before.split(clauseBoundary).at(-1)??"";
  const suffix=endsClause?"":after.split(clauseBoundary)[0]??"";
  const clause=prefix+quote+suffix;
  const sentencePrefix=before.split(sentenceBoundary).at(-1)??"";
  const sentence=sentencePrefix+quote+(endsSentence?"":after.split(sentenceBoundary)[0]??"");
  // A future/hypothetical setup before a comma still governs the quoted claim.
  if(prospective.test(sentencePrefix+quote+suffix)||attributed.test(clause)||
    /[？?]/u.test(note[end+suffix.length]??""))return false;
  // Diary wording may omit “I”. An explicitly attributed sentence needs a clear
  // first-person clause before it can support the writer's own experience.
  if(attributed.test(sentence)&&!firstPerson.test(clause))return false;
  if(!initiation.test(sentence))return false;
  const signal=(level<=2?effort:level===4?automatic:natural).exec(quote);
  if(!signal||insideQuotation(note,start+signal.index))return false;
  if(level>=3&&negatedNatural.test(clause))return false;
  return true;
}
