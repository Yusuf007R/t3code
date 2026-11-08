import {
  CodexSettings,
  defaultInstanceIdForDriver,
  ProviderDriverKind,
  resolveProviderInstanceEnabled,
  type ServerSettings,
} from "@t3tools/contracts";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { HttpClientRequest } from "effect/http";
import { resolveCodexHomeLayout } from "../provider/Drivers/CodexHomeLayout.ts";

const driver = ProviderDriverKind.make("codex");
const defaultId = defaultInstanceIdForDriver(driver);
const decodeSettings = Schema.decodeUnknownOption(CodexSettings);
const CodexSubscriptionAuth = Schema.Struct({
  auth_mode: Schema.Literal("chatgpt"),
  tokens: Schema.Struct({
    access_token: Schema.RedactedFromValue(Schema.NonEmptyString),
    account_id: Schema.NonEmptyString,
  }),
});
const decodeAuth = Schema.decodeUnknownOption(Schema.fromJsonString(CodexSubscriptionAuth));

export const readCodexSubscription = Effect.fn("CloudSpeech.readCodexSubscription")(function* (
  settings: ServerSettings,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const { CODEX_HOME: inheritedHome } = yield* HostProcess.Environment;
  const instances = settings.providerInstances;
  const candidates = [
    instances[defaultId] ?? { driver },
    ...Object.entries(instances).flatMap(([id, instance]) => (id === defaultId ? [] : [instance])),
  ];
  for (const instance of candidates) {
    if (instance.driver !== driver || !resolveProviderInstanceEnabled(instance)) continue;
    const config = decodeSettings(instance.config ?? {});
    // Managed Codex does not use the CLI's auth.json credential.
    if (Option.isNone(config) || config.value.setupMode === "managed") continue;
    const home = yield* resolveCodexHomeLayout(
      !config.value.homePath && !config.value.shadowHomePath && inheritedHome?.trim()
        ? { ...config.value, homePath: inheritedHome }
        : config.value,
    );
    const file = yield* fs
      .readFileString(path.join(home.effectiveHomePath ?? home.sharedHomePath, "auth.json"))
      .pipe(Effect.option);
    const auth = Option.flatMap(file, decodeAuth);
    if (Option.isSome(auth)) return Option.some(auth.value.tokens);
  }
  return Option.none();
});

const deviceId = SecureRandom.uuidV4Unsafe();

export function codexSubscriptionRequest(
  credentials: (typeof CodexSubscriptionAuth.Type)["tokens"],
  audio: ArrayBuffer,
) {
  const form = new FormData();
  form.set("file", new Blob([audio], { type: "audio/wav" }), "dictation.wav");
  return HttpClientRequest.post("https://chatgpt.com/backend-api/transcribe").pipe(
    HttpClientRequest.bearerToken(credentials.access_token),
    HttpClientRequest.setHeaders({
      "ChatGPT-Account-Id": credentials.account_id,
      "X-OpenAI-Attach-Auth": "1",
      "X-OpenAI-Attach-Integrity-State": "1",
      "x-codex-base64": "1",
      originator: "Codex Desktop",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
      "sec-ch-ua": '"Chromium";v="136", "Google Chrome";v="136", "Not=A?Brand";v="24"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"macOS"',
      "oai-did": deviceId,
      "OAI-Language": "en",
      Origin: "https://chatgpt.com",
      Referer: "https://chatgpt.com/",
    }),
    HttpClientRequest.bodyFormData(form),
  );
}
