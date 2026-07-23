import sharedSectors from '@shared/taxonomy/sectors.json';

export const SECTORS_LIST = sharedSectors.sectors.map((s) => s.id);

export function isValidSector(id: string | null | undefined): boolean {
  if (!id) return false;
  return SECTORS_LIST.includes(id);
}
