import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test, type TestContext } from "node:test";
import { NextRequest } from "next/server";
import { GET, POST, PUT } from "../src/app/api/v1/ability-coaching/route";
import { GET as getAssistantAvailability, POST as postAssistant } from "../src/app/api/v1/assistant/route";
import type { CoachingDraft, CoachingOverview } from "../src/lib/ability-coaching";
import { taskContentDigest } from "../src/server/assessment-integrity";
import { getDb } from "../src/server/db";
import { issueSession, SESSION_COOKIE } from "../src/server/security";

const day = 86_400_000;
const focus = "evidence";
const habitInput = {
  focus,
  title: "检查论证证据",
  action: "写下一条结论、一条证据和另一种解释。",
  cue: "读完当天第一篇文章后"
} as const;

function request(
  method: "GET" | "POST" | "PUT",
  token?: string,
  body?: unknown,
  path = "/api/v1/ability-coaching"
) {
  const origin = new URL(process.env.APP_ORIGIN ?? "http://localhost:3000").origin;
  const headers = new Headers({ origin });
  if (token) headers.set("cookie", `${SESSION_COOKIE}=${token}`);
  if (body !== undefined) headers.set("content-type", "application/json");
  return new NextRequest(new URL(path, origin), {
    method,
    headers,
    body: body === undefined ? null : JSON.stringify(body)
  });
}

async function account(t: TestContext) {
  const db = getDb();
  const user = await db.user.create({
    data: {
      credential: {
        create: {
          email: `coaching_${randomUUID()}@example.test`,
          passwordHash: "test-only",
          verifiedAt: new Date()
        }
      }
    }
  });
  t.after(async () => { await db.user.delete({ where: { id: user.id } }); });
  const { token } = await issueSession(user.id, "WEB");
  return { userId: user.id, token };
}

async function formTasks(formCode: "logic-a-v1" | "logic-b-v1") {
  const tasks = await getDb().task.findMany({
    where: { formCode },
    orderBy: { formOrder: "asc" },
    select: { id: true, version: true, skillCode: true, formOrder: true, content: true }
  });
  assert.equal(tasks.length, 6, "the database must contain the seeded public reasoning forms");
  return tasks;
}

function attempt(
  userId: string,
  task: Awaited<ReturnType<typeof formTasks>>[number],
  createdAt: Date,
  correct: boolean,
  verified = true
) {
  return {
    userId,
    taskId: task.id,
    taskVersion: task.version,
    evidenceKind: "OBJECTIVE" as const,
    rawScore: correct ? 100 : 0,
    createdAt,
    evidence: verified ? { taskContentSha256: taskContentDigest(task.content) } : {}
  };
}

async function overview(token: string): Promise<CoachingOverview> {
  const response = await GET(request("GET", token));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  return response.json();
}

test("coaching starts only after an owner's verified first form and hides partial or legacy scores", async (t) => {
  const db = getDb();
  const [owner, outsider] = await Promise.all([account(t), account(t)]);
  const tasks = await formTasks("logic-a-v1");
  const firstAttempt = new Date(Date.now() - 2 * day);

  assert.equal((await GET(request("GET"))).status, 401);
  const initial = await overview(owner.token);
  assert.equal(initial.baseline.status, "ready");
  assert.equal(initial.retest.status, "locked");
  assert.equal(initial.retest.availableAt, null);
  assert.equal(initial.canCoach, false);
  assert.equal(initial.recommendedFocus, null);

  await db.assessmentAttempt.create({ data: attempt(owner.userId, tasks[0]!, firstAttempt, true) });
  const partial = await overview(owner.token);
  assert.equal(partial.baseline.status, "in_progress");
  assert.equal(partial.baseline.correct, null);
  assert.equal(partial.baseline.completedAt, null);
  assert.equal(partial.baseline.skills.every((skill) => skill.correct === null), true);
  assert.equal(partial.canCoach, false);
  assert.equal(partial.rawDifferencePoints, null);
  assert.equal((await overview(outsider.token)).baseline.status, "ready");

  const blockedDraft = await POST(request("POST", owner.token, { focus, consentToAI: false }));
  assert.equal(blockedDraft.status, 409);
  assert.deepEqual(await blockedDraft.json(), { error: { code: "VERIFIED_BASELINE_REQUIRED" } });

  await db.assessmentAttempt.createMany({
    data: tasks.slice(1).map((task) => attempt(owner.userId, task, firstAttempt, true, false))
  });
  const legacy = await overview(owner.token);
  assert.equal(legacy.baseline.status, "completed");
  assert.equal(legacy.baseline.integrityStatus, "legacy_unverified");
  assert.equal(legacy.baseline.correct, null);
  assert.equal(legacy.baseline.completedAt, null);
  assert.equal(legacy.baseline.skills.every((skill) => skill.correct === null), true);
  assert.equal(Object.hasOwn(legacy.baseline, "reviews"), false);
  assert.equal(legacy.canCoach, false);
  assert.equal(legacy.recommendedFocus, null);
  assert.equal(legacy.retest.status, "locked");
  assert.equal(legacy.retest.availableAt, new Date(firstAttempt.getTime() + 7 * day).toISOString());

  const blockedSave = await PUT(request("PUT", owner.token, habitInput));
  assert.equal(blockedSave.status, 409);
  assert.deepEqual(await blockedSave.json(), { error: { code: "VERIFIED_BASELINE_REQUIRED" } });
  assert.equal(await db.habit.count({ where: { userId: owner.userId } }), 0);
});

test("coaching drafts send only consented, verified, selected skill evidence and fall back safely", async (t) => {
  const db = getDb();
  const [owner, outsider] = await Promise.all([account(t), account(t)]);
  const tasks = await formTasks("logic-a-v1");
  const evidenceTask = tasks.find((task) => task.skillCode === focus)!;
  const baselineAt = new Date(Date.now() - day);
  await db.assessmentAttempt.createMany({
    data: tasks.map((task) => attempt(
      owner.userId, task, baselineAt, task.skillCode === "conditional" || task.id === evidenceTask.id
    ))
  });
  const privateNote = "Unrelated private reflection fixture";
  await db.habit.create({
    data: {
      userId: owner.userId,
      title: "Unrelated habit fixture",
      action: "Unrelated action fixture",
      reflections: { create: { note: privateNote } }
    }
  });

  const providerKeys = ["AI_ASSISTANT_", "AI_HABIT_"].flatMap((prefix) =>
    ["PROVIDER", "API_KEY", "MODEL", "ENDPOINT", "ALLOWED_HOST"].map((field) => prefix + field)
  );
  const envKeys = [...providerKeys, "DEEPSEEK_API_KEY", "https_proxy", "STEPMARK_USE_SYSTEM_PROXY"];
  const savedEnv = envKeys.map((key) => [key, process.env[key]] as const);
  t.after(() => {
    for (const [key, value] of savedEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  for (const key of envKeys) delete process.env[key];
  process.env.https_proxy = "";
  process.env.STEPMARK_USE_SYSTEM_PROXY = "0";

  const modelDraft = {
    ...habitInput,
    minutes: 5,
    minimumAction: "先划出一句结论。",
    successCriteria: "写出可检查的替代解释。"
  } satisfies Omit<CoachingDraft, "reason" | "example">;
  const modelOutputs = [
    {
      ...modelDraft,
      type: "json_object",
      reason: "Unverified ability claim from model",
      example: "Invented example"
    },
    { ...modelDraft, minutes: 1 },
    { ...modelDraft, focus: "conditional" }
  ];
  const outbound: { url: string; authorization: string | null; redirect: RequestRedirect | undefined; body: string }[] = [];
  t.mock.method(globalThis, "fetch", async (url: URL | RequestInfo, init?: RequestInit) => {
    outbound.push({
      url: String(url),
      authorization: new Headers(init?.headers).get("authorization"),
      redirect: init?.redirect,
      body: String(init?.body)
    });
    return Response.json({ choices: [{ message: { content: JSON.stringify(modelOutputs.shift()) } }] });
  });

  const draft = (consentToAI: boolean) => POST(request("POST", owner.token, { focus, consentToAI }));
  const availability = (token?: string) =>
    getAssistantAvailability(request("GET", token, undefined, "/api/v1/assistant"));
  assert.equal((await availability()).status, 401);
  assert.deepEqual(await (await availability(owner.token)).json(), { configured: false, userId: owner.userId });
  const noProvider = await overview(owner.token);
  assert.equal(noProvider.aiConfigured, false);
  assert.equal(noProvider.canCoach, true);
  assert.equal(noProvider.recommendedFocus, "quantitative");
  assert.equal(noProvider.baseline.correct, 3);
  assert.equal(noProvider.retest.status, "locked");
  assert.equal(noProvider.retest.availableAt, new Date(baselineAt.getTime() + 7 * day).toISOString());
  const fallback = await draft(true);
  assert.equal(fallback.status, 200);
  const builtIn = await fallback.json();
  assert.equal(builtIn.source, "built_in");
  assert.equal(builtIn.draft.focus, focus);
  assert.match(builtIn.draft.reason, /1\/2/);
  assert.equal(outbound.length, 0);

  process.env.AI_ASSISTANT_PROVIDER = "openai";
  process.env.AI_ASSISTANT_API_KEY = "fake-coaching-test-only";
  process.env.AI_ASSISTANT_MODEL = "coaching-test-model";
  const configured = await availability(owner.token);
  assert.equal(configured.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await configured.json(), { configured: true, userId: owner.userId });
  assert.equal((await overview(owner.token)).aiConfigured, true);
  const staleConsent = await postAssistant(request("POST", owner.token, {
    message: "今天完成了例行练习。",
    consentToAI: true,
    consentUserId: outsider.userId,
    requestId: randomUUID(),
    localDate: new Date().toISOString().slice(0, 10)
  }, "/api/v1/assistant"));
  assert.equal(staleConsent.status, 409);
  assert.deepEqual(await staleConsent.json(), { error: { code: "ASSISTANT_CONSENT_ACCOUNT_CHANGED" } });
  assert.deepEqual(await (await draft(false)).json(), builtIn);
  assert.equal((await POST(request("POST", outsider.token, { focus, consentToAI: true }))).status, 409);
  assert.equal((await POST(request("POST", owner.token, { focus, consentToAI: true, note: privateNote }))).status, 400);
  assert.equal(outbound.length, 0);

  const valid = await draft(true);
  assert.equal(valid.status, 200);
  assert.deepEqual(await valid.json(), {
    source: "ai",
    draft: { ...modelDraft, reason: builtIn.draft.reason, example: builtIn.draft.example }
  });
  for (let index = 0; index < 2; index++) {
    const invalid = await draft(true);
    assert.equal(invalid.status, 200);
    assert.deepEqual(await invalid.json(), builtIn);
  }
  assert.equal(outbound.length, 3);
  for (const { url, authorization, redirect, body } of outbound) {
    assert.equal(url, "https://api.openai.com/v1/chat/completions");
    assert.equal(authorization, "Bearer fake-coaching-test-only");
    assert.equal(redirect, "error");
    const payload = JSON.parse(body);
    assert.equal(payload.model, "coaching-test-model");
    assert.deepEqual(payload.messages.map((message: { role: string }) => message.role), ["system", "user"]);
    assert.deepEqual(JSON.parse(payload.messages[1].content), { focus, skill: "论证与证据", correct: 1, total: 2 });
    assert.equal(body.includes(owner.userId) || body.includes(outsider.userId) || body.includes(privateNote), false);
  }
  assert.equal(await db.habit.count({ where: { userId: owner.userId } }), 1);
  assert.equal(await db.habitAssociation.count({ where: { habit: { userId: owner.userId } } }), 0);
});

test("concurrent coaching saves link one owner's habit and report opportunities and an eligible raw retest", async (t) => {
  const db = getDb();
  const [owner, outsider] = await Promise.all([account(t), account(t)]);
  const start = Date.now();
  const daysAgo = (days: number) => new Date(start - days * day);
  const baseline = await formTasks("logic-a-v1");
  const retest = await formTasks("logic-b-v1");
  await db.assessmentAttempt.createMany({
    data: baseline.map((task, index) => attempt(owner.userId, task, daysAgo(11), index < 3))
  });
  const foreignHabit = await db.habit.create({
    data: { userId: outsider.userId, title: habitInput.title, action: habitInput.action, cue: habitInput.cue }
  });

  const put = () => PUT(request("PUT", owner.token, habitInput));
  const responses = await Promise.all([put(), put(), put()]);
  assert.deepEqual(responses.map((response) => response.status), [200, 200, 200]);
  const results = await Promise.all(responses.map((response) => response.json()));
  const habitId: string = results[0].habit.id;
  assert.notEqual(habitId, foreignHabit.id);
  assert.deepEqual(results, responses.map(() => ({ habit: { id: habitId, title: habitInput.title } })));
  assert.equal(await db.habit.count({ where: { userId: owner.userId } }), 1);

  const associationKey = { habitId, constructCode: "reasoning.logic" };
  assert.equal(await db.habitAssociation.count({ where: { habitId } }), 1);
  const originalLink = await db.habitAssociation.findUniqueOrThrow({
    where: { habitId_constructCode: associationKey }
  });
  assert.equal(originalLink.evidenceLevel, "user_selected");
  assert.equal((await put()).status, 200);
  assert.deepEqual(await db.habitAssociation.findUniqueOrThrow({
    where: { habitId_constructCode: associationKey }
  }), originalLink);
  assert.equal(await db.habitAssociation.count({ where: { habitId: foreignHabit.id } }), 0);
  assert.deepEqual((await overview(outsider.token)).linkedHabits, []);

  await db.habitAssociation.update({
    where: { habitId_constructCode: associationKey },
    data: { updatedAt: daysAgo(9) }
  });
  const done = await db.habitEvent.create({
    data: { habitId, opportunityKey: "done", occurredAt: daysAgo(8), eligible: true, completed: true, source: "test" }
  });
  await db.habitEvent.createMany({
    data: [
      { habitId, opportunityKey: "missed", occurredAt: daysAgo(7), eligible: true, completed: false, source: "test" },
      { habitId, opportunityKey: "no-cue", occurredAt: daysAgo(6), eligible: false, completed: false, source: "test" }
    ]
  });
  await db.habitReflection.create({ data: { habitId, eventId: done.id, initiationLevel: 3 } });
  const progress = await overview(owner.token);
  assert.equal(progress.linkedHabits.length, 1);
  const [linked] = progress.linkedHabits;
  assert.equal(linked!.id, habitId);
  assert.deepEqual(
    { completed: linked!.progress.completed, eligible: linked!.progress.eligible, ratings: linked!.progress.ratings },
    { completed: 1, eligible: 2, ratings: 1 }
  );
  assert.ok(linked!.progress.score > 0 && linked!.progress.score <= 100);
  assert.equal(linked!.recordedTrainingBetweenTests, 1);
  assert.equal(progress.rawDifferencePoints, null);

  await db.habitEvent.create({
    data: { habitId, opportunityKey: "after-retest", occurredAt: daysAgo(3), eligible: true, completed: true, source: "test" }
  });
  await db.assessmentAttempt.createMany({
    data: retest.map((task, index) => attempt(owner.userId, task, daysAgo(index === 0 ? 5 : 4), index < 5))
  });
  const early = await overview(owner.token);
  assert.equal(early.retest.status, "completed");
  assert.equal(early.retest.integrityStatus, "verified");
  assert.equal(early.retest.correct, 5);
  assert.equal(early.rawDifferencePoints, null, "the first B item must meet the minimum wait");

  await db.assessmentAttempt.update({
    where: { userId_taskId: { userId: owner.userId, taskId: retest[0]!.id } },
    data: { createdAt: daysAgo(4) }
  });
  const compared = await overview(owner.token);
  assert.equal(compared.baseline.correct, 3);
  assert.equal(compared.retest.correct, 5);
  assert.equal(compared.rawDifferencePoints, 33);
  assert.equal(compared.linkedHabits[0]?.progress.completed, 2);
  assert.equal(compared.linkedHabits[0]?.recordedTrainingBetweenTests, 1);
  assert.equal(Object.hasOwn(compared.retest, "reviews"), false);
  assert.equal(Object.hasOwn(compared, "theta"), false);
  assert.equal((await overview(outsider.token)).rawDifferencePoints, null);
});
