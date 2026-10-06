import { afterEach, describe, expect, it } from 'vitest';
import { getStageTop, setStageTop } from './stageTop';

afterEach(() => setStageTop(0));

describe('stageTop (how much of the canvas the header covers)', () => {
  it('is 0 until someone says otherwise: the stage starts below the header', () => {
    expect(getStageTop()).toBe(0);
  });

  it('keeps the value it is given, and treats junk as 0', () => {
    setStageTop(64);
    expect(getStageTop()).toBe(64);
    for (const junk of [-4, Number.NaN, Number.POSITIVE_INFINITY]) {
      setStageTop(junk);
      expect(getStageTop()).toBe(0);
    }
  });
});
