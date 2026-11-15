import { describe, it, expect } from 'vitest';
import { errorMessage } from '@/lib/utils';

describe('errorMessage', () => {
  it('uses the message of an Error', () => {
    expect(errorMessage(new Error('Otillräckliga rättigheter'), 'fallback')).toBe('Otillräckliga rättigheter');
  });
  it('falls back for non-errors and empty messages', () => {
    expect(errorMessage('boom', 'fallback')).toBe('fallback');
    expect(errorMessage(new Error(''), 'fallback')).toBe('fallback');
    expect(errorMessage(undefined, 'fallback')).toBe('fallback');
  });
});
