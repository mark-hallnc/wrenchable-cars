import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabaseClient'
import { COMMON_OWNERSHIP_REPAIR_COUNT } from './lib/commonRepairs'
import {
  buildShareUrl,
  getCurrentPagePath,
  getInitialUrlState,
  updateBrowserUrl,
} from './lib/urlState'
import {
  copyToClipboard,
  formatHours,
  formatScore,
} from './lib/formatters'
import {
  compareNumbers,
  compareRepairNames,
  getCompareRepairRows,
  getFilteredAndSortedRepairs,
  getRepairCategorySummary,
  getRepairDisplayOrder,
  getRepairHours,
  getRepairName,
  getRepairScore,
  getTopOwnershipOrder,
  isTopOwnershipRepair,
} from './lib/repairHelpers'
import {
  COMPARE_REPAIR_SORTS,
  COMPARE_REPAIR_VIEWS,
  RANKING_LIMITS,
  RANKING_TYPES,
  applyRepairCountsToVehicles,
  buildDataStatusSummary,
  createCompareSlot,
  createCompareSlotsFromVehicles,
  getCompareVehicleIdsFromSlots,
  getConfigurationBadgeLabel,
  getEngineKey,
  getEngineOptions,
  getRepairCountMaps,
  getRankedVehicles,
  getUniqueMakes,
  getUniqueModels,
  getUniqueYears,
  getVehicleConfigurationLabel,
  getVehicleScoreValue,
  getVehicleTitle,
  mapVehicleScoreRows,
  mergeVehicleScoreRows,
  normalizeCompareVehicleIds,
  readStoredCompareVehicleIds,
  writeStoredCompareVehicleIds,
} from './lib/vehicleHelpers'
import {
  BRAND,
  buildCompareHighlights,
  buildVehicleScoreSummary,
  countRows,
  getBestOverallText,
  getCoverageInfoFromRepairCount,
  getCoverageLabelClass,
  getScoreBasedSummary,
  getVehicleCoverageInfo,
  getVehicleQuickTake,
  getVehicleVerdict,
  scoreClass,
  selectAllRows,
} from './lib/scoreHelpers'
import './App.css'

import Header from './components/Header'
import Hero from './components/Hero'
import Footer from './components/Footer'
import SearchPanel from './components/SearchPanel'
import DataStatus from './components/DataStatus'
import RepairList from './components/RepairList'
import AdminDataReview from './components/AdminDataReview'
import PrivacyPolicyPage from './components/PrivacyPolicyPage'
function App() {
  const [pagePath, setPagePath] = useState(getCurrentPagePath)
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
  const [repairViewFilter, setRepairViewFilter] = useState('all')
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
  const isPrivacyPage = pagePath === '/privacy'
  const isAdminView = activeView === 'admin'

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const handlePopState = () => {
      setPagePath(getCurrentPagePath())
      const nextUrlState = getInitialUrlState()

      if (nextUrlState.view === 'admin') {
        setActiveView('admin')
      } else if (nextUrlState.view === 'rankings') {
        setActiveView('rankings')
      } else if (nextUrlState.view === 'compare') {
        setActiveView('compare')
      } else {
        setActiveView('search')
      }
    }

    window.addEventListener('popstate', handlePopState)

    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const goToHomePage = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', '/')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    setPagePath('/')
    setActiveView('search')
  }, [])

  const goToPrivacyPage = useCallback((event) => {
    event.preventDefault()

    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', '/privacy')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    setPagePath('/privacy')
  }, [])

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
          const repairCountMaps = await getRepairCountMaps()
          setRankedVehicles(applyRepairCountsToVehicles(ranked, repairCountMaps))
          setRankingsStatus('loaded')
          return
        }

        const ranked = mapVehicleScoreRows(data)
        const repairCountMaps = await getRepairCountMaps()
        setRankedVehicles(applyRepairCountsToVehicles(ranked, repairCountMaps))
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
        repairScoreCount,
        laborEstimateCount,
        repairTaskCount,
      ] = await Promise.all([
        selectAllRows('vehicles', 'id, year, make, model, trim, engine, source_engine_slug'),
        selectAllRows('vehicle_scores', 'id, vehicle_id'),
        // Do not load all repair_scores here; table can be large.
        countRows('repair_scores'),
        // Do not load all labor_estimates here; table can be large.
        countRows('labor_estimates'),
        countRows('repair_tasks'),
      ])

      let queueRows = []
      let queueTotal = null
      let queueAvailable = true

      try {
        const [queueStatusRows, queueCount] = await Promise.all([
          selectAllRows('openlabor_import_queue', 'id, status'),
          countRows('openlabor_import_queue'),
        ])
        queueRows = queueStatusRows
        queueTotal = queueCount
      } catch (queueError) {
        console.warn('Queue status unavailable to the frontend:', queueError)
        queueAvailable = false
      }

      setDataStatusSummary(
        buildDataStatusSummary({
          vehicles: vehiclesRows,
          vehicleScores: vehicleScoreRows,
          repairScoreCount,
          laborEstimateCount,
          repairTaskCount,
          queueRows,
          queueTotal,
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
    setRepairViewFilter('all')
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
        // Do not load all repair_scores here; fetch only the selected vehicle.
        supabase
          .from('repair_scores')
          .select(
            'id, vehicle_id, repair_task_id, labor_hours, wrenchability_score, score_label',
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

    if (view === 'admin') {
      updateBrowserUrl({ view: 'admin' })
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

  const handleNavView = (event, view, targetId = '') => {
    event.preventDefault()

    if (isPrivacyPage && typeof window !== 'undefined') {
      window.history.pushState({}, '', '/')
      setPagePath('/')
    }

    goToView(view)

    if (targetId && typeof window !== 'undefined') {
      window.setTimeout(() => {
        document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth' })
      }, 0)
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

    if (initialUrlState.view === 'compare' || initialUrlState.view === 'admin') {
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

      if (initialUrlState.view === 'admin') {
        setActiveView('admin')
        updateBrowserUrl({ view: 'admin' }, 'replace')
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
    ].slice(0, 3)

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
        // Do not load all repair_scores here; compare is limited to up to 3 selected vehicles.
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
  const commonOwnershipRepairs = useMemo(
    () =>
      (result?.repairs ?? [])
        .filter(isTopOwnershipRepair)
        .sort(
          (first, second) =>
            compareNumbers(getTopOwnershipOrder(first), getTopOwnershipOrder(second)) ||
            compareRepairNames(first, second),
        ),
    [result?.repairs],
  )
  const additionalRepairs = useMemo(
    () => (result?.repairs ?? []).filter((repair) => !isTopOwnershipRepair(repair)),
    [result?.repairs],
  )
  const visibleRepairs = useMemo(
    () =>
      getFilteredAndSortedRepairs(
        additionalRepairs,
        repairViewFilter === 'top-ownership' ? 'all' : repairViewFilter,
        repairSortMode,
        repairSearchText,
      ),
    [additionalRepairs, repairViewFilter, repairSortMode, repairSearchText],
  )
  const vehicleQuickTake = useMemo(
    () => getVehicleQuickTake(result?.repairs ?? []),
    [result?.repairs],
  )
  const vehicleCoverageInfo = useMemo(
    () => getVehicleCoverageInfo(result?.repairs ?? []),
    [result?.repairs],
  )
  const repairCategorySummary = useMemo(
    () => getRepairCategorySummary(result?.repairs ?? []),
    [result?.repairs],
  )
  const repairSummaryText = useMemo(() => {
    const count = visibleRepairs.length

    if (repairViewFilter === 'easiest') {
      return `Showing ${count} easiest additional ${count === 1 ? 'repair' : 'repairs'}`
    }

    if (repairViewFilter === 'hardest') {
      return `Showing ${count} hardest additional ${count === 1 ? 'repair' : 'repairs'}`
    }

    return `Showing ${count} additional ${count === 1 ? 'repair' : 'repairs'}`
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
  const otherCompareRepairRows = useMemo(
    () => getCompareRepairRows(comparisonVehicles, 'shared', compareRepairSort),
    [comparisonVehicles, compareRepairSort],
  )
  const compareRepairSummaryText = useMemo(() => {
    const vehicleCount = comparisonVehicles.length

    if (compareRepairView === 'top-ownership') {
      return `Showing ${compareRepairRows.length} common ownership repairs.`
    }

    if (compareRepairView === 'differences') {
      return `Showing ${compareRepairRows.length} biggest differences from common ownership repairs.`
    }

    return `Comparing ${compareRepairRows.length} shared additional ${compareRepairRows.length === 1 ? 'repair' : 'repairs'} across ${vehicleCount} ${vehicleCount === 1 ? 'vehicle' : 'vehicles'} as reference data.`
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
      <Header
        brandName={BRAND.name}
        activeView={activeView}
        onHome={goToHomePage}
        onNavView={handleNavView}
      />

      {isPrivacyPage ? (
        <PrivacyPolicyPage onBack={goToHomePage} />
      ) : isAdminView ? (
        <AdminDataReview />
      ) : (
      <main id="top">
        <Hero>
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
              <SearchPanel
                engineOptions={engineOptions}
                hasVehicleOptions={hasVehicleOptions}
                isLoadingVehicleOptions={isLoadingVehicleOptions}
                makeOptions={makeOptions}
                modelOptions={modelOptions}
                needsEngineSelection={needsEngineSelection}
                onEngineChange={handleEngineChange}
                onMakeChange={handleMakeChange}
                onModelChange={handleModelChange}
                onSubmit={handleSubmit}
                onYearChange={handleYearChange}
                selectedEngineKey={selectedEngineKey}
                selectedMake={selectedMake}
                selectedModel={selectedModel}
                selectedVehicleId={selectedVehicleId}
                selectedYear={selectedYear}
                showEngineSelect={showEngineSelect}
                status={status}
                yearOptions={yearOptions}
              />
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
              <DataStatus
                dataStatusCards={dataStatusCards}
                dataStatusState={dataStatusState}
                dataStatusSummary={dataStatusSummary}
                onRefresh={loadDataStatus}
              />
            )}
          </div>
        </Hero>

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
                      {Number.isFinite(Number(vehicle.commonRepairCount)) && (
                        <>
                          {getCoverageInfoFromRepairCount(vehicle.commonRepairCount) && (
                            <span
                              className={`coverage-badge ${getCoverageLabelClass(
                                getCoverageInfoFromRepairCount(vehicle.commonRepairCount).coverageLabel,
                              )}`}
                            >
                              {getCoverageInfoFromRepairCount(vehicle.commonRepairCount).coverageLabel}
                            </span>
                          )}
                          <span>
                            Score based on {vehicle.commonRepairCount} of {COMMON_OWNERSHIP_REPAIR_COUNT} common ownership repairs
                          </span>
                          <span>Additional repair data: {vehicle.additionalRepairCount ?? 0} jobs</span>
                        </>
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
                      {(() => {
                        const coverageInfo = getVehicleCoverageInfo(repairs)

                        return (
                          <div className="coverage-line">
                            <span
                              className={`coverage-badge ${getCoverageLabelClass(
                                coverageInfo.coverageLabel,
                              )}`}
                            >
                              {coverageInfo.coverageLabel}
                            </span>
                            <span>{coverageInfo.coverageDescription}</span>
                          </div>
                        )
                      })()}
                      <p className="score-summary-line">
                        Additional repair data: {Math.max(0, repairs.length - getVehicleCoverageInfo(repairs).topOwnershipRepairCount)} jobs
                      </p>
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
                    <p className="eyebrow">Common repair benchmarks</p>
                    <h2>Common Ownership Repairs</h2>
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

                  <details className="other-compare-repairs">
                    <summary>
                      <span>Other available repairs</span>
                      <em>{otherCompareRepairRows.length} shared reference repairs</em>
                    </summary>
                    <p className="comparison-summary-text">
                      These repairs are shown for reference data. They are not the primary common ownership benchmarks used for the overall score.
                    </p>
                    {otherCompareRepairRows.length === 0 ? (
                      <article className="empty-repairs">
                        No shared additional repair data found for these vehicles.
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

                          {otherCompareRepairRows.map((row) => (
                            <div
                              className="compare-repair-row"
                              key={row.key}
                              style={{
                                gridTemplateColumns: `minmax(190px, 1fr) repeat(${comparisonVehicles.length}, minmax(160px, 0.8fr))`,
                              }}
                            >
                              <div className="compare-repair-name">
                                <strong>{row.name}</strong>
                              </div>
                              {comparisonVehicles.map(({ vehicle }) => {
                                const repair = row.cells.get(String(vehicle.id))
                                const hours = repair ? getRepairHours(repair) : null

                                return (
                                  <div className="compare-repair-cell" key={vehicle.id}>
                                    {repair ? (
                                      <>
                                        <strong>{formatHours(hours)}</strong>
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
                  </details>
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
                      <span
                        className={`coverage-badge ${getCoverageLabelClass(
                          vehicleCoverageInfo.coverageLabel,
                        )}`}
                      >
                        {vehicleCoverageInfo.coverageLabel}
                      </span>
                      <span className="coverage-text">
                        Score based on {vehicleCoverageInfo.topOwnershipRepairCount} of {COMMON_OWNERSHIP_REPAIR_COUNT} common ownership repairs.
                      </span>
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

                <RepairList
                  additionalRepairs={additionalRepairs}
                  commonOwnershipRepairs={commonOwnershipRepairs}
                  repairSearchText={repairSearchText}
                  repairSortMode={repairSortMode}
                  repairSummaryText={repairSummaryText}
                  repairViewFilter={repairViewFilter}
                  setRepairSearchText={setRepairSearchText}
                  setRepairSortMode={setRepairSortMode}
                  setRepairViewFilter={setRepairViewFilter}
                  visibleRepairs={visibleRepairs}
                />
                <p className="profile-disclaimer">
                  Scores are estimates based on common repair labor times. Labor-time
                  data provided by{' '}
                  <a
                    href="https://openlaborproject.com"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open Labor Project
                  </a>
                  . Actual difficulty can vary by rust, condition, tools, and
                  experience.
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
      )}
      <Footer onPrivacyClick={goToPrivacyPage} />
    </div>
  )
}

export default App
