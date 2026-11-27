import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logicSkills } from "@/lib/ability-coaching";
import { getCoachingOverview, requireCoachingBaseline, saveCoachingHabit } from "@/server/ability-coaching";
import { suggestCoachingHabit } from "@/server/ability-coaching-draft";
import { boundedJson, enforceRateLimit, errorResponse, principalFromRequest, requireSameOrigin } from "@/server/security";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
const suggestInput = z.strictObject({ focus: z.enum(logicSkills), consentToAI: z.boolean() });
const saveInput = z.strictObject({
  focus: z.enum(logicSkills),
  title: z.string().trim().min(2).max(180),
  action: z.string().trim().min(2).max(500),
  cue: z.string().trim().max(250)
});

export async function GET(request: NextRequest) {
  try {
    const { userId } = await principalFromRequest(request);
    return NextResponse.json(await getCoachingOverview(userId), { headers });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId, kind } = await principalFromRequest(request);
    if (kind === "WEB") requireSameOrigin(request);
    const { focus, consentToAI } = await boundedJson(request, suggestInput, 512);
    await enforceRateLimit("ability-coaching-draft", userId, 12, 60 * 60 * 1000);
    const evidence = await requireCoachingBaseline(userId, focus);
    return NextResponse.json(await suggestCoachingHabit(evidence, consentToAI), { headers });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { userId, kind } = await principalFromRequest(request);
    if (kind === "WEB") requireSameOrigin(request);
    const input = await boundedJson(request, saveInput, 4096);
    await enforceRateLimit("ability-coaching-save", userId, 20, 60 * 60 * 1000);
    return NextResponse.json({ habit: await saveCoachingHabit(userId, input) }, { headers });
  } catch (error) {
    return errorResponse(error);
  }
}
