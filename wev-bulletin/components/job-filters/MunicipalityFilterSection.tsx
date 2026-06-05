'use client';

import { CheckOutlined } from '@lineiconshq/free-icons';
import { Lineicons } from '@lineiconshq/react-lineicons';
import { Checkbox } from '@/components/ui/Checkbox';
import type { MunicipalitiesByProvince } from '@/lib/bulletin/filter-options';

interface MunicipalityFilterSectionProps {
  label: string;
  selectedMunicipalities: string[];
  totalMunicipalities: number;
  selectedProvinces: string[];
  visibleMunicipalitiesByProvince: MunicipalitiesByProvince;
  onToggleMunicipality: (municipality: string) => void;
  className?: string;
  noDataMessage: string;
  selectProvinceMessage: string;
  showingFromSelectedMessage: string;
}

export default function MunicipalityFilterSection({
  label,
  selectedMunicipalities,
  totalMunicipalities,
  selectedProvinces,
  visibleMunicipalitiesByProvince,
  onToggleMunicipality,
  className,
  noDataMessage,
  selectProvinceMessage,
  showingFromSelectedMessage,
}: MunicipalityFilterSectionProps) {
  return (
    <div className={className}>
      <label className="block text-sm font-semibold text-foreground mb-2">
        {label} ({selectedMunicipalities.length}/{totalMunicipalities})
        {selectedProvinces.length > 0 && totalMunicipalities > 0 ? (
          <span className="text-xs font-normal text-muted-foreground ml-2">
            {showingFromSelectedMessage}
          </span>
        ) : null}
      </label>
      <div className="h-48 overflow-y-auto border border-border rounded-wev-btn p-2 bg-background">
        {totalMunicipalities === 0 ? (
          <p className="text-sm text-muted-foreground italic px-2 py-2">{noDataMessage}</p>
        ) : Object.keys(visibleMunicipalitiesByProvince).length === 0 ? (
          <p className="text-sm text-muted-foreground italic px-2 py-2">{selectProvinceMessage}</p>
        ) : (
          Object.entries(visibleMunicipalitiesByProvince).map(([province, municipalities]) => {
            const isProvinceSelected = selectedProvinces.includes(province);

            return (
              <div key={province} className="mb-2">
                <div
                  className={`text-xs font-semibold mb-1 px-2 flex items-center gap-1 ${
                    isProvinceSelected ? 'text-primary' : 'text-muted-foreground'
                  }`}
                >
                  {province}
                  {isProvinceSelected ? (
                    <Lineicons icon={CheckOutlined} size={11} className="flex-shrink-0" />
                  ) : null}
                </div>
                {municipalities.map((municipality) => {
                  const isSelected = selectedMunicipalities.includes(municipality);

                  return (
                    <label
                      key={`${province}-${municipality}`}
                      className="flex items-center space-x-2 py-1 cursor-pointer rounded px-2 ml-2 transition-colors hover:bg-primary-tint"
                    >
                      <Checkbox
                        checked={isSelected}
                        onChange={() => onToggleMunicipality(municipality)}
                      />
                      <span className="text-sm text-foreground">{municipality}</span>
                    </label>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
