export type HabitInsights = {
  eligibleOpportunities: number;
  completions: number;
  observedRate: number | null;
  wilsonInterval95: { low: number; high: number } | null;
  posterior: { posteriorMean: number; posteriorSD: number } | null;
  latestAutomaticity: { indexScore: number; measuredAt: string } | null;
};

export default function HabitInsightsPanel({ insights }: { insights: HabitInsights }) {
  return (
    <details className="dashboard-panel">
      <summary>查看执行率的统计细节</summary>
      <p>
        有触发机会 {insights.eligibleOpportunities} 次，完成 {insights.completions}{" "}
        次。没有出现触发情境的日子不计入分母。
      </p>
      <p>
        实际观察完成率：
        {insights.observedRate === null
          ? "数据不足"
          : (insights.observedRate * 100).toFixed(1) + "%"}
        。
      </p>
      {insights.posterior && (
        <p>
          贝叶斯平滑预测：{(insights.posterior.posteriorMean * 100).toFixed(1)}%（标准差{" "}
          {(insights.posterior.posteriorSD * 100).toFixed(1)} 个百分点）。 采用 Beta(1,1)
          先验，只是对后续类似执行机会的描述性预测。
        </p>
      )}
      {insights.wilsonInterval95 && (
        <p>
          观察比例粗略 95% 区间：
          {(insights.wilsonInterval95.low * 100).toFixed(1)}%—
          {(insights.wilsonInterval95.high * 100).toFixed(1)}%。
          重复行为可能相关，因此此区间不应当被当作严格保证。
        </p>
      )}
      {insights.latestAutomaticity ? (
        <p>
          最近一次试验性自动化指数：{insights.latestAutomaticity.indexScore.toFixed(1)}
          /100（不是已验证量表或能力值）。
        </p>
      ) : (
        <p>还没有自动化程度的独立测量。完成次数不能证明习惯已经形成。</p>
      )}
    </details>
  );
}
