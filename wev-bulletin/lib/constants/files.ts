export const CV_MIME_TYPES = {
  PDF: 'application/pdf',
  DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const;

export const ALLOWED_CV_MIME_TYPES = new Set<string>([CV_MIME_TYPES.PDF, CV_MIME_TYPES.DOCX]);

export const CV_EXTENSIONS = ['.pdf', '.docx'] as const;

export const CV_HTML_ACCEPT_STRING = `${CV_EXTENSIONS.join(',')},${Object.values(CV_MIME_TYPES).join(',')}`;

export const CV_FILE_PICKER_TYPES = [
  {
    description: 'CV Document',
    accept: {
      [CV_MIME_TYPES.PDF]: ['.pdf'],
      [CV_MIME_TYPES.DOCX]: ['.docx'],
    },
  },
];

export const MAX_CV_FILE_SIZE_BYTES = 4 * 1024 * 1024;

export const CV_PARSING_TIMEOUT_MS = 60_000;
