import { describe, expect, it } from 'vitest';

describe('vitest setup', () => {
  it('runs in a jsdom environment', () => {
    expect(typeof document).toBe('object');
    expect(document.createElement('div')).toBeInstanceOf(HTMLElement);
  });
});
