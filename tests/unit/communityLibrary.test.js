import { describe, expect, it } from 'vitest';
import { COMMUNITY_PATCHES } from '../../src/generated/communityPatches.js';

describe('generated community patch library', () => {
  it('starts empty while keeping the student-patch bundling pipeline available', () => {
    expect(COMMUNITY_PATCHES).toEqual([]);
  });
});
