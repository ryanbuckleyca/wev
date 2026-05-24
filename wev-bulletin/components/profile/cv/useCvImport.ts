import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import notify from '@/lib/toast';
import type { CvImportMetadata, CvLocale } from '@/lib/cv/types';
import type { EscoSkill } from '@/lib/types/skills';
import { CV_FILE_PICKER_TYPES, MAX_CV_FILE_SIZE_BYTES } from '@/lib/constants/files';
import { useFilePicker } from './useFilePicker';

// ---------------------------------------------------------------------------
// Error Handling
// ---------------------------------------------------------------------------

function getCvImportErrorMessage(
  t: ReturnType<typeof useTranslations<'profile'>>,
  error: unknown,
): string {
  const code = error instanceof Error ? error.message : '';
  // Fallback to 'embedding_failed' for Jina errors
  if (code.startsWith('jina_')) return t('embedding_failed');
  // All other error codes are valid translation keys; fall back to generic message
  return t(code as any, { defaultMessage: t('cv_import_failed') });
}

// ---------------------------------------------------------------------------
// Pipeline Logic
// ---------------------------------------------------------------------------

async function executeCvImportPipeline(
  file: File,
  locale: CvLocale,
  signal?: AbortSignal,
): Promise<{
  skills: EscoSkill[];
  values: string[];
  cvImport: CvImportMetadata;
  warnings: string[];
}> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('locale', locale);

  const extractRes = await fetch('/api/cv/extract', {
    method: 'POST',
    body: formData,
    signal,
  });

  if (!extractRes.ok) {
    const body = (await extractRes.json().catch(() => ({}))) as { error?: string; detail?: string };
    console.error('[cv-import] API error:', extractRes.status, body);
    throw new Error(body.error ?? 'extraction_failed');
  }
  const result = (await extractRes.json()) as {
    skills: EscoSkill[];
    values: string[];
    metadata: CvImportMetadata;
    warnings?: string[];
  };

  return {
    skills: result.skills ?? [],
    values: result.values ?? [],
    cvImport: result.metadata,
    warnings: result.warnings ?? [],
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

type UseCvImportOptions = {
  locale: CvLocale;
  onConfirmImport: (data: {
    skills: EscoSkill[];
    values: string[];
    cvImport: CvImportMetadata;
  }) => Promise<void>;
};

export function useCvImport({ locale, onConfirmImport }: UseCvImportOptions) {
  const t = useTranslations('profile');
  const abortControllerRef = useRef<AbortController | null>(null);
  const [isParsing, setIsParsing] = useState(false);

  const processFile = async (file: File) => {
    if (file.size > MAX_CV_FILE_SIZE_BYTES) {
      notify.error(getCvImportErrorMessage(t, new Error('file_too_large')));
      return;
    }

    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    setIsParsing(true);
    notify.info(t('cvParsingWaitWarning'), { duration: 8000 });

    try {
      const result = await executeCvImportPipeline(file, locale, abortControllerRef.current.signal);
      if (result.warnings.includes('no_skills_extracted')) {
        notify.warning(t('no_skills_extracted_warning'));
      }
      await onConfirmImport(result);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;

      if (typeof console !== 'undefined') {
        console.error('[cv-import]', error);
      }
      notify.error(getCvImportErrorMessage(t, error));
    } finally {
      setIsParsing(false);
    }
  };

  const filePicker = useFilePicker({
    acceptTypes: CV_FILE_PICKER_TYPES,
    onFileSelect: processFile,
  });

  return {
    ...filePicker,
    isParsing,
  };
}
