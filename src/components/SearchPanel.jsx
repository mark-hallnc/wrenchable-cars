export default function SearchPanel({
  engineOptions,
  hasVehicleOptions,
  isLoadingVehicleOptions,
  makeOptions,
  modelOptions,
  needsEngineSelection,
  onEngineChange,
  onMakeChange,
  onModelChange,
  onSubmit,
  onYearChange,
  selectedEngineKey,
  selectedMake,
  selectedModel,
  selectedVehicleId,
  selectedYear,
  showEngineSelect,
  status,
  yearOptions,
}) {
  return (
    <form className="search-panel" onSubmit={onSubmit}>
      <div className="panel-heading">
        <p className="eyebrow">Quick check</p>
        <h2>Search a vehicle</h2>
      </div>

      <div className="form-grid">
        <label>
          Year
          <select
            value={selectedYear}
            onChange={onYearChange}
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
            onChange={onMakeChange}
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
            onChange={onModelChange}
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
              onChange={onEngineChange}
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
  )
}
