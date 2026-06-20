import { supabase } from './supabaseClient'
import {
  COMMON_OWNERSHIP_REPAIR_COUNT,
  COMMON_OWNERSHIP_REPAIR_NAME_KEYWORDS,
  COMMON_OWNERSHIP_REPAIR_SLUGS,
  getCommonRepairCoverage,
  isCommonOwnershipRepairSlug,
} from './commonRepairs'

export const BRAND = {
  name: 'Wrenchable Cars',
  tagline: 'Find cars that are easier to fix, maintain, and own.',
  shortTagline: 'Compare common repair labor times.',
}

export const FEATURE_CALLOUTS = [
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

export const WRENCHABILITY_SCORE_EXPLANATION =
  'Wrenchability Score is a 1-10 rating based on estimated labor time for common repairs. Higher scores generally mean simpler, more approachable maintenance and repair work.'

export const scoreClass = (score) => {
  const numericScore = Number(score)

  if (numericScore <= 3) return 'low'
  if (numericScore <= 6) return 'mid'
  return 'high'
}

export const formatScore = (score) => {
  const numericScore = Number(score)

  if (!Number.isFinite(numericScore)) return 'Pending'

  return numericScore.toFixed(1).replace('.0', '')
}

export const REPAIR_VIEW_FILTERS = [
  { value: 'top-ownership', label: 'Common Ownership Repairs' },
  { value: 'easiest', label: 'Easiest repairs' },
  { value: 'hardest', label: 'Hardest repairs' },
  { value: 'all', label: 'Additional repair data' },
]

export const REPAIR_SORT_MODES = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'score-desc', label: 'Wrenchability: High to Low' },
  { value: 'score-asc', label: 'Wrenchability: Low to High' },
  { value: 'hours-asc', label: 'Labor Hours: Low to High' },
  { value: 'hours-desc', label: 'Labor Hours: High to Low' },
  { value: 'name-asc', label: 'Repair Name: A to Z' },
]

export const RANKING_TYPES = [
  { value: 'top', label: 'Top Easiest' },
  { value: 'bottom', label: 'Bottom Hardest' },
  { value: 'all', label: 'All Ranked' },
]

export const RANKING_LIMITS = ['10', '25', '50', '100']

export const QUEUE_STATUSES = ['pending', 'running', 'completed', 'skipped', 'failed']

export const COMPARE_STORAGE_KEY = 'wrenchable_compare_vehicle_ids'

export const COMPARE_REPAIR_VIEWS = [
  { value: 'top-ownership', label: 'Common Ownership Repairs' },
  { value: 'shared', label: 'Shared Additional Repairs' },
  { value: 'differences', label: 'Biggest Common Differences' },
]

export const COMPARE_REPAIR_SORTS = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'average-easiest', label: 'Easiest average first' },
  { value: 'average-hardest', label: 'Hardest average first' },
  { value: 'labor-spread', label: 'Biggest labor-hour spread' },
  { value: 'name-asc', label: 'Repair name A-Z' },
]

export const createCompareSlot = () => ({
  year: '',
  make: '',
  model: '',
  engineKey: '',
  vehicleId: '',
})

export const normalizeCompareVehicleIds = (ids) =>
  [...new Set((Array.isArray(ids) ? ids : []).map((id) => String(id ?? '').trim()).filter(Boolean))]
    .slice(0, 3)

export const getCompareVehicleIdsFromSlots = (slots) =>
  normalizeCompareVehicleIds(slots.map((slot) => slot.vehicleId))

export const readStoredCompareVehicleIds = () => {
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

export const writeStoredCompareVehicleIds = (ids) => {
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

export const normalizeUrlVehicleIds = (value) =>
  normalizeCompareVehicleIds(String(value ?? '').split(','))

export const getInitialUrlState = () => {
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

export const getCurrentPagePath = () => {
  if (typeof window === 'undefined') return '/'

  return window.location.pathname === '/privacy' ? '/privacy' : '/'
}

export const buildShareUrl = (params) => {
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

export const updateBrowserUrl = (params, mode = 'push') => {
  if (typeof window === 'undefined' || !window.history) return

  const url = buildShareUrl(params)

  if (!url || url === window.location.href) return

  if (mode === 'replace') {
    window.history.replaceState({}, '', url)
    return
  }

  window.history.pushState({}, '', url)
}

export const copyToClipboard = async (text) => {
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

export const createCompareSlotsFromVehicles = (vehicleRows) => {
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

export const VEHICLE_VERDICT =
  'This score is based on common repair labor times and how approachable the vehicle is for typical maintenance and repair work.'

export const normalizeText = (value) => String(value ?? '').trim().toLowerCase()

export const optionalNumber = (value) => {
  if (value === '' || value === null || value === undefined) return null

  const numericValue = Number(value)

  return Number.isFinite(numericValue) ? numericValue : null
}

export const getRepairTask = (repair) =>
  repair?.repair_tasks ?? repair?.repair_task ?? repair?.task ?? null

export const getRepairName = (repair) => {
  const task = getRepairTask(repair)

  return repair?.name ?? repair?.repair_name ?? task?.name ?? 'Unknown repair task'
}

export const getRepairCategory = (repair) => {
  const task = getRepairTask(repair)

  return repair?.category ?? repair?.repair_category ?? task?.category ?? ''
}

export const getRepairSlug = (repair) => {
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

export const getRepairScore = (repair) => Number(repair?.score ?? repair?.wrenchability_score)

export const getRepairHours = (repair) => Number(repair?.hours ?? repair?.labor_hours)

export const getRepairDisplayOrder = (repair) => {
  const task = getRepairTask(repair)
  const displayOrder = Number(repair?.displayOrder ?? repair?.display_order ?? task?.display_order)

  return Number.isFinite(displayOrder) ? displayOrder : 999
}

export const getTopOwnershipOrder = (repair) => {
  const slug = normalizeText(getRepairSlug(repair))
  const slugIndex = COMMON_OWNERSHIP_REPAIR_SLUGS.indexOf(slug)

  if (slugIndex >= 0) return slugIndex

  const repairName = normalizeText(getRepairName(repair))
  const keywordMatch = COMMON_OWNERSHIP_REPAIR_NAME_KEYWORDS.find(({ keywords }) =>
    keywords.every((keyword) => repairName.includes(keyword)),
  )

  return keywordMatch
    ? COMMON_OWNERSHIP_REPAIR_SLUGS.indexOf(keywordMatch.slug)
    : Number.POSITIVE_INFINITY
}

export const isTopOwnershipRepair = (repair) => Number.isFinite(getTopOwnershipOrder(repair))

export const compareNumbers = (first, second) => {
  const firstNumber = Number.isFinite(first) ? first : Number.POSITIVE_INFINITY
  const secondNumber = Number.isFinite(second) ? second : Number.POSITIVE_INFINITY

  return firstNumber - secondNumber
}

export const compareFiniteNumbers = (first, second, direction = 'asc') => {
  const firstIsFinite = Number.isFinite(first)
  const secondIsFinite = Number.isFinite(second)

  if (!firstIsFinite && !secondIsFinite) return 0
  if (!firstIsFinite) return 1
  if (!secondIsFinite) return -1

  return direction === 'desc' ? second - first : first - second
}

export const compareRepairNames = (first, second) =>
  getRepairName(first).localeCompare(getRepairName(second))

export const incrementCount = (map, key, amount = 1) => {
  map.set(key, (map.get(key) ?? 0) + amount)
}

export const getTopCountEntries = (map, limit = 10) =>
  [...map.entries()]
    .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]))
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }))

export const selectAllRows = async (tableName, selectColumns) => {
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

export const countRows = async (tableName) => {
  const { count, error } = await supabase
    .from(tableName)
    .select('id', { count: 'exact', head: true })

  if (error) throw error

  return count ?? 0
}

export const getRecommendedRepairSort = (viewFilter) => {
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

export const getRepairSort = (viewFilter, sortMode) => {
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

export const getFilteredAndSortedRepairs = (repairs, viewFilter, sortMode, searchText) => {
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

export const getVehicleTitle = (vehicle) =>
  [vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean).join(' ')

export const getVehicleScoreValue = (vehicle) => Number(vehicle?.vehicleScore?.overall_score)

export const formatEngineSlug = (slug) => {
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

export const getVehicleConfigurationLabel = (vehicle) => {
  const engine = String(vehicle?.engine ?? '').trim()
  const sourceEngineSlug = formatEngineSlug(vehicle?.source_engine_slug)
  const trim = String(vehicle?.trim ?? '').trim()
  const configuration = engine || sourceEngineSlug || 'Base / unspecified engine'

  return trim ? `${configuration} - ${trim}` : configuration
}

export const getEngineKey = (vehicle) => {
  const sourceEngineSlug = normalizeText(vehicle?.source_engine_slug)
  const engine = normalizeText(vehicle?.engine)

  return sourceEngineSlug || engine || 'base-unspecified'
}

export const hasSpecificConfiguration = (vehicle) =>
  Boolean(normalizeText(vehicle?.engine) || normalizeText(vehicle?.source_engine_slug))

export const getConfigurationBadgeLabel = (vehicle) =>
  hasSpecificConfiguration(vehicle) ? 'Engine-specific data' : 'General model data'

export const hasSpecificEngineSibling = (vehicle, allVehicles) =>
  !hasSpecificConfiguration(vehicle) &&
  (allVehicles ?? []).some(
    (candidate) =>
      String(candidate.id) !== String(vehicle.id) &&
      String(candidate.year) === String(vehicle.year) &&
      candidate.make === vehicle.make &&
      candidate.model === vehicle.model &&
      hasSpecificConfiguration(candidate),
  )

export const isGenericVehicleHidden = (vehicle, allVehicles) =>
  hasSpecificEngineSibling(vehicle, allVehicles)

export const getVehicleVerdict = (vehicleScore) => {
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

export const getUniqueRepairNames = (repairs, limit) => {
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

export const formatRepairNameList = (names) => {
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} and ${names[1]}`

  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
}

export const formatHours = (hours) => {
  const numericHours = Number(hours)

  if (!Number.isFinite(numericHours)) return 'No data'

  return `${numericHours.toFixed(1)} ${numericHours === 1 ? 'hr' : 'hrs'}`
}

export const buildRepairLaborExplanation = (hours) => {
  const numericHours = Number(hours)

  if (!Number.isFinite(numericHours)) return 'Labor time estimate is not available.'
  if (numericHours <= 0.5) return 'A quick repair based on estimated labor time.'
  if (numericHours <= 1.5) return 'A relatively approachable repair based on estimated labor time.'
  if (numericHours <= 3) return 'A moderate repair based on estimated labor time.'
  if (numericHours <= 6) return 'A more involved repair based on estimated labor time.'
  return 'A major repair based on estimated labor time.'
}

export const getScoreBasedSummary = (overallScore) => {
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

export const buildVehicleScoreSummary = (vehicle, repairScores) => {
  const commonRepairs = (repairScores ?? []).filter(isTopOwnershipRepair)
  const usableRepairs = commonRepairs
    .map((repair) => ({
      repair,
      score: getRepairScore(repair),
      hours: getRepairHours(repair),
    }))
    .filter(({ score, hours }) => Number.isFinite(score) || Number.isFinite(hours))

  if (usableRepairs.length === 0) {
    return 'More common ownership repair data is needed to explain this score.'
  }

  const coverageInfo = getVehicleCoverageInfo(repairScores)
  const coverageNote = ['Limited coverage', 'Early estimate'].includes(coverageInfo.coverageLabel)
    ? ' Coverage is still growing for this configuration.'
    : ''

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
    return `This vehicle scores well because several common jobs${easiestNames ? `, like ${easiestNames},` : ''} look quick and approachable.${hardestNames ? ` The main jobs to watch are ${hardestNames}.` : ''}${coverageNote}`
  }

  if (averageScore !== null && averageScore < 5) {
    return `This vehicle may be more demanding to maintain.${longestNames ? ` Repairs like ${longestNames} show higher labor times,` : ' Several common repairs have higher labor times,'} so it may be less friendly for driveway DIY work.${coverageNote}`
  }

  return `This vehicle is a mixed bag.${easiestNames ? ` Basic work like ${easiestNames} looks approachable,` : ' Basic maintenance looks approachable,'}${hardestNames ? ` but ${hardestNames} take enough labor to pull the overall score down.` : ' but a few common repairs take enough labor to pull the overall score down.'}${coverageNote}`
}

export const getVehicleQuickTake = (repairs) => {
  const repairRows = (repairs ?? []).filter(isTopOwnershipRepair)
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

export const getCategoryLabelFromAverage = (averageScore) => {
  if (averageScore >= 9) return 'Easy'
  if (averageScore >= 7) return 'DIY Friendly'
  if (averageScore >= 5) return 'Moderate'
  if (averageScore >= 3) return 'Advanced'
  return 'Major Job'
}

export const getRepairCategorySummary = (repairs) => {
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

export const getCoverageLabelClass = (coverageLabel) =>
  normalizeText(coverageLabel).replace(/\s+/g, '-')

export const getCommonRepairCoverageDescription = (commonRepairCount) => {
  const count = Number(commonRepairCount)

  if (count >= 16) {
    return `Score based on ${count} of ${COMMON_OWNERSHIP_REPAIR_COUNT} common ownership repairs.`
  }

  if (count >= 10) {
    return `Score based on ${count} of ${COMMON_OWNERSHIP_REPAIR_COUNT} common ownership repairs.`
  }

  if (count >= 5) {
    return `Score based on ${count} of ${COMMON_OWNERSHIP_REPAIR_COUNT} common ownership repairs.`
  }

  return `Early estimate based on ${Math.max(0, count)} of ${COMMON_OWNERSHIP_REPAIR_COUNT} common ownership repairs.`
}

export const getVehicleCoverageInfo = (repairScores) => {
  const repairs = repairScores ?? []
  const scoredRepairCount = repairs.filter((repair) =>
    Number.isFinite(getRepairScore(repair)),
  ).length
  const topOwnershipRepairCount = repairs.filter((repair) =>
    Number.isFinite(getRepairScore(repair)) && isTopOwnershipRepair(repair),
  ).length

  return {
    scoredRepairCount,
    topOwnershipRepairCount,
    additionalRepairCount: Math.max(0, scoredRepairCount - topOwnershipRepairCount),
    coverageLabel: getCommonRepairCoverage(topOwnershipRepairCount),
    coverageDescription: getCommonRepairCoverageDescription(topOwnershipRepairCount),
  }
}

export const getCoverageInfoFromRepairCount = (repairCount) => {
  const count = Number(repairCount)

  if (!Number.isFinite(count)) return null

  return {
    coverageLabel: getCommonRepairCoverage(count),
    scoredRepairCount: count,
    coverageDescription: getCommonRepairCoverageDescription(count),
  }
}

export const getJoinedVehicle = (scoreRow) => {
  if (Array.isArray(scoreRow?.vehicles)) {
    return scoreRow.vehicles[0] ?? null
  }

  return scoreRow?.vehicles ?? null
}

export const mapVehicleScoreRows = (scoreRows) =>
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

export const mergeVehicleScoreRows = (scoreRows, vehicleRows) => {
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

export const getRepairCountMaps = async () => {
  const [repairRows, repairTasks] = await Promise.all([
    selectAllRows('repair_scores', 'vehicle_id, repair_task_id'),
    selectAllRows('repair_tasks', 'id, source_job_slug'),
  ])
  const taskSlugsById = new Map(repairTasks.map((task) => [task.id, task.source_job_slug]))
  const countsByVehicleId = new Map()

  for (const repair of repairRows) {
    const vehicleId = String(repair.vehicle_id)
    const counts = countsByVehicleId.get(vehicleId) ?? {
      commonRepairCount: 0,
      additionalRepairCount: 0,
      repairCount: 0,
    }
    const slug = taskSlugsById.get(repair.repair_task_id)

    counts.repairCount += 1

    if (isCommonOwnershipRepairSlug(slug)) {
      counts.commonRepairCount += 1
    } else {
      counts.additionalRepairCount += 1
    }

    countsByVehicleId.set(vehicleId, counts)
  }

  return countsByVehicleId
}

export const applyRepairCountsToVehicles = (vehicles, countsByVehicleId) =>
  vehicles.map((vehicle) => ({
    ...vehicle,
    ...(countsByVehicleId.get(String(vehicle.id)) ?? {
      commonRepairCount: 0,
      additionalRepairCount: 0,
      repairCount: 0,
    }),
  }))

export const getRankedVehicles = (vehicles, filters) => {
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

export const getUniqueYears = (vehicles) =>
  [...new Set(vehicles.map((vehicle) => vehicle.year))]
    .filter((year) => year !== null && year !== undefined)
    .sort((a, b) => Number(b) - Number(a))
    .map(String)

export const getUniqueMakes = (vehicles, year) =>
  [
    ...new Set(
      vehicles
        .filter((vehicle) => String(vehicle.year) === String(year))
        .map((vehicle) => vehicle.make),
    ),
  ]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))

export const getUniqueModels = (vehicles, year, make) =>
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

export const getEngineOptions = (vehicles, year, make, model) => {
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

export const buildDataStatusSummary = ({
  vehicles,
  vehicleScores,
  repairScoreCount,
  laborEstimateCount,
  repairTaskCount,
  queueRows,
  queueTotal,
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
      repairScores: repairScoreCount,
      laborEstimates: laborEstimateCount,
      repairTasks: repairTaskCount,
      queueTotal: queueAvailable ? queueTotal : null,
    },
    queueAvailable,
    queueStatusCounts,
    missingScoreVehicles,
    topMakeModelGroups: getTopCountEntries(makeModelCounts),
    topVariantGroups: getTopCountEntries(variantCounts),
    recommendation,
  }
}

export const getCompareRepairKey = (repair) =>
  getRepairSlug(repair) || String(repair.repair_task_id ?? repair.repairTaskId ?? repair.id)

export const getRepairWinner = (row) => {
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

export const getLaborHourSpread = (row) => {
  const hours = [...row.cells.values()].map(getRepairHours).filter(Number.isFinite)

  if (hours.length < 2) return 0

  return Math.max(...hours) - Math.min(...hours)
}

export const getCompareRepairRows = (comparisonVehicles, viewMode, sortMode) => {
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
      return row.dataCount >= 2 && !Number.isFinite(row.order)
    }

    return Number.isFinite(row.order) && row.hoursCount >= 2 && row.laborSpread > 0
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

export const getComparableRepairRows = (comparisonVehicles) =>
  getCompareRepairRows(comparisonVehicles, 'shared', 'labor-spread')
    .filter((row) => row.hoursCount >= 2)

export const buildCompareHighlights = (comparisonVehicles) => {
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

export const getBestOverallText = (comparisonVehicles) => {
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
