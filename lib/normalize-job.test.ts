import { describe, it, expect } from 'vitest'
import { normalizeJobsWithSource } from './normalize-job'

describe('normalizeJobsWithSource', () => {
  it('returns an empty array for null input', () => {
    expect(normalizeJobsWithSource(null)).toEqual([])
  })

  it('returns an empty array for undefined input', () => {
    expect(normalizeJobsWithSource(undefined)).toEqual([])
  })

  it('returns an empty array for empty array input', () => {
    expect(normalizeJobsWithSource([])).toEqual([])
  })

  it('extracts source name from a single source object', () => {
    const rows = [
      { id: '1', title: 'Dev', sources: { name: 'GoodWork' }, source_id: 'src1' },
    ]
    const result = normalizeJobsWithSource(rows)
    expect(result).toEqual([{ id: '1', title: 'Dev', source: 'GoodWork' }])
  })

  it('extracts source name from an array of sources (takes first)', () => {
    const rows = [
      {
        id: '2',
        title: 'Designer',
        sources: [{ name: 'EcoCanada' }, { name: 'GoodWork' }],
        source_id: 'src2',
      },
    ]
    const result = normalizeJobsWithSource(rows)
    expect(result).toEqual([{ id: '2', title: 'Designer', source: 'EcoCanada' }])
  })

  it('sets source to null when sources is missing', () => {
    const rows = [{ id: '3', title: 'PM' }]
    const result = normalizeJobsWithSource(rows)
    expect(result).toEqual([{ id: '3', title: 'PM', source: null }])
  })

  it('strips source_id and bookmarks from output', () => {
    const rows = [
      {
        id: '4',
        title: 'Analyst',
        sources: { name: 'CSI' },
        source_id: 'src4',
        bookmarks: [{ user_id: 'u1' }],
        extra_field: 'kept',
      },
    ]
    const result = normalizeJobsWithSource(rows)
    expect(result[0]).not.toHaveProperty('source_id')
    expect(result[0]).not.toHaveProperty('bookmarks')
    expect(result[0]).not.toHaveProperty('sources')
    expect(result[0]).toHaveProperty('extra_field', 'kept')
  })

  it('handles multiple rows correctly', () => {
    const rows = [
      { id: '1', title: 'A', sources: { name: 'S1' }, source_id: 's1' },
      { id: '2', title: 'B', sources: [{ name: 'S2' }], source_id: 's2' },
      { id: '3', title: 'C' },
    ]
    const result = normalizeJobsWithSource(rows)
    expect(result).toHaveLength(3)
    expect(result[0].source).toBe('S1')
    expect(result[1].source).toBe('S2')
    expect(result[2].source).toBeNull()
  })
})
