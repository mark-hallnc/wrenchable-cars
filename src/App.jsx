import { useState } from 'react'
import './App.css'

const years = ['2011', '2012', '2015', '2018']
const makes = ['GMC', 'Toyota', 'Ford', 'Honda', 'Chevrolet']
const models = ['Acadia', 'Camry', 'F-150', 'Pilot', 'Silverado']

const repairs = [
  { name: 'Headlight bulb replacement', hours: 1.4, score: 2, label: 'Wrench Nightmare' },
  { name: 'Water pump replacement', hours: 3.2, score: 4, label: 'Hard' },
  { name: 'Alternator replacement', hours: 2.8, score: 4, label: 'Hard' },
  { name: 'Starter replacement', hours: 2.4, score: 5, label: 'Moderate' },
  { name: 'Front brake pads and rotors', hours: 1.5, score: 8, label: 'DIY Friendly' },
  { name: 'Rear brake pads and rotors', hours: 1.6, score: 7, label: 'DIY Friendly' },
  { name: 'Battery replacement', hours: 0.5, score: 9, label: 'Easy' },
  { name: 'Spark plug replacement', hours: 2.2, score: 5, label: 'Moderate' },
  { name: 'Ignition coil replacement', hours: 1.8, score: 6, label: 'Moderate' },
  { name: 'Thermostat replacement', hours: 2.0, score: 5, label: 'Moderate' },
  { name: 'Radiator replacement', hours: 2.6, score: 4, label: 'Hard' },
  { name: 'Serpentine belt replacement', hours: 0.8, score: 8, label: 'DIY Friendly' },
  { name: 'Belt tensioner replacement', hours: 1.2, score: 7, label: 'DIY Friendly' },
  { name: 'Headlight assembly replacement', hours: 1.8, score: 3, label: 'Hard' },
  { name: 'Tail light bulb replacement', hours: 0.3, score: 10, label: 'Easy' },
  { name: 'Wheel bearing/hub replacement', hours: 2.1, score: 5, label: 'Moderate' },
  { name: 'Front strut replacement', hours: 2.4, score: 5, label: 'Moderate' },
  { name: 'Control arm replacement', hours: 2.0, score: 6, label: 'Moderate' },
  { name: 'Fuel pump replacement', hours: 3.5, score: 3, label: 'Hard' },
  { name: 'Blower motor replacement', hours: 1.7, score: 6, label: 'Moderate' },
]

const scoreClass = (score) => {
  if (score <= 3) return 'low'
  if (score <= 6) return 'mid'
  return 'high'
}

function App() {
  const [selectedYear, setSelectedYear] = useState('2011')
  const [selectedMake, setSelectedMake] = useState('GMC')
  const [selectedModel, setSelectedModel] = useState('Acadia')
  const [hasSearched, setHasSearched] = useState(false)

  const handleSubmit = (event) => {
    event.preventDefault()
    setHasSearched(true)
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Wrenchable Cars home">
          <span className="brand-mark">WC</span>
          <span>Wrenchable Cars</span>
        </a>
        <nav className="main-nav" aria-label="Primary navigation">
          <a href="#search">Search</a>
          <a href="#how-it-works">How it works</a>
        </nav>
      </header>

      <main id="top">
        <section className="hero-section">
          <div className="hero-content">
            <p className="eyebrow">Used-car repair difficulty, before you buy</p>
            <h1>Before you buy it, know how hard it is to fix.</h1>
            <p className="hero-copy">
              Wrenchable Cars helps shoppers spot repair-heavy vehicles by turning
              common ownership jobs into plain-English difficulty scores.
            </p>
          </div>

          <form className="search-panel" id="search" onSubmit={handleSubmit}>
            <div className="panel-heading">
              <p className="eyebrow">Quick check</p>
              <h2>Search a vehicle</h2>
            </div>

            <div className="form-grid">
              <label>
                Year
                <select value={selectedYear} onChange={(event) => setSelectedYear(event.target.value)}>
                  {years.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Make
                <select value={selectedMake} onChange={(event) => setSelectedMake(event.target.value)}>
                  {makes.map((make) => (
                    <option key={make} value={make}>
                      {make}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Model
                <select value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)}>
                  {models.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <button type="submit">Check Wrenchability</button>
            <p className="helper-text">
              MVP preview: every search currently returns the 2011 GMC Acadia mock result.
            </p>
          </form>
        </section>

        {hasSearched && (
          <section className="results-section" aria-live="polite">
            <div className="section-heading">
              <p className="eyebrow">Mock result</p>
              <h2>2011 GMC Acadia</h2>
            </div>

            <article className="result-card">
              <div className="result-summary">
                <div>
                  <span className="meta-label">Vehicle</span>
                  <h3>2011 GMC Acadia</h3>
                </div>
                <div className="score-badge">
                  <span>Overall Wrenchability Score</span>
                  <strong>3.8 / 10</strong>
                  <em>Hard to Wrench</em>
                </div>
              </div>
              <p>
                This vehicle has several common repairs with above-average labor
                time. Good to know before buying one cheap.
              </p>
            </article>

            <div className="repairs-panel">
              <div className="section-heading compact">
                <p className="eyebrow">Top 20 common ownership repairs</p>
                <h2>Repair difficulty snapshot</h2>
              </div>

              <div className="repair-list">
                {repairs.map((repair) => (
                  <article className="repair-row" key={repair.name}>
                    <div className="repair-main">
                      <h3>{repair.name}</h3>
                      <span>{repair.hours.toFixed(1)} labor hours</span>
                    </div>
                    <div className="repair-score">
                      <div className="score-line">
                        <strong>{repair.score} / 10</strong>
                        <span className={`label-pill ${scoreClass(repair.score)}`}>
                          {repair.label}
                        </span>
                      </div>
                      <div className="meter" aria-label={`${repair.score} out of 10`}>
                        <span
                          className={scoreClass(repair.score)}
                          style={{ width: `${repair.score * 10}%` }}
                        />
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="how-section" id="how-it-works">
          <div className="section-heading">
            <p className="eyebrow">Practical scoring for shoppers</p>
            <h2>How the Wrenchability Score works</h2>
          </div>

          <div className="info-grid">
            <article>
              <h3>Labor hours</h3>
              <p>Book labor time gives us a baseline for how involved a repair is.</p>
            </article>
            <article>
              <h3>Repair comparison</h3>
              <p>
                Each job is compared against the same job on other vehicles, not
                judged by one fixed rule.
              </p>
            </article>
            <article>
              <h3>Buyer-friendly score</h3>
              <p>
                We turn the data into a simple 1-10 rating so used-car shoppers
                can understand the pain before they buy.
              </p>
            </article>
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
