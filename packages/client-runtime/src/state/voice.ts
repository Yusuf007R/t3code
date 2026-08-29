import type { PreparedConnection } from "../connection/model.ts";
import type { ProviderInstanceId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { environmentEndpointUrl } from "../environment/endpoint.ts";
import { ManagedRelayDpopSigner } from "../relay/managedRelay.ts";
import {
  executeEnvironmentHttpRequest,
  makeEnvironmentHttpApiClient,
  type RemoteEnvironmentRequestError,
} from "../rpc/http.ts";
import { buildEnvironmentAuthHeaders, withEnvironmentCredentials } from "./environmentHttpAuth.ts";

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
  const requestUrl = environmentEndpointUrl(input.prepared.httpBaseUrl, "/api/voice/transcribe");
  const client = yield* makeEnvironmentHttpApiClient(input.prepared.httpBaseUrl);
  const signer = yield* Effect.serviceOption(ManagedRelayDpopSigner);
  const headers = yield* buildEnvironmentAuthHeaders(
    input.prepared.httpAuthorization,
    "POST",
    requestUrl,
    signer,
  );

  return yield* executeEnvironmentHttpRequest(
    requestUrl,
    input.timeoutMs ?? DEFAULT_VOICE_TRANSCRIPTION_TIMEOUT_MS,
    withEnvironmentCredentials(
      input.prepared.httpAuthorization,
      client.voice.transcribe({
        headers,
        payload: {
          providerInstanceId: input.providerInstanceId,
          audio: input.audio,
          mimeType: input.mimeType,
        },
      }),
    ),
  );
});

export type TranscribeEnvironmentVoiceError = RemoteEnvironmentRequestError;
