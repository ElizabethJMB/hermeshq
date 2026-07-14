import { describe, it, expect } from "vitest";
import { findMatchingProvider, applyProviderPreset } from "./providers";
import type { ProviderDefinition } from "../types/api";

const _p = (overrides: Partial<ProviderDefinition>): ProviderDefinition =>
  ({
    slug: "test",
    name: "Test Provider",
    runtime_provider: "openai-codex",
    base_url: "https://api.test.com/v1",
    default_model: "gpt-4",
    supports_secret_ref: true,
    ...overrides,
  }) as ProviderDefinition;

describe("findMatchingProvider", () => {
  it("returns null for empty providers", () => {
    expect(findMatchingProvider([], "openai-codex", "https://api.test.com/v1")).toBeNull();
    expect(findMatchingProvider(undefined, "openai-codex", "https://api.test.com/v1")).toBeNull();
  });

  it("returns null when runtimeProvider is null", () => {
    expect(findMatchingProvider([_p({})], null, "https://api.test.com/v1")).toBeNull();
  });

  it("matches by runtime_provider and base_url", () => {
    const providers = [_p({ slug: "a" }), _p({ slug: "b", base_url: "https://other.com/v1" })];
    const result = findMatchingProvider(providers, "openai-codex", "https://api.test.com/v1");
    expect(result?.slug).toBe("a");
  });

  it("falls back to runtime_provider match when base_url doesn't match", () => {
    const providers = [_p({ slug: "a", base_url: "https://other.com/v1" })];
    const result = findMatchingProvider(providers, "openai-codex", "https://api.test.com/v1");
    expect(result?.slug).toBe("a");
  });

  it("normalizes trailing slashes in base_url", () => {
    const providers = [_p({ slug: "a", base_url: "https://api.test.com/v1/" })];
    const result = findMatchingProvider(providers, "openai-codex", "https://api.test.com/v1");
    expect(result?.slug).toBe("a");
  });
});

describe("applyProviderPreset", () => {
  it("returns provider config with model, base_url, and api_key_ref", () => {
    const provider = _p({ supports_secret_ref: true });
    const result = applyProviderPreset(provider, "my-secret");
    expect(result).toEqual({
      provider: "openai-codex",
      model: "gpt-4",
      base_url: "https://api.test.com/v1",
      api_key_ref: "my-secret",
    });
  });

  it("returns empty api_key_ref when provider doesn't support secret refs", () => {
    const provider = _p({ supports_secret_ref: false });
    const result = applyProviderPreset(provider, "my-secret");
    expect(result.api_key_ref).toBe("");
  });
});
