import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';

export type FilePickerOptions = {
  acceptTypes?: Array<{ description: string; accept: Record<string, string[]> }>;
  onFileSelect: (file: File) => void;
};

export function useFilePicker({ acceptTypes, onFileSelect }: FilePickerOptions) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const onPickFile = () => {
    inputRef.current?.click();
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
