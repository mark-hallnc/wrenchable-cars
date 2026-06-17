import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabaseClient'
import './App.css'

const BRAND = {
  name: 'Wrenchable Cars',
  tagline: 'Find cars that are easier to fix, maintain, and own.',
  shortTagline: 'Compare common repair labor times.',
}

const FEATURE_CALLOUTS = [
  {
    title: 'Search by Vehicle',
    description: 'Pick a year, make, model, and engine to see common repair ratings.',
  },
  {
    title: 'Browse Rankings',
    description: 'Find the easiest and hardest vehicles based on Wrenchability Score.',
  },
  {
    title: 'Compare Vehicles',
    description: 'Compare repair labor times side by side.',
  },
]

const WRENCHABILITY_SCORE_EXPLANATION =
  'Wrenchability Score is a 1-10 rating based on estimated labor time for common repairs. Higher scores generally mean simpler, more approachable maintenance and repair work.'

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
  { value: 'top-ownership', label: 'Top ownership repairs' },
  { value: 'easiest', label: 'Easiest repairs' },
  { value: 'hardest', label: 'Hardest repairs' },
  { value: 'all', label: 'All repairs' },
]

const REPAIR_SORT_MODES = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'score-desc', label: 'Wrenchability: High to Low' },
  { value: 'score-asc', label: 'Wrenchability: Low to High' },
  { value: 'hours-asc', label: 'Labor Hours: Low to High' },
  { value: 'hours-desc', label: 'Labor Hours: High to Low' },
  { value: 'name-asc', label: 'Repair Name: A to Z' },
]

const RANKING_TYPES = [
  { value: 'top', label: 'Top Easiest' },
  { value: 'bottom', label: 'Bottom Hardest' },
  { value: 'all', label: 'All Ranked' },
]

const RANKING_LIMITS = ['10', '25', '50', '100']

const QUEUE_STATUSES = ['pending', 'running', 'completed', 'skipped', 'failed']

const COMPARE_STORAGE_KEY = 'wrenchable_compare_vehicle_ids'

const COMPARE_REPAIR_VIEWS = [
  { value: 'top-ownership', label: 'Top Ownership Repairs' },
  { value: 'shared', label: 'All Shared Repairs' },
  { value: 'differences', label: 'Biggest Differences' },
]

const COMPARE_REPAIR_SORTS = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'average-easiest', label: 'Easiest average first' },
  { value: 'average-hardest', label: 'Hardest average first' },
  { value: 'labor-spread', label: 'Biggest labor-hour spread' },
  { value: 'name-asc', label: 'Repair name A-Z' },
]

const createCompareSlot = () => ({
  year: '',
  make: '',
  model: '',
  engineKey: '',
  vehicleId: '',
})

const normalizeCompareVehicleIds = (ids) =>
  [...new Set((Array.isArray(ids) ? ids : []).map((id) => String(id ?? '').trim()).filter(Boolean))]
    .slice(0, 3)

const getCompareVehicleIdsFromSlots = (slots) =>
  normalizeCompareVehicleIds(slots.map((slot) => slot.vehicleId))

const readStoredCompareVehicleIds = () => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return []

    const storedValue = window.localStorage.getItem(COMPARE_STORAGE_KEY)
    if (!storedValue) return []

    const parsedValue = JSON.parse(storedValue)
    return normalizeCompareVehicleIds(parsedValue)
  } catch (error) {
    console.warn('Unable to read saved comparison vehicles:', error)
    return []
  }
}

const writeStoredCompareVehicleIds = (ids) => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return

    const normalizedIds = normalizeCompareVehicleIds(ids)

    if (normalizedIds.length === 0) {
      window.localStorage.removeItem(COMPARE_STORAGE_KEY)
      return
    }

    window.localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(normalizedIds))
  } catch (error) {
    console.warn('Unable to save comparison vehicles:', error)
  }
}

const normalizeUrlVehicleIds = (value) =>
  normalizeCompareVehicleIds(String(value ?? '').split(','))

const getInitialUrlState = () => {
  if (typeof window === 'undefined') {
    return { view: 'search', vehicleId: '', compareIds: [] }
  }

  const params = new URLSearchParams(window.location.search)
  const view = params.get('view') ?? 'search'

  return {
    view,
    vehicleId: String(params.get('vehicleId') ?? '').trim(),
    compareIds: normalizeUrlVehicleIds(params.get('vehicles')),
  }
}

const buildShareUrl = (params) => {
  if (typeof window === 'undefined') return ''

  const url = new URL(window.location.href)
  url.search = ''

  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') {
      url.searchParams.set(key, value)
    }
  }

  return url.toString()
}

const updateBrowserUrl = (params, mode = 'push') => {
  if (typeof window === 'undefined' || !window.history) return

  const url = buildShareUrl(params)

  if (!url || url === window.location.href) return

  if (mode === 'replace') {
    window.history.replaceState({}, '', url)
    return
  }

  window.history.pushState({}, '', url)
}

const copyToClipboard = async (text) => {
  if (!text) return false

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch (error) {
    console.warn('Clipboard API unavailable:', error)
  }

  return false
}

const createCompareSlotsFromVehicles = (vehicleRows) => {
  const slots = normalizeCompareVehicleIds(vehicleRows.map((vehicle) => vehicle?.id))
    .map((vehicleId) => {
      const vehicle = vehicleRows.find((row) => String(row?.id) === String(vehicleId))

      return vehicle
        ? {
            year: String(vehicle.year ?? ''),
            make: vehicle.make ?? '',
            model: vehicle.model ?? '',
            engineKey: getEngineKey(vehicle),
            vehicleId: String(vehicle.id ?? ''),
          }
        : createCompareSlot()
    })

  while (slots.length < 3) {
    slots.push(createCompareSlot())
  }

  return slots.slice(0, 3)
}

const VEHICLE_VERDICT =
  'This score is based on common repair labor times and how approachable the vehicle is for typical maintenance and repair work.'

const normalizeText = (value) => String(value ?? '').trim().toLowerCase()

const optionalNumber = (value) => {
  if (value === '' || value === null || value === undefined) return null

  const numericValue = Number(value)

  return Number.isFinite(numericValue) ? numericValue : null
}

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

const incrementCount = (map, key, amount = 1) => {
  map.set(key, (map.get(key) ?? 0) + amount)
}

const getTopCountEntries = (map, limit = 10) =>
  [...map.entries()]
    .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]))
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }))

const selectAllRows = async (tableName, selectColumns) => {
  const pageSize = 1000
  const rows = []
  let start = 0

  while (true) {
    const { data, error } = await supabase
      .from(tableName)
      .select(selectColumns)
      .range(start, start + pageSize - 1)

    if (error) throw error

    const pageRows = data ?? []
    rows.push(...pageRows)

    if (pageRows.length < pageSize) break

    start += pageSize
  }

  return rows
}

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

const getVehicleTitle = (vehicle) =>
  [vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean).join(' ')

const getVehicleScoreValue = (vehicle) => Number(vehicle?.vehicleScore?.overall_score)

const formatEngineSlug = (slug) => {
  const words = String(slug ?? '')
    .trim()
    .split('-')
    .filter(Boolean)

  if (words.length === 0) return ''

  return words
    .map((word) => {
      const lowerWord = word.toLowerCase()

      if (/^\d+(\.\d+)?l$/.test(lowerWord)) return lowerWord.toUpperCase()
      if (/^v\d+$/.test(lowerWord)) return lowerWord.toUpperCase()
      if (lowerWord === 'ecoboost') return 'EcoBoost'
      if (lowerWord === 'coyote') return 'Coyote'
      if (lowerWord === 'hemi') return 'HEMI'
      if (lowerWord === 'vct') return 'VCT'
      if (lowerWord === 'ti') return 'Ti'

      return lowerWord.charAt(0).toUpperCase() + lowerWord.slice(1)
    })
    .join(' ')
}

const getVehicleConfigurationLabel = (vehicle) => {
  const engine = String(vehicle?.engine ?? '').trim()
  const sourceEngineSlug = formatEngineSlug(vehicle?.source_engine_slug)
  const trim = String(vehicle?.trim ?? '').trim()
  const configuration = engine || sourceEngineSlug || 'Base / unspecified engine'

  return trim ? `${configuration} - ${trim}` : configuration
}

const getEngineKey = (vehicle) => {
  const sourceEngineSlug = normalizeText(vehicle?.source_engine_slug)
  const engine = normalizeText(vehicle?.engine)

  return sourceEngineSlug || engine || 'base-unspecified'
}

const hasSpecificConfiguration = (vehicle) =>
  Boolean(normalizeText(vehicle?.engine) || normalizeText(vehicle?.source_engine_slug))

const getConfigurationBadgeLabel = (vehicle) =>
  hasSpecificConfiguration(vehicle) ? 'Engine-specific data' : 'General model data'

const hasSpecificEngineSibling = (vehicle, allVehicles) =>
  !hasSpecificConfiguration(vehicle) &&
  (allVehicles ?? []).some(
    (candidate) =>
      String(candidate.id) !== String(vehicle.id) &&
      String(candidate.year) === String(vehicle.year) &&
      candidate.make === vehicle.make &&
      candidate.model === vehicle.model &&
      hasSpecificConfiguration(candidate),
  )

const isGenericVehicleHidden = (vehicle, allVehicles) =>
  hasSpecificEngineSibling(vehicle, allVehicles)

const getVehicleVerdict = (vehicleScore) => {
  const verdict = vehicleScore?.verdict ?? ''
  const normalizedVerdict = normalizeText(verdict)

  if (
    !verdict ||
    normalizedVerdict.includes('imported vehicles') ||
    normalizedVerdict.includes('openlabor') ||
    normalizedVerdict.includes('open labor') ||
    normalizedVerdict.includes('percentile')
  ) {
    return VEHICLE_VERDICT
  }

  return verdict
}

const getUniqueRepairNames = (repairs, limit) => {
  const names = []
  const seenNames = new Set()

  for (const repair of repairs) {
    const name = getRepairName(repair)
      .replace(/\s+replacement$/i, '')
      .replace(/\s+service$/i, '')
      .trim()

    if (!name || seenNames.has(name.toLowerCase())) continue

    seenNames.add(name.toLowerCase())
    names.push(name)

    if (names.length >= limit) break
  }

  return names
}

const formatRepairNameList = (names) => {
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} and ${names[1]}`

  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
}

const formatHours = (hours) => {
  const numericHours = Number(hours)

  if (!Number.isFinite(numericHours)) return 'No data'

  return `${numericHours.toFixed(1)} ${numericHours === 1 ? 'hr' : 'hrs'}`
}

const getScoreBasedSummary = (overallScore) => {
  const score = Number(overallScore)

  if (!Number.isFinite(score)) {
    return 'More repair data is needed to explain this score.'
  }

  if (score >= 8) {
    return 'One of the easier vehicles in the current results.'
  }

  if (score >= 6.5) {
    return 'Generally approachable for common maintenance and repair work.'
  }

  if (score >= 5) {
    return 'A balanced option with some easy jobs and some harder ones.'
  }

  return 'Likely more demanding for DIY repair and maintenance.'
}

const buildVehicleScoreSummary = (vehicle, repairScores) => {
  const usableRepairs = (repairScores ?? [])
    .map((repair) => ({
      repair,
      score: getRepairScore(repair),
      hours: getRepairHours(repair),
    }))
    .filter(({ score, hours }) => Number.isFinite(score) || Number.isFinite(hours))

  if (usableRepairs.length === 0) {
    return 'More repair data is needed to explain this score.'
  }

  const scoredRepairs = usableRepairs.filter(({ score }) => Number.isFinite(score))
  const hourRepairs = usableRepairs.filter(({ hours }) => Number.isFinite(hours))
  const averageScore = scoredRepairs.length
    ? scoredRepairs.reduce((total, item) => total + item.score, 0) / scoredRepairs.length
    : null
  const easiestNames = formatRepairNameList(
    getUniqueRepairNames(
      [...usableRepairs].sort(
        (first, second) =>
          compareFiniteNumbers(first.score, second.score, 'desc') ||
          compareFiniteNumbers(first.hours, second.hours, 'asc'),
      ).map(({ repair }) => repair),
      3,
    ),
  )
  const hardestNames = formatRepairNameList(
    getUniqueRepairNames(
      [...usableRepairs].sort(
        (first, second) =>
          compareFiniteNumbers(first.score, second.score, 'asc') ||
          compareFiniteNumbers(first.hours, second.hours, 'desc'),
      ).map(({ repair }) => repair),
      2,
    ),
  )
  const longestNames = formatRepairNameList(
    getUniqueRepairNames(
      [...hourRepairs]
        .sort((first, second) => compareFiniteNumbers(first.hours, second.hours, 'desc'))
        .map(({ repair }) => repair),
      2,
    ),
  )

  if (averageScore !== null && averageScore >= 7.5) {
    return `This vehicle scores well because several common jobs${easiestNames ? `, like ${easiestNames},` : ''} look quick and approachable.${hardestNames ? ` The main jobs to watch are ${hardestNames}.` : ''}`
  }

  if (averageScore !== null && averageScore < 5) {
    return `This vehicle may be more demanding to maintain.${longestNames ? ` Repairs like ${longestNames} show higher labor times,` : ' Several common repairs have higher labor times,'} so it may be less friendly for driveway DIY work.`
  }

  return `This vehicle is a mixed bag.${easiestNames ? ` Basic work like ${easiestNames} looks approachable,` : ' Basic maintenance looks approachable,'}${hardestNames ? ` but ${hardestNames} take enough labor to pull the overall score down.` : ' but a few common repairs take enough labor to pull the overall score down.'}`
}

const getVehicleQuickTake = (repairs) => {
  const repairRows = (repairs ?? [])
    .map((repair) => ({
      repair,
      score: getRepairScore(repair),
      hours: getRepairHours(repair),
    }))
    .filter(({ score, hours }) => Number.isFinite(score) || Number.isFinite(hours))
  const scoredRepairs = repairRows.filter(({ score }) => Number.isFinite(score))
  const hourRepairs = repairRows.filter(({ hours }) => Number.isFinite(hours))
  const easiest = formatRepairNameList(
    getUniqueRepairNames(
      [...repairRows]
        .sort(
          (first, second) =>
            compareFiniteNumbers(first.score, second.score, 'desc') ||
            compareFiniteNumbers(first.hours, second.hours, 'asc'),
        )
        .map(({ repair }) => repair),
      3,
    ),
  )
  const hardest = formatRepairNameList(
    getUniqueRepairNames(
      [...repairRows]
        .sort(
          (first, second) =>
            compareFiniteNumbers(first.score, second.score, 'asc') ||
            compareFiniteNumbers(first.hours, second.hours, 'desc'),
        )
        .map(({ repair }) => repair),
      2,
    ),
  )
  const averageHours = hourRepairs.length
    ? hourRepairs.reduce((total, item) => total + item.hours, 0) / hourRepairs.length
    : null

  return [
    { label: 'Easiest', value: easiest || 'More data needed' },
    { label: 'Watch out for', value: hardest || 'More data needed' },
    {
      label: 'Average shown repair',
      value: averageHours === null ? 'More data needed' : formatHours(averageHours),
    },
    { label: 'Repairs scored', value: String(scoredRepairs.length) },
  ]
}

const getCategoryLabelFromAverage = (averageScore) => {
  if (averageScore >= 9) return 'Easy'
  if (averageScore >= 7) return 'DIY Friendly'
  if (averageScore >= 5) return 'Moderate'
  if (averageScore >= 3) return 'Advanced'
  return 'Major Job'
}

const getRepairCategorySummary = (repairs) => {
  const categoryGroups = new Map()

  for (const repair of repairs ?? []) {
    const category = getRepairCategory(repair)
    const score = getRepairScore(repair)

    if (!category || !Number.isFinite(score)) continue

    if (!categoryGroups.has(category)) {
      categoryGroups.set(category, [])
    }

    categoryGroups.get(category).push(score)
  }

  return [...categoryGroups.entries()]
    .filter(([, scores]) => scores.length >= 2)
    .map(([category, scores]) => {
      const averageScore = scores.reduce((total, score) => total + score, 0) / scores.length

      return {
        category,
        label: getCategoryLabelFromAverage(averageScore),
        score: averageScore,
      }
    })
    .sort((first, second) => second.score - first.score)
    .slice(0, 6)
}

const getJoinedVehicle = (scoreRow) => {
  if (Array.isArray(scoreRow?.vehicles)) {
    return scoreRow.vehicles[0] ?? null
  }

  return scoreRow?.vehicles ?? null
}

const mapVehicleScoreRows = (scoreRows) =>
  (scoreRows ?? [])
    .filter((row) => getJoinedVehicle(row))
    .map((row) => {
      const vehicle = getJoinedVehicle(row)

      return {
        id: vehicle.id,
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        trim: vehicle.trim,
        engine: vehicle.engine,
        source_engine_slug: vehicle.source_engine_slug,
        vehicleScore: {
          id: row.id,
          vehicle_id: row.vehicle_id,
          overall_score: row.overall_score,
          score_label: row.score_label,
          verdict: row.verdict,
        },
        repairCount: 0,
      }
    })

const mergeVehicleScoreRows = (scoreRows, vehicleRows) => {
  const vehiclesById = new Map((vehicleRows ?? []).map((vehicle) => [vehicle.id, vehicle]))

  return (scoreRows ?? [])
    .filter((row) => vehiclesById.has(row.vehicle_id))
    .map((row) => {
      const vehicle = vehiclesById.get(row.vehicle_id)

      return {
        id: vehicle.id,
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        trim: vehicle.trim,
        engine: vehicle.engine,
        source_engine_slug: vehicle.source_engine_slug,
        vehicleScore: {
          id: row.id,
          vehicle_id: row.vehicle_id,
          overall_score: row.overall_score,
          score_label: row.score_label,
          verdict: row.verdict,
        },
        repairCount: 0,
      }
    })
}

const getRankedVehicles = (vehicles, filters) => {
  const normalizedSearch = normalizeText(filters.searchText)
  const minYear = optionalNumber(filters.minYear)
  const maxYear = optionalNumber(filters.maxYear)
  const minScore = optionalNumber(filters.minScore)
  const maxScore = optionalNumber(filters.maxScore)

  return vehicles
    .filter((vehicle) => !isGenericVehicleHidden(vehicle, vehicles))
    .filter((vehicle) => {
      const year = Number(vehicle.year)
      const score = getVehicleScoreValue(vehicle)

      if (filters.rankingType !== 'all' && !Number.isFinite(score)) return false
      if (minYear !== null && year < minYear) return false
      if (maxYear !== null && year > maxYear) return false
      if (filters.make !== 'all' && vehicle.make !== filters.make) return false
      if (minScore !== null && (!Number.isFinite(score) || score < minScore)) return false
      if (maxScore !== null && (!Number.isFinite(score) || score > maxScore)) return false

      if (!normalizedSearch) return true

      return [vehicle.make, vehicle.model, vehicle.engine]
        .map(normalizeText)
        .some((value) => value.includes(normalizedSearch))
    })
    .sort((first, second) => {
      const direction = filters.rankingType === 'bottom' ? 'asc' : 'desc'

      return (
        compareFiniteNumbers(
          getVehicleScoreValue(first),
          getVehicleScoreValue(second),
          direction,
        ) ||
        Number(second.year) - Number(first.year) ||
        getVehicleTitle(first).localeCompare(getVehicleTitle(second))
      )
    })
    .slice(0, Number(filters.limit))
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

const getEngineOptions = (vehicles, year, make, model) => {
  const matchingVehicles = vehicles.filter(
    (vehicle) =>
      String(vehicle.year) === String(year) &&
      vehicle.make === make &&
      vehicle.model === model &&
      !isGenericVehicleHidden(vehicle, vehicles),
  )
  const optionsByKey = new Map()

  for (const vehicle of matchingVehicles) {
    const key = getEngineKey(vehicle)

    if (optionsByKey.has(key)) {
      continue
    }

    optionsByKey.set(key, {
      id: vehicle.id,
      key,
      label: getVehicleConfigurationLabel(vehicle),
      sourceEngineSlug: vehicle.source_engine_slug ?? '',
      hasKnownEngine: Boolean(
        String(vehicle.engine ?? '').trim() || String(vehicle.source_engine_slug ?? '').trim(),
      ),
    })
  }

  return [...optionsByKey.values()].sort((first, second) => {
    if (first.hasKnownEngine !== second.hasKnownEngine) {
      return first.hasKnownEngine ? -1 : 1
    }

    return first.label.localeCompare(second.label)
  })
}

const buildDataStatusSummary = ({
  vehicles,
  vehicleScores,
  repairScores,
  laborEstimates,
  repairTasks,
  queueRows,
  queueAvailable,
}) => {
  const vehicleScoresByVehicleId = new Set(
    vehicleScores.map((score) => String(score.vehicle_id)),
  )
  const engineSpecificVehicles = vehicles.filter(hasSpecificConfiguration)
  const genericVehicles = vehicles.filter((vehicle) => !hasSpecificConfiguration(vehicle))
  const missingScoreVehicles = vehicles.filter(
    (vehicle) => !vehicleScoresByVehicleId.has(String(vehicle.id)),
  )

  const queueStatusCounts = Object.fromEntries(QUEUE_STATUSES.map((status) => [status, 0]))

  for (const row of queueRows) {
    const status = row.status ?? 'unknown'
    queueStatusCounts[status] = (queueStatusCounts[status] ?? 0) + 1
  }

  const makeModelCounts = new Map()
  const variantsByYearMakeModel = new Map()

  for (const vehicle of vehicles) {
    incrementCount(makeModelCounts, `${vehicle.make} ${vehicle.model}`)

    const groupKey = `${vehicle.year} ${vehicle.make} ${vehicle.model}`

    if (!variantsByYearMakeModel.has(groupKey)) {
      variantsByYearMakeModel.set(groupKey, new Set())
    }

    variantsByYearMakeModel
      .get(groupKey)
      .add(getVehicleConfigurationLabel(vehicle).toLowerCase())
  }

  const variantCounts = new Map(
    [...variantsByYearMakeModel.entries()].map(([group, variants]) => [
      group,
      variants.size,
    ]),
  )
  const pendingQueueRows = queueStatusCounts.pending ?? 0

  let recommendation = 'Database looks ready for frontend testing.'

  if (queueAvailable && pendingQueueRows > 0) {
    recommendation = 'Next: process more queued vehicles, then recalculate scores.'
  } else if (missingScoreVehicles.length > 0) {
    recommendation = 'Next: recalculate Wrenchability scores.'
  }

  return {
    counts: {
      vehicles: vehicles.length,
      engineSpecificVehicles: engineSpecificVehicles.length,
      genericVehicles: genericVehicles.length,
      vehicleScores: vehicleScores.length,
      repairScores: repairScores.length,
      laborEstimates: laborEstimates.length,
      repairTasks: repairTasks.length,
      queueTotal: queueAvailable ? queueRows.length : null,
    },
    queueAvailable,
    queueStatusCounts,
    missingScoreVehicles,
    topMakeModelGroups: getTopCountEntries(makeModelCounts),
    topVariantGroups: getTopCountEntries(variantCounts),
    recommendation,
  }
}

const getCompareRepairKey = (repair) =>
  getRepairSlug(repair) || String(repair.repair_task_id ?? repair.repairTaskId ?? repair.id)

const getRepairWinner = (row) => {
  const validCells = [...row.cells.entries()]
    .map(([vehicleId, repair]) => ({
      vehicleId,
      repair,
      hours: getRepairHours(repair),
    }))
    .filter(({ hours }) => Number.isFinite(hours))

  if (validCells.length === 0) return []

  const bestHours = Math.min(...validCells.map(({ hours }) => hours))

  return validCells.filter(({ hours }) => hours === bestHours)
}

const getLaborHourSpread = (row) => {
  const hours = [...row.cells.values()].map(getRepairHours).filter(Number.isFinite)

  if (hours.length < 2) return 0

  return Math.max(...hours) - Math.min(...hours)
}

const getCompareRepairRows = (comparisonVehicles, viewMode, sortMode) => {
  const rowsByKey = new Map()

  for (const comparisonVehicle of comparisonVehicles) {
    for (const repair of comparisonVehicle.repairs) {
      const key = getCompareRepairKey(repair)

      if (!rowsByKey.has(key)) {
        rowsByKey.set(key, {
          key,
          name: getRepairName(repair),
          slug: getRepairSlug(repair),
          order: getTopOwnershipOrder(repair),
          cells: new Map(),
        })
      }

      rowsByKey.get(key).cells.set(String(comparisonVehicle.vehicle.id), repair)
    }
  }

  const rows = [...rowsByKey.values()].map((row) => {
    const repairs = [...row.cells.values()]
    const hours = repairs.map(getRepairHours).filter(Number.isFinite)
    const scores = repairs.map(getRepairScore).filter(Number.isFinite)
    const minHours = hours.length > 0 ? Math.min(...hours) : null
    const maxHours = hours.length > 0 ? Math.max(...hours) : null
    const averageScore =
      scores.length > 0
        ? scores.reduce((total, score) => total + score, 0) / scores.length
        : null

    return {
      ...row,
      dataCount: repairs.length,
      hoursCount: hours.length,
      minHours,
      laborSpread:
        minHours !== null && maxHours !== null && hours.length >= 2
          ? maxHours - minHours
          : 0,
      averageScore,
    }
  })

  const filteredRows = rows.filter((row) => {
    if (viewMode === 'top-ownership') {
      return Number.isFinite(row.order)
    }

    if (viewMode === 'shared') {
      return row.dataCount >= 2
    }

    return row.hoursCount >= 2 && row.laborSpread > 0
  })

  const sortRows = (first, second) => {
    if (sortMode === 'average-easiest') {
      return (
        compareFiniteNumbers(first.averageScore, second.averageScore, 'desc') ||
        first.name.localeCompare(second.name)
      )
    }

    if (sortMode === 'average-hardest') {
      return (
        compareFiniteNumbers(first.averageScore, second.averageScore, 'asc') ||
        first.name.localeCompare(second.name)
      )
    }

    if (sortMode === 'labor-spread') {
      return second.laborSpread - first.laborSpread || first.name.localeCompare(second.name)
    }

    if (sortMode === 'name-asc') {
      return first.name.localeCompare(second.name)
    }

    if (viewMode === 'top-ownership') {
      return (
        compareNumbers(first.order, second.order) ||
        first.name.localeCompare(second.name)
      )
    }

    if (viewMode === 'differences') {
      return second.laborSpread - first.laborSpread || first.name.localeCompare(second.name)
    }

    return first.name.localeCompare(second.name)
  }

  return filteredRows.sort(sortRows)
}

const getComparableRepairRows = (comparisonVehicles) =>
  getCompareRepairRows(comparisonVehicles, 'shared', 'labor-spread')
    .filter((row) => row.hoursCount >= 2)

const buildCompareHighlights = (comparisonVehicles) => {
  const highlights = []
  const scoredVehicles = comparisonVehicles.filter(({ vehicleScore }) =>
    Number.isFinite(Number(vehicleScore?.overall_score)),
  )
  const comparableRows = getComparableRepairRows(comparisonVehicles)

  if (scoredVehicles.length > 0) {
    const bestScore = Math.max(
      ...scoredVehicles.map(({ vehicleScore }) => Number(vehicleScore.overall_score)),
    )
    const winners = scoredVehicles.filter(
      ({ vehicleScore }) => Number(vehicleScore.overall_score) === bestScore,
    )

    if (winners.length === 1) {
      const { vehicle } = winners[0]
      highlights.push(
        `Best overall: ${getVehicleTitle(vehicle)} ${getVehicleConfigurationLabel(vehicle)} has the highest Wrenchability Score at ${formatScore(bestScore)}/10.`,
      )
    } else {
      highlights.push('Best overall: Tie.')
    }

    const sortedScores = scoredVehicles
      .map(({ vehicleScore }) => Number(vehicleScore.overall_score))
      .sort((first, second) => second - first)

    if (sortedScores.length >= 2 && sortedScores[0] - sortedScores[sortedScores.length - 1] <= 0.5) {
      highlights.push('These vehicles are closely matched overall, so the deciding factor may be specific repairs.')
    }
  }

  const biggestDifference = comparableRows[0]

  if (biggestDifference && getLaborHourSpread(biggestDifference) > 0) {
    const validCells = [...biggestDifference.cells.entries()]
      .map(([vehicleId, repair]) => ({
        vehicle: comparisonVehicles.find((item) => String(item.vehicle.id) === vehicleId)?.vehicle,
        hours: getRepairHours(repair),
      }))
      .filter(({ vehicle, hours }) => vehicle && Number.isFinite(hours))
      .sort((first, second) => first.hours - second.hours)
    const easiest = validCells[0]
    const hardest = validCells[validCells.length - 1]

    if (easiest && hardest) {
      highlights.push(
        `The biggest difference is ${biggestDifference.name}: ${getVehicleTitle(easiest.vehicle)} is estimated at ${formatHours(easiest.hours)}, while ${getVehicleTitle(hardest.vehicle)} is ${formatHours(hardest.hours)}.`,
      )
    }
  }

  const winCounts = new Map()

  for (const row of comparableRows) {
    const winners = getRepairWinner(row)

    for (const winner of winners) {
      incrementCount(winCounts, winner.vehicleId)
    }
  }

  const topWinner = [...winCounts.entries()].sort((first, second) => second[1] - first[1])[0]

  if (topWinner) {
    const vehicle = comparisonVehicles.find((item) => String(item.vehicle.id) === topWinner[0])?.vehicle

    if (vehicle) {
      highlights.push(`${getVehicleTitle(vehicle)} wins the most shared repairs in this comparison.`)
    }
  }

  const totalRepairSlots = comparisonVehicles.reduce(
    (total, item) => total + (item.repairs?.length ?? 0),
    0,
  )
  const possibleRepairSlots = comparableRows.length * comparisonVehicles.length

  if (possibleRepairSlots > 0 && totalRepairSlots < possibleRepairSlots * 0.75) {
    highlights.push('Some repairs do not have data for every selected vehicle, so compare shared repairs first.')
  }

  return highlights.slice(0, 6)
}

const getBestOverallText = (comparisonVehicles) => {
  const scoredVehicles = comparisonVehicles.filter((item) =>
    Number.isFinite(Number(item.vehicleScore?.overall_score)),
  )

  if (scoredVehicles.length === 0) return ''

  const bestScore = Math.max(
    ...scoredVehicles.map((item) => Number(item.vehicleScore.overall_score)),
  )
  const bestVehicles = scoredVehicles.filter(
    (item) => Number(item.vehicleScore.overall_score) === bestScore,
  )

  if (bestVehicles.length > 1) {
    return 'Best overall: Tie'
  }

  return `Best overall: ${getVehicleTitle(bestVehicles[0].vehicle)} - ${formatScore(bestScore)}/10`
}

function App() {
  const [activeView, setActiveView] = useState('search')
  const [selectedYear, setSelectedYear] = useState('2011')
  const [selectedMake, setSelectedMake] = useState('GMC')
  const [selectedModel, setSelectedModel] = useState('Acadia')
  const [selectedEngineKey, setSelectedEngineKey] = useState('')
  const [selectedVehicleId, setSelectedVehicleId] = useState('')
  const [vehicles, setVehicles] = useState([])
  const [rankedVehicles, setRankedVehicles] = useState([])
  const [rankingsStatus, setRankingsStatus] = useState('idle')
  const [dataStatusSummary, setDataStatusSummary] = useState(null)
  const [dataStatusState, setDataStatusState] = useState('idle')
  const [vehicleOptionsStatus, setVehicleOptionsStatus] = useState('loading')
  const [status, setStatus] = useState('idle')
  const [result, setResult] = useState(null)
  const [repairViewFilter, setRepairViewFilter] = useState('top-ownership')
  const [repairSortMode, setRepairSortMode] = useState('recommended')
  const [repairSearchText, setRepairSearchText] = useState('')
  const [rankingType, setRankingType] = useState('top')
  const [rankingLimit, setRankingLimit] = useState('10')
  const [rankingMinYear, setRankingMinYear] = useState('')
  const [rankingMaxYear, setRankingMaxYear] = useState('')
  const [rankingMake, setRankingMake] = useState('all')
  const [rankingSearchText, setRankingSearchText] = useState('')
  const [rankingMinScore, setRankingMinScore] = useState('')
  const [rankingMaxScore, setRankingMaxScore] = useState('')
  const [compareSlots, setCompareSlots] = useState([
    createCompareSlot(),
    createCompareSlot(),
    createCompareSlot(),
  ])
  const [compareStatus, setCompareStatus] = useState('idle')
  const [compareError, setCompareError] = useState('')
  const [compareMessage, setCompareMessage] = useState('')
  const [savedCompareHydrated, setSavedCompareHydrated] = useState(false)
  const [initialUrlHandled, setInitialUrlHandled] = useState(false)
  const [vehicleLinkMessage, setVehicleLinkMessage] = useState('')
  const [comparisonLinkMessage, setComparisonLinkMessage] = useState('')
  const [comparisonVehicles, setComparisonVehicles] = useState([])
  const [compareRepairView, setCompareRepairView] = useState('top-ownership')
  const [compareRepairSort, setCompareRepairSort] = useState('recommended')

  useEffect(() => {
    const loadVehicles = async () => {
      setVehicleOptionsStatus('loading')

      try {
        if (!supabase) {
          throw new Error('Supabase is not configured.')
        }

        const { data, error } = await supabase
          .from('vehicles')
          .select('id, year, make, model, trim, engine, source_engine_slug')

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
          const firstEngineOptions = getEngineOptions(
            loadedVehicles,
            firstYear,
            firstMake,
            firstModel,
          )

          setSelectedYear(firstYear)
          setSelectedMake(firstMake)
          setSelectedModel(firstModel)
          setSelectedEngineKey(firstEngineOptions.length === 1 ? firstEngineOptions[0].key : '')
          setSelectedVehicleId(
            firstEngineOptions.length === 1 ? String(firstEngineOptions[0].id) : '',
          )
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

  useEffect(() => {
    const loadRankings = async () => {
      setRankingsStatus('loading')

      try {
        if (!supabase) {
          throw new Error('Supabase is not configured.')
        }

        const { data, error } = await supabase
          .from('vehicle_scores')
          .select(`
            id,
            vehicle_id,
            overall_score,
            score_label,
            verdict,
            vehicles (
              id,
              year,
              make,
              model,
              trim,
              engine,
              source_engine_slug
            )
          `)

        if (error) {
          console.warn('Joined vehicle rankings query failed, using fallback:', error)

          const [scoresResponse, vehiclesResponse] = await Promise.all([
            supabase
              .from('vehicle_scores')
              .select('id, vehicle_id, overall_score, score_label, verdict'),
            supabase.from('vehicles').select('id, year, make, model, trim, engine, source_engine_slug'),
          ])

          if (scoresResponse.error) throw scoresResponse.error
          if (vehiclesResponse.error) throw vehiclesResponse.error

          const ranked = mergeVehicleScoreRows(scoresResponse.data, vehiclesResponse.data)

          console.log('vehicle_scores rows:', scoresResponse.data?.length || 0)
          console.log('ranked vehicles:', ranked.length)

          setRankedVehicles(ranked)
          setRankingsStatus('loaded')
          return
        }

        const ranked = mapVehicleScoreRows(data)

        console.log('vehicle_scores rows:', data?.length || 0)
        console.log('ranked vehicles:', ranked.length)

        setRankedVehicles(ranked)
        setRankingsStatus('loaded')
      } catch (error) {
        console.error('Error loading vehicle rankings:', error)
        setRankedVehicles([])
        setRankingsStatus('error')
      }
    }

    loadRankings()
  }, [])

  const loadDataStatus = useCallback(async () => {
    setDataStatusState('loading')

    try {
      if (!supabase) {
        throw new Error('Supabase is not configured.')
      }

      const [
        vehiclesRows,
        vehicleScoreRows,
        repairScoreRows,
        laborEstimateRows,
        repairTaskRows,
      ] = await Promise.all([
        selectAllRows('vehicles', 'id, year, make, model, trim, engine, source_engine_slug'),
        selectAllRows('vehicle_scores', 'id, vehicle_id'),
        selectAllRows('repair_scores', 'id, vehicle_id'),
        selectAllRows('labor_estimates', 'id'),
        selectAllRows('repair_tasks', 'id'),
      ])

      let queueRows = []
      let queueAvailable = true

      try {
        queueRows = await selectAllRows('openlabor_import_queue', 'id, status')
      } catch (queueError) {
        console.warn('Queue status unavailable to the frontend:', queueError)
        queueAvailable = false
      }

      setDataStatusSummary(
        buildDataStatusSummary({
          vehicles: vehiclesRows,
          vehicleScores: vehicleScoreRows,
          repairScores: repairScoreRows,
          laborEstimates: laborEstimateRows,
          repairTasks: repairTaskRows,
          queueRows,
          queueAvailable,
        }),
      )
      setDataStatusState('loaded')
    } catch (error) {
      console.error('Error loading data status:', error)
      setDataStatusSummary(null)
      setDataStatusState('error')
    }
  }, [])

  useEffect(() => {
    if (activeView === 'status' && dataStatusState === 'idle') {
      loadDataStatus()
    }
  }, [activeView, dataStatusState, loadDataStatus])

  const yearOptions = useMemo(() => getUniqueYears(vehicles), [vehicles])
  const makeOptions = useMemo(
    () => getUniqueMakes(vehicles, selectedYear),
    [vehicles, selectedYear],
  )
  const modelOptions = useMemo(
    () => getUniqueModels(vehicles, selectedYear, selectedMake),
    [vehicles, selectedYear, selectedMake],
  )
  const engineOptions = useMemo(
    () => getEngineOptions(vehicles, selectedYear, selectedMake, selectedModel),
    [vehicles, selectedYear, selectedMake, selectedModel],
  )
  const selectedEngineOption = engineOptions.find(
    (option) => option.key === selectedEngineKey,
  )
  const showEngineSelect = engineOptions.length > 1
  const needsEngineSelection = showEngineSelect && !selectedVehicleId

  const hasVehicleOptions = vehicles.length > 0
  const isLoadingVehicleOptions = vehicleOptionsStatus === 'loading'

  const applyEngineSelection = (nextYear, nextMake, nextModel) => {
    const nextEngineOptions = getEngineOptions(vehicles, nextYear, nextMake, nextModel)
    const nextEngineOption = nextEngineOptions.length === 1 ? nextEngineOptions[0] : null

    setSelectedEngineKey(nextEngineOption?.key ?? '')
    setSelectedVehicleId(nextEngineOption ? String(nextEngineOption.id) : '')
  }

  const handleYearChange = (event) => {
    const nextYear = event.target.value
    const nextMakes = getUniqueMakes(vehicles, nextYear)
    const nextMake = nextMakes[0] ?? ''
    const nextModels = getUniqueModels(vehicles, nextYear, nextMake)

    setSelectedYear(nextYear)
    setSelectedMake(nextMake)
    setSelectedModel(nextModels[0] ?? '')
    applyEngineSelection(nextYear, nextMake, nextModels[0] ?? '')
    setResult(null)
    setStatus('idle')
  }

  const handleMakeChange = (event) => {
    const nextMake = event.target.value
    const nextModels = getUniqueModels(vehicles, selectedYear, nextMake)

    setSelectedMake(nextMake)
    setSelectedModel(nextModels[0] ?? '')
    applyEngineSelection(selectedYear, nextMake, nextModels[0] ?? '')
    setResult(null)
    setStatus('idle')
  }

  const handleModelChange = (event) => {
    const nextModel = event.target.value

    setSelectedModel(nextModel)
    applyEngineSelection(selectedYear, selectedMake, nextModel)
    setResult(null)
    setStatus('idle')
  }

  const handleEngineChange = (event) => {
    const nextEngineKey = event.target.value
    const nextEngineOption = engineOptions.find((option) => option.key === nextEngineKey)

    setSelectedEngineKey(nextEngineKey)
    setSelectedVehicleId(nextEngineOption ? String(nextEngineOption.id) : '')
    setResult(null)
    setStatus('idle')
  }

  const resetRepairControls = () => {
    setRepairViewFilter('top-ownership')
    setRepairSortMode('recommended')
    setRepairSearchText('')
  }

  const loadVehicleDetails = async (vehicleLookup, options = {}) => {
    const shouldUpdateUrl = options.updateUrl ?? true
    const historyMode = options.historyMode ?? 'push'

    setStatus('loading')
    setResult(null)
    setVehicleLinkMessage('')
    resetRepairControls()

    try {
      if (!supabase) {
        throw new Error('Supabase is not configured.')
      }

      let vehicleQuery = supabase
        .from('vehicles')
        .select('id, year, make, model, trim, engine, source_engine_slug, generation')

      if (vehicleLookup.id) {
        vehicleQuery = vehicleQuery.eq('id', vehicleLookup.id)
      } else {
        vehicleQuery = vehicleQuery
          .eq('year', Number(vehicleLookup.year))
          .eq('make', vehicleLookup.make)
          .eq('model', vehicleLookup.model)
      }

      const { data: vehicle, error: vehicleError } = await vehicleQuery.maybeSingle()

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
            'id, repair_task_id, labor_hours, wrenchability_score, score_label',
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
          }
        })
        .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name))

      setResult({
        vehicle,
        vehicleScore: vehicleScoreResponse.data,
        repairs,
      })
      if (shouldUpdateUrl) {
        updateBrowserUrl(
          { view: 'vehicle', vehicleId: vehicle.id },
          historyMode,
        )
      }
      setStatus('success')
    } catch (error) {
      console.error('Error loading Wrenchability data:', error)
      setStatus('error')
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    await loadVehicleDetails({
      id: selectedVehicleId || selectedEngineOption?.id,
      year: selectedYear,
      make: selectedMake,
      model: selectedModel,
    })
  }

  const handleRankingDetailsClick = async (vehicle) => {
    setActiveView('search')
    setSelectedYear(String(vehicle.year ?? ''))
    setSelectedMake(vehicle.make ?? '')
    setSelectedModel(vehicle.model ?? '')
    setSelectedEngineKey(getEngineKey(vehicle))
    setSelectedVehicleId(String(vehicle.id ?? ''))
    await loadVehicleDetails(vehicle)
  }

  const goToView = (view) => {
    setActiveView(view)

    if (view === 'rankings') {
      updateBrowserUrl({ view: 'rankings' })
      return
    }

    if (view === 'compare') {
      updateBrowserUrl({
        view: 'compare',
        vehicles: selectedCompareIds.length ? selectedCompareIds.join(',') : '',
      })
      return
    }

    if (view === 'search') {
      if (status === 'success' && result?.vehicle?.id) {
        updateBrowserUrl({ view: 'vehicle', vehicleId: result.vehicle.id })
      } else {
        updateBrowserUrl({ view: 'search' })
      }
    }
  }

  const copyVehicleLink = async () => {
    if (!result?.vehicle?.id) return

    const url = buildShareUrl({ view: 'vehicle', vehicleId: result.vehicle.id })
    const copied = await copyToClipboard(url)

    setVehicleLinkMessage(copied ? 'Link copied.' : url)
  }

  const copyComparisonLink = async () => {
    if (selectedCompareIds.length < 2) return

    const url = buildShareUrl({
      view: 'compare',
      vehicles: selectedCompareIds.join(','),
    })
    const copied = await copyToClipboard(url)

    setComparisonLinkMessage(copied ? 'Comparison link copied.' : url)
  }

  const resetCompareResultState = () => {
    setCompareStatus('idle')
    setCompareError('')
    setComparisonVehicles([])
  }

  const setCompareVehicleIds = useCallback(
    (ids, availableVehicles = []) => {
      const normalizedIds = normalizeCompareVehicleIds(ids)
      const vehiclesById = new Map(
        [...vehicles, ...availableVehicles].map((vehicle) => [
          String(vehicle.id),
          vehicle,
        ]),
      )
      const selectedVehicles = normalizedIds
        .map((id) => vehiclesById.get(String(id)))
        .filter(Boolean)
      const validIds = selectedVehicles.map((vehicle) => String(vehicle.id))

      setCompareSlots(createCompareSlotsFromVehicles(selectedVehicles))
      writeStoredCompareVehicleIds(validIds)
      resetCompareResultState()
      setComparisonLinkMessage('')

      return validIds
    },
    [vehicles],
  )

  const hydrateCompareFromIds = useCallback(
    async (ids) => {
      const normalizedIds = normalizeCompareVehicleIds(ids)

      if (normalizedIds.length === 0) {
        setSavedCompareHydrated(true)
        return []
      }

      try {
        if (!supabase) {
          throw new Error('Supabase is not configured.')
        }

        const { data, error } = await supabase
          .from('vehicles')
          .select('id, year, make, model, trim, engine, source_engine_slug')
          .in('id', normalizedIds)

        if (error) throw error

        const vehiclesById = new Map((data ?? []).map((vehicle) => [
          String(vehicle.id),
          vehicle,
        ]))
        const validVehicles = normalizedIds
          .map((id) => vehiclesById.get(String(id)))
          .filter(Boolean)
        const validIds = setCompareVehicleIds(
          validVehicles.map((vehicle) => vehicle.id),
          validVehicles,
        )

        setSavedCompareHydrated(true)
        return validIds
      } catch (error) {
        console.warn('Unable to restore comparison vehicles:', error)
        writeStoredCompareVehicleIds([])
        setSavedCompareHydrated(true)
        return []
      }
    },
    [setCompareVehicleIds],
  )

  const loadSavedCompareVehicles = useCallback(async () => {
    const savedIds = readStoredCompareVehicleIds()

    if (savedIds.length === 0) {
      setSavedCompareHydrated(true)
      return
    }

    await hydrateCompareFromIds(savedIds)
  }, [hydrateCompareFromIds])

  useEffect(() => {
    const initialUrlState = getInitialUrlState()

    if (initialUrlState.view === 'compare') {
      return
    }

    if (!savedCompareHydrated) {
      loadSavedCompareVehicles()
    }
  }, [loadSavedCompareVehicles, savedCompareHydrated])

  useEffect(() => {
    if (initialUrlHandled || vehicleOptionsStatus === 'loading') return

    const applyInitialUrlState = async () => {
      const initialUrlState = getInitialUrlState()

      if (initialUrlState.view === 'vehicle' && initialUrlState.vehicleId) {
        setActiveView('search')
        await loadVehicleDetails(
          { id: initialUrlState.vehicleId },
          { historyMode: 'replace' },
        )
        setInitialUrlHandled(true)
        return
      }

      if (initialUrlState.view === 'compare') {
        setActiveView('compare')
        const validIds = await hydrateCompareFromIds(initialUrlState.compareIds)
        updateBrowserUrl(
          {
            view: 'compare',
            vehicles: validIds.length ? validIds.join(',') : '',
          },
          'replace',
        )
        setInitialUrlHandled(true)
        return
      }

      if (initialUrlState.view === 'rankings') {
        setActiveView('rankings')
        updateBrowserUrl({ view: 'rankings' }, 'replace')
        setInitialUrlHandled(true)
        return
      }

      setActiveView('search')
      updateBrowserUrl({ view: 'search' }, 'replace')
      setInitialUrlHandled(true)
    }

    applyInitialUrlState()
  }, [
    hydrateCompareFromIds,
    initialUrlHandled,
    vehicleOptionsStatus,
  ])

  const updateCompareSlot = (slotIndex, updater) => {
    setCompareSlots((currentSlots) =>
      {
        const nextSlots = currentSlots.map((slot, index) =>
        index === slotIndex ? updater(slot) : slot,
        )

        writeStoredCompareVehicleIds(getCompareVehicleIdsFromSlots(nextSlots))
        return nextSlots
      },
    )
    resetCompareResultState()
    setCompareMessage('')
    setComparisonLinkMessage('')
  }

  const applyCompareVehicleSelection = (slotIndex, year, make, model) => {
    const options = getEngineOptions(vehicles, year, make, model)
    const option = options.length === 1 ? options[0] : null

    updateCompareSlot(slotIndex, () => ({
      year,
      make,
      model,
      engineKey: option?.key ?? '',
      vehicleId: option ? String(option.id) : '',
    }))
  }

  const handleCompareYearChange = (slotIndex, nextYear) => {
    const nextMake = getUniqueMakes(vehicles, nextYear)[0] ?? ''
    const nextModel = getUniqueModels(vehicles, nextYear, nextMake)[0] ?? ''

    applyCompareVehicleSelection(slotIndex, nextYear, nextMake, nextModel)
  }

  const handleCompareMakeChange = (slotIndex, currentSlot, nextMake) => {
    const nextModel = getUniqueModels(vehicles, currentSlot.year, nextMake)[0] ?? ''

    applyCompareVehicleSelection(slotIndex, currentSlot.year, nextMake, nextModel)
  }

  const handleCompareModelChange = (slotIndex, currentSlot, nextModel) => {
    applyCompareVehicleSelection(slotIndex, currentSlot.year, currentSlot.make, nextModel)
  }

  const handleCompareEngineChange = (slotIndex, currentSlot, nextEngineKey) => {
    const options = getEngineOptions(
      vehicles,
      currentSlot.year,
      currentSlot.make,
      currentSlot.model,
    )
    const option = options.find((engineOption) => engineOption.key === nextEngineKey)

    updateCompareSlot(slotIndex, (slot) => ({
      ...slot,
      engineKey: nextEngineKey,
      vehicleId: option ? String(option.id) : '',
    }))
  }

  const removeCompareSlot = (slotIndex) => {
    updateCompareSlot(slotIndex, () => createCompareSlot())
    setCompareMessage('Removed from comparison.')
  }

  const addVehicleToCompare = (vehicle) => {
    const vehicleId = String(vehicle?.id ?? '')

    if (!vehicleId) return

    if (compareSlots.some((slot) => String(slot.vehicleId) === vehicleId)) {
      setCompareMessage('Added to comparison.')
      return
    }

    const openSlotIndex = compareSlots.findIndex((slot) => !slot.vehicleId)

    if (openSlotIndex < 0) {
      setCompareMessage('Comparison is full. Clear a slot or clear comparison first.')
      return
    }

    updateCompareSlot(openSlotIndex, () => ({
      year: String(vehicle.year ?? ''),
      make: vehicle.make ?? '',
      model: vehicle.model ?? '',
      engineKey: getEngineKey(vehicle),
      vehicleId,
    }))
    setCompareMessage('Added to comparison.')
  }

  const clearComparison = () => {
    setCompareSlots([createCompareSlot(), createCompareSlot(), createCompareSlot()])
    writeStoredCompareVehicleIds([])
    setComparisonVehicles([])
    setCompareStatus('idle')
    setCompareError('')
    setCompareMessage('')
    setComparisonLinkMessage('')
    setCompareRepairView('top-ownership')
    setCompareRepairSort('recommended')
  }

  const loadComparison = async () => {
    const selectedIds = [
      ...new Set(compareSlots.map((slot) => slot.vehicleId).filter(Boolean)),
    ]

    if (selectedIds.length < 2) return

    setCompareStatus('loading')
    setCompareError('')

    try {
      if (!supabase) {
        throw new Error('Supabase is not configured.')
      }

      const [vehiclesResponse, scoresResponse, repairScoresResponse] = await Promise.all([
        supabase
          .from('vehicles')
          .select('id, year, make, model, trim, engine, source_engine_slug')
          .in('id', selectedIds),
        supabase
          .from('vehicle_scores')
          .select('id, vehicle_id, overall_score, score_label, verdict')
          .in('vehicle_id', selectedIds),
        supabase
          .from('repair_scores')
          .select('id, vehicle_id, repair_task_id, labor_hours, wrenchability_score, score_label')
          .in('vehicle_id', selectedIds),
      ])

      if (vehiclesResponse.error) throw vehiclesResponse.error
      if (scoresResponse.error) throw scoresResponse.error
      if (repairScoresResponse.error) throw repairScoresResponse.error

      const repairScores = repairScoresResponse.data ?? []
      const repairTaskIds = [...new Set(repairScores.map((repair) => repair.repair_task_id))]
      const { data: repairTasks, error: repairTasksError } = repairTaskIds.length
        ? await supabase
            .from('repair_tasks')
            .select('id, name, category, source_job_slug, display_order')
            .in('id', repairTaskIds)
        : { data: [], error: null }

      if (repairTasksError) throw repairTasksError

      const vehiclesById = new Map((vehiclesResponse.data ?? []).map((vehicle) => [
        String(vehicle.id),
        vehicle,
      ]))
      const scoresByVehicleId = new Map((scoresResponse.data ?? []).map((score) => [
        String(score.vehicle_id),
        score,
      ]))
      const tasksById = new Map((repairTasks ?? []).map((task) => [task.id, task]))
      const repairsByVehicleId = new Map()

      for (const repair of repairScores) {
        const task = tasksById.get(repair.repair_task_id)
        const vehicleId = String(repair.vehicle_id)

        if (!repairsByVehicleId.has(vehicleId)) {
          repairsByVehicleId.set(vehicleId, [])
        }

        repairsByVehicleId.get(vehicleId).push({
          id: repair.id,
          repair_task_id: repair.repair_task_id,
          name: task?.name ?? 'Unknown repair task',
          category: task?.category ?? '',
          source_job_slug: task?.source_job_slug ?? '',
          displayOrder: task?.display_order ?? 999,
          repair_tasks: task ?? null,
          hours: repair.labor_hours,
          score: repair.wrenchability_score,
          label: repair.score_label,
        })
      }

      const comparison = selectedIds
        .map((id) => {
          const vehicle = vehiclesById.get(String(id))

          if (!vehicle) return null

          return {
            vehicle,
            vehicleScore: scoresByVehicleId.get(String(id)) ?? null,
            repairs: (repairsByVehicleId.get(String(id)) ?? []).sort(
              (first, second) =>
                getRepairDisplayOrder(first) - getRepairDisplayOrder(second) ||
                getRepairName(first).localeCompare(getRepairName(second)),
            ),
          }
        })
        .filter(Boolean)

      setComparisonVehicles(comparison)
      setCompareStatus('success')
    } catch (error) {
      console.error('Error loading comparison:', error)
      setComparisonVehicles([])
      setCompareError('Something went wrong loading the comparison.')
      setCompareStatus('error')
    }
  }

  const hasResultsState = status !== 'idle'
  const vehicleTitle = result
    ? `${result.vehicle.year} ${result.vehicle.make} ${result.vehicle.model}`
    : `${selectedYear} ${selectedMake} ${selectedModel}`
  const vehicleConfigurationLabel = result
    ? getVehicleConfigurationLabel(result.vehicle)
    : ''
  const vehicleConfigurationBadge = result
    ? getConfigurationBadgeLabel(result.vehicle)
    : ''
  const rankingMakeOptions = useMemo(
    () => [...new Set(rankedVehicles.map((vehicle) => vehicle.make))]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b)),
    [rankedVehicles],
  )
  const rankingFilters = useMemo(
    () => ({
      rankingType,
      limit: rankingLimit,
      minYear: rankingMinYear,
      maxYear: rankingMaxYear,
      make: rankingMake,
      searchText: rankingSearchText,
      minScore: rankingMinScore,
      maxScore: rankingMaxScore,
    }),
    [
      rankingLimit,
      rankingMake,
      rankingMaxScore,
      rankingMaxYear,
      rankingMinScore,
      rankingMinYear,
      rankingSearchText,
      rankingType,
    ],
  )
  const visibleRankedVehicles = useMemo(
    () => getRankedVehicles(rankedVehicles, rankingFilters),
    [rankedVehicles, rankingFilters],
  )
  const hasRankedVehicles = rankedVehicles.length > 0
  const rankingsAreFiltered =
    rankingMinYear ||
    rankingMaxYear ||
    rankingMake !== 'all' ||
    rankingSearchText ||
    rankingMinScore ||
    rankingMaxScore
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
  const vehicleQuickTake = useMemo(
    () => getVehicleQuickTake(result?.repairs ?? []),
    [result?.repairs],
  )
  const repairCategorySummary = useMemo(
    () => getRepairCategorySummary(result?.repairs ?? []),
    [result?.repairs],
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
  const selectedCompareIds = useMemo(
    () => [...new Set(compareSlots.map((slot) => slot.vehicleId).filter(Boolean))],
    [compareSlots],
  )
  useEffect(() => {
    if (activeView !== 'compare' || !initialUrlHandled) return

    updateBrowserUrl(
      {
        view: 'compare',
        vehicles: selectedCompareIds.length ? selectedCompareIds.join(',') : '',
      },
      'replace',
    )
  }, [activeView, initialUrlHandled, selectedCompareIds])
  const canCompare = selectedCompareIds.length >= 2
  const compareRepairRows = useMemo(
    () =>
      getCompareRepairRows(
        comparisonVehicles,
        compareRepairView,
        compareRepairSort,
      ),
    [comparisonVehicles, compareRepairSort, compareRepairView],
  )
  const compareHighlights = useMemo(
    () => buildCompareHighlights(comparisonVehicles),
    [comparisonVehicles],
  )
  const compareRepairSummaryText = useMemo(() => {
    const vehicleCount = comparisonVehicles.length

    if (compareRepairView === 'top-ownership') {
      return `Showing ${compareRepairRows.length} common ownership repairs.`
    }

    return `Comparing ${compareRepairRows.length} shared ${compareRepairRows.length === 1 ? 'repair' : 'repairs'} across ${vehicleCount} ${vehicleCount === 1 ? 'vehicle' : 'vehicles'}.`
  }, [compareRepairRows.length, compareRepairView, comparisonVehicles.length])
  const bestOverallText = useMemo(
    () => getBestOverallText(comparisonVehicles),
    [comparisonVehicles],
  )
  const comparisonHasMissingScores =
    compareStatus === 'success' && comparisonVehicles.some((item) => !item.vehicleScore)
  const dataStatusCards = dataStatusSummary
    ? [
        { label: 'Vehicles', value: dataStatusSummary.counts.vehicles },
        {
          label: 'Engine-specific vehicles',
          value: dataStatusSummary.counts.engineSpecificVehicles,
        },
        {
          label: 'General model vehicles',
          value: dataStatusSummary.counts.genericVehicles,
        },
        { label: 'Vehicle scores', value: dataStatusSummary.counts.vehicleScores },
        { label: 'Repair scores', value: dataStatusSummary.counts.repairScores },
        { label: 'Labor estimates', value: dataStatusSummary.counts.laborEstimates },
        { label: 'Repair tasks', value: dataStatusSummary.counts.repairTasks },
        {
          label: 'Queue total',
          value:
            dataStatusSummary.counts.queueTotal === null
              ? 'Unavailable'
              : dataStatusSummary.counts.queueTotal,
        },
      ]
    : []

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label={`${BRAND.name} home`}>
          <span className="brand-mark" aria-hidden="true">
            {BRAND.name.split(' ').map((word) => word[0]).join('')}
          </span>
          <span>{BRAND.name}</span>
        </a>
        <nav className="main-nav" aria-label="Primary navigation">
          <a href="#search">Search</a>
          <a href="#how-it-works">How it works</a>
          <button
            className={`status-link ${activeView === 'status' ? 'active' : ''}`}
            type="button"
            onClick={() => setActiveView('status')}
          >
            Status
          </button>
        </nav>
      </header>

      <main id="top">
        <section className="hero-section">
          <div className="hero-content">
            <p className="eyebrow">{BRAND.shortTagline}</p>
            <h1>{BRAND.name}</h1>
            <p className="hero-copy">
              {BRAND.tagline}
            </p>
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

          <div className="view-workspace" id="search">
            <div className="view-tabs" aria-label="View options">
              <button
                className={activeView === 'search' ? 'active' : ''}
                type="button"
                onClick={() => goToView('search')}
              >
                Search by Vehicle
              </button>
              <button
                className={activeView === 'rankings' ? 'active' : ''}
                type="button"
                onClick={() => goToView('rankings')}
              >
                Browse Rankings
              </button>
              <button
                className={activeView === 'compare' ? 'active' : ''}
                type="button"
                onClick={() => goToView('compare')}
              >
                Compare Vehicles
              </button>
            </div>

            <div className="compare-status-bar" aria-live="polite">
              <span>Compare: {selectedCompareIds.length} of 3 selected</span>
              {compareMessage && <em>{compareMessage}</em>}
              <button
                className="secondary-button"
                type="button"
                onClick={() => goToView('compare')}
              >
                Go to Compare
              </button>
            </div>

            {activeView === 'search' && (
              <form className="search-panel" onSubmit={handleSubmit}>
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

                  {showEngineSelect && (
                    <label>
                      Engine
                      <select
                        value={selectedEngineKey}
                        onChange={handleEngineChange}
                        disabled={isLoadingVehicleOptions || !hasVehicleOptions}
                      >
                        <option value="">Choose an engine</option>
                        {engineOptions.map((option) => (
                          <option key={option.key} value={option.key}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={status === 'loading' || !hasVehicleOptions || !selectedVehicleId}
                >
                  {status === 'loading' ? 'Checking Wrenchability...' : 'Check Wrenchability'}
                </button>
                {needsEngineSelection && (
                  <p className="helper-text notice">
                    Choose an engine to get the most accurate repair ratings.
                  </p>
                )}
                {isLoadingVehicleOptions && (
                  <p className="helper-text notice">Loading available vehicles...</p>
                )}
                {!isLoadingVehicleOptions && !hasVehicleOptions && (
                  <p className="helper-text notice">No vehicle data has been loaded yet.</p>
                )}
                <p className="helper-text">
                  Choose a vehicle configuration to see common repair labor ratings.
                </p>
              </form>
            )}

            {activeView === 'rankings' && (
              <section className="rankings-panel" aria-label="Browse vehicle rankings">
                <div className="panel-heading">
                  <p className="eyebrow">Browse rankings</p>
                  <h2>Ranked vehicles</h2>
                </div>
                <p className="helper-text">
                  Rankings compare vehicles using common repair labor-time data.
                  Scores improve as more vehicles are added.
                </p>

                <div className="ranking-controls">
                  <label>
                    Ranking type
                    <select
                      value={rankingType}
                      onChange={(event) => setRankingType(event.target.value)}
                    >
                      {RANKING_TYPES.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Number to show
                    <select
                      value={rankingLimit}
                      onChange={(event) => setRankingLimit(event.target.value)}
                    >
                      {RANKING_LIMITS.map((limit) => (
                        <option key={limit} value={limit}>
                          {limit}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Min year
                    <select
                      value={rankingMinYear}
                      onChange={(event) => setRankingMinYear(event.target.value)}
                    >
                      <option value="">Any</option>
                      {yearOptions.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Max year
                    <select
                      value={rankingMaxYear}
                      onChange={(event) => setRankingMaxYear(event.target.value)}
                    >
                      <option value="">Any</option>
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
                      value={rankingMake}
                      onChange={(event) => setRankingMake(event.target.value)}
                    >
                      <option value="all">All Makes</option>
                      {rankingMakeOptions.map((make) => (
                        <option key={make} value={make}>
                          {make}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Search
                    <input
                      type="search"
                      value={rankingSearchText}
                      onChange={(event) => setRankingSearchText(event.target.value)}
                      placeholder="Search make or model..."
                    />
                  </label>

                  <label>
                    Minimum score
                    <input
                      type="number"
                      min="0"
                      max="10"
                      step="0.1"
                      value={rankingMinScore}
                      onChange={(event) => setRankingMinScore(event.target.value)}
                    />
                  </label>

                  <label>
                    Maximum score
                    <input
                      type="number"
                      min="0"
                      max="10"
                      step="0.1"
                      value={rankingMaxScore}
                      onChange={(event) => setRankingMaxScore(event.target.value)}
                    />
                  </label>
                </div>
              </section>
            )}

            {activeView === 'compare' && (
              <section className="compare-panel" aria-label="Compare vehicles">
                <div className="panel-heading">
                  <p className="eyebrow">Side-by-side</p>
                  <h2>Compare Vehicles</h2>
                </div>
                <p className="helper-text">
                  Pick two or three vehicle configurations to compare overall scores
                  and common repair labor times.
                </p>

                <div className="compare-selector-grid">
                  {compareSlots.map((slot, slotIndex) => {
                    const slotYearOptions = yearOptions
                    const slotMakeOptions = slot.year
                      ? getUniqueMakes(vehicles, slot.year)
                      : []
                    const slotModelOptions = slot.year && slot.make
                      ? getUniqueModels(vehicles, slot.year, slot.make)
                      : []
                    const slotEngineOptions = slot.year && slot.make && slot.model
                      ? getEngineOptions(vehicles, slot.year, slot.make, slot.model)
                      : []
                    const slotNeedsEngine =
                      slotEngineOptions.length > 1 && !slot.vehicleId

                    return (
                      <article className="compare-selector-card" key={`slot-${slotIndex}`}>
                        <div className="compare-selector-heading">
                          <h3>Vehicle {slotIndex + 1}</h3>
                          {slotIndex === 2 && <span>Optional</span>}
                        </div>

                        <label>
                          Year
                          <select
                            value={slot.year}
                            onChange={(event) =>
                              handleCompareYearChange(slotIndex, event.target.value)}
                            disabled={isLoadingVehicleOptions || !hasVehicleOptions}
                          >
                            <option value="">Choose year</option>
                            {slotYearOptions.map((year) => (
                              <option key={year} value={year}>
                                {year}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label>
                          Make
                          <select
                            value={slot.make}
                            onChange={(event) =>
                              handleCompareMakeChange(slotIndex, slot, event.target.value)}
                            disabled={!slot.year}
                          >
                            <option value="">Choose make</option>
                            {slotMakeOptions.map((make) => (
                              <option key={make} value={make}>
                                {make}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label>
                          Model
                          <select
                            value={slot.model}
                            onChange={(event) =>
                              handleCompareModelChange(slotIndex, slot, event.target.value)}
                            disabled={!slot.year || !slot.make}
                          >
                            <option value="">Choose model</option>
                            {slotModelOptions.map((model) => (
                              <option key={model} value={model}>
                                {model}
                              </option>
                            ))}
                          </select>
                        </label>

                        {slotEngineOptions.length > 1 && (
                          <label>
                            Engine
                            <select
                              value={slot.engineKey}
                              onChange={(event) =>
                                handleCompareEngineChange(slotIndex, slot, event.target.value)}
                              disabled={!slot.year || !slot.make || !slot.model}
                            >
                              <option value="">Choose an engine</option>
                              {slotEngineOptions.map((option) => (
                                <option key={option.key} value={option.key}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}

                        {slotNeedsEngine && (
                          <p className="helper-text notice">
                            Choose an engine for accurate comparison.
                          </p>
                        )}

                        {slot.vehicleId && (
                          <button
                            className="secondary-button compare-remove-button"
                            type="button"
                            onClick={() => removeCompareSlot(slotIndex)}
                          >
                            Remove
                          </button>
                        )}
                      </article>
                    )
                  })}
                </div>

                <div className="compare-actions">
                  <button
                    type="button"
                    onClick={loadComparison}
                    disabled={!canCompare || compareStatus === 'loading'}
                  >
                    {compareStatus === 'loading' ? 'Loading comparison...' : 'Compare'}
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={clearComparison}
                  >
                    Clear comparison
                  </button>
                  {canCompare && (
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={copyComparisonLink}
                    >
                      Copy comparison link
                    </button>
                  )}
                  {comparisonLinkMessage && !comparisonLinkMessage.startsWith('http') && (
                    <span className="copy-link-message">{comparisonLinkMessage}</span>
                  )}
                  {comparisonLinkMessage.startsWith('http') && (
                    <input
                      className="copy-link-input"
                      readOnly
                      value={comparisonLinkMessage}
                      onFocus={(event) => event.target.select()}
                    />
                  )}
                </div>
              </section>
            )}

            {activeView === 'status' && (
              <section className="status-panel" aria-label="Data status">
                <div className="status-panel-header">
                  <div className="panel-heading">
                    <p className="eyebrow">Database health</p>
                    <h2>Data Status</h2>
                  </div>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={loadDataStatus}
                    disabled={dataStatusState === 'loading'}
                  >
                    {dataStatusState === 'loading' ? 'Refreshing...' : 'Refresh status'}
                  </button>
                </div>

                {dataStatusState === 'loading' && (
                  <article className="status-card">Loading data status...</article>
                )}

                {dataStatusState === 'error' && (
                  <article className="status-card error">
                    Something went wrong loading data status.
                  </article>
                )}

                {dataStatusState === 'loaded' && dataStatusSummary && (
                  <div className="data-status-content">
                    <div className="status-metric-grid">
                      {dataStatusCards.map((card) => (
                        <article className="status-metric-card" key={card.label}>
                          <span>{card.label}</span>
                          <strong>{card.value}</strong>
                        </article>
                      ))}
                    </div>

                    <article className="status-detail-card">
                      <div>
                        <h3>Queue status</h3>
                        {!dataStatusSummary.queueAvailable && (
                          <p className="helper-text">
                            Queue status is only available in local scripts.
                          </p>
                        )}
                      </div>
                      {dataStatusSummary.queueAvailable && (
                        <div className="status-count-list">
                          {QUEUE_STATUSES.map((queueStatus) => (
                            <div key={queueStatus}>
                              <span>{queueStatus}</span>
                              <strong>
                                {dataStatusSummary.queueStatusCounts[queueStatus] ?? 0}
                              </strong>
                            </div>
                          ))}
                        </div>
                      )}
                    </article>

                    <div className="status-detail-grid">
                      <article className="status-detail-card">
                        <h3>Vehicles missing scores</h3>
                        <strong className="status-large-number">
                          {dataStatusSummary.missingScoreVehicles.length}
                        </strong>
                        {dataStatusSummary.missingScoreVehicles.length === 0 ? (
                          <p>No vehicles are missing scores.</p>
                        ) : (
                          <ul className="compact-list">
                            {dataStatusSummary.missingScoreVehicles
                              .slice(0, 10)
                              .map((vehicle) => (
                                <li key={vehicle.id}>
                                  {getVehicleTitle(vehicle)} -{' '}
                                  {getVehicleConfigurationLabel(vehicle)}
                                </li>
                              ))}
                          </ul>
                        )}
                      </article>

                      <article className="status-detail-card">
                        <h3>Top make/model groups</h3>
                        <ul className="compact-list">
                          {dataStatusSummary.topMakeModelGroups.map((group) => (
                            <li key={group.label}>
                              <span>{group.label}</span>
                              <strong>{group.count}</strong>
                            </li>
                          ))}
                        </ul>
                      </article>

                      <article className="status-detail-card">
                        <h3>Most engine variants</h3>
                        <ul className="compact-list">
                          {dataStatusSummary.topVariantGroups.map((group) => (
                            <li key={group.label}>
                              <span>{group.label}</span>
                              <strong>{group.count} variants</strong>
                            </li>
                          ))}
                        </ul>
                      </article>
                    </div>

                    <article className="status-recommendation">
                      {dataStatusSummary.recommendation}
                    </article>
                  </div>
                )}
              </section>
            )}
          </div>
        </section>

        {activeView === 'rankings' && (
          <section className="rankings-section" aria-live="polite">
            {rankingsStatus === 'loading' && (
              <article className="status-card">Loading vehicle rankings...</article>
            )}

            {rankingsStatus === 'error' && (
              <article className="status-card error">
                Something went wrong loading vehicle rankings.
              </article>
            )}

            {rankingsStatus === 'loaded' && !hasRankedVehicles && (
              <article className="status-card">
                No ranked vehicles found. Add vehicle data and recalculate scores first.
              </article>
            )}

            {rankingsStatus === 'loaded' && hasRankedVehicles && visibleRankedVehicles.length === 0 && (
              <article className="status-card">
                {rankingsAreFiltered
                  ? 'No vehicles match these filters.'
                  : 'No ranked vehicles found. Add vehicle data and recalculate scores first.'}
              </article>
            )}

            {rankingsStatus === 'loaded' && visibleRankedVehicles.length > 0 && (
              <div className="ranking-card-list">
                {visibleRankedVehicles.map((vehicle, index) => (
                  <article className="ranking-card" key={vehicle.id}>
                    <div className={`rank-number ${scoreClass(getVehicleScoreValue(vehicle))}`}>
                      #{index + 1}
                    </div>
                    <div className="ranking-card-main">
                      <span className="meta-label">Vehicle</span>
                      <h3>{getVehicleTitle(vehicle)}</h3>
                      <p className="configuration-text">
                        {getVehicleConfigurationLabel(vehicle)}
                      </p>
                      <span className="configuration-badge">
                        {getConfigurationBadgeLabel(vehicle)}
                      </span>
                      {vehicle.vehicleScore && <p>{getVehicleVerdict(vehicle.vehicleScore)}</p>}
                      <p className="score-summary-line">
                        {getScoreBasedSummary(vehicle.vehicleScore?.overall_score)}
                      </p>
                    </div>
                    <div className="ranking-card-score">
                      <span>Overall score</span>
                      <strong>
                        {Number.isFinite(getVehicleScoreValue(vehicle))
                          ? `${formatScore(vehicle.vehicleScore.overall_score)} / 10`
                          : 'Pending'}
                      </strong>
                      {vehicle.vehicleScore?.score_label && (
                        <em>{vehicle.vehicleScore.score_label}</em>
                      )}
                      {vehicle.repairCount > 0 && (
                        <span>{vehicle.repairCount} repair scores</span>
                      )}
                      <button type="button" onClick={() => handleRankingDetailsClick(vehicle)}>
                        View repair details
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => addVehicleToCompare(vehicle)}
                        disabled={selectedCompareIds.includes(String(vehicle.id))}
                      >
                        {selectedCompareIds.includes(String(vehicle.id))
                          ? 'Added'
                          : 'Add to compare'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {activeView === 'compare' && (
          <section className="compare-section" aria-live="polite">
            {compareStatus === 'loading' && (
              <article className="status-card">Loading comparison...</article>
            )}

            {compareStatus === 'error' && (
              <article className="status-card error">
                {compareError || 'Something went wrong loading the comparison.'}
              </article>
            )}

            {compareStatus === 'success' && comparisonVehicles.length > 0 && (
              <>
                <div className="section-heading">
                  <p className="eyebrow">Comparison result</p>
                  <h2>Side-by-side Wrenchability</h2>
                </div>

                {bestOverallText && (
                  <article className="best-overall-card">{bestOverallText}</article>
                )}

                {comparisonHasMissingScores && (
                  <article className="status-card">
                    One or more selected vehicles do not have Wrenchability scores yet.
                  </article>
                )}

                <div className="compare-summary-grid">
                  {comparisonVehicles.map(({ vehicle, vehicleScore, repairs }) => (
                    <article className="compare-summary-card" key={vehicle.id}>
                      <span className="meta-label">Vehicle</span>
                      <h3>{getVehicleTitle(vehicle)}</h3>
                      <p className="configuration-text">
                        {getVehicleConfigurationLabel(vehicle)}
                      </p>
                      <span className="configuration-badge">
                        {getConfigurationBadgeLabel(vehicle)}
                      </span>
                      <div className="compare-score-block">
                        <span>Overall score</span>
                        <strong>
                          {vehicleScore
                            ? `${formatScore(vehicleScore.overall_score)} / 10`
                            : 'Pending'}
                        </strong>
                        {vehicleScore?.score_label && <em>{vehicleScore.score_label}</em>}
                      </div>
                      {vehicleScore && <p>{getVehicleVerdict(vehicleScore)}</p>}
                      <div className="score-explanation-card compact">
                        <h4>Why it stands out</h4>
                        <p>{buildVehicleScoreSummary(vehicle, repairs)}</p>
                      </div>
                    </article>
                  ))}
                </div>

                {compareHighlights.length > 0 && (
                  <div className="compare-highlights">
                    <div className="section-heading compact">
                      <p className="eyebrow">What stands out</p>
                      <h2>Comparison highlights</h2>
                    </div>
                    <div className="compare-highlight-grid">
                      {compareHighlights.map((highlight) => (
                        <article className="compare-highlight-card" key={highlight}>
                          {highlight}
                        </article>
                      ))}
                    </div>
                  </div>
                )}

                <div className="compare-repairs-panel">
                  <div className="section-heading compact">
                    <p className="eyebrow">Common repair comparison</p>
                    <h2>Labor time by repair</h2>
                  </div>

                  <div className="compare-repair-controls">
                    <label>
                      Show
                      <select
                        value={compareRepairView}
                        onChange={(event) => setCompareRepairView(event.target.value)}
                      >
                        {COMPARE_REPAIR_VIEWS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Sort
                      <select
                        value={compareRepairSort}
                        onChange={(event) => setCompareRepairSort(event.target.value)}
                      >
                        {COMPARE_REPAIR_SORTS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <p className="comparison-summary-text">{compareRepairSummaryText}</p>

                  {compareRepairRows.length === 0 ? (
                    <article className="empty-repairs">
                      No shared repair data found for these vehicles.
                    </article>
                  ) : (
                    <div className="compare-repair-table-wrap">
                      <div className="compare-repair-table">
                        <div
                          className="compare-repair-header"
                          style={{
                            gridTemplateColumns: `minmax(190px, 1fr) repeat(${comparisonVehicles.length}, minmax(160px, 0.8fr))`,
                          }}
                        >
                          <span>Repair</span>
                          {comparisonVehicles.map(({ vehicle }) => (
                            <span key={vehicle.id}>{getVehicleTitle(vehicle)}</span>
                          ))}
                        </div>

                        {compareRepairRows.map((row) => (
                          <div
                            className="compare-repair-row"
                            key={row.key}
                            style={{
                              gridTemplateColumns: `minmax(190px, 1fr) repeat(${comparisonVehicles.length}, minmax(160px, 0.8fr))`,
                            }}
                          >
                            <div className="compare-repair-name">
                              <strong>{row.name}</strong>
                              {row.laborSpread >= 2 && (
                                <span className="difference-badge">Big difference</span>
                              )}
                              {row.hoursCount >= 2 && row.laborSpread <= 0.3 && (
                                <span className="close-badge">Close</span>
                              )}
                            </div>
                            {comparisonVehicles.map(({ vehicle }) => {
                              const repair = row.cells.get(String(vehicle.id))
                              const hours = repair ? getRepairHours(repair) : null
                              const isBest =
                                repair &&
                                row.minHours !== null &&
                                Number.isFinite(hours) &&
                                hours === row.minHours

                              return (
                                <div className="compare-repair-cell" key={vehicle.id}>
                                  {repair ? (
                                    <>
                                      <div className="compare-cell-topline">
                                        <strong>{formatHours(hours)}</strong>
                                        {isBest && <span className="best-badge">Best</span>}
                                      </div>
                                      <span>{formatScore(getRepairScore(repair))} / 10</span>
                                      <em>{repair.label}</em>
                                    </>
                                  ) : (
                                    <span>No data</span>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        )}

        {activeView === 'search' && hasResultsState && (
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
                  <div className="vehicle-profile-hero">
                    <div className="vehicle-profile-main">
                      <span className="meta-label">Vehicle profile</span>
                      <h3>{vehicleTitle}</h3>
                      <p className="configuration-text">{vehicleConfigurationLabel}</p>
                      <span className="configuration-badge">{vehicleConfigurationBadge}</span>
                      <p className="vehicle-profile-copy">
                        {getVehicleVerdict(result.vehicleScore)}
                      </p>
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

                  <div className="vehicle-profile-actions">
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => addVehicleToCompare(result.vehicle)}
                      disabled={selectedCompareIds.includes(String(result.vehicle.id))}
                    >
                      {selectedCompareIds.includes(String(result.vehicle.id))
                        ? 'Added'
                        : 'Add to compare'}
                    </button>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => goToView('rankings')}
                    >
                      Browse rankings
                    </button>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => goToView('compare')}
                    >
                      Compare vehicles
                    </button>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={copyVehicleLink}
                    >
                      Copy link
                    </button>
                    {vehicleLinkMessage && !vehicleLinkMessage.startsWith('http') && (
                      <span className="copy-link-message">{vehicleLinkMessage}</span>
                    )}
                    {vehicleLinkMessage.startsWith('http') && (
                      <input
                        className="copy-link-input"
                        readOnly
                        value={vehicleLinkMessage}
                        onFocus={(event) => event.target.select()}
                      />
                    )}
                  </div>

                  <div className="score-explanation-card">
                    <h4>Why this score?</h4>
                    <p>{buildVehicleScoreSummary(result.vehicle, result.repairs)}</p>
                  </div>

                  <div className="quick-take-grid">
                    {vehicleQuickTake.map((item) => (
                      <article className="quick-take-card" key={item.label}>
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                      </article>
                    ))}
                  </div>

                  {repairCategorySummary.length > 0 && (
                    <div className="category-summary">
                      <div className="section-heading compact">
                        <p className="eyebrow">Repair category snapshot</p>
                        <h2>Where this vehicle looks easier</h2>
                      </div>
                      <div className="category-summary-grid">
                        {repairCategorySummary.map((item) => (
                          <article className="category-summary-card" key={item.category}>
                            <span>{item.category}</span>
                            <strong>{item.label}</strong>
                          </article>
                        ))}
                      </div>
                    </div>
                  )}
                </article>

                <div className="repairs-panel">
                  <div className="section-heading compact">
                    <p className="eyebrow">Repair details</p>
                    <h2>Common repair ratings</h2>
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
                <p className="profile-disclaimer">
                  Scores are estimates based on common repair labor times. Actual
                  difficulty can vary by rust, condition, tools, and experience.
                </p>
              </>
            )}
          </section>
        )}

        <section className="how-section" id="how-it-works">
          <div className="section-heading">
            <p className="eyebrow">Practical research before you buy</p>
            <h2>How it works</h2>
          </div>

          <div className="info-grid">
            <article>
              <h3>Choose a vehicle</h3>
              <p>Pick a year, make, model, and engine.</p>
            </article>
            <article>
              <h3>Review common repair ratings</h3>
              <p>
                Wrenchable Cars turns common repair labor times into an easy
                1-10 Wrenchability Score.
              </p>
            </article>
            <article>
              <h3>Compare before you buy</h3>
              <p>Use rankings and side-by-side comparisons to spot easier choices.</p>
            </article>
          </div>

          <div className="public-info-section">
            <article className="score-meaning-card">
              <p className="eyebrow">What the score means</p>
              <h2>Higher scores usually mean simpler repairs.</h2>
              <p>
                Scores are based on estimated labor time for common repairs. Higher
                scores usually mean simpler, more approachable maintenance and repair
                work. Actual difficulty can vary by rust, condition, tools, and experience.
              </p>
            </article>
          </div>

          <div className="faq-section" aria-label="Frequently asked questions">
            <div className="section-heading compact">
              <p className="eyebrow">FAQ</p>
              <h2>Common questions</h2>
            </div>
            <div className="faq-grid">
              <article>
                <h3>What is a Wrenchability Score?</h3>
                <p>
                  A 1-10 rating that estimates how approachable a vehicle is for
                  common maintenance and repair jobs. Higher is generally easier.
                </p>
              </article>
              <article>
                <h3>Is this a replacement for a mechanic's inspection?</h3>
                <p>
                  No. It is a research tool. Always inspect a specific vehicle's
                  condition before buying.
                </p>
              </article>
              <article>
                <h3>Why does engine choice matter?</h3>
                <p>
                  Labor time can change by engine and configuration, so engine-specific
                  results are more useful when available.
                </p>
              </article>
              <article>
                <h3>Why are some vehicles missing data?</h3>
                <p>
                  Some vehicles or repairs may not have enough labor-time data yet.
                  Coverage improves as more vehicles are added.
                </p>
              </article>
            </div>
          </div>
        </section>
      </main>
      <footer className="site-footer">
        <div>
          <strong>{BRAND.name}</strong>
          <p>Repair difficulty estimates are for research only.</p>
        </div>
        <button
          className="status-link"
          type="button"
          onClick={() => setActiveView('status')}
        >
          Status
        </button>
      </footer>
    </div>
  )
}

export default App
