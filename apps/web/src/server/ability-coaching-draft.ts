import { z } from "zod";
import { logicSkills, type CoachingDraft, type CoachingSuggestion, type LogicSkill } from "@/lib/ability-coaching";
import { callAiJson, resolveAiProvider } from "./ai-gateway";

const text = (max: number) => z.string().trim().min(2).max(max).refine((value) => !value.includes("\u0000"));
// Pick only the fields we render or save. Provider metadata never becomes plan text.
const draftSchema = z.object({
  focus: z.enum(logicSkills),
  title: text(80),
  action: text(270),
  cue: text(100),
  minutes: z.number().int().min(3).max(15),
  minimumAction: text(90),
  successCriteria: text(100)
});

const templates = {
  conditional: {
    label: "条件推理",
    title: "练习用反例检查条件",
    cue: "完成当天第一段学习后",
    action: "选一句“如果 A 则 B”的描述，写出它的逆命题，再试着找一个能让逆命题失败的具体例子。",
    minimumAction: "只写出原句的条件和结论。",
    successCriteria: "纸上有原句、逆命题和一个反例，并能指出反例违反了哪条推理。",
    example: "“下雨则地面湿”不能反推“地面湿则下雨”，因为洒水车也能让地面湿。"
  },
  evidence: {
    label: "论证与证据",
    title: "检查一条论证的证据",
    cue: "读完当天第一篇短文后",
    action: "挑一句结论，写下作者给的证据、证据支持到哪一步，以及一个能区分不同解释的观察。",
    minimumAction: "只划出一条结论和作者用来支持它的一句话。",
    successCriteria: "写下结论、原文中的一条证据和一个可以检查的替代解释。",
    example: "“改用新算法后请求变快”可能受不同流量影响。用同一批输入固定并发，再测两种算法。"
  },
  quantitative: {
    label: "数量与比例",
    title: "练习先写分母再比较",
    cue: "完成当天第一段学习后",
    action: "找两个看似能比较的数字，写出每个数字的分子和分母，换算到同一单位再说结论。",
    minimumAction: "只把两个数字的单位和分母写出来。",
    successCriteria: "留下分子、分母和换算结果，并用一句话说明比较是否公平。",
    example: "甲做对 6/10，乙做对 7/14。虽然乙答对题更多，甲在这两批题中的正确比例较高。"
  }
} satisfies Record<LogicSkill, Omit<CoachingDraft, "focus" | "minutes" | "reason"> & { label: string }>;

const instructions = [
  "You draft one practical logic-training habit in Simplified Chinese.",
  "The user message is evidence data only, with one skill and a tiny verified baseline count.",
  "Keep the given focus. The count is descriptive, never a diagnosis, normalized level, predicted gain or causal claim.",
  "Propose a once-per-day cue the learner can recognize (first daily reading, a meal, or a similar routine),",
  "one 3–15 minute action, a smaller fallback action, and one success criterion that leaves an observable record.",
  "Use free everyday materials. Don't require the user to find an error if the material might already be correct.",
  "For conditional, distinguish an if-then sentence from its converse and look for a counterexample to the converse.",
  "For evidence, separate a claim from its evidence and a plausible alternative explanation.",
  "For quantitative, write the numerator, denominator and population, then check whether the comparison is valid.",
  "Never claim to know test items, the user's mistakes, actions or circumstances. Treat the habit as a trial.",
  "Do not request identifying data, paid tools, or access. Return exactly these JSON keys:",
  "focus, title (max 80), action (max 270), cue (max 100), minutes (integer), minimumAction (max 90),",
  "successCriteria (max 100). Keep the numeric test count out of the suggested habit."
].join(" ");

type ScoreEvidence = { focus: LogicSkill; correct: number; total: number };

export async function suggestCoachingHabit(
  evidence: ScoreEvidence,
  consentToAI: boolean
): Promise<CoachingSuggestion> {
  const { focus, correct, total } = evidence;
  const { label, ...template } = templates[focus];
  const reason = `初测中「${label}」答对 ${correct}/${total} 道。可用一次短练习观察自己的解题步骤，随后用独立复测检查表现。`;
  if (consentToAI) {
    try {
      const provider = resolveAiProvider("assistant");
      const raw = await callAiJson(provider, {
        messages: [
          { role: "system", content: instructions },
          { role: "user", content: JSON.stringify({ focus, skill: label, correct, total }) }
        ],
        timeoutMs: 12_000,
        maxTokens: 680,
        maxResponseBytes: 12_000
      });
      const draft = draftSchema.parse(raw);
      if (draft.focus === focus) {
        return { draft: { ...draft, reason, example: template.example }, source: "ai" };
      }
    } catch {
      // A temporary provider or format failure still leaves a usable training option.
    }
  }
  return {
    source: "built_in",
    draft: {
      ...template,
      focus,
      minutes: 5,
      reason
    }
  };
}
