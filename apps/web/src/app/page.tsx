import { initialConstructs } from "@stepmark/core";
const features = [
  { title: "Windows 工作台", description: "把正在做的事交给 DeepSeek 分析，拿到能改、能用、能验证的成果。" },
  { title: "培养习惯", description: "用对话记录触发情境、行动和感受，观察一个行为如何慢慢变得自然。" },
  { title: "测量与训练", description: "通过结构化任务建立基线，再到新题和真实场景中检查所学能否迁移。" }
];
export default function Home() {
  return <main className="shell">
    <header className="topbar"><a className="wordmark" href="/">STEP<span>MARK</span><span className="brand-dot">.</span></a>
      <nav className="top-links"><a href="/login">登录</a><a href="/register">创建账户</a></nav></header>
    <section className="hero landing-growth">
      <h1>从一个问题开始<br/><span>走出自己的一步</span></h1>
      <p>独立发现和理解问题，学习所需的知识，用工具和他人一起做出东西。StepMark 帮你记录每次尝试的证据，让你有依据地选择下一步。</p>
      <div className="hero-actions"><a href="/dashboard" className="primary-link">进入控制台 <span aria-hidden="true">→</span></a>
        <a href="#framework" className="secondary-link">了解能力测量</a></div>
    </section>
    <section id="framework" className="section">
      <div className="section-heading"><h2>能力测量的研究方向</h2><p>研究预览阶段的演示测验仍待独立校准。答题表现用于个人练习与研究。</p></div>
      <div className="domains">
      {initialConstructs.map(domain => <article className="domain" key={domain.code}>
        <h3>{domain.title}</h3><p>{domain.description}</p>
        <div className="domain-bottom"><span>代码：{domain.code}</span><span className="tag">待校准</span></div>
      </article>)}
      </div>
    </section>
    <section id="principles" className="section dark-section">
      <div className="section-heading"><h2>怎样把成长落到实处</h2></div>
      <div className="feature-grid">{features.map(f => <article key={f.title} className="feature">
        <h3>{f.title}</h3><p>{f.description}</p></article>)}</div>
    </section>
    <footer><span>STEPMARK / FOUNDATION</span><span>能力用表现证明 · 习惯用行为证明 · 成长用证据证明</span></footer>
  </main>;
}
