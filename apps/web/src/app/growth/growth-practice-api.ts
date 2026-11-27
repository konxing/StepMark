import { aiErrorMessage } from "@/lib/ai-errors";

const endpoint = "/api/v1/growth-practices";

export async function requestGrowthPractice<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(endpoint + path, { cache: "no-store", ...init });
  if (response.status === 401) {
    location.assign("/login?next=/growth");
    throw new Error("登录已过期。");
  }
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: { code?: string } } | null;
    const aiMessage = aiErrorMessage(data?.error?.code);
    if (aiMessage) throw new Error(aiMessage);
    if (response.status === 409)
      throw new Error("记录已在别处更新。请先复制未保存内容，刷新列表后再编辑。");
    if (response.status === 429) throw new Error("操作有点频繁，请稍后再试。");
    if (response.status === 503) throw new Error("DeepSeek 暂未配置。你可以展开表单手动填写。");
    if (response.status === 502)
      throw new Error("DeepSeek 暂时没有返回可用草稿。可以重试或手动填写。");
    throw new Error("操作未完成，请重试。");
  }
  return response.json() as Promise<T>;
}

export function growthPracticeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作未完成，请重试。";
}
