import type { ProviderInstanceId, ServerProvider } from "@t3tools/contracts";

type VoiceProvider = Pick<ServerProvider, "instanceId" | "driver" | "auth" | "state">;

export function selectCodexVoiceProvider(
  providers: ReadonlyArray<VoiceProvider>,
  preferredInstanceId: ProviderInstanceId,
) {
  const available = (provider: VoiceProvider) =>
    provider.driver === "codex" &&
    provider.state !== "disabled" &&
    provider.auth.type === "chatgpt" &&
    provider.auth.status === "authenticated";
  return (
    providers.find(
      (provider) => provider.instanceId === preferredInstanceId && available(provider),
    ) ?? providers.find(available)
  );
}
