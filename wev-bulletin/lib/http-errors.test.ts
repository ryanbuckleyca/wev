import { describe, it, expect } from 'vitest';
import { forbiddenResponse, unauthorizedResponse } from './http-errors';

describe('http-errors', () => {
  it('unauthorizedResponse defaults to 401', async () => {
    const res = unauthorizedResponse();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('forbiddenResponse defaults to 403', async () => {
    const res = forbiddenResponse();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
  });

  it('allows custom messages', async () => {
    const res = unauthorizedResponse('Not authenticated');
    expect(await res.json()).toEqual({ error: 'Not authenticated' });
  });
});
