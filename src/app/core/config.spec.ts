import { isApiConfigured } from './config';

describe('isApiConfigured', () => {
  it('rejects the placeholder', () => {
    expect(isApiConfigured('https://YOUR_PROJECT_ID.mockapi.io/api/v1')).toBe(false);
  });

  it('accepts a real MockAPI endpoint', () => {
    expect(isApiConfigured('https://6712ab34cd5e8f9a0b1c2d3e.mockapi.io/api/v1')).toBe(true);
  });

  it('rejects other hosts', () => {
    expect(isApiConfigured('http://localhost:3000/api')).toBe(false);
  });
});
