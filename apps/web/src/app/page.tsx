import { initialConstructs } from "@stepmark/core";
const features = [
  { number: "01", title: "测量能力", description: "通过结构化任务和重复测量建立个人基线，不用聊天印象代替评估。" },
  { number: "02", title: "培养习惯", description: "追踪机会、情境、执行和自动化程度，不将连续打卡等同习惯形成。" },
  { number: "03", title: "验证进步", description: "用新的测验验证提升，把练习效果与真正的能力迁移分开。" },
  { number: "04", title: "AI 个性化", description: "预留可审计的 AI 教练与评分接口。启用前需人工基准校准。" }
];
export default function Home() {
  return <main className="shell">
    <header className="topbar"><a className="wordmark" href="/">STEP<span>MARK</span><span className="brand-dot">.</span></a>
      <nav className="top-links"><a href="/login">登录</a><a href="/register">创建账户</a></nav></header>
    <section className="hero">
      <div className="eyebrow"><span className="pulse" /> YOUR CAPACITY. YOUR EVIDENCE.</div>
      <h1>让成长<br/><span>有迹可循。</span></h1>
      <p>不以打卡次数定义自律，不以一次分数定义能力。StepMark 用可追溯的证据，连接能力评估、习惯训练和真实进步。</p>
      <div className="hero-actions"><a href="#framework" className="primary-link">了解测量框架 <span aria-hidden="true">↗</span></a>
        <a href="#principles" className="secondary-link">科学原则 ↓</a></div>
      <p className="warning">目前为公开、只读的架构展示。账户、评估提交及 AI 评分尚未开放。</p>
    </section>
    <section id="framework" className="section">
      <div className="section-heading"><span className="kicker">MEASUREMENT DOMAINS</span><h2>从可测量的维度开始</h2><p>这些是初始研究构念，并非已经校准的人口常模。</p></div>
      <div className="domains">
      {initialConstructs.map((domain, index) => <article className="domain" key={domain.code}>
        <span className="domain-index">0{index+1} / CONSTRUCT</span>
        <div className="domain-mark" aria-hidden="true">{["◇","◈","✳"][index]}</div>
        <h3>{domain.title}</h3><p>{domain.description}</p>
        <div className="domain-bottom"><span>代码：{domain.code}</span><span className="tag">待校准</span></div>
      </article>)}
      </div>
    </section>
    <section id="principles" className="section dark-section">
      <div className="section-heading"><span className="kicker">OUR PRINCIPLES</span><h2>证据先于分数</h2></div>
      <div className="feature-grid">{features.map(f => <article key={f.number} className="feature">
        <span className="feature-number">{f.number}</span><h3>{f.title}</h3><p>{f.description}</p></article>)}</div>
    </section>
    <footer><span>STEPMARK / FOUNDATION</span><span>能力用表现证明 · 习惯用行为证明 · 成长用证据证明</span></footer>
  </main>;
}
