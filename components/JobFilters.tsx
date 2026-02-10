'use client'

import { useMemo } from 'react'
import { Lineicons } from '@lineiconshq/react-lineicons'
import { Leaf1Outlined, Leaf1Solid } from '@lineiconshq/free-icons'
import { JobPosting } from '@/lib/supabase'

interface JobFiltersProps {
  jobs: JobPosting[]
  searchQuery: string
  onSearchChange: (query: string) => void
  selectedOrganizations: string[]
  onOrganizationsChange: (orgs: string[]) => void
  selectedProvinces: string[]
  onProvincesChange: (provinces: string[]) => void
  selectedMunicipalities: string[]
  onMunicipalitiesChange: (municipalities: string[]) => void
  selectedEmploymentTypes: string[]
  onEmploymentTypesChange: (types: string[]) => void
  remoteFilter: 'all' | 'remote-only' | 'hide-remote'
  onRemoteFilterChange: (filter: 'all' | 'remote-only' | 'hide-remote') => void
  showOnlySse: boolean
  onShowOnlySseChange: (show: boolean) => void
  showJobsWithoutSalary: boolean
  onShowJobsWithoutSalaryChange: (show: boolean) => void
  postedWithin: '1-week' | '2-weeks' | '3-weeks' | '1-month' | 'any'
  onPostedWithinChange: (value: '1-week' | '2-weeks' | '3-weeks' | '1-month' | 'any') => void
  filtersExpanded: boolean
  onFiltersExpandedChange: (expanded: boolean) => void
}

export default function JobFilters({
  jobs,
  searchQuery,
  onSearchChange,
  selectedOrganizations,
  onOrganizationsChange,
  selectedProvinces,
  onProvincesChange,
  selectedMunicipalities,
  onMunicipalitiesChange,
  selectedEmploymentTypes,
  onEmploymentTypesChange,
  remoteFilter,
  onRemoteFilterChange,
  showOnlySse,
  onShowOnlySseChange,
  showJobsWithoutSalary,
  onShowJobsWithoutSalaryChange,
  postedWithin,
  onPostedWithinChange,
  filtersExpanded,
  onFiltersExpandedChange,
}: JobFiltersProps) {
  const hasActiveFilters =
    !!searchQuery ||
    selectedOrganizations.length > 0 ||
    selectedProvinces.length > 0 ||
    selectedMunicipalities.length > 0 ||
    selectedEmploymentTypes.length > 0 ||
    remoteFilter !== 'all' ||
    !showOnlySse ||
    showJobsWithoutSalary ||
    postedWithin !== '2-weeks'

  // Extract unique values for filter options
  const { organizations, provinces, municipalitiesByProvince, employmentTypes } = useMemo(() => {
    const orgs = new Set<string>()
    const provs = new Set<string>()
    const munisByProv: Record<string, Set<string>> = {}
    const types = new Set<string>()

    jobs.forEach((job) => {
      if (job.organization) orgs.add(job.organization)
      if (job.province) {
        provs.add(job.province)
        if (!munisByProv[job.province]) {
          munisByProv[job.province] = new Set<string>()
        }
        if (job.municipality) {
          munisByProv[job.province].add(job.municipality)
        }
      }
      if (job.employment_type) types.add(job.employment_type)
    })

    // Convert Sets to sorted arrays
    const sortedMunisByProv: Record<string, string[]> = {}
    Object.keys(munisByProv).sort().forEach(prov => {
      sortedMunisByProv[prov] = Array.from(munisByProv[prov]).sort()
    })

    return {
      organizations: Array.from(orgs).sort(),
      provinces: Array.from(provs).sort(),
      municipalitiesByProvince: sortedMunisByProv,
      employmentTypes: Array.from(types).sort(),
    }
  }, [jobs])

  const handleOrganizationToggle = (org: string) => {
    if (selectedOrganizations.includes(org)) {
      onOrganizationsChange(selectedOrganizations.filter((o) => o !== org))
    } else {
      onOrganizationsChange([...selectedOrganizations, org])
    }
  }

  const handleProvinceToggle = (province: string) => {
    if (selectedProvinces.includes(province)) {
      // Deselecting province: remove it and all its municipalities
      onProvincesChange(selectedProvinces.filter((p) => p !== province))
      const municipalitiesInProvince = municipalitiesByProvince[province] || []
      onMunicipalitiesChange(
        selectedMunicipalities.filter((m) => !municipalitiesInProvince.includes(m))
      )
    } else {
      // Selecting province: add it and all its municipalities
      onProvincesChange([...selectedProvinces, province])
      const municipalitiesInProvince = municipalitiesByProvince[province] || []
      // Combine and deduplicate municipalities
      const combined = [...selectedMunicipalities, ...municipalitiesInProvince]
      const newMunicipalities = combined.filter((m, index) => combined.indexOf(m) === index)
      onMunicipalitiesChange(newMunicipalities)
    }
  }

  const handleMunicipalityToggle = (municipality: string) => {
    if (selectedMunicipalities.includes(municipality)) {
      onMunicipalitiesChange(selectedMunicipalities.filter((m) => m !== municipality))
    } else {
      onMunicipalitiesChange([...selectedMunicipalities, municipality])
    }
  }

  const handleEmploymentTypeToggle = (type: string) => {
    if (selectedEmploymentTypes.includes(type)) {
      onEmploymentTypesChange(selectedEmploymentTypes.filter((t) => t !== type))
    } else {
      onEmploymentTypesChange([...selectedEmploymentTypes, type])
    }
  }

  const clearAllFilters = () => {
    onSearchChange('')
    onOrganizationsChange([])
    onProvincesChange([])
    onMunicipalitiesChange([])
    onEmploymentTypesChange([])
    onRemoteFilterChange('all')
    onShowOnlySseChange(false)
    onShowJobsWithoutSalaryChange(false)
    onPostedWithinChange('2-weeks')
  }

  // Get municipalities to display based on selected provinces
  // Shows: municipalities from selected provinces + any already-selected municipalities
  const visibleMunicipalitiesByProvince = useMemo(() => {
    const visible: Record<string, string[]> = {}
    
    Object.entries(municipalitiesByProvince).forEach(([province, municipalities]) => {
      // Show municipalities from this province if:
      // 1. No provinces selected (show all), OR
      // 2. This province is selected, OR
      // 3. Any municipality from this province is already selected
      const hasSelectedMunicipality = municipalities.some(m => selectedMunicipalities.includes(m))
      const shouldShow = selectedProvinces.length === 0 || selectedProvinces.includes(province) || hasSelectedMunicipality
      
      if (shouldShow) {
        visible[province] = municipalities
      }
    })
    
    return visible
  }, [municipalitiesByProvince, selectedProvinces, selectedMunicipalities])

  // Get all municipalities for count
  const allMunicipalities = useMemo(() => {
    const all: string[] = []
    Object.values(municipalitiesByProvince).forEach(munis => {
      all.push(...munis)
    })
    return all.sort()
  }, [municipalitiesByProvince])

  // Calculate which provinces are in indeterminate state (some but not all municipalities selected)
  const indeterminateProvinces = useMemo(() => {
    const indeterminate = new Set<string>()
    
    provinces.forEach(province => {
      const municipalitiesInProvince = municipalitiesByProvince[province] || []
      if (municipalitiesInProvince.length === 0) return
      
      const selectedCount = municipalitiesInProvince.filter(m => 
        selectedMunicipalities.includes(m)
      ).length
      
      // Indeterminate if some but not all municipalities are selected
      if (selectedCount > 0 && selectedCount < municipalitiesInProvince.length) {
        indeterminate.add(province)
      }
    })
    
    return indeterminate
  }, [provinces, municipalitiesByProvince, selectedMunicipalities])

  return (
    <div className="bg-wev-surface border border-wev-border rounded-wev-card p-6 mb-6 shadow-wev-card">
      {/* Search */}
      <div className="mb-2">
        <div className="flex items-center justify-between mb-2">
          <label htmlFor="search" className="block text-sm font-semibold text-wev-text-primary">
            Search
          </label>
          <button
            type="button"
            onClick={() => onFiltersExpandedChange(!filtersExpanded)}
            className="text-sm text-wev-accent hover:text-wev-primary-text hover:underline flex items-center gap-1 transition-colors"
            aria-expanded={filtersExpanded}
            aria-controls="job-filters-content"
          >
            {filtersExpanded ? (
              <>
                <span>Hide Filters</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              </>
            ) : (
              <>
                <span>Show filters</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </>
            )}
          </button>
        </div>
        <input
          type="text"
          id="search"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by job title, organization, location..."
          className="w-full px-4 py-2 border border-wev-border rounded-wev-btn focus:outline-none focus:ring-2 focus:ring-wev-primary focus:border-transparent text-wev-text-primary bg-wev-surface transition-colors"
        />
      </div>

      {/* Collapsible Filters Section */}
      <div
        id="job-filters-content"
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          filtersExpanded ? 'max-h-[2000px] opacity-100 mt-4' : 'max-h-0 opacity-0'
        }`}
      >
        {/* SSE filter */}
        <div className="mb-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showOnlySse}
              onChange={(e) => onShowOnlySseChange(e.target.checked)}
              className="wev-checkbox"
            />
            <Lineicons icon={showOnlySse ? Leaf1Solid : Leaf1Outlined} size={16} className="shrink-0 text-wev-primary" aria-hidden />
            <span className="text-sm font-semibold text-wev-text-primary">
              Show only SSE jobs
            </span>
          </label>
          <p className="text-xs text-wev-text-secondary mt-1 pl-7">
            SSE = Solidarity Economy. We tag SSE jobs based on published principles.
            <a
              href="https://solidarityeconomyprinciples.org/wp-content/uploads/2023/02/SE-Principles-2-pager-handout.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-1 text-wev-accent hover:text-wev-primary-text hover:underline"
            >
              Learn more
            </a>
          </p>
        </div>

        {/* Jobs without salary filter */}
        <div className="mb-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showJobsWithoutSalary}
              onChange={(e) => onShowJobsWithoutSalaryChange(e.target.checked)}
              className="wev-checkbox"
            />
            <span className="text-sm font-semibold text-wev-text-primary">
              Show jobs without salary
            </span>
          </label>
          <p className="text-xs text-wev-text-secondary mt-1 pl-7">
            Uncheck to hide jobs that don’t list pay
          </p>
        </div>

        {/* Posted within filter */}
        <div className="mb-4">
          <label className="block text-sm font-semibold text-wev-text-primary mb-2">
            Posted within
          </label>
          <div className="flex flex-wrap gap-2">
            {(['1-week', '2-weeks', '3-weeks', '1-month', 'any'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => onPostedWithinChange(value)}
                className={`px-4 py-2 rounded-wev-btn text-sm font-medium transition-colors ${
                  postedWithin === value
                    ? 'bg-wev-primary text-white shadow-wev-btn'
                    : 'bg-wev-bg text-wev-text-primary border border-wev-border hover:bg-wev-primary-tint'
                }`}
              >
                {value === '1-week' ? '1 week' : value === '2-weeks' ? '2 weeks' : value === '3-weeks' ? '3 weeks' : value === '1-month' ? '1 month' : 'Any'}
              </button>
            ))}
          </div>
        </div>

        {/* Remote Filter */}
        <div className="mb-4">
        <label className="block text-sm font-semibold text-wev-text-primary mb-2">
          Remote Jobs
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onRemoteFilterChange('all')}
            className={`px-4 py-2 rounded-wev-btn text-sm font-medium transition-colors ${
              remoteFilter === 'all'
                ? 'bg-wev-primary text-white shadow-wev-btn'
                : 'bg-wev-bg text-wev-text-primary border border-wev-border hover:bg-wev-primary-tint'
            }`}
          >
            Show All
          </button>
          <button
            type="button"
            onClick={() => onRemoteFilterChange('remote-only')}
            className={`px-4 py-2 rounded-wev-btn text-sm font-medium transition-colors ${
              remoteFilter === 'remote-only'
                ? 'bg-wev-primary text-white shadow-wev-btn'
                : 'bg-wev-bg text-wev-text-primary border border-wev-border hover:bg-wev-primary-tint'
            }`}
          >
            Remote Only
          </button>
          <button
            type="button"
            onClick={() => onRemoteFilterChange('hide-remote')}
            className={`px-4 py-2 rounded-wev-btn text-sm font-medium transition-colors ${
              remoteFilter === 'hide-remote'
                ? 'bg-wev-primary text-white shadow-wev-btn'
                : 'bg-wev-bg text-wev-text-primary border border-wev-border hover:bg-wev-primary-tint'
            }`}
          >
            Hide Remote
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-2 md:grid-rows-[auto_auto] md:items-start gap-x-4 gap-y-4 mb-2">
        {/* Provinces */}
        <div className="flex flex-col order-1 md:row-start-1 md:col-start-1 min-h-0">
          <label className="block text-sm font-semibold text-wev-text-primary mb-2">
            Province ({selectedProvinces.length}/{provinces.length})
          </label>
          <div className="max-h-32 overflow-y-auto border border-wev-border rounded-wev-btn p-2 bg-wev-bg">
            {provinces.length > 0 ? (
              provinces.map((province) => {
                const isIndeterminate = indeterminateProvinces.has(province)
                return (
                  <label
                    key={province}
                    className="flex items-center space-x-2 py-1 cursor-pointer hover:bg-wev-primary-tint rounded px-2 transition-colors"
                  >
                    <input
                      type="checkbox"
                      ref={(el) => {
                        if (el) {
                          el.indeterminate = isIndeterminate
                        }
                      }}
                      checked={selectedProvinces.includes(province)}
                      onChange={() => handleProvinceToggle(province)}
                      className="wev-checkbox"
                    />
                    <span className="text-sm text-wev-text-primary">{province}</span>
                  </label>
                )
              })
            ) : (
              <p className="text-sm text-wev-text-secondary italic px-2 py-2">
                No province data available. Run the scraper to populate location data.
              </p>
            )}
          </div>
        </div>

        {/* Employment Types */}
        <div className="flex flex-col order-3 md:row-start-1 md:col-start-2 min-h-0">
          <label className="block text-sm font-semibold text-wev-text-primary mb-2">
            Employment Type ({selectedEmploymentTypes.length}/{employmentTypes.length})
          </label>
          <div className="max-h-32 overflow-y-auto border border-wev-border rounded-wev-btn p-2 bg-wev-bg">
            {employmentTypes.length > 0 ? (
              employmentTypes.map((type) => (
                <label
                  key={type}
                  className="flex items-center space-x-2 py-1 cursor-pointer hover:bg-wev-primary-tint rounded px-2 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedEmploymentTypes.includes(type)}
                    onChange={() => handleEmploymentTypeToggle(type)}
                    className="wev-checkbox"
                  />
                  <span className="text-sm text-wev-text-primary">{type}</span>
                </label>
              ))
            ) : (
              <p className="text-sm text-wev-text-secondary italic px-2 py-2">
                No employment type data available
              </p>
            )}
          </div>
        </div>

        {/* Municipalities (grouped by province, filtered by selected provinces) */}
        <div className="flex flex-col order-2 md:row-start-2 md:col-start-1">
          <label className="block text-sm font-semibold text-wev-text-primary mb-2">
            Municipality ({selectedMunicipalities.length}/{allMunicipalities.length})
            {selectedProvinces.length > 0 && allMunicipalities.length > 0 && (
              <span className="text-xs font-normal text-wev-text-secondary ml-2">
                (showing municipalities from selected provinces)
              </span>
            )}
          </label>
          <div className="h-48 overflow-y-auto border border-wev-border rounded-wev-btn p-2 bg-wev-bg">
            {allMunicipalities.length === 0 ? (
              <p className="text-sm text-wev-text-secondary italic px-2 py-2">
                No municipality data available. Run the scraper to populate location data.
              </p>
            ) : Object.keys(visibleMunicipalitiesByProvince).length === 0 ? (
              <p className="text-sm text-wev-text-secondary italic px-2 py-2">
                Select a province to see municipalities
              </p>
            ) : (
              Object.entries(visibleMunicipalitiesByProvince).map(([province, municipalities]) => {
                const isProvinceSelected = selectedProvinces.includes(province)
                return (
                  <div key={province} className="mb-2">
                    <div className={`text-xs font-semibold mb-1 px-2 ${
                      isProvinceSelected ? 'text-wev-primary' : 'text-wev-text-secondary'
                    }`}>
                      {province}
                      {isProvinceSelected && ' ✓'}
                    </div>
                    {municipalities.map((municipality) => {
                      const isSelected = selectedMunicipalities.includes(municipality)
                      const isFromSelectedProvince = isProvinceSelected
                      return (
                        <label
                          key={`${province}-${municipality}`}
                          className={`flex items-center space-x-2 py-1 cursor-pointer rounded px-2 ml-2 transition-colors ${
                            isFromSelectedProvince 
                              ? 'hover:bg-wev-primary-tint' 
                              : 'hover:bg-wev-bg opacity-75'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleMunicipalityToggle(municipality)}
                            className="wev-checkbox"
                          />
                          <span className={`text-sm ${
                            isFromSelectedProvince ? 'text-wev-text-primary' : 'text-wev-text-secondary'
                          }`}>
                            {municipality}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Organizations */}
        <div className="flex flex-col order-4 md:row-start-2 md:col-start-2">
          <label className="block text-sm font-semibold text-wev-text-primary mb-2">
            Organization ({selectedOrganizations.length}/{organizations.length})
          </label>
          <div className="h-48 overflow-y-auto border border-wev-border rounded-wev-btn p-2 bg-wev-bg">
            {organizations.length > 0 ? (
              organizations.map((org) => (
                <label
                  key={org}
                  className="flex items-center space-x-2 py-1 cursor-pointer hover:bg-wev-primary-tint rounded px-2 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedOrganizations.includes(org)}
                    onChange={() => handleOrganizationToggle(org)}
                    className="wev-checkbox"
                  />
                  <span className="text-sm text-wev-text-primary">{org}</span>
                </label>
              ))
            ) : (
              <p className="text-sm text-wev-text-secondary italic px-2 py-2">
                No organization data available
              </p>
            )}
          </div>
        </div>
      </div>

        {/* Reset Filters Button */}
        {hasActiveFilters && (
          <button
            onClick={clearAllFilters}
            className="text-sm text-wev-accent hover:text-wev-primary-text hover:underline transition-colors"
          >
            Reset filters
          </button>
        )}
      </div>
    </div>
  )
}
