import { expect, it } from "@effect/vitest";
import { EnvironmentId, ProviderInstanceId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { RemoteEnvironmentAuthorization } from "../authorization/service.ts";
import {
  PrimaryConnectionTarget,
  RelayConnectionTarget,
  type PreparedConnection,
  type PreparedHttpAuthorization,
} from "../connection/model.ts";
import { ManagedRelayDpopSigner } from "../relay/managedRelay.ts";
import * as RpcHttp from "../rpc/http.ts";
import { transcribeEnvironmentVoice } from "./voice.ts";

const target = new PrimaryConnectionTarget({
  environmentId: EnvironmentId.make("voice-environment"),
  label: "Voice",
  httpBaseUrl: "https://environment.example.test",
  wsBaseUrl: "wss://environment.example.test/ws",
});
const prepared: PreparedConnection = {
  environmentId: target.environmentId,
  label: target.label,
  httpBaseUrl: target.httpBaseUrl,
  socketUrl: target.wsBaseUrl,
  httpAuthorization: null,
  target,
};
const recording = {
  providerInstanceId: ProviderInstanceId.make("codex"),
  audio: new Uint8Array([1, 2, 3]),
  mimeType: "audio/mp4",
};

it.effect.each([
  { label: "cookies", authorization: null },
  { label: "bearer", authorization: { _tag: "Bearer", token: "voice-token" } },
] satisfies Array<{ label: string; authorization: PreparedHttpAuthorization | null }>)(
  "transcribes with $label authentication",
  ({ authorization }) => {
    let requests = 0;
    const fetchFn: typeof fetch = (input, init) => {
      requests += 1;
      expect(String(input)).toBe("https://environment.example.test/api/voice/transcribe");
      expect(init?.method).toBe("POST");
      expect(new Headers(init?.headers).get("authorization")).toBe(
        authorization === null ? null : "Bearer voice-token",
      );
      expect(init?.credentials).toBe(authorization === null ? "include" : undefined);
      expect(JSON.parse(String(init?.body))).toEqual({
        providerInstanceId: "codex",
        audio: "AQID",
        mimeType: "audio/mp4",
      });
      return Promise.resolve(Response.json({ text: "T3 Code" }));
    };
    return Effect.gen(function* () {
      const result = yield* transcribeEnvironmentVoice({
        ...recording,
        prepared: { ...prepared, httpAuthorization: authorization },
      });
      expect(result).toEqual({ text: "T3 Code" });
      expect(requests).toBe(1);
    }).pipe(Effect.provide(RpcHttp.layerRemoteHttpClient(fetchFn)));
  },
);

it.effect("signs the current relay URL used for transcription", () => {
  const relayPrepared: PreparedConnection = {
    ...prepared,
    target: new RelayConnectionTarget({ environmentId: target.environmentId, label: target.label }),
    httpAuthorization: { _tag: "Dpop", accessToken: "expired", expiresAtEpochMs: 0 },
  };
  let signedUrl: string | undefined;
  let requests = 0;
  const fetchFn: typeof fetch = (input, init) => {
    requests += 1;
    expect(String(input)).toBe("https://relay.example.test/api/voice/transcribe");
    expect(String(input)).toBe(signedUrl);
    expect(new Headers(init?.headers).get("authorization")).toBe("DPoP current-token");
    expect(new Headers(init?.headers).get("dpop")).toBe("voice-proof");
    return Promise.resolve(Response.json({ text: "relay dictation" }));
  };
  return Effect.gen(function* () {
    const result = yield* transcribeEnvironmentVoice({ ...recording, prepared: relayPrepared });
    expect(result.text).toBe("relay dictation");
    expect(requests).toBe(1);
  }).pipe(
    Effect.provideService(RemoteEnvironmentAuthorization, {
      authorizeBearer: () => Effect.die("Unexpected bearer preparation"),
      authorizeDpop: () => Effect.die("Unexpected WebSocket preparation"),
      authorizeDpopHttp: () =>
        Effect.succeed({
          environmentId: target.environmentId,
          label: target.label,
          httpBaseUrl: "https://relay.example.test",
          httpAuthorization: {
            _tag: "Dpop",
            accessToken: "current-token",
            expiresAtEpochMs: 3_600_000,
          },
        }),
    }),
    Effect.provideService(ManagedRelayDpopSigner, {
      thumbprint: Effect.succeed("voice-thumbprint"),
      createProof: (input) =>
        Effect.sync(() => {
          signedUrl = input.url;
          expect(input.method).toBe("POST");
          expect(input.accessToken).toBe("current-token");
          return "voice-proof";
        }),
    }),
    Effect.provide(RpcHttp.layerRemoteHttpClient(fetchFn)),
  );
});
