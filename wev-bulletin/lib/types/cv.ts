export type CvLocale = 'en' | 'fr';

export type CvImportMetadata = {
  filename: string;
  imported_at: string;
  source: 'cv_upload';
  locale: CvLocale;
};
