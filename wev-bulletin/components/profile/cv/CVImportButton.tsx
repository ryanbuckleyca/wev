'use client';

import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { useTranslations } from 'next-intl';
import Button from '@/components/Button';
import Alert from '@/components/ui/Alert';
import CVReviewModal from '@/components/profile/cv/CVReviewModal';
import { parseCvFile, readCvFileBytes, type CvImportMetadata } from '@/lib/cv-parser';
import type { EscoSkill } from '@/lib/types/skills';
import type { WorkValue } from '@/lib/values';
import notify from '@/lib/toast';

type FileSystemFileHandleLike = {
  getFile: () => Promise<File>;
};

type ShowOpenFilePicker = (options?: {
  types?: Array<{
    description?: string;
    accept: Record<string, string[]>;
  }>;
  multiple?: boolean;
  excludeAcceptAllOption?: boolean;
}) => Promise<FileSystemFileHandleLike[]>;

function getShowOpenFilePicker(): ShowOpenFilePicker | null {
  if (typeof window === 'undefined') return null;
  const candidate = (window as unknown as { showOpenFilePicker?: ShowOpenFilePicker })
    .showOpenFilePicker;
  return typeof candidate === 'function' ? candidate : null;
}

function getCvImportErrorMessage(
  t: ReturnType<typeof useTranslations<'profile'>>,
  error: unknown,
): string {
  const message = error instanceof Error ? error.message : '';
  switch (message) {
    case 'unsupported_file_type':
      return t('unsupported_file_type');
    case 'empty_file':
      return t('empty_file');
    case 'file_too_large':
      return t('file_too_large');
    case 'file_read_failed':
      return t('file_read_failed');
    case 'pdf_no_text_layer':
      return t('pdf_no_text_layer');
    case 'no_extractable_text':
      return t('no_extractable_text');
    default:
      return t('cvImportFailed');
  }
}

type CVImportButtonProps = {
  locale: 'en' | 'fr';
  allSkills: EscoSkill[];
  workValues: WorkValue[];
  cvImport: CvImportMetadata | null;
  isSaving: boolean;
  onConfirmImport: (data: {
    skills: EscoSkill[];
    values: string[];
    skillCutoff: number;
    valueCutoff: number;
    cvImport: CvImportMetadata;
  }) => Promise<void>;
};

export default function CVImportButton({
  locale,
  allSkills,
  workValues,
  cvImport,
  isSaving,
  onConfirmImport,
}: CVImportButtonProps) {
  const t = useTranslations('profile');
  const inputRef = useRef<HTMLInputElement>(null);

  const [isParsing, setIsParsing] = useState(false);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [suggestedSkills, setSuggestedSkills] = useState<EscoSkill[]>([]);
  const [suggestedValues, setSuggestedValues] = useState<string[]>([]);
  const [metadata, setMetadata] = useState<CvImportMetadata | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

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

  const processFile = (file: File, bytesPromise: Promise<ArrayBuffer>) => {
    const filename = file.name;
    const fileType = file.type;

    setIsParsing(true);

    void (async () => {
      try {
        const bytes = await bytesPromise;
        const parsed = await parseCvFile({ bytes, name: filename, type: fileType }, locale);
        const [skillsRes, valuesRes] = await Promise.all([
          fetch('/api/cv/skills', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: parsed.text }),
          }).catch(() => null),
          fetch('/api/cv/values', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: parsed.text }),
          }).catch(() => null),
        ]);

        let skills: EscoSkill[] = [];
        if (skillsRes?.ok) {
          skills = (((await skillsRes.json()) as { skills?: EscoSkill[] }).skills ?? []);
        }
        
        if (skills.length === 0) {
          const { extractSkillsFromCvText } = await import('@/lib/cv-skills-extractor');
          skills = await extractSkillsFromCvText(parsed.text, locale);
        }

        const values = valuesRes?.ok
          ? (((await valuesRes.json()) as { values?: string[] }).values ?? [])
          : [];

        setSuggestedSkills(skills);
        setSuggestedValues(values);
        setMetadata(parsed.metadata);
        setIsReviewOpen(true);
      } catch (error) {
        if (typeof console !== 'undefined') {
          console.error('[cv-import] processing failed', {
            name: error instanceof Error ? error.name : typeof error,
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            error,
          });
        }
        notify.error(getCvImportErrorMessage(t, error));
      } finally {
        setIsParsing(false);
        if (inputRef.current) {
          inputRef.current.value = '';
        }
      }
    })();
  };

  const onPickFile = async () => {
    const showOpenFilePicker = getShowOpenFilePicker();
    if (!showOpenFilePicker) {
      inputRef.current?.click();
      return;
    }
    try {
      const [handle] = await showOpenFilePicker({
        types: [
          {
            description: 'CV',
            accept: {
              'application/pdf': ['.pdf'],
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
            },
          },
        ],
        multiple: false,
        excludeAcceptAllOption: true,
      });
      if (!handle) return;
      const file = await handle.getFile();
      processFile(file, readCvFileBytes(file));
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      inputRef.current?.click();
    }
  };

  const onFileSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    processFile(file, readCvFileBytes(file));
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
    if (!isDragOver) setIsDragOver(true);
  };

  const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    processFile(file, readCvFileBytes(file));
  };

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={onFileSelected}
        aria-label={t('cvImportInputLabel')}
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
          <p className="text-xs text-muted-foreground">
            {t('cvImportDropHint')} · {t('cvImportPrivacyHint')}
          </p>
        </div>
      </div>

      {metadata && (
        <CVReviewModal
          isOpen={isReviewOpen}
          locale={locale}
          allSkills={allSkills}
          workValues={workValues}
          initialSkills={suggestedSkills}
          initialValues={suggestedValues}
          fileName={metadata.filename}
          isConfirming={isSaving}
          onCancel={() => setIsReviewOpen(false)}
          onConfirm={async ({ skills, values, skillCutoff, valueCutoff }) => {
            await onConfirmImport({
              skills,
              values,
              skillCutoff,
              valueCutoff,
              cvImport: metadata,
            });
            setIsReviewOpen(false);
          }}
        />
      )}
    </div>
  );
}
