import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { useTranslations } from 'next-intl';
import notify from '@/lib/toast';
import { parseCvFile, readCvFileBytes, type CvImportMetadata } from '@/lib/cv-parser';
import type { EscoSkill } from '@/lib/types/skills';

// ---------------------------------------------------------------------------
// File Picker Utilities
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Error Handling
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

type UseCvImportOptions = {
  locale: 'en' | 'fr';
  onConfirmImport: (data: {
    skills: EscoSkill[];
    values: string[];
    cvImport: CvImportMetadata;
  }) => Promise<void>;
};

export function useCvImport({ locale, onConfirmImport }: UseCvImportOptions) {
  const t = useTranslations('profile');
  const inputRef = useRef<HTMLInputElement>(null);

  const [isParsing, setIsParsing] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const processFile = (file: File, bytesPromise: Promise<ArrayBuffer>) => {
    const filename = file.name;
    const fileType = file.type;

    setIsParsing(true);

    void (async () => {
      try {
        const bytes = await bytesPromise;
        const parsed = await parseCvFile({ bytes, name: filename, type: fileType }, locale);
        const extractRes = await fetch('/api/cv/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: parsed.text }),
        });

        const extracted = extractRes.ok
          ? ((await extractRes.json()) as { skills?: EscoSkill[]; values?: string[] })
          : { skills: [], values: [] };
        const skills = extracted.skills ?? [];
        const values = extracted.values ?? [];

        await onConfirmImport({
          skills,
          values,
          cvImport: parsed.metadata,
        });
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

  return {
    inputRef,
    isParsing,
    isDragOver,
    onPickFile,
    onFileSelected,
    onDragOver,
    onDragLeave,
    onDrop,
  };
}
