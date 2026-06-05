import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateUserMatches, calculateJobMatches } from './match-calculator';
import { supabaseServer } from '@/lib/supabase-server';
import { logger } from '@/lib/logger';

vi.mock('@/lib/supabase-server', () => ({
  supabaseServer: {
    rpc: vi.fn(),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

describe('match-calculator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('calculateUserMatches', () => {
    it('calls the recalculate_matches_for_user RPC', async () => {
      vi.mocked(supabaseServer.rpc).mockResolvedValue({ error: null } as any);

      await calculateUserMatches('user-123');

      expect(supabaseServer.rpc).toHaveBeenCalledWith('recalculate_matches_for_user', {
        p_user_id: 'user-123',
      });
    });

    it('logs an error if RPC fails', async () => {
      const mockError = { message: 'RPC failed' };
      vi.mocked(supabaseServer.rpc).mockResolvedValue({ error: mockError } as any);

      await calculateUserMatches('user-123');

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: mockError, userId: 'user-123' }),
        expect.stringContaining('Error calling'),
      );
    });

    it('logs an exception if rpc throws', async () => {
      const mockException = new Error('Network error');
      vi.mocked(supabaseServer.rpc).mockRejectedValue(mockException);

      await calculateUserMatches('user-123');

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: mockException, userId: 'user-123' }),
        expect.stringContaining('Exception in'),
      );
    });
  });

  describe('calculateJobMatches', () => {
    it('calls the recalculate_matches_for_job RPC', async () => {
      vi.mocked(supabaseServer.rpc).mockResolvedValue({ error: null } as any);

      await calculateJobMatches('job-123');

      expect(supabaseServer.rpc).toHaveBeenCalledWith('recalculate_matches_for_job', {
        p_job_id: 'job-123',
      });
    });

    it('logs an error if RPC fails', async () => {
      const mockError = { message: 'RPC failed' };
      vi.mocked(supabaseServer.rpc).mockResolvedValue({ error: mockError } as any);

      await calculateJobMatches('job-123');

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: mockError, jobId: 'job-123' }),
        expect.stringContaining('Error calling'),
      );
    });

    it('logs an exception if rpc throws', async () => {
      const mockException = new Error('Network error');
      vi.mocked(supabaseServer.rpc).mockRejectedValue(mockException);

      await calculateJobMatches('job-123');

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: mockException, jobId: 'job-123' }),
        expect.stringContaining('Exception in'),
      );
    });
  });
});
