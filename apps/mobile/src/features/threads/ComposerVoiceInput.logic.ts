import type { ComposerEditorSelection } from "../../components/ComposerEditor";

export interface MobileVoiceInputAvailability {
  readonly connected: boolean;
  readonly disabled: boolean;
  readonly hasCodexOauth: boolean;
  readonly visible: boolean;
}

export const mobileVoiceInputUnavailableReason = (
  availability: MobileVoiceInputAvailability,
): string | null =>
  !availability.visible
    ? "Voice input is only available with Codex"
    : !availability.hasCodexOauth
      ? "Voice input requires a Codex ChatGPT OAuth login"
      : !availability.connected
        ? "Connect this environment to use voice input"
        : availability.disabled
          ? "Voice input is unavailable while the composer is disabled"
          : null;

export const canContinueMobileVoiceOperation = (input: {
  readonly operation: number;
  readonly currentOperation: number;
  readonly availability: MobileVoiceInputAvailability;
}): boolean =>
  input.operation === input.currentOperation &&
  mobileVoiceInputUnavailableReason(input.availability) === null;

export const insertMobileVoiceTranscription = (input: {
  readonly value: string;
  readonly selection: ComposerEditorSelection;
  readonly transcription: string;
}): {
  readonly text: string;
  readonly selection: ComposerEditorSelection;
} => {
  const start = Math.max(0, Math.min(input.selection.start, input.value.length));
  const end = Math.max(start, Math.min(input.selection.end, input.value.length));
  const transcription = input.transcription.trim();

  if (!transcription) {
    return {
      text: input.value,
      selection: { start, end },
    };
  }

  const prefix = input.value.slice(0, start);
  const suffix = input.value.slice(end);
  const leadingSpace = prefix.length > 0 && !/\s$/.test(prefix) ? " " : "";
  const trailingSpace = suffix.length > 0 && !/^\s/.test(suffix) ? " " : "";
  const replacement = `${leadingSpace}${transcription}${trailingSpace}`;
  const cursor = start + replacement.length;

  return {
    text: `${prefix}${replacement}${suffix}`,
    selection: { start: cursor, end: cursor },
  };
};
