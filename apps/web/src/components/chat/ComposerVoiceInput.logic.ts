export interface VoiceInputAvailability {
  readonly hasCodexOauth: boolean;
  readonly captureSupported: boolean;
  readonly disabled: boolean;
}

export const voiceInputUnavailableReason = (availability: VoiceInputAvailability): string | null =>
  !availability.hasCodexOauth
    ? "Voice input requires a Codex ChatGPT OAuth login"
    : !availability.captureSupported
      ? "Voice input is not supported in this browser"
      : availability.disabled
        ? "Voice input is unavailable while the composer is disabled"
        : null;

export const canContinueVoiceOperation = (input: {
  readonly operation: number;
  readonly currentOperation: number;
  readonly availability: VoiceInputAvailability;
}): boolean =>
  input.operation === input.currentOperation &&
  voiceInputUnavailableReason(input.availability) === null;
