import {
  AuthOrchestrationOperateScope,
  EnvironmentHttpApi,
  VOICE_AUDIO_MAX_ENCODED_CHARACTERS,
} from "@t3tools/contracts";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";
import * as Effect from "effect/Effect";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";

import { annotateEnvironmentRequest, requireEnvironmentScope } from "../auth/http.ts";
import { transcribeVoice } from "./VoiceTranscription.ts";

// Leave room for the JSON envelope while bounding the base64 audio near its schema limit.
const VOICE_TRANSCRIPTION_MAX_BODY_BYTES = VOICE_AUDIO_MAX_ENCODED_CHARACTERS + 64 * 1024;

export const voiceHttpApiLayer = HttpApiBuilder.group(EnvironmentHttpApi, "voice", (handlers) =>
  handlers.handle(
    "transcribe",
    Effect.fn("environment.voice.transcribe")(function* (args) {
      yield* annotateEnvironmentRequest(args.endpoint.name);
      yield* requireEnvironmentScope(AuthOrchestrationOperateScope);
      return yield* transcribeVoice(args.payload);
    }),
  ),
).pipe(
  Layer.provide(
    Layer.succeed(
      HttpServerRequest.MaxBodySize,
      FileSystem.Size(VOICE_TRANSCRIPTION_MAX_BODY_BYTES),
    ),
  ),
);
