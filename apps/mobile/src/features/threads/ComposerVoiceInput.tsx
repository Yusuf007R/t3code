import { transcribeEnvironmentVoice } from "@t3tools/client-runtime/state/voice";
import { ProviderInstanceId, VOICE_AUDIO_MAX_BYTES, type EnvironmentId } from "@t3tools/contracts";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingOptions,
} from "expo-audio";
import { File } from "expo-file-system";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, AppState, Linking } from "react-native";
import * as Option from "effect/Option";

import { ComposerToolbarButton } from "../../components/ComposerToolbarTrigger";
import { ControlPill } from "../../components/ControlPill";
import { runtime } from "../../lib/runtime";
import { useThemeColor } from "../../lib/useThemeColor";
import { usePreparedConnection } from "../../state/session";
import {
  canContinueMobileVoiceOperation,
  mobileVoiceInputUnavailableReason,
  type MobileVoiceInputAvailability,
} from "./ComposerVoiceInput.logic";

type VoiceInputPhase = "idle" | "requesting-permission" | "recording" | "transcribing";

const MAX_RECORDING_DURATION_SECONDS = 5 * 60;
const VOICE_RECORDING_MIME_TYPE = "audio/mp4";
const VOICE_RECORDING_OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  directory: "cache",
  sampleRate: 24_000,
  numberOfChannels: 1,
  bitRate: 64_000,
  android: {
    ...RecordingPresets.HIGH_QUALITY.android,
    sampleRate: 24_000,
    audioSource: "voice_recognition",
    maxFileSize: VOICE_AUDIO_MAX_BYTES,
  },
  ios: {
    ...RecordingPresets.HIGH_QUALITY.ios,
    sampleRate: 24_000,
  },
};

const voiceInputErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.trim()
  ) {
    return error.message;
  }
  return "The recording could not be transcribed.";
};

const restorePlaybackAudioMode = async (): Promise<void> => {
  await setAudioModeAsync({
    allowsRecording: false,
    allowsBackgroundRecording: false,
    shouldPlayInBackground: false,
  }).catch(() => undefined);
};

export function ComposerVoiceInput(props: {
  readonly connected: boolean;
  readonly disabled: boolean;
  readonly environmentId: EnvironmentId;
  readonly hasCodexOauth: boolean;
  readonly providerInstanceId: string;
  readonly variant: "control-pill" | "toolbar";
  readonly visible: boolean;
  readonly onTranscribed: (text: string) => void;
}) {
  const preparedOption = usePreparedConnection(props.environmentId);
  const prepared = Option.getOrNull(preparedOption);
  const iconColor = useThemeColor("--color-icon");
  const [phase, setPhase] = useState<VoiceInputPhase>("idle");
  const phaseRef = useRef<VoiceInputPhase>("idle");
  const mountedRef = useRef(true);
  const operationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const recorderCleanupRef = useRef<Promise<void>>(Promise.resolve());
  const preparedRef = useRef(prepared);
  const contextKey = `${props.environmentId}:${props.providerInstanceId}`;
  const previousContextKeyRef = useRef(contextKey);

  const availability = useMemo<MobileVoiceInputAvailability>(
    () => ({
      connected: props.connected && prepared !== null,
      disabled: props.disabled,
      hasCodexOauth: props.hasCodexOauth,
      visible: props.visible,
    }),
    [prepared, props.connected, props.disabled, props.hasCodexOauth, props.visible],
  );
  const availabilityRef = useRef(availability);
  availabilityRef.current = availability;
  preparedRef.current = prepared;

  const setCurrentPhase = useCallback((nextPhase: VoiceInputPhase) => {
    phaseRef.current = nextPhase;
    if (mountedRef.current) {
      setPhase(nextPhase);
    }
  }, []);

  const recorder = useAudioRecorder(VOICE_RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(recorder, 250);

  const operationCanContinue = useCallback(
    (operation: number) =>
      canContinueMobileVoiceOperation({
        operation,
        currentOperation: operationRef.current,
        availability: availabilityRef.current,
      }),
    [],
  );

  const cancelVoiceOperation = useCallback(
    (options?: { readonly updateUi?: boolean }) => {
      operationRef.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
      if (options?.updateUi !== false) {
        setCurrentPhase("idle");
      } else {
        phaseRef.current = "idle";
      }
      const cleanup = async () => {
        if (recorder.isRecording) {
          await recorder.stop().catch(() => undefined);
        }
        await restorePlaybackAudioMode();
      };
      recorderCleanupRef.current = recorderCleanupRef.current.then(cleanup, cleanup);
    },
    [recorder, setCurrentPhase],
  );

  const stopAndTranscribe = useCallback(async () => {
    if (phaseRef.current !== "recording") {
      return;
    }

    const operation = operationRef.current;
    setCurrentPhase("transcribing");
    let recordingFile: File | null = null;

    try {
      if (recorder.isRecording) {
        await recorder.stop();
      }
      await restorePlaybackAudioMode();
      if (!operationCanContinue(operation)) {
        return;
      }

      const recordingUri = recorder.uri ?? recorder.getStatus().url;
      if (!recordingUri) {
        throw new Error("The microphone did not produce a recording.");
      }

      recordingFile = new File(recordingUri);
      const size = recordingFile.size;
      if (size === null || size === 0) {
        throw new Error("The microphone did not capture any audio.");
      }
      if (size > VOICE_AUDIO_MAX_BYTES) {
        throw new Error("The recording is too large. Try a shorter voice input.");
      }

      const audio = await recordingFile.bytes();
      recordingFile.delete();
      recordingFile = null;
      if (!operationCanContinue(operation)) {
        return;
      }

      const latestPrepared = preparedRef.current;
      if (latestPrepared === null) {
        throw new Error("The environment disconnected before transcription could start.");
      }

      const abortController = new AbortController();
      abortRef.current = abortController;
      const result = await runtime.runPromise(
        transcribeEnvironmentVoice({
          prepared: latestPrepared,
          providerInstanceId: ProviderInstanceId.make(props.providerInstanceId),
          audio,
          mimeType: VOICE_RECORDING_MIME_TYPE,
        }),
        { signal: abortController.signal },
      );
      if (!operationCanContinue(operation)) {
        return;
      }
      props.onTranscribed(result.text);
    } catch (error) {
      if (operationCanContinue(operation)) {
        Alert.alert("Voice input failed", voiceInputErrorMessage(error));
      }
    } finally {
      if (recordingFile?.exists) {
        try {
          recordingFile.delete();
        } catch {
          // The cache file is best-effort cleanup; transcription state must
          // still settle if the OS already purged it.
        }
      }
      if (operationRef.current === operation) {
        abortRef.current = null;
        setCurrentPhase("idle");
      }
    }
  }, [
    operationCanContinue,
    props.onTranscribed,
    props.providerInstanceId,
    recorder,
    setCurrentPhase,
  ]);

  const startRecording = useCallback(async () => {
    if (phaseRef.current !== "idle") {
      return;
    }
    const reason = mobileVoiceInputUnavailableReason(availabilityRef.current);
    if (reason !== null) {
      return;
    }

    const operation = operationRef.current + 1;
    operationRef.current = operation;
    setCurrentPhase("requesting-permission");

    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!operationCanContinue(operation)) {
        return;
      }
      if (!permission.granted) {
        setCurrentPhase("idle");
        Alert.alert(
          "Microphone access needed",
          "Allow microphone access to dictate a message.",
          permission.canAskAgain
            ? [{ text: "OK" }]
            : [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Open Settings",
                  onPress: () => {
                    void Linking.openSettings();
                  },
                },
              ],
        );
        return;
      }
      if (AppState.currentState !== "active") {
        cancelVoiceOperation();
        return;
      }

      // A context change may have stopped the previous native recorder just
      // before this tap. Serialize that cleanup with the next audio session so
      // a late "allowsRecording: false" cannot disable the new recording.
      await recorderCleanupRef.current;
      if (!operationCanContinue(operation)) {
        return;
      }
      if (AppState.currentState !== "active") {
        cancelVoiceOperation();
        return;
      }
      await setAudioModeAsync({
        allowsRecording: true,
        allowsBackgroundRecording: false,
        interruptionMode: "doNotMix",
        shouldPlayInBackground: false,
      });
      if (!operationCanContinue(operation)) {
        return;
      }
      if (AppState.currentState !== "active") {
        cancelVoiceOperation();
        return;
      }

      await recorder.prepareToRecordAsync();
      if (!operationCanContinue(operation)) {
        return;
      }
      if (AppState.currentState !== "active") {
        cancelVoiceOperation();
        return;
      }
      recorder.record({ forDuration: MAX_RECORDING_DURATION_SECONDS });
      setCurrentPhase("recording");
    } catch (error) {
      await restorePlaybackAudioMode();
      if (operationCanContinue(operation)) {
        setCurrentPhase("idle");
        Alert.alert("Could not start voice input", voiceInputErrorMessage(error));
      }
    }
  }, [cancelVoiceOperation, operationCanContinue, recorder, setCurrentPhase]);

  const handlePress = useCallback(() => {
    if (phaseRef.current === "recording") {
      void stopAndTranscribe();
      return;
    }
    if (phaseRef.current === "idle") {
      void startRecording();
    }
  }, [startRecording, stopAndTranscribe]);

  useEffect(() => {
    if (previousContextKeyRef.current === contextKey) {
      return;
    }
    previousContextKeyRef.current = contextKey;
    if (phaseRef.current !== "idle") {
      cancelVoiceOperation();
    }
  }, [cancelVoiceOperation, contextKey]);

  useEffect(() => {
    if (phaseRef.current !== "idle" && mobileVoiceInputUnavailableReason(availability) !== null) {
      cancelVoiceOperation();
    }
  }, [availability, cancelVoiceOperation]);

  useEffect(() => {
    if (
      phaseRef.current === "recording" &&
      (recorderState.durationMillis >= MAX_RECORDING_DURATION_SECONDS * 1_000 ||
        (!recorderState.isRecording && recorderState.durationMillis > 0))
    ) {
      void stopAndTranscribe();
    }
  }, [recorderState.durationMillis, recorderState.isRecording, stopAndTranscribe]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (
        nextState !== "active" &&
        (phaseRef.current === "recording" || phaseRef.current === "transcribing")
      ) {
        cancelVoiceOperation();
      }
    });
    return () => subscription.remove();
  }, [cancelVoiceOperation]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelVoiceOperation({ updateUi: false });
    };
  }, [cancelVoiceOperation]);

  if (!props.visible) {
    return null;
  }

  const unavailableReason = mobileVoiceInputUnavailableReason(availability);
  const busy = phase === "requesting-permission" || phase === "transcribing";
  const recording = phase === "recording";
  const accessibilityLabel =
    phase === "requesting-permission"
      ? "Starting voice input"
      : phase === "transcribing"
        ? "Transcribing voice input"
        : recording
          ? "Stop recording"
          : (unavailableReason ?? "Start voice input");
  const iconNode = busy ? <ActivityIndicator size="small" color={iconColor} /> : undefined;

  return props.variant === "toolbar" ? (
    <ComposerToolbarButton
      accessibilityLabel={accessibilityLabel}
      active={recording}
      disabled={busy || unavailableReason !== null}
      icon={recording ? "stop.fill" : "mic"}
      iconNode={iconNode}
      onPress={handlePress}
      showChevron={false}
      variant={recording ? "danger" : "default"}
    />
  ) : (
    <ControlPill
      accessibilityLabel={accessibilityLabel}
      disabled={busy || unavailableReason !== null}
      icon={recording ? "stop.fill" : "mic"}
      iconNode={iconNode}
      onPress={handlePress}
      variant={recording ? "danger" : "circle"}
    />
  );
}
