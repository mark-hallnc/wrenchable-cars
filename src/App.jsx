import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabaseClient'
import './App.css'

const scoreClass = (score) => {
  const numericScore = Number(score)

  if (numericScore <= 3) return 'low'
  if (numericScore <= 6) return 'mid'
  return 'high'
}

const formatScore = (score) => {
  const numericScore = Number(score)

  if (!Number.isFinite(numericScore)) return 'Pending'

  return numericScore.toFixed(1).replace('.0', '')
}

const getUniqueYears = (vehicles) =>
  [...new Set(vehicles.map((vehicle) => vehicle.year))]
    .filter((year) => year !== null && year !== undefined)
    .sort((a, b) => Number(b) - Number(a))
    .map(String)

const getUniqueMakes = (vehicles, year) =>
  [
    ...new Set(
      vehicles
        .filter((vehicle) => String(vehicle.year) === String(year))
        .map((vehicle) => vehicle.make),
    ),
  ]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))

const getUniqueModels = (vehicles, year, make) =>
  [
    ...new Set(
      vehicles
        .filter(
          (vehicle) =>
            String(vehicle.year) === String(year) && vehicle.make === make,
        )
        .map((vehicle) => vehicle.model),
    ),
  ]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))

function App() {
  const [selectedYear, setSelectedYear] = useState('2011')
  const [selectedMake, setSelectedMake] = useState('GMC')
  const [selectedModel, setSelectedModel] = useState('Acadia')
  const [vehicles, setVehicles] = useState([])
  const [vehicleOptionsStatus, setVehicleOptionsStatus] = useState('loading')
  const [status, setStatus] = useState('idle')
  const [result, setResult] = useState(null)

  useEffect(() => {
    const loadVehicles = async () => {
      setVehicleOptionsStatus('loading')

      try {
        if (!supabase) {
          throw new Error('Supabase is not configured.')
        }

        const { data, error } = await supabase
          .from('vehicles')
          .select('id, year, make, model, trim, engine')

        if (error) throw error

        const loadedVehicles = data ?? []
        const yearOptions = getUniqueYears(loadedVehicles)
        const firstYear = yearOptions[0] ?? ''
        const makeOptions = getUniqueMakes(loadedVehicles, firstYear)
        const firstMake = makeOptions[0] ?? ''
        const modelOptions = getUniqueModels(loadedVehicles, firstYear, firstMake)
        const firstModel = modelOptions[0] ?? ''

        setVehicles(loadedVehicles)

        if (firstYear) {
          setSelectedYear(firstYear)
          setSelectedMake(firstMake)
          setSelectedModel(firstModel)
        }

        setVehicleOptionsStatus('loaded')
      } catch (error) {
        console.error('Error loading available vehicles:', error)
        setVehicles([])
        setVehicleOptionsStatus('loaded')
      }
    }

    loadVehicles()
  }, [])

  const yearOptions = useMemo(() => getUniqueYears(vehicles), [vehicles])
  const makeOptions = useMemo(
    () => getUniqueMakes(vehicles, selectedYear),
    [vehicles, selectedYear],
  )
  const modelOptions = useMemo(
    () => getUniqueModels(vehicles, selectedYear, selectedMake),
    [vehicles, selectedYear, selectedMake],
  )

  const hasVehicleOptions = vehicles.length > 0
  const isLoadingVehicleOptions = vehicleOptionsStatus === 'loading'

  const handleYearChange = (event) => {
    const nextYear = event.target.value
    const nextMakes = getUniqueMakes(vehicles, nextYear)
    const nextMake = nextMakes[0] ?? ''
    const nextModels = getUniqueModels(vehicles, nextYear, nextMake)

    setSelectedYear(nextYear)
    setSelectedMake(nextMake)
    setSelectedModel(nextModels[0] ?? '')
    setResult(null)
    setStatus('idle')
  }

  const handleMakeChange = (event) => {
    const nextMake = event.target.value
    const nextModels = getUniqueModels(vehicles, selectedYear, nextMake)

    setSelectedMake(nextMake)
    setSelectedModel(nextModels[0] ?? '')
    setResult(null)
    setStatus('idle')
  }

  const handleModelChange = (event) => {
    setSelectedModel(event.target.value)
    setResult(null)
    setStatus('idle')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setStatus('loading')
    setResult(null)

    try {
      if (!supabase) {
        throw new Error('Supabase is not configured.')
      }

      const { data: vehicle, error: vehicleError } = await supabase
        .from('vehicles')
        .select('id, year, make, model, trim, engine, generation')
        .eq('year', Number(selectedYear))
        .eq('make', selectedMake)
        .eq('model', selectedModel)
        .maybeSingle()

      if (vehicleError) throw vehicleError

      if (!vehicle) {
        setStatus('not-found')
        return
      }

      const [vehicleScoreResponse, repairScoresResponse] = await Promise.all([
        supabase
          .from('vehicle_scores')
          .select('id, overall_score, score_label, verdict, calculated_at')
          .eq('vehicle_id', vehicle.id)
          .maybeSingle(),
        supabase
          .from('repair_scores')
          .select(
            'id, repair_task_id, labor_hours, wrenchability_score, score_label, explanation',
          )
          .eq('vehicle_id', vehicle.id),
      ])

      if (vehicleScoreResponse.error) throw vehicleScoreResponse.error
      if (repairScoresResponse.error) throw repairScoresResponse.error

      const repairScores = repairScoresResponse.data ?? []
      const repairTaskIds = [...new Set(repairScores.map((repair) => repair.repair_task_id))]

      const { data: repairTasks, error: repairTasksError } = repairTaskIds.length
        ? await supabase
            .from('repair_tasks')
            .select('id, name, category, display_order')
            .in('id', repairTaskIds)
        : { data: [], error: null }

      if (repairTasksError) throw repairTasksError

      const tasksById = new Map(repairTasks.map((task) => [task.id, task]))
      const repairs = repairScores
        .map((repair) => {
          const task = tasksById.get(repair.repair_task_id)

          return {
            id: repair.id,
            name: task?.name ?? 'Unknown repair task',
            category: task?.category ?? '',
            displayOrder: task?.display_order ?? 999,
            hours: repair.labor_hours,
            score: repair.wrenchability_score,
            label: repair.score_label,
            explanation: repair.explanation,
          }
        })
        .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name))

      setResult({
        vehicle,
        vehicleScore: vehicleScoreResponse.data,
        repairs,
      })
      setStatus('success')
    } catch (error) {
      console.error('Error loading Wrenchability data:', error)
      setStatus('error')
    }
  }

  const hasResultsState = status !== 'idle'
  const vehicleTitle = result
    ? `${result.vehicle.year} ${result.vehicle.make} ${result.vehicle.model}`
    : `${selectedYear} ${selectedMake} ${selectedModel}`

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
                <select
                  value={selectedYear}
                  onChange={handleYearChange}
                  disabled={isLoadingVehicleOptions || !hasVehicleOptions}
                >
                  {yearOptions.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Make
                <select
                  value={selectedMake}
                  onChange={handleMakeChange}
                  disabled={isLoadingVehicleOptions || !hasVehicleOptions}
                >
                  {makeOptions.map((make) => (
                    <option key={make} value={make}>
                      {make}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Model
                <select
                  value={selectedModel}
                  onChange={handleModelChange}
                  disabled={isLoadingVehicleOptions || !hasVehicleOptions}
                >
                  {modelOptions.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <button type="submit" disabled={status === 'loading' || !hasVehicleOptions}>
              {status === 'loading' ? 'Checking Wrenchability...' : 'Check Wrenchability'}
            </button>
            {isLoadingVehicleOptions && (
              <p className="helper-text notice">Loading available vehicles...</p>
            )}
            {!isLoadingVehicleOptions && !hasVehicleOptions && (
              <p className="helper-text notice">No vehicle data has been loaded yet.</p>
            )}
            <p className="helper-text">
              Start with the seeded 2011 GMC Acadia, then try other vehicles as data is added.
            </p>
          </form>
        </section>

        {hasResultsState && (
          <section className="results-section" aria-live="polite">
            {status === 'loading' && (
              <article className="status-card">Checking Wrenchability...</article>
            )}

            {status === 'error' && (
              <article className="status-card error">
                Something went wrong loading vehicle data.
              </article>
            )}

            {status === 'not-found' && (
              <article className="status-card">
                We do not have Wrenchability data for that vehicle yet.
              </article>
            )}

            {status === 'success' && result && (
              <>
                <div className="section-heading">
                  <p className="eyebrow">Vehicle result</p>
                  <h2>{vehicleTitle}</h2>
                </div>

                <article className="result-card">
                  <div className="result-summary">
                    <div>
                      <span className="meta-label">Vehicle</span>
                      <h3>{vehicleTitle}</h3>
                    </div>
                    <div className="score-badge">
                      <span>Overall Wrenchability Score</span>
                      <strong>
                        {result.vehicleScore
                          ? `${formatScore(result.vehicleScore.overall_score)} / 10`
                          : 'Pending'}
                      </strong>
                      {result.vehicleScore?.score_label && (
                        <em>{result.vehicleScore.score_label}</em>
                      )}
                    </div>
                  </div>
                  <p>
                    {result.vehicleScore?.verdict ??
                      'Wrenchability data is available, but the overall verdict is still pending.'}
                  </p>
                </article>

                <div className="repairs-panel">
                  <div className="section-heading compact">
                    <p className="eyebrow">Top common ownership repairs</p>
                    <h2>Repair difficulty snapshot</h2>
                  </div>

                  <div className="repair-list">
                    {result.repairs.map((repair) => (
                      <article className="repair-row" key={repair.id}>
                        <div className="repair-main">
                          <h3>{repair.name}</h3>
                          <span>{Number(repair.hours).toFixed(1)} labor hours</span>
                          {repair.category && <p className="repair-detail">{repair.category}</p>}
                          {repair.explanation && (
                            <p className="repair-detail">{repair.explanation}</p>
                          )}
                        </div>
                        <div className="repair-score">
                          <div className="score-line">
                            <strong>{formatScore(repair.score)} / 10</strong>
                            <span className={`label-pill ${scoreClass(repair.score)}`}>
                              {repair.label}
                            </span>
                          </div>
                          <div className="meter" aria-label={`${repair.score} out of 10`}>
                            <span
                              className={scoreClass(repair.score)}
                              style={{
                                width: `${Math.max(0, Math.min(Number(repair.score), 10)) * 10}%`,
                              }}
                            />
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              </>
            )}
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
