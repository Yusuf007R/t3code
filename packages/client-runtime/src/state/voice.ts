import type { PreparedConnection } from "../connection/model.ts";
import type { ProviderInstanceId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { RemoteEnvironmentAuthorization } from "../authorization/service.ts";
import { environmentEndpointUrl } from "../environment/endpoint.ts";
import { ManagedRelayDpopSigner } from "../relay/managedRelay.ts";
import type { RemoteEnvironmentRequestError } from "../rpc/http.ts";
import { executeAuthenticatedEnvironmentHttpRequest } from "./environmentHttpAuth.ts";

const DEFAULT_VOICE_TRANSCRIPTION_TIMEOUT_MS = 60_000;

/**
 * Transcribe one foreground recording against the selected environment.
 * Keeping the HTTP + bearer/DPoP details here lets every native client use
 * exactly the same authenticated request path as other environment endpoints.
 */
export const transcribeEnvironmentVoice = Effect.fn(
  "clientRuntime.state.transcribeEnvironmentVoice",
)(function* (input: {
  readonly prepared: PreparedConnection;
  readonly providerInstanceId: ProviderInstanceId;
  readonly audio: Uint8Array;
  readonly mimeType: string;
  readonly timeoutMs?: number;
}) {
  const signer = yield* Effect.serviceOption(ManagedRelayDpopSigner);
  const remoteAuthorization = yield* Effect.serviceOption(RemoteEnvironmentAuthorization);

  return yield* executeAuthenticatedEnvironmentHttpRequest({
    prepared: input.prepared,
    signer,
    remoteAuthorization,
    method: "POST",
    url: (httpBaseUrl) => environmentEndpointUrl(httpBaseUrl, "/api/voice/transcribe"),
    timeoutMs: input.timeoutMs ?? DEFAULT_VOICE_TRANSCRIPTION_TIMEOUT_MS,
    group: "voice",
    request: ({ client, headers }) =>
      client.transcribe({
        headers,
        payload: {
          providerInstanceId: input.providerInstanceId,
          audio: input.audio,
          mimeType: input.mimeType,
        },
      }),
  });
});

export type TranscribeEnvironmentVoiceError = RemoteEnvironmentRequestError;
