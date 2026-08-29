import { describe, expect, it } from "vite-plus/test";

import config from "./app.config";

function pluginOptions(name: string): Record<string, unknown> {
  const plugin = config.plugins?.find((entry) => Array.isArray(entry) && entry[0] === name);
  if (!Array.isArray(plugin)) {
    throw new Error(`Missing ${name} config plugin`);
  }
  return plugin[1] as Record<string, unknown>;
}

describe("mobile app config", () => {
  it("preserves Android microphone access for composer voice input", () => {
    const audio = pluginOptions("expo-audio");
    const imagePicker = pluginOptions("expo-image-picker");

    expect(audio.recordAudioAndroid).toBe(true);
    expect(imagePicker.microphonePermission).toBe(audio.microphonePermission);
    expect(imagePicker.microphonePermission).not.toBe(false);
  });
});
