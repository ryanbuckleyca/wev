/**
 * These error codes are used directly as translation keys in the profile namespace.
 * Do not change these without also updating en.json and fr.json.
 */
export type CvImportErrorCode =
  | 'unsupported_file_type'
  | 'empty_file'
  | 'file_too_large'
  | 'pdf_no_text_layer'
  | 'no_extractable_text'
  | 'llm_parsing_failed'
  | 'extraction_failed'
  | 'jina_bad_dimensions'
  | 'jina_bad_response'
  | 'jina_misaligned_response'
  | 'embedding_failed'
  | 'cv_import_failed';

export class CvImportError extends Error {
  constructor(
    public code: CvImportErrorCode,
    message?: string,
  ) {
    super(message || code);
    this.name = 'CvImportError';
  }
}
