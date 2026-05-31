'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import Button from '@/components/Button';
import Alert from '@/components/ui/Alert';
import type { CvImportMetadata } from '@/lib/cv/types';
import type { EscoSkill } from '@/lib/types/skills';
import { CV_HTML_ACCEPT_STRING } from '@/lib/constants/files';
import { useCvImport } from './useCvImport';

type CVImportButtonProps = {
  locale: 'en' | 'fr';
  cvImport: CvImportMetadata | null;
  isSaving: boolean;
  onConfirmImport: (data: {
    skills: EscoSkill[];
    values: string[];
    warnings: string[];
    cvImport: CvImportMetadata;
  }) => void;
};

export default function CVImportButton({
  locale,
  cvImport,
  isSaving,
  onConfirmImport,
}: CVImportButtonProps) {
  const t = useTranslations('profile');

  const {
    inputRef,
    isParsing,
    isDragOver,
    onPickFile,
    onFileSelected,
    onDragOver,
    onDragLeave,
    onDrop,
  } = useCvImport({ locale, onConfirmImport });

  const lastImportedLabel = useMemo(() => {
    if (!cvImport?.imported_at) return null;
    try {
      return new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
      }).format(new Date(cvImport.imported_at));
    } catch {
      return cvImport.imported_at;
    }
  }, [cvImport, locale]);

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={CV_HTML_ACCEPT_STRING}
        onChange={onFileSelected}
        aria-label={t('cvImportInputLabel')}
        data-testid="cv-file-input"
      />

      {cvImport?.filename && (
        <Alert>
          {t('cvImportedIndicator', {
            fileName: cvImport.filename,
            importedAt: lastImportedLabel ?? cvImport.imported_at,
          })}
        </Alert>
      )}

      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={
          'rounded-md border-2 border-dashed p-4 transition-colors ' +
          (isDragOver ? 'border-primary bg-primary/5' : 'border-gray-300 dark:border-zinc-700')
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() => void onPickFile()}
            loading={isParsing}
            disabled={isSaving || isParsing}
          >
            {cvImport?.filename ? t('cvReimportButton') : t('cvImportButton')}
          </Button>
          <p className="text-xs text-muted-foreground">{t('cvImportDropHint')}</p>
        </div>
        {cvImport?.filename && (
          <p className="mt-3 text-xs font-medium text-amber-600 dark:text-amber-500">
            {t('cvReimportWarning')}
          </p>
        )}
      </div>
    </div>
  );
}
