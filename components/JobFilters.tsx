'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { Lineicons } from '@lineiconshq/react-lineicons'
import { Leaf1Outlined, Leaf1Solid } from '@lineiconshq/free-icons'
import JobSearch, { ActiveFilterChip } from './JobSearch'
import Collapsible from './Collapsible'
import FilterIcon from './FilterIcon'
import { JobPosting } from '@/lib/supabase'
import { truncateMiddle } from '@/lib/string-utils'

type PostedWithinOption = '1-week' | '2-weeks' | '3-weeks' | '1-month'

type PostedWithinLabel = {
  fullKey: string
  shortKey: string
  fallbackShort: string
}

const postedWithinLabels: Record<PostedWithinOption, PostedWithinLabel> = {
  '1-week': {
    fullKey: 'filters.postedWithin.options.1Week',
    shortKey: 'filters.postedWithin.short.1Week',
    fallbackShort: '1 wk',
  },
  '2-weeks': {
    fullKey: 'filters.postedWithin.options.2Weeks',
    shortKey: 'filters.postedWithin.short.2Weeks',
    fallbackShort: '2 wks',
  },
  '3-weeks': {
    fullKey: 'filters.postedWithin.options.3Weeks',
    shortKey: 'filters.postedWithin.short.3Weeks',
    fallbackShort: '3 wks',
  },
  '1-month': {
    fullKey: 'filters.postedWithin.options.1Month',
    shortKey: 'filters.postedWithin.short.1Month',
    fallbackShort: '1 mo',
  },
}
  '1-week': {
    full: 'filters.postedWithin.options.1Week',
    short: 'filters.postedWithin.short.1Week',
    fallbackShort: '1 wk',
  },
  '2-weeks': {
    full: 'filters.postedWithin.options.2Weeks',
    short: 'filters.postedWithin.short.2Weeks',
    fallbackShort: '2 wks',
  },
  '3-weeks': {
    full: 'filters.postedWithin.options.3Weeks',
    short: 'filters.postedWithin.short.3Weeks',
    fallbackShort: '3 wks',
  },
  '1-month': {
    full: 'filters.postedWithin.options.1Month',
    short: 'filters.postedWithin.short.1Month',
    fallbackShort: '1 mo',
  },
}

interface JobFiltersProps {
  jobs: JobPosting[]
  filteredJobsCount?: number
  totalJobsCount?: number
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
  selectedSources: string[]
  onSourcesChange: (sources: string[]) => void
  selectedWorkTypes: string[]
  onWorkTypesChange: (types: string[]) => void
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
  filteredJobsCount,
  totalJobsCount,
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
  selectedSources,
  onSourcesChange,
  selectedWorkTypes,
  onWorkTypesChange,
  showOnlySse,
  onShowOnlySseChange,
  showJobsWithoutSalary,
  onShowJobsWithoutSalaryChange,
  postedWithin,
  onPostedWithinChange,
  filtersExpanded,
  onFiltersExpandedChange,
}: JobFiltersProps) {
  const t = useTranslations()
  const hasAnyFilters =
    !!searchQuery ||
    selectedOrganizations.length > 0 ||
    selectedProvinces.length > 0 ||
    selectedMunicipalities.length > 0 ||
    selectedEmploymentTypes.length > 0 ||
    selectedSources.length > 0 ||
    selectedWorkTypes.length > 0 ||
    showOnlySse ||
    !showJobsWithoutSalary ||
    postedWithin !== 'any'

  const isSuggestedDefaults =
    !searchQuery &&
    selectedOrganizations.length === 0 &&
    selectedProvinces.length === 0 &&
    selectedMunicipalities.length === 0 &&
    selectedEmploymentTypes.length === 0 &&
    selectedSources.length === 0 &&
    selectedWorkTypes.length === 0 &&
    showOnlySse &&
    showJobsWithoutSalary &&
    postedWithin === '2-weeks'

  const filteredJobsCountResolved = filteredJobsCount ?? jobs.length
  const totalJobsCountResolved = totalJobsCount ?? jobs.length

  const getTranslationOrFallback = (key: string, fallback: string) => {
    const translation = t(key)
    return translation === key ? fallback : translation
  }

  const activeFilterChips = useMemo(() => {
    const chips: ActiveFilterChip[] = []

    if (postedWithin !== 'any') {
      const fullLabel =
        postedWithin === '1-week'
          ? `${t('filters.chips.posted')} ${t('filters.postedWithin.options.1Week')}`
          : postedWithin === '2-weeks'
            ? `${t('filters.chips.posted')} ${t('filters.postedWithin.options.2Weeks')}`
            : postedWithin === '3-weeks'
              ? `${t('filters.chips.posted')} ${t('filters.postedWithin.options.3Weeks')}`
              : `${t('filters.chips.posted')} ${t('filters.postedWithin.options.1Month')}`

      const valueKey =
        postedWithin === '1-week'
          ? '1Week'
          : postedWithin === '2-weeks'
            ? '2Weeks'
            : postedWithin === '3-weeks'
              ? '3Weeks'
              : '1Month'

      const fallbackShortLabel =
        postedWithin === '1-week'
          ? '1 wk'
          : postedWithin === '2-weeks'
            ? '2 wks'
            : postedWithin === '3-weeks'
              ? '3 wks'
              : '1 mo'

      const shortLabel = getTranslationOrFallback(`filters.postedWithin.short.${valueKey}`, fallbackShortLabel)

      chips.push({
        id: 'posted-within',
        label: shortLabel,
        title: fullLabel,
        onRemove: () => onPostedWithinChange('any'),
      })
    }

    if (showOnlySse) {
      chips.push({
        id: 'sse',
        label: getTranslationOrFallback('filters.chips.sseShort', 'SSE'),
        title: t('filters.chips.sseOnly'),
        onRemove: () => onShowOnlySseChange(false),
      })
    }

    if (!showJobsWithoutSalary) {
      chips.push({
        id: 'salary',
        label: t('filters.chips.salaryListedOnly'),
        onRemove: () => onShowJobsWithoutSalaryChange(true),
      })
    }

    if (searchQuery) {
      const truncated = searchQuery.length > 24 ? `${searchQuery.slice(0, 24)}…` : searchQuery
      chips.push({
        id: 'search',
        label: `"${truncated}"`,
        title: `${t('filters.chips.search')} "${truncated}"`,
        onRemove: () => onSearchChange(''),
      })
    }

    if (selectedWorkTypes.length > 0) {
      const workLabel =
        selectedWorkTypes.length <= 2
          ? selectedWorkTypes
              .map((wt) => {
                if (wt === 'remote') return t('filters.workType.remote')
                if (wt === 'hybrid') return t('filters.workType.hybrid')
                if (wt === 'office') return t('filters.workType.office')
                return wt.charAt(0).toUpperCase() + wt.slice(1)
              })
              .join(', ')
          : `${selectedWorkTypes.length} ${t('filters.chips.selected')}`
      chips.push({
        id: 'work-types',
        label: workLabel,
        onRemove: () => onWorkTypesChange([]),
      })
    }

    const MAX_TAG_LENGTH = 20
    const pushSelectionChips = (keyPrefix: string, items: string[], labelFn: (item: string) => string, onRemoveFn: (item: string) => void) => {
      items.forEach((item) => {
        const fullLabel = labelFn(item)
        chips.push({
          id: `${keyPrefix}-${item}`,
          label: truncateMiddle(fullLabel, MAX_TAG_LENGTH),
          title: fullLabel,
          onRemove: () => onRemoveFn(item),
        })
      })
    }

    if (selectedProvinces.length > 0) {
      pushSelectionChips('province', selectedProvinces, (province) => province, (province) => onProvincesChange(selectedProvinces.filter((p) => p !== province)))
    }

    if (selectedMunicipalities.length > 0) {
      pushSelectionChips('municipality', selectedMunicipalities, (municipality) => municipality, (municipality) => onMunicipalitiesChange(selectedMunicipalities.filter((m) => m !== municipality)))
    }

    if (selectedOrganizations.length > 0) {
      pushSelectionChips('organization', selectedOrganizations, (organization) => organization, (organization) => onOrganizationsChange(selectedOrganizations.filter((o) => o !== organization)))
    }

    if (selectedEmploymentTypes.length > 0) {
      const translateWorkType = (type: string) => {
        if (type === 'remote') return t('filters.workType.remote')
        if (type === 'hybrid') return t('filters.workType.hybrid')
        if (type === 'office') return t('filters.workType.office')
        return type
      }
      pushSelectionChips('employment-type', selectedEmploymentTypes, translateWorkType, (type) => onEmploymentTypesChange(selectedEmploymentTypes.filter((t) => t !== type)))
    }

    if (selectedSources.length > 0) {
      pushSelectionChips('source', selectedSources, (source) => source, (source) => onSourcesChange(selectedSources.filter((s) => s !== source)))
    }

    return chips
  }, [
    onEmploymentTypesChange,
    onMunicipalitiesChange,
    onOrganizationsChange,
    onPostedWithinChange,
    onProvincesChange,
    onSearchChange,
    onShowJobsWithoutSalaryChange,
    onShowOnlySseChange,
    onSourcesChange,
    onWorkTypesChange,
    postedWithin,
    searchQuery,
    selectedEmploymentTypes.length,
    selectedMunicipalities.length,
    selectedOrganizations.length,
    selectedProvinces.length,
    selectedSources.length,
    selectedWorkTypes,
    showJobsWithoutSalary,
    showOnlySse,
  ])

  // Extract unique values for filter options
  const { organizations, provinces, municipalitiesByProvince, employmentTypes, sources } = useMemo(() => {
    const orgs = new Set<string>()
    const provs = new Set<string>()
    const munisByProv: Record<string, Set<string>> = {}
    const types = new Set<string>()
    const sourceSet = new Set<string>()

    jobs.forEach((job) => {
      if (job.organization) orgs.add(job.organization)
      if (job.source) sourceSet.add(job.source)
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
      sources: Array.from(sourceSet).sort(),
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

  const handleSourceToggle = (source: string) => {
    if (selectedSources.includes(source)) {
      onSourcesChange(selectedSources.filter((s) => s !== source))
    } else {
      onSourcesChange([...selectedSources, source])
    }
  }

  const clearAllFilters = () => {
    onSearchChange('')
    onOrganizationsChange([])
    onProvincesChange([])
    onMunicipalitiesChange([])
    onEmploymentTypesChange([])
    onSourcesChange([])
    onWorkTypesChange([])
    onShowOnlySseChange(false)
    onShowJobsWithoutSalaryChange(true)
    onPostedWithinChange('any')
  }

  const applySuggestedDefaults = () => {
    onSearchChange('')
    onOrganizationsChange([])
    onProvincesChange([])
    onMunicipalitiesChange([])
    onEmploymentTypesChange([])
    onSourcesChange([])
    onWorkTypesChange([])
    onShowOnlySseChange(true)
    onShowJobsWithoutSalaryChange(true)
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
    <div className="bg-wev-surface border border-wev-border rounded-wev-card mb-4 overflow-hidden">
      <JobSearch
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        filtersExpanded={filtersExpanded}
        onFiltersExpandedChange={onFiltersExpandedChange}
        activeFilterChips={activeFilterChips}
        filteredJobsCount={filteredJobsCountResolved}
        totalJobsCount={totalJobsCountResolved}
        hasAnyFilters={hasAnyFilters}
        isSuggestedDefaults={isSuggestedDefaults}
        onClearAllFilters={clearAllFilters}
        onApplySuggestedDefaults={applySuggestedDefaults}
      />

      {/* Collapsible Filters Section */}
      <Collapsible isOpen={filtersExpanded} className="p-6">
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
                {t('filters.sse.label')}
              </span>
            </label>
            <p className="text-xs text-wev-text-secondary mt-1 pl-7">
              {t('filters.sse.description')}
              <a
                href="https://solidarityeconomyprinciples.org/wp-content/uploads/2023/02/SE-Principles-2-pager-handout.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="ml-1 text-wev-accent hover:text-wev-primary-text hover:underline"
              >
                {t('filters.sse.learnMore')}
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
              {t('filters.salary.label')}
            </span>
          </label>
          <p className="text-xs text-wev-text-secondary mt-1 pl-7">
            {t('filters.salary.description')}
          </p>
        </div>

        {/* Posted within filter */}
        <div className="mb-4">
          <label className="block text-sm font-semibold text-wev-text-primary mb-2">
            {t('filters.postedWithin.label')}
          </label>
          <div className="flex flex-wrap gap-2">
            {(['1-week', '2-weeks', '3-weeks', '1-month', 'any'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => onPostedWithinChange(value)}
                className={`px-4 py-2 rounded-wev-btn text-sm font-medium transition-colors ${
                  postedWithin === value
                    ? 'bg-wev-primary text-white'
                    : 'bg-wev-bg text-wev-text-primary border border-wev-border hover:bg-wev-primary-tint'
                }`}
              >
                {value === '1-week' ? t('filters.postedWithin.options.1Week') : value === '2-weeks' ? t('filters.postedWithin.options.2Weeks') : value === '3-weeks' ? t('filters.postedWithin.options.3Weeks') : value === '1-month' ? t('filters.postedWithin.options.1Month') : t('filters.postedWithin.options.any')}
              </button>
            ))}
          </div>
        </div>

        {/* Work Type Filter */}
        <div className="mb-4">
        <label className="block text-sm font-semibold text-wev-text-primary mb-2">
          {t('filters.workType.label')}
        </label>
        <div className="flex gap-2">
          {(['remote', 'hybrid', 'office'] as const).map((workType) => {
            const isSelected = selectedWorkTypes.includes(workType)
            const label = workType === 'remote' ? t('filters.workType.remote') : workType === 'hybrid' ? t('filters.workType.hybrid') : t('filters.workType.office')
            return (
              <button
                key={workType}
                type="button"
                onClick={() => {
                  if (isSelected) {
                    onWorkTypesChange(selectedWorkTypes.filter(wt => wt !== workType))
                  } else {
                    onWorkTypesChange([...selectedWorkTypes, workType])
                  }
                }}
                className={`px-4 py-2 rounded-wev-btn text-sm font-medium transition-colors ${
                  isSelected
                    ? 'bg-wev-primary text-white'
                    : 'bg-wev-bg text-wev-text-primary border border-wev-border hover:bg-wev-primary-tint'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-2 md:grid-rows-[auto_auto_auto] md:items-start gap-x-4 gap-y-4 mb-2">
        {/* Provinces */}
        <div className="flex flex-col order-1 md:row-start-1 md:col-start-1 min-h-0">
          <label className="block text-sm font-semibold text-wev-text-primary mb-2">
            {t('filters.province.label')} ({selectedProvinces.length}/{provinces.length})
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
                {t('filters.province.noData')}
              </p>
            )}
          </div>
        </div>

        {/* Employment Types */}
        <div className="flex flex-col order-3 md:row-start-1 md:col-start-2 min-h-0">
          <label className="block text-sm font-semibold text-wev-text-primary mb-2">
            {t('filters.employmentType.label')} ({selectedEmploymentTypes.length}/{employmentTypes.length})
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
                {t('filters.employmentType.noData')}
              </p>
            )}
          </div>
        </div>

        {/* Municipalities (grouped by province, filtered by selected provinces) */}
        <div className="flex flex-col order-2 md:row-start-2 md:col-start-1">
          <label className="block text-sm font-semibold text-wev-text-primary mb-2">
            {t('filters.municipality.label')} ({selectedMunicipalities.length}/{allMunicipalities.length})
            {selectedProvinces.length > 0 && allMunicipalities.length > 0 && (
              <span className="text-xs font-normal text-wev-text-secondary ml-2">
                {t('filters.municipality.showingFromSelected')}
              </span>
            )}
          </label>
          <div className="h-48 overflow-y-auto border border-wev-border rounded-wev-btn p-2 bg-wev-bg">
            {allMunicipalities.length === 0 ? (
              <p className="text-sm text-wev-text-secondary italic px-2 py-2">
                {t('filters.municipality.noData')}
              </p>
            ) : Object.keys(visibleMunicipalitiesByProvince).length === 0 ? (
              <p className="text-sm text-wev-text-secondary italic px-2 py-2">
                {t('filters.municipality.selectProvince')}
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
            {t('filters.organization.label')} ({selectedOrganizations.length}/{organizations.length})
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
                {t('filters.organization.noData')}
              </p>
            )}
          </div>
        </div>

        {/* Sources */}
        <div className="flex flex-col order-5 md:row-start-3 md:col-start-1">
          <label className="block text-sm font-semibold text-wev-text-primary mb-2">
            {t('filters.source.label')} ({selectedSources.length}/{sources.length})
          </label>
          <div className="max-h-32 overflow-y-auto border border-wev-border rounded-wev-btn p-2 bg-wev-bg">
            {sources.length > 0 ? (
              sources.map((source) => (
                <label
                  key={source}
                  className="flex items-center space-x-2 py-1 cursor-pointer hover:bg-wev-primary-tint rounded px-2 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedSources.includes(source)}
                    onChange={() => handleSourceToggle(source)}
                    className="wev-checkbox"
                  />
                  <span className="text-sm text-wev-text-primary">{source}</span>
                </label>
              ))
            ) : (
              <p className="text-sm text-wev-text-secondary italic px-2 py-2">
                {t('filters.source.noData')}
              </p>
            )}
          </div>
        </div>
      </div>
      
      {/* Collapse indicator at bottom */}
      <div className="mt-6 relative h-2 shadow-top flex items-center justify-center border-t border-wev-border">
        <button
          type="button"
          onClick={() => onFiltersExpandedChange(false)}
          className="absolute -top-3 flex items-center justify-center w-8 h-6 bg-wev-surface border border-wev-border rounded-full shadow-sm transition-all group"
          aria-label={t('filters.hideFilters')}
        >
          <FilterIcon className="w-4 h-4 text-wev-text-tertiary group-hover:text-wev-text-secondary transition-colors" reversed />
        </button>
      </div>
      </Collapsible>
    </div>
  )
}
