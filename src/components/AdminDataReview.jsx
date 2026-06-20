import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { formatScore } from '../lib/formatters'
import DataStatus from './DataStatus'

const ADMIN_PASSWORD = 'adminadminadmin'
const ADMIN_SESSION_KEY = 'wrenchable_admin_unlocked'

const PAGE_SIZES = [25, 50, 100, 250]

const SORTABLE_COLUMNS = [
  { key: 'year', label: 'Year', source: 'year' },
  { key: 'make', label: 'Make', source: 'make' },
  { key: 'model', label: 'Model', source: 'model' },
  { key: 'engine', label: 'Engine', source: 'engine' },
  { key: 'fuel_type', label: 'Fuel Type', source: 'fuel_type' },
  { key: 'source_engine_slug', label: 'Source Engine Slug', source: 'source_engine_slug' },
  { key: 'updated_at', label: 'Vehicle Updated', source: 'created_at' },
  { key: 'created_at', label: 'Created At', source: 'created_at' },
]

const SCORE_LABEL_OPTIONS = [
  'Easy to Wrench',
  'DIY Friendly',
  'Moderate',
  'Advanced',
  'Major Project',
]

const getScoreRow = (vehicle) => {
  const scoreRows = vehicle?.vehicle_scores

  if (Array.isArray(scoreRows)) return scoreRows[0] ?? null
  return scoreRows ?? null
}

const formatDate = (value) => {
  if (!value) return ''

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)

  return date.toLocaleString()
}

const getVehicleSearchText = (vehicle) =>
  [
    vehicle.make,
    vehicle.model,
    vehicle.engine,
    vehicle.source_engine_slug,
  ]
    .join(' ')
    .toLowerCase()

const mapVehicleRow = (vehicle) => {
  const score = getScoreRow(vehicle)

  return {
    ...vehicle,
    updated_at: vehicle?.updated_at ?? vehicle?.created_at ?? null,
    overall_score: score?.overall_score ?? null,
    score_label: score?.score_label ?? null,
    score_updated_at: score?.updated_at ?? score?.calculated_at ?? null,
  }
}

const buildCsvValue = (value) => {
  const text = String(value ?? '')
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export default function AdminDataReview({
  dataStatusCards = [],
  dataStatusState = 'idle',
  dataStatusSummary = null,
  onRefreshDataStatus,
}) {
  const [isUnlocked, setIsUnlocked] = useState(() => {
    try {
      return window.sessionStorage?.getItem(ADMIN_SESSION_KEY) === 'true'
    } catch {
      return false
    }
  })
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [rows, setRows] = useState([])
  const [filterOptions, setFilterOptions] = useState({
    years: [],
    makes: [],
    models: [],
    scoreLabels: SCORE_LABEL_OPTIONS,
  })
  const [filters, setFilters] = useState({
    year: '',
    make: '',
    model: '',
    engine: '',
    scoreLabel: '',
    search: '',
    scoreState: 'all',
  })
  const [sortConfig, setSortConfig] = useState({ key: 'updated_at', direction: 'desc' })
  const [pageSize, setPageSize] = useState(50)
  const [page, setPage] = useState(0)
  const [totalCount, setTotalCount] = useState(null)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [expandedRowId, setExpandedRowId] = useState('')
  const [adminSection, setAdminSection] = useState('vehicles')

  const visibleRows = useMemo(() => {
    const searchText = filters.search.trim().toLowerCase()

    return rows.filter((row) => {
      if (filters.scoreLabel && row.score_label !== filters.scoreLabel) return false
      if (filters.scoreState === 'missing' && row.overall_score !== null) return false
      if (filters.scoreState === 'scored' && row.overall_score === null) return false
      if (searchText && !getVehicleSearchText(row).includes(searchText)) return false
      return true
    })
  }, [filters.scoreLabel, filters.scoreState, filters.search, rows])

  const pageCount = totalCount === null ? null : Math.max(1, Math.ceil(totalCount / pageSize))
  const loadedRangeStart = totalCount === 0 ? 0 : page * pageSize + 1
  const loadedRangeEnd = page * pageSize + visibleRows.length

  const applyVehicleFilters = useCallback((query) => {
    let nextQuery = query

    if (filters.year) nextQuery = nextQuery.eq('year', Number(filters.year))
    if (filters.make) nextQuery = nextQuery.eq('make', filters.make)
    if (filters.model) nextQuery = nextQuery.eq('model', filters.model)
    if (filters.engine) nextQuery = nextQuery.ilike('engine', `%${filters.engine}%`)
    if (filters.search.trim()) {
      const searchText = filters.search.trim().replaceAll(',', ' ')
      nextQuery = nextQuery.or(
        `make.ilike.%${searchText}%,model.ilike.%${searchText}%,engine.ilike.%${searchText}%,source_engine_slug.ilike.%${searchText}%`,
      )
    }

    return nextQuery
  }, [filters.engine, filters.make, filters.model, filters.search, filters.year])

  const loadFilterOptions = useCallback(async () => {
    if (!supabase) return

    const { data, error: optionsError } = await supabase
      .from('vehicles')
      .select('year, make, model')
      .order('year', { ascending: false })
      .range(0, 999)

    if (optionsError) {
      console.warn('Admin filter options unavailable:', optionsError)
      return
    }

    const optionRows = data ?? []
    setFilterOptions({
      years: [...new Set(optionRows.map((row) => row.year).filter(Boolean))]
        .sort((a, b) => Number(b) - Number(a))
        .map(String),
      makes: [...new Set(optionRows.map((row) => row.make).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b)),
      models: [...new Set(optionRows.map((row) => row.model).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b)),
      scoreLabels: SCORE_LABEL_OPTIONS,
    })
  }, [])

  const loadRows = useCallback(async () => {
    setStatus('loading')
    setError('')

    try {
      if (!supabase) {
        throw new Error('Supabase is not configured.')
      }

      const scoreJoin =
        filters.scoreState === 'scored' || filters.scoreLabel
          ? 'vehicle_scores!inner'
          : 'vehicle_scores'
      let query = supabase
        .from('vehicles')
        .select(
          `
            id,
            year,
            make,
            model,
            trim,
            engine,
            source_make_slug,
            source_model_slug,
            source_engine_slug,
            fuel_type,
            created_at,
            ${scoreJoin} (
              vehicle_id,
              overall_score,
              score_label,
              calculated_at
            )
          `,
          { count: 'exact' },
        )

      query = applyVehicleFilters(query)

      if (filters.scoreState === 'missing') {
        query = query.is('vehicle_scores.vehicle_id', null)
      } else if (filters.scoreLabel) {
        query = query.eq('vehicle_scores.score_label', filters.scoreLabel)
      }

      const sortColumn = SORTABLE_COLUMNS.find((column) => column.key === sortConfig.key)
      if (sortColumn) {
        query = query.order(sortColumn.source, { ascending: sortConfig.direction === 'asc' })
      }

      const start = page * pageSize
      const end = start + pageSize - 1
      const { data, error: rowsError, count } = await query.range(start, end)

      if (rowsError) throw rowsError

      setRows((data ?? []).map(mapVehicleRow))
      setTotalCount(count ?? null)
      setStatus('loaded')
    } catch (loadError) {
      console.error('Error loading admin vehicle data:', loadError)
      setRows([])
      setTotalCount(null)
      setError(loadError instanceof Error ? loadError.message : 'Unable to load vehicle data.')
      setStatus('error')
    }
  }, [
    applyVehicleFilters,
    filters.scoreLabel,
    filters.scoreState,
    page,
    pageSize,
    sortConfig.direction,
    sortConfig.key,
  ])

  useEffect(() => {
    if (!isUnlocked) return

    loadFilterOptions()
  }, [isUnlocked, loadFilterOptions])

  useEffect(() => {
    if (!isUnlocked) return

    loadRows()
  }, [isUnlocked, loadRows])

  useEffect(() => {
    if (!isUnlocked || adminSection !== 'data-status' || dataStatusState !== 'idle') return

    onRefreshDataStatus?.()
  }, [adminSection, dataStatusState, isUnlocked, onRefreshDataStatus])

  const unlock = (event) => {
    event.preventDefault()

    if (password === ADMIN_PASSWORD) {
      window.sessionStorage?.setItem(ADMIN_SESSION_KEY, 'true')
      setIsUnlocked(true)
      setPassword('')
      setPasswordError('')
      return
    }

    setPasswordError('Incorrect password.')
  }

  const lock = () => {
    window.sessionStorage?.removeItem(ADMIN_SESSION_KEY)
    setIsUnlocked(false)
    setRows([])
    setExpandedRowId('')
  }

  const updateFilter = (key, value) => {
    setFilters((currentFilters) => ({ ...currentFilters, [key]: value }))
    setPage(0)
  }

  const updateSort = (key) => {
    setSortConfig((currentSort) => ({
      key,
      direction:
        currentSort.key === key && currentSort.direction === 'asc' ? 'desc' : 'asc',
    }))
    setPage(0)
  }

  const exportCsv = () => {
    const headers = [
      'Year',
      'Make',
      'Model',
      'Engine',
      'Fuel Type',
      'Score',
      'Score Label',
      'Source Engine Slug',
      'Vehicle ID',
      'Vehicle Updated',
      'Score Updated',
      'Trim',
      'Source Make Slug',
      'Source Model Slug',
      'Created At',
    ]
    const csvRows = visibleRows.map((row) => [
      row.year,
      row.make,
      row.model,
      row.engine,
      row.fuel_type,
      row.overall_score ?? 'Pending',
      row.score_label ?? 'Pending',
      row.source_engine_slug,
      row.id,
      row.updated_at,
      row.score_updated_at,
      row.trim,
      row.source_make_slug,
      row.source_model_slug,
      row.created_at,
    ])
    const csv = [headers, ...csvRows]
      .map((row) => row.map(buildCsvValue).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'wrenchable-cars-data-review.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  if (!isUnlocked) {
    return (
      <main id="top">
        <section className="admin-section">
          <form className="admin-card admin-lock-card" onSubmit={unlock}>
            <p className="eyebrow">Admin</p>
            <h1>Data Review</h1>
            <p className="helper-text">
              Enter the admin password to review read-only vehicle data.
            </p>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
              />
            </label>
            <button type="submit">Unlock</button>
            {passwordError && <p className="helper-text notice">{passwordError}</p>}
          </form>
        </section>
      </main>
    )
  }

  return (
    <main id="top">
      <section className="admin-section">
        <div className="admin-card">
          <div className="admin-header">
            <div>
              <p className="eyebrow">Admin</p>
              <h1>Data Review</h1>
              <p className="helper-text">
                Read-only vehicle data pulled directly from the database.
              </p>
            </div>
            <div className="admin-actions">
              <button className="secondary-button" type="button" onClick={loadRows}>
                Refresh
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={exportCsv}
                disabled={visibleRows.length === 0}
              >
                Export CSV
              </button>
              <button className="secondary-button" type="button" onClick={lock}>
                Lock
              </button>
            </div>
          </div>

          <div className="admin-section-tabs" aria-label="Admin sections">
            <button
              className={adminSection === 'vehicles' ? 'active' : ''}
              type="button"
              onClick={() => setAdminSection('vehicles')}
            >
              Vehicles Table
            </button>
            <button
              className={adminSection === 'data-status' ? 'active' : ''}
              type="button"
              onClick={() => setAdminSection('data-status')}
            >
              Data Status
            </button>
          </div>

          {adminSection === 'vehicles' && (
            <>
          <div className="admin-quick-filters" aria-label="Score filters">
            {[
              { value: 'all', label: 'All' },
              { value: 'missing', label: 'Missing scores' },
              { value: 'scored', label: 'Scored only' },
            ].map((option) => (
              <button
                className={filters.scoreState === option.value ? 'active' : ''}
                key={option.value}
                type="button"
                onClick={() => updateFilter('scoreState', option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="admin-filter-grid">
            <label>
              Search
              <input
                type="search"
                value={filters.search}
                onChange={(event) => updateFilter('search', event.target.value)}
                placeholder="make, model, engine, slug"
              />
            </label>
            <label>
              Year
              <select value={filters.year} onChange={(event) => updateFilter('year', event.target.value)}>
                <option value="">All</option>
                {filterOptions.years.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </label>
            <label>
              Make
              <select value={filters.make} onChange={(event) => updateFilter('make', event.target.value)}>
                <option value="">All</option>
                {filterOptions.makes.map((make) => (
                  <option key={make} value={make}>{make}</option>
                ))}
              </select>
            </label>
            <label>
              Model
              <select value={filters.model} onChange={(event) => updateFilter('model', event.target.value)}>
                <option value="">All</option>
                {filterOptions.models.map((model) => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </select>
            </label>
            <label>
              Engine
              <input
                value={filters.engine}
                onChange={(event) => updateFilter('engine', event.target.value)}
                placeholder="engine text"
              />
            </label>
            <label>
              Score Label
              <select
                value={filters.scoreLabel}
                onChange={(event) => updateFilter('scoreLabel', event.target.value)}
              >
                <option value="">All</option>
                {filterOptions.scoreLabels.map((label) => (
                  <option key={label} value={label}>{label}</option>
                ))}
              </select>
            </label>
            <label>
              Page size
              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value))
                  setPage(0)
                }}
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="admin-table-status">
            <span>
              {totalCount === null
                ? `${visibleRows.length} loaded rows`
                : `Showing ${loadedRangeStart}-${loadedRangeEnd} of ${totalCount}`}
            </span>
            {status === 'loading' && <em>Loading...</em>}
            {status === 'error' && <em className="admin-error">{error}</em>}
          </div>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  {SORTABLE_COLUMNS.slice(0, 7).map((column) => (
                    <th key={column.key}>
                      <button type="button" onClick={() => updateSort(column.key)}>
                        {column.label}
                        {sortConfig.key === column.key && (
                          <span>{sortConfig.direction === 'asc' ? ' up' : ' down'}</span>
                        )}
                      </button>
                    </th>
                  ))}
                  <th>Score</th>
                  <th>Score Label</th>
                  <th>Vehicle ID</th>
                  <th>Score Updated</th>
                </tr>
              </thead>
              <tbody>
                {status === 'loaded' && visibleRows.length === 0 && (
                  <tr>
                    <td colSpan="11">No vehicles match the current filters.</td>
                  </tr>
                )}
                {visibleRows.map((row) => (
                  <Fragment key={row.id}>
                    <tr
                      className={expandedRowId === row.id ? 'expanded' : ''}
                      onClick={() => setExpandedRowId(expandedRowId === row.id ? '' : row.id)}
                    >
                      <td>{row.year}</td>
                      <td>{row.make}</td>
                      <td>{row.model}</td>
                      <td>{row.engine || row.trim || 'Base / unspecified'}</td>
                      <td>{row.fuel_type || ''}</td>
                      <td>{row.source_engine_slug || ''}</td>
                      <td>{formatDate(row.updated_at)}</td>
                      <td>{row.overall_score === null ? 'Pending' : formatScore(row.overall_score)}</td>
                      <td>{row.score_label ?? 'Pending'}</td>
                      <td className="mono-cell">{row.id}</td>
                      <td>{formatDate(row.score_updated_at)}</td>
                    </tr>
                    {expandedRowId === row.id && (
                      <tr className="admin-detail-row">
                        <td colSpan="11">
                          <dl>
                            <div><dt>Vehicle ID</dt><dd>{row.id}</dd></div>
                            <div><dt>Source Make Slug</dt><dd>{row.source_make_slug || ''}</dd></div>
                            <div><dt>Source Model Slug</dt><dd>{row.source_model_slug || ''}</dd></div>
                            <div><dt>Source Engine Slug</dt><dd>{row.source_engine_slug || ''}</dd></div>
                            <div><dt>Created At</dt><dd>{formatDate(row.created_at)}</dd></div>
                            <div><dt>Vehicle Updated</dt><dd>{formatDate(row.updated_at)}</dd></div>
                            <div><dt>Overall Score</dt><dd>{row.overall_score ?? 'Pending'}</dd></div>
                            <div><dt>Score Label</dt><dd>{row.score_label ?? 'Pending'}</dd></div>
                            <div><dt>Score Updated</dt><dd>{formatDate(row.score_updated_at)}</dd></div>
                          </dl>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div className="admin-pagination">
            <button
              className="secondary-button"
              type="button"
              onClick={() => setPage((currentPage) => Math.max(0, currentPage - 1))}
              disabled={page === 0 || status === 'loading'}
            >
              Previous
            </button>
            <span>
              Page {page + 1}{pageCount ? ` of ${pageCount}` : ''}
            </span>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setPage((currentPage) => currentPage + 1)}
              disabled={status === 'loading' || (pageCount !== null && page + 1 >= pageCount)}
            >
              Next
            </button>
          </div>
            </>
          )}

          {adminSection === 'data-status' && (
            <div className="admin-data-status-section">
              <DataStatus
                dataStatusCards={dataStatusCards}
                dataStatusState={dataStatusState}
                dataStatusSummary={dataStatusSummary}
                helperText="Database health and import progress summary."
                onRefresh={onRefreshDataStatus}
              />
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
