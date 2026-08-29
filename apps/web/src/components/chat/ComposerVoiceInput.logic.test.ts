import { describe, expect, it } from "vite-plus/test";

import {
  canContinueVoiceOperation,
  voiceInputUnavailableReason,
  type VoiceInputAvailability,
} from "./ComposerVoiceInput.logic";

const available: VoiceInputAvailability = {
  hasCodexOauth: true,
  captureSupported: true,
  disabled: false,
};

describe("voice input lifecycle", () => {
  it("continues only the current operation while voice input remains available", () => {
    expect(
      canContinueVoiceOperation({
        operation: 4,
        currentOperation: 4,
        availability: available,
      }),
    ).toBe(true);
    expect(
      canContinueVoiceOperation({
        operation: 3,
        currentOperation: 4,
        availability: available,
      }),
    ).toBe(false);
  });

  it("rejects a pending permission result after OAuth disappears", () => {
    const availability = { ...available, hasCodexOauth: false };

    expect(voiceInputUnavailableReason(availability)).toContain("OAuth");
    expect(
      canContinueVoiceOperation({
        operation: 4,
        currentOperation: 4,
        availability,
      }),
    ).toBe(false);
  });

  it("rejects late work after the composer becomes disabled", () => {
    const availability = { ...available, disabled: true };

    expect(voiceInputUnavailableReason(availability)).toContain("composer is disabled");
    expect(
      canContinueVoiceOperation({
        operation: 4,
        currentOperation: 4,
        availability,
      }),
    ).toBe(false);
  });
});
