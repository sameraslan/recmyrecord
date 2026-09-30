import { describe, expect, it } from 'vitest';
import { ambientBackground } from './AmbientWash';

describe('ambientBackground', () => {
  it('builds the panel wash from both colours and the map wash from the second', () => {
    const a: [string, string, string] = ['#51351f', '#331a15', '#d78242'];
    expect(ambientBackground(a, 'panel')).toBe(
      'radial-gradient(60% 70% at 16% 20%, rgba(81,53,31,0.85), transparent 72%), radial-gradient(55% 60% at 88% 6%, rgba(51,26,21,0.8), transparent 70%)',
    );
    expect(ambientBackground(a, 'map')).toBe('radial-gradient(60% 65% at 50% 48%, rgba(51,26,21,0.42), transparent 78%)');
  });
});
