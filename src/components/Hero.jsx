import {
  BRAND,
  FEATURE_CALLOUTS,
  WRENCHABILITY_SCORE_EXPLANATION,
} from '../lib/scoreHelpers'

export default function Hero({ children }) {
  return (
    <section className="hero-section">
      <div className="hero-content">
        <p className="eyebrow">{BRAND.shortTagline}</p>
        <h1>{BRAND.name}</h1>
        <p className="hero-copy">{BRAND.tagline}</p>
        <p className="hero-support">
          Search a specific vehicle, browse the easiest and hardest models,
          or compare vehicles side by side before you buy.
        </p>

        <div className="feature-callouts" aria-label="Ways to use Wrenchable Cars">
          {FEATURE_CALLOUTS.map((feature) => (
            <article key={feature.title}>
              <h2>{feature.title}</h2>
              <p>{feature.description}</p>
            </article>
          ))}
        </div>

        <p className="score-explainer">{WRENCHABILITY_SCORE_EXPLANATION}</p>
      </div>

      {children}
    </section>
  )
}
