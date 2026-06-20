import { REPAIR_SORT_MODES, REPAIR_VIEW_FILTERS } from '../lib/repairHelpers'
import {
  buildRepairLaborExplanation,
  getRepairCategory,
  getRepairHours,
  getRepairName,
} from '../lib/repairHelpers'
import { formatHours, formatScore } from '../lib/formatters'
import { scoreClass } from '../lib/scoreHelpers'

function RepairRow({ repair }) {
  return (
    <article className="repair-row">
      <div className="repair-main">
        <h3>{getRepairName(repair)}</h3>
        <span>{formatHours(getRepairHours(repair))}</span>
        {getRepairCategory(repair) && (
          <p className="repair-detail">{getRepairCategory(repair)}</p>
        )}
        <p className="repair-detail">
          {buildRepairLaborExplanation(getRepairHours(repair))}
        </p>
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
  )
}

export default function RepairList({
  additionalRepairs,
  commonOwnershipRepairs,
  repairSearchText,
  repairSortMode,
  repairSummaryText,
  repairViewFilter,
  setRepairSearchText,
  setRepairSortMode,
  setRepairViewFilter,
  visibleRepairs,
}) {
  return (
    <div className="repairs-panel">
      <div className="section-heading compact">
        <p className="eyebrow">Common repair benchmarks</p>
        <h2>Common Ownership Repairs</h2>
      </div>
      <p className="repair-summary">
        The overall Wrenchability Score is based on these common ownership repairs when data is available.
      </p>

      <div className="repair-list common-repair-list">
        {commonOwnershipRepairs.length === 0 && (
          <article className="empty-repairs">
            No common ownership repair data is available for this vehicle yet.
          </article>
        )}
        {commonOwnershipRepairs.map((repair) => (
          <RepairRow key={repair.id} repair={repair} />
        ))}
      </div>

      <details className="additional-repairs-panel">
        <summary>
          <span>All Available Repair Data</span>
          <em>{additionalRepairs.length} additional repair jobs available</em>
        </summary>
        <p className="repair-summary">
          These repairs are shown for reference. They do not all carry equal weight in the overall Wrenchability Score.
        </p>

        <div className="repair-controls" aria-label="Additional repair list controls">
          <div className="filter-button-group" aria-label="Additional repair view filter">
            {REPAIR_VIEW_FILTERS.filter((option) => option.value !== 'top-ownership').map((option) => (
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
                placeholder="Filter additional repairs..."
              />
            </label>
          </div>
        </div>

        <p className="repair-summary">{repairSummaryText}</p>

        <div className="repair-list">
          {visibleRepairs.length === 0 && (
            <article className="empty-repairs">
              No additional repairs match your current filters.
            </article>
          )}
          {visibleRepairs.map((repair) => (
            <RepairRow key={repair.id} repair={repair} />
          ))}
        </div>
      </details>
    </div>
  )
}
