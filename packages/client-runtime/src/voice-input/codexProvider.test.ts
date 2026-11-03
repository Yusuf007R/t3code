import { ProviderInstanceId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { selectCodexVoiceProvider } from "./codexProvider.ts";

const codex = {
  instanceId: ProviderInstanceId.make("codex-account"),
  driver: "codex" as const,
  state: "ready" as const,
  auth: { type: "chatgpt", status: "authenticated" as const },
};

describe("Codex voice provider routing", () => {
  it.each(["claude", "cursor", "grok", "opencode", "antigravity"])(
    "uses Codex transcription when the chat provider is %s",
    (chatProvider) => {
      expect(selectCodexVoiceProvider([codex], ProviderInstanceId.make(chatProvider))).toBe(codex);
    },
  );

  it("prefers the selected Codex account, otherwise uses an authenticated enabled account", () => {
    const preferred = { ...codex, instanceId: ProviderInstanceId.make("second-codex") };
    const disabled = { ...codex, state: "disabled" as const };
    const apiKey = { ...codex, auth: { type: "apiKey", status: "authenticated" as const } };
    const signedOut = { ...codex, auth: { type: "chatgpt", status: "unauthenticated" as const } };
    expect(selectCodexVoiceProvider([codex, preferred], preferred.instanceId)).toBe(preferred);
    expect(
      selectCodexVoiceProvider([disabled, apiKey, signedOut, preferred], codex.instanceId),
    ).toBe(preferred);
    expect(
      selectCodexVoiceProvider([disabled, apiKey, signedOut], codex.instanceId),
    ).toBeUndefined();
    expect(selectCodexVoiceProvider([], codex.instanceId)).toBeUndefined();
  });
});
