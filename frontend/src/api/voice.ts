import { apiClient } from "./client";

export interface VoiceConfig {
  engine: string | null;
  stt: boolean;
  tts: boolean;
  voices: string[];
  default_voice: string | null;
}

export async function getVoiceConfig(): Promise<VoiceConfig> {
  const { data } = await apiClient.get("/voice/config");
  return data;
}

export async function transcribeAudio(blob: Blob): Promise<{ text: string; language: string }> {
  const formData = new FormData();
  formData.append("file", blob, "audio.webm");
  const { data } = await apiClient.post("/voice/stt", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 120_000, // 2 min — first request loads Whisper model
  });
  return data;
}

export async function synthesizeText(text: string, voice?: string): Promise<Blob> {
  const { data } = await apiClient.post(
    "/voice/tts",
    { text, voice },
    { responseType: "blob" },
  );
  return data;
}
