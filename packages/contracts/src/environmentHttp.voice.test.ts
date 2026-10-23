import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";
import { VoiceAudioPayload, VOICE_AUDIO_MAX_ENCODED_CHARACTERS } from "./environmentHttp.ts";

const decodeVoiceAudioPayload = Schema.decodeUnknownSync(VoiceAudioPayload);

describe("VoiceAudioPayload", () => {
  it("decodes valid base64 audio bytes", () => {
    expect(decodeVoiceAudioPayload("AQID")).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("rejects an encoded payload over the ceiling before base64 decoding", () => {
    expect(() =>
      decodeVoiceAudioPayload("A".repeat(VOICE_AUDIO_MAX_ENCODED_CHARACTERS + 4)),
    ).toThrow();
  });
});
