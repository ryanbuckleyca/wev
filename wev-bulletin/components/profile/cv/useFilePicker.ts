import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';

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

export type FilePickerOptions = {
  acceptTypes?: Array<{ description: string; accept: Record<string, string[]> }>;
  onFileSelect: (file: File) => void;
};

export function useFilePicker({ acceptTypes, onFileSelect }: FilePickerOptions) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const onPickFile = async () => {
    const showOpenFilePicker = getShowOpenFilePicker();
    if (!showOpenFilePicker) {
      inputRef.current?.click();
      return;
    }
    try {
      const [handle] = await showOpenFilePicker({
        types: acceptTypes,
        multiple: false,
        excludeAcceptAllOption: true,
      });
      if (!handle) return;
      const file = await handle.getFile();
      onFileSelect(file);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      inputRef.current?.click();
    }
  };

  const isAcceptedFile = (file: File) => {
    if (!acceptTypes || acceptTypes.length === 0) return true;
    return acceptTypes.some((t) => {
      const mimeTypes = Object.keys(t.accept);
      const extensions = Object.values(t.accept).flat();
      return (
        mimeTypes.includes(file.type) ||
        extensions.some((ext) => file.name.toLowerCase().endsWith(ext.toLowerCase()))
      );
    });
  };

  const onFileSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && isAcceptedFile(file)) {
      onFileSelect(file);
    }
    if (inputRef.current) inputRef.current.value = '';
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
    if (file && isAcceptedFile(file)) {
      onFileSelect(file);
    }
  };

  return {
    inputRef,
    isDragOver,
    onPickFile,
    onFileSelected,
    onDragOver,
    onDragLeave,
    onDrop,
  };
}
