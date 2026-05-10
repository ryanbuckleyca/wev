export type CvImportErrorCode =
  | 'unsupported_file_type'
  | 'empty_file'
  | 'file_too_large'
  | 'file_read_failed'
  | 'pdf_no_text_layer'
  | 'no_extractable_text'
  | 'llm_parsing_failed'
  | 'extraction_failed'
  | 'jina_bad_dimensions'
  | 'embedding_failed'
  | 'cvImportFailed';

export class CvImportError extends Error {
  constructor(
    public code: CvImportErrorCode,
    message?: string,
  ) {
    super(message || code);
    this.name = 'CvImportError';
  }
}
