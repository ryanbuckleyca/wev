import { z } from 'zod';

export const CvLocaleSchema = z.enum(['en', 'fr']);
export type CvLocale = z.infer<typeof CvLocaleSchema>;

export const CvImportMetadataSchema = z
  .object({
    filename: z.string().trim().min(1),
    imported_at: z.string().datetime({ offset: true }),
    source: z.literal('cv_upload'),
    locale: CvLocaleSchema,
  })
  .strict();

export type CvImportMetadata = z.infer<typeof CvImportMetadataSchema>;

export function parseCvImportMetadata(value: unknown): CvImportMetadata | null {
  const result = CvImportMetadataSchema.safeParse(value);
  return result.success ? result.data : null;
}
