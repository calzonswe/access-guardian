import { describe, it, expect, afterEach } from 'vitest';
import { setToken, getTokenRoles, getTokenAgeSeconds } from '@/services/api';

const b64url = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fakeJwt = (payload: object) => `${b64url({ alg: 'HS256' })}.${b64url(payload)}.sig`;

describe('JWT helpers', () => {
  afterEach(() => setToken(null));

  it('returns no roles without a token', () => {
    setToken(null);
    expect(getTokenRoles()).toEqual([]);
    expect(getTokenAgeSeconds()).toBeNull();
  });

  it('reads roles and age from the payload', () => {
    const iat = Math.floor(Date.now() / 1000) - 120;
    setToken(fakeJwt({ id: 'u1', roles: ['administrator', 'line_manager'], iat }));
    expect(getTokenRoles()).toEqual(['administrator', 'line_manager']);
    expect(getTokenAgeSeconds()).toBeGreaterThanOrEqual(119);
  });

  it('handles malformed tokens', () => {
    setToken('not-a-jwt');
    expect(getTokenRoles()).toEqual([]);
    expect(getTokenAgeSeconds()).toBeNull();
  });
});
