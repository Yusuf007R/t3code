import { describe, expect, it } from "vite-plus/test";

import {
  canContinueMobileVoiceOperation,
  insertMobileVoiceTranscription,
  mobileVoiceInputUnavailableReason,
  type MobileVoiceInputAvailability,
} from "./ComposerVoiceInput.logic";

const available: MobileVoiceInputAvailability = {
  connected: true,
  disabled: false,
  hasCodexOauth: true,
  visible: true,
};

describe("mobile voice input lifecycle", () => {
  it("continues only the current operation while voice remains available", () => {
    expect(
      canContinueMobileVoiceOperation({
        operation: 4,
        currentOperation: 4,
        availability: available,
      }),
    ).toBe(true);
    expect(
      canContinueMobileVoiceOperation({
        operation: 3,
        currentOperation: 4,
        availability: available,
      }),
    ).toBe(false);
  });

  it("rejects late permission and transcription work when context changes", () => {
    for (const availability of [
      { ...available, connected: false },
      { ...available, disabled: true },
      { ...available, hasCodexOauth: false },
      { ...available, visible: false },
    ]) {
      expect(mobileVoiceInputUnavailableReason(availability)).not.toBeNull();
      expect(
        canContinueMobileVoiceOperation({
          operation: 4,
          currentOperation: 4,
          availability,
        }),
      ).toBe(false);
    }
  });
});

describe("insertMobileVoiceTranscription", () => {
  it("inserts at the cursor with natural spacing", () => {
    expect(
      insertMobileVoiceTranscription({
        value: "fixthis please",
        selection: { start: 3, end: 3 },
        transcription: "the tests",
      }),
    ).toEqual({
      text: "fix the tests this please",
      selection: { start: 14, end: 14 },
    });
  });

  it("replaces a selection without adding duplicate spaces", () => {
    expect(
      insertMobileVoiceTranscription({
        value: "fix old behavior",
        selection: { start: 4, end: 7 },
        transcription: "new",
      }),
    ).toEqual({
      text: "fix new behavior",
      selection: { start: 7, end: 7 },
    });
  });

  it("clamps stale selections and ignores blank results", () => {
    expect(
      insertMobileVoiceTranscription({
        value: "hello",
        selection: { start: 99, end: 120 },
        transcription: " world ",
      }),
    ).toEqual({
      text: "hello world",
      selection: { start: 11, end: 11 },
    });
    expect(
      insertMobileVoiceTranscription({
        value: "hello",
        selection: { start: 2, end: 4 },
        transcription: "   ",
      }),
    ).toEqual({
      text: "hello",
      selection: { start: 2, end: 4 },
    });
  });
});
