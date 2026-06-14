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

const TOP_OWNERSHIP_REPAIR_SLUGS = [
  'headlight-bulb',
  'water-pump',
  'alternator',
  'starter',
  'brake-pads-front',
  'brake-pads-rear',
  'battery',
  'spark-plugs',
  'ignition-coils-all',
  'thermostat',
  'radiator',
  'serpentine-belt',
  'serpentine-belt-tensioner',
  'headlight-assembly',
  'tail-light-bulb',
  'wheel-bearing-front',
  'strut-assembly-front',
  'lower-control-arm-front',
  'fuel-pump',
  'blower-motor',
]

const TOP_OWNERSHIP_REPAIR_NAME_KEYWORDS = [
  { slug: 'headlight-bulb', keywords: ['headlight', 'bulb'] },
  { slug: 'water-pump', keywords: ['water pump'] },
  { slug: 'alternator', keywords: ['alternator'] },
  { slug: 'starter', keywords: ['starter'] },
  { slug: 'brake-pads-front', keywords: ['front', 'brake'] },
  { slug: 'brake-pads-rear', keywords: ['rear', 'brake'] },
  { slug: 'battery', keywords: ['battery'] },
  { slug: 'spark-plugs', keywords: ['spark plug'] },
  { slug: 'ignition-coils-all', keywords: ['ignition coil'] },
  { slug: 'thermostat', keywords: ['thermostat'] },
  { slug: 'radiator', keywords: ['radiator'] },
  { slug: 'serpentine-belt', keywords: ['serpentine belt'] },
  { slug: 'serpentine-belt-tensioner', keywords: ['belt tensioner'] },
  { slug: 'headlight-assembly', keywords: ['headlight', 'assembly'] },
  { slug: 'tail-light-bulb', keywords: ['tail light', 'bulb'] },
  { slug: 'wheel-bearing-front', keywords: ['front', 'wheel bearing'] },
  { slug: 'strut-assembly-front', keywords: ['front', 'strut'] },
  { slug: 'lower-control-arm-front', keywords: ['front', 'lower control arm'] },
  { slug: 'fuel-pump', keywords: ['fuel pump'] },
  { slug: 'blower-motor', keywords: ['blower motor'] },
]

const REPAIR_VIEW_FILTERS = [
  { value: 'top-ownership', label: 'Top 20 Ownership Repairs' },
  { value: 'easiest', label: 'Easiest Repairs' },
  { value: 'hardest', label: 'Hardest Repairs' },
  { value: 'all', label: 'All Repairs' },
]

const REPAIR_SORT_MODES = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'score-desc', label: 'Wrenchability: High to Low' },
  { value: 'score-asc', label: 'Wrenchability: Low to High' },
  { value: 'hours-asc', label: 'Labor Hours: Low to High' },
  { value: 'hours-desc', label: 'Labor Hours: High to Low' },
  { value: 'name-asc', label: 'Repair Name: A to Z' },
]

const normalizeText = (value) => String(value ?? '').trim().toLowerCase()

const getRepairTask = (repair) =>
  repair?.repair_tasks ?? repair?.repair_task ?? repair?.task ?? null

const getRepairName = (repair) => {
  const task = getRepairTask(repair)

  return repair?.name ?? repair?.repair_name ?? task?.name ?? 'Unknown repair task'
}

const getRepairCategory = (repair) => {
  const task = getRepairTask(repair)

  return repair?.category ?? repair?.repair_category ?? task?.category ?? ''
}

const getRepairSlug = (repair) => {
  const task = getRepairTask(repair)

  return (
    repair?.source_job_slug ??
    repair?.repair_slug ??
    repair?.slug ??
    task?.source_job_slug ??
    task?.slug ??
    ''
  )
}

const getRepairScore = (repair) => Number(repair?.score ?? repair?.wrenchability_score)

const getRepairHours = (repair) => Number(repair?.hours ?? repair?.labor_hours)

const getRepairDisplayOrder = (repair) => {
  const task = getRepairTask(repair)
  const displayOrder = Number(repair?.displayOrder ?? repair?.display_order ?? task?.display_order)

  return Number.isFinite(displayOrder) ? displayOrder : 999
}

const getTopOwnershipOrder = (repair) => {
  const slug = normalizeText(getRepairSlug(repair))
  const slugIndex = TOP_OWNERSHIP_REPAIR_SLUGS.indexOf(slug)

  if (slugIndex >= 0) return slugIndex

  const repairName = normalizeText(getRepairName(repair))
  const keywordMatch = TOP_OWNERSHIP_REPAIR_NAME_KEYWORDS.find(({ keywords }) =>
    keywords.every((keyword) => repairName.includes(keyword)),
  )

  return keywordMatch
    ? TOP_OWNERSHIP_REPAIR_SLUGS.indexOf(keywordMatch.slug)
    : Number.POSITIVE_INFINITY
}

const isTopOwnershipRepair = (repair) => Number.isFinite(getTopOwnershipOrder(repair))

const compareNumbers = (first, second) => {
  const firstNumber = Number.isFinite(first) ? first : Number.POSITIVE_INFINITY
  const secondNumber = Number.isFinite(second) ? second : Number.POSITIVE_INFINITY

  return firstNumber - secondNumber
}

const compareFiniteNumbers = (first, second, direction = 'asc') => {
  const firstIsFinite = Number.isFinite(first)
  const secondIsFinite = Number.isFinite(second)

  if (!firstIsFinite && !secondIsFinite) return 0
  if (!firstIsFinite) return 1
  if (!secondIsFinite) return -1

  return direction === 'desc' ? second - first : first - second
}

const compareRepairNames = (first, second) =>
  getRepairName(first).localeCompare(getRepairName(second))

const getRecommendedRepairSort = (viewFilter) => {
  if (viewFilter === 'top-ownership') {
    return (first, second) =>
      compareNumbers(getTopOwnershipOrder(first), getTopOwnershipOrder(second)) ||
      compareRepairNames(first, second)
  }

  if (viewFilter === 'easiest') {
    return (first, second) =>
      compareFiniteNumbers(getRepairScore(first), getRepairScore(second), 'desc') ||
      compareRepairNames(first, second)
  }

  if (viewFilter === 'hardest') {
    return (first, second) =>
      compareFiniteNumbers(getRepairScore(first), getRepairScore(second), 'asc') ||
      compareRepairNames(first, second)
  }

  return (first, second) =>
    compareNumbers(getRepairDisplayOrder(first), getRepairDisplayOrder(second)) ||
    compareRepairNames(first, second)
}

const getRepairSort = (viewFilter, sortMode) => {
  if (sortMode === 'score-desc') {
    return (first, second) =>
      compareFiniteNumbers(getRepairScore(first), getRepairScore(second), 'desc') ||
      compareRepairNames(first, second)
  }

  if (sortMode === 'score-asc') {
    return (first, second) =>
      compareFiniteNumbers(getRepairScore(first), getRepairScore(second), 'asc') ||
      compareRepairNames(first, second)
  }

  if (sortMode === 'hours-asc') {
    return (first, second) =>
      compareFiniteNumbers(getRepairHours(first), getRepairHours(second), 'asc') ||
      compareRepairNames(first, second)
  }

  if (sortMode === 'hours-desc') {
    return (first, second) =>
      compareFiniteNumbers(getRepairHours(first), getRepairHours(second), 'desc') ||
      compareRepairNames(first, second)
  }

  if (sortMode === 'name-asc') {
    return compareRepairNames
  }

  return getRecommendedRepairSort(viewFilter)
}

const getFilteredAndSortedRepairs = (repairs, viewFilter, sortMode, searchText) => {
  const normalizedSearch = normalizeText(searchText)
  const shouldLimit = viewFilter === 'easiest' || viewFilter === 'hardest'

  return repairs
    .filter((repair) => viewFilter !== 'top-ownership' || isTopOwnershipRepair(repair))
    .filter((repair) => {
      if (!normalizedSearch) return true

      return [getRepairName(repair), getRepairCategory(repair)]
        .map(normalizeText)
        .some((value) => value.includes(normalizedSearch))
    })
    .sort(getRepairSort(viewFilter, sortMode))
    .slice(0, shouldLimit ? 20 : undefined)
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
  const [repairViewFilter, setRepairViewFilter] = useState('top-ownership')
  const [repairSortMode, setRepairSortMode] = useState('recommended')
  const [repairSearchText, setRepairSearchText] = useState('')

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
    setRepairViewFilter('top-ownership')
    setRepairSortMode('recommended')
    setRepairSearchText('')

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
            .select('id, name, category, display_order, source_job_slug')
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
            source_job_slug: task?.source_job_slug ?? '',
            repair_tasks: task ?? null,
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
  const visibleRepairs = useMemo(
    () =>
      getFilteredAndSortedRepairs(
        result?.repairs ?? [],
        repairViewFilter,
        repairSortMode,
        repairSearchText,
      ),
    [result?.repairs, repairViewFilter, repairSortMode, repairSearchText],
  )
  const repairSummaryText = useMemo(() => {
    const count = visibleRepairs.length

    if (repairViewFilter === 'top-ownership') {
      return `Showing ${count} top ownership ${count === 1 ? 'repair' : 'repairs'}`
    }

    if (repairViewFilter === 'easiest') {
      return `Showing ${count} easiest ${count === 1 ? 'repair' : 'repairs'}`
    }

    if (repairViewFilter === 'hardest') {
      return `Showing ${count} hardest ${count === 1 ? 'repair' : 'repairs'}`
    }

    return `Showing ${count} ${count === 1 ? 'repair' : 'repairs'}`
  }, [repairViewFilter, visibleRepairs.length])

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

                  <div className="repair-controls" aria-label="Repair list controls">
                    <div className="filter-button-group" aria-label="Repair view filter">
                      {REPAIR_VIEW_FILTERS.map((option) => (
                        <button
                          className={repairViewFilter === option.value ? 'active' : ''}
                          key={option.value}
                          type="button"
                          onClick={() => setRepairViewFilter(option.value)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>

                    <div className="repair-control-row">
                      <label>
                        Sort repairs
                        <select
                          value={repairSortMode}
                          onChange={(event) => setRepairSortMode(event.target.value)}
                        >
                          {REPAIR_SORT_MODES.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label>
                        Search repairs
                        <input
                          type="search"
                          value={repairSearchText}
                          onChange={(event) => setRepairSearchText(event.target.value)}
                          placeholder="Filter repairs..."
                        />
                      </label>
                    </div>
                  </div>

                  <p className="repair-summary">{repairSummaryText}</p>

                  <div className="repair-list">
                    {visibleRepairs.length === 0 && (
                      <article className="empty-repairs">
                        No repairs match your current filters.
                      </article>
                    )}
                    {visibleRepairs.map((repair) => (
                      <article className="repair-row" key={repair.id}>
                        <div className="repair-main">
                          <h3>{getRepairName(repair)}</h3>
                          <span>{Number(getRepairHours(repair)).toFixed(1)} labor hours</span>
                          {getRepairCategory(repair) && (
                            <p className="repair-detail">{getRepairCategory(repair)}</p>
                          )}
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
