const example = `{
  "title": "Write a five-post launch thread",
  "payoutUsd": 250,
  "hoursEstimate": 4,
  "daysToDeadline": 5,
  "daysToPayout": 14,
  "existingSubmissions": 12,
  "fit": 5,
  "paymentCertainty": 4,
  "aiLeverage": 5,
  "reuseValue": 4,
  "cashCostUsd": 0,
  "agentAccessible": true,
  "verifiableOutput": true
}`;

export default function Home() {
  return (
    <main>
      <nav>
        <span className="brand">COMPOUNDER</span>
        <a href="/api/health">Health JSON</a>
      </nav>

      <section className="hero">
        <p className="eyebrow">MACHINE-PAYABLE DECISION INTELLIGENCE</p>
        <h1>Spend one cent.<br />Avoid the wrong bounty.</h1>
        <p className="lede">
          The Bounty Fit Scorer evaluates paid opportunities by payment certainty, operator fit,
          AI leverage, reuse value, time-to-cash, payout quality, execution friction, and competition.
        </p>
        <div className="badges">
          <span>$0.01 USDC</span>
          <span>Base Mainnet</span>
          <span>x402 v2</span>
          <span>Bazaar-ready</span>
        </div>
      </section>

      <section className="grid">
        <article>
          <p className="label">PAID ENDPOINT</p>
          <h2>POST /api/bounty-score</h2>
          <p>
            Returns a 0–100 score, pursue/skip verdict, expected value, dimension breakdown,
            hard stops, risks, strengths, and a next action.
          </p>
        </article>
        <article>
          <p className="label">PAYMENT</p>
          <h2>Exact USDC settlement</h2>
          <p>
            Payments settle directly to the operator wallet on Base through an accountless
            production facilitator. No API key or subscription is required.
          </p>
        </article>
        <article>
          <p className="label">DOCTRINE</p>
          <h2>Certainty over headline value</h2>
          <p>
            Short, verifiable, AI-leveraged work that creates reusable assets outranks crowded,
            speculative, capital-intensive opportunities.
          </p>
        </article>
      </section>

      <section className="docs">
        <div>
          <p className="label">FREE DISCOVERY</p>
          <h2>Inspect the schema before paying.</h2>
          <p>
            GET the same endpoint for machine-readable documentation. POST invokes x402 payment
            negotiation and only settles after a successful assessment response.
          </p>
          <a className="button" href="/api/bounty-score">Open endpoint docs</a>
        </div>
        <pre><code>{example}</code></pre>
      </section>

      <footer>
        <span>Compounder Market API · v0.1.0</span>
        <span>Built to turn reusable intelligence into Base-denominated revenue.</span>
      </footer>
    </main>
  );
}
