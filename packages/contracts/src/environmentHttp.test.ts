import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import {
  EnvironmentAuthInvalidError,
  EnvironmentInternalError,
  EnvironmentOperationForbiddenError,
  EnvironmentRequestInvalidError,
  EnvironmentResourceNotFoundError,
  EnvironmentScopeRequiredError,
  VoiceAudioPayload,
  VOICE_AUDIO_MAX_BYTES,
  VOICE_AUDIO_MAX_ENCODED_CHARACTERS,
} from "./environmentHttp.ts";

const traceId = "trace-1";

describe("environment HTTP errors", () => {
  // A client squashes the cause and shows `message`; an empty one becomes a generic
  // "The environment request failed." that names nothing the reader can act on.
  it("each carries a message that names its reason", () => {
    const errors = [
      new EnvironmentRequestInvalidError({
        code: "invalid_request",
        reason: "invalid_command",
        traceId,
      }),
      new EnvironmentAuthInvalidError({
        code: "auth_invalid",
        reason: "missing_credential",
        traceId,
      }),
      new EnvironmentScopeRequiredError({
        code: "insufficient_scope",
        requiredScope: "orchestration:read",
        traceId,
      }),
      new EnvironmentOperationForbiddenError({
        code: "operation_forbidden",
        reason: "current_session_revoke_not_allowed",
        traceId,
      }),
      new EnvironmentResourceNotFoundError({
        code: "not_found",
        reason: "thread_not_found",
        traceId,
      }),
      new EnvironmentInternalError({
        code: "internal_error",
        reason: "orchestration_snapshot_failed",
        traceId,
      }),
    ] as const;
    const details = [
      "invalid_command",
      "missing_credential",
      "orchestration:read",
      "current_session_revoke_not_allowed",
      "thread_not_found",
      "orchestration_snapshot_failed",
    ];
    errors.forEach((error, index) => {
      expect(error.message).toContain(details[index]);
    });
  });
});

const decodeVoiceAudioPayload = Schema.decodeUnknownSync(VoiceAudioPayload);

describe("VoiceAudioPayload", () => {
  it("decodes valid base64 audio bytes", () => {
    expect(decodeVoiceAudioPayload("AQID")).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("sets the encoded ceiling for the 25 MB decoded limit", () => {
    expect(VOICE_AUDIO_MAX_BYTES).toBe(25 * 1024 * 1024);
    expect(VOICE_AUDIO_MAX_ENCODED_CHARACTERS).toBe(4 * Math.ceil(VOICE_AUDIO_MAX_BYTES / 3));
  });

  it("rejects an encoded payload over the ceiling before base64 decoding", () => {
    const oversizedPayload = "A".repeat(VOICE_AUDIO_MAX_ENCODED_CHARACTERS + 4);

    expect(() => decodeVoiceAudioPayload(oversizedPayload)).toThrow();
  });
});
