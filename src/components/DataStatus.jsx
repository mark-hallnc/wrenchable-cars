import { QUEUE_STATUSES } from '../lib/vehicleHelpers'
import { getVehicleConfigurationLabel, getVehicleTitle } from '../lib/vehicleHelpers'

export default function DataStatus({
  dataStatusCards,
  dataStatusState,
  dataStatusSummary,
  helperText,
  onRefresh,
}) {
  return (
    <section className="status-panel" aria-label="Data status">
      <div className="status-panel-header">
        <div className="panel-heading">
          <p className="eyebrow">Database health</p>
          <h2>Data Status</h2>
          {helperText && <p className="helper-text">{helperText}</p>}
        </div>
        <button
          className="secondary-button"
          type="button"
          onClick={onRefresh}
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
          Something went wrong loading data status. For the full local report,
          run npm.cmd run data:status.
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
                  {dataStatusSummary.missingScoreVehicles.slice(0, 10).map((vehicle) => (
                    <li key={vehicle.id}>
                      {getVehicleTitle(vehicle)} - {getVehicleConfigurationLabel(vehicle)}
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
  )
}
