import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import {
  VoiceAudioPayload,
  VOICE_AUDIO_MAX_BYTES,
  VOICE_AUDIO_MAX_ENCODED_CHARACTERS,
} from "./environmentHttp.ts";

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
