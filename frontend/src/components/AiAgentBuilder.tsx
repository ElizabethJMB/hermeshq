import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getVoiceConfig, transcribeAudio, synthesizeText, type VoiceConfig } from "../api/voice";
import {
  createBuilderSession,
  sendBuilderMessage,
  finalizeAgent,
  type AgentBuilderTurn,
  type AgentDraft,
  type RequiredConnector,
} from "../api/agentBuilder";
import { useI18n } from "../lib/i18n";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: (agentId: string) => void;
}

export function AiAgentBuilder({ open, onClose, onCreated }: Props) {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AgentDraft | null>(null);
  const [connectors, setConnectors] = useState<RequiredConnector[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [recording, setRecording] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamingTextRef = useRef<HTMLSpanElement>(null);

  const { data: voiceConfig } = useQuery({
    queryKey: ["voice-config"],
    queryFn: getVoiceConfig,
    enabled: open,
  });

  const initSession = useCallback(async () => {
    try {
      const session = await createBuilderSession();
      setSessionId(session.session_id);
    } catch {
      setError("Failed to initialize builder session");
    }
  }, []);

  useEffect(() => {
    if (open && !sessionId) {
      initSession();
    }
  }, [open, sessionId, initSession]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!sessionId || !text.trim() || streaming) return;

      setError(null);
      setInput("");
      setStreaming(true);
      setMessages((prev) => [...prev, { role: "user", content: text }]);

      const assistantIdx = messages.length + 1;
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      let fullText = "";

      try {
        const turn: AgentBuilderTurn = await sendBuilderMessage(sessionId, text, (chunk) => {
          fullText += chunk;
          setMessages((prev) => {
            const updated = [...prev];
            updated[assistantIdx] = { role: "assistant", content: fullText };
            return updated;
          });
        });

        setDraft(turn.draft);
        setConnectors(turn.required_connectors);

        if (ttsEnabled && voiceConfig?.tts && fullText) {
          try {
            const audioBlob = await synthesizeText(fullText, voiceConfig.default_voice ?? undefined);
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            audio.play().catch(() => {});
          } catch {
            // TTS failed, continue silently
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to send message");
      } finally {
        setStreaming(false);
      }
    },
    [sessionId, streaming, messages.length, ttsEnabled, voiceConfig],
  );

  const handleFinalize = useMutation({
    mutationFn: () => finalizeAgent(sessionId!),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onCreated?.(result.agent_id);
      onClose();
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: { error?: string } } } })?.response?.data?.detail;
      setError(detail?.error || "Failed to create agent");
    },
  });

  const toggleRecording = useCallback(async () => {
    if (recording) {
      mediaRecorderRef.current?.stop();
      setRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        try {
          const result = await transcribeAudio(blob);
          if (result.text) {
            sendMessage(result.text);
          }
        } catch {
          setError("Speech recognition failed");
        }
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch {
      setError("Microphone access denied");
    }
  }, [recording, sendMessage]);

  if (!open) return null;

  const ready = draft?.friendly_name && draft?.system_prompt;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="flex h-[85vh] w-full max-w-5xl flex-col rounded-2xl bg-[var(--bg-surface)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-[var(--text-display)]">
              {t("agentBuilder.title")}
            </h2>
            {voiceConfig?.tts && (
              <button
                onClick={() => setTtsEnabled((v) => !v)}
                className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
                  ttsEnabled
                    ? "bg-[var(--accent)] text-white"
                    : "bg-[var(--bg-hover)] text-[var(--text-muted)]"
                }`}
              >
                🔊 TTS
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Chat panel */}
          <div className="flex flex-1 flex-col">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {messages.length === 0 && (
                <div className="flex h-full items-center justify-center text-center text-[var(--text-muted)]">
                  <div>
                    <p className="text-lg">{t("agentBuilder.welcome")}</p>
                    <p className="mt-2 text-sm">{t("agentBuilder.placeholder")}</p>
                  </div>
                </div>
              )}
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`mb-4 flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                      msg.role === "user"
                        ? "bg-[var(--accent)] text-white"
                        : "bg-[var(--bg-hover)] text-[var(--text)]"
                    }`}
                  >
                    <span ref={idx === messages.length - 1 && streaming ? streamingTextRef : undefined}>
                      {msg.content || "…"}
                    </span>
                  </div>
                </div>
              ))}
              {error && (
                <div className="mb-4 rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-500">
                  {error}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-[var(--border)] px-6 py-4">
              <div className="flex items-center gap-2">
                {voiceConfig?.stt && (
                  <button
                    onClick={toggleRecording}
                    disabled={streaming}
                    className={`flex h-10 w-10 items-center justify-center rounded-full transition ${
                      recording
                        ? "bg-red-500 text-white animate-pulse"
                        : "bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text)]"
                    }`}
                  >
                    🎤
                  </button>
                )}
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage(input);
                    }
                  }}
                  placeholder={t("agentBuilder.placeholder")}
                  disabled={streaming}
                  className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
                />
                <button
                  onClick={() => sendMessage(input)}
                  disabled={streaming || !input.trim()}
                  className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {streaming ? "…" : "Send"}
                </button>
              </div>
            </div>
          </div>

          {/* Draft panel */}
          {(draft || connectors.length > 0) && (
            <div className="w-80 border-l border-[var(--border)] overflow-y-auto px-4 py-4">
              {draft && (
                <>
                  <h3 className="mb-3 text-sm font-semibold text-[var(--text-muted)]">
                    {t("agentBuilder.draftTitle")}
                  </h3>
                  <dl className="space-y-2 text-sm">
                    {draft.friendly_name && (
                      <div>
                        <dt className="text-xs text-[var(--text-muted)]">Name</dt>
                        <dd className="text-[var(--text)]">{draft.friendly_name}</dd>
                      </div>
                    )}
                    {draft.runtime_profile && (
                      <div>
                        <dt className="text-xs text-[var(--text-muted)]">Profile</dt>
                        <dd className="text-[var(--text)]">{draft.runtime_profile}</dd>
                      </div>
                    )}
                    {draft.description && (
                      <div>
                        <dt className="text-xs text-[var(--text-muted)]">Description</dt>
                        <dd className="text-[var(--text)]">{draft.description}</dd>
                      </div>
                    )}
                    {draft.system_prompt && (
                      <div>
                        <dt className="text-xs text-[var(--text-muted)]">System Prompt</dt>
                        <dd className="line-clamp-4 text-[var(--text)]">{draft.system_prompt}</dd>
                      </div>
                    )}
                  </dl>
                </>
              )}

              {connectors.length > 0 && (
                <>
                  <h3 className="mb-3 mt-6 text-sm font-semibold text-[var(--text-muted)]">
                    {t("agentBuilder.connectorsTitle")}
                  </h3>
                  <div className="space-y-2">
                    {connectors.map((c) => (
                      <div
                        key={c.slug}
                        className={`rounded-lg border p-3 text-xs ${
                          c.installed
                            ? "border-green-500/30 bg-green-500/5"
                            : "border-amber-500/30 bg-amber-500/5"
                        }`}
                      >
                        <div className="flex items-center gap-2 font-medium">
                          {c.installed ? "✅" : "⚠️"} {c.name}
                        </div>
                        {!c.installed && c.admin_instructions && (
                          <div className="mt-2 flex items-start gap-2">
                            <p className="flex-1 text-[var(--text-muted)]">{c.admin_instructions}</p>
                            <button
                              onClick={() => navigator.clipboard.writeText(c.admin_instructions)}
                              className="shrink-0 text-[var(--accent)] hover:underline"
                            >
                              Copy
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {ready && (
                <button
                  onClick={() => handleFinalize.mutate()}
                  disabled={handleFinalize.isPending}
                  className="mt-6 w-full rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {handleFinalize.isPending
                    ? t("agentBuilder.creating")
                    : t("agentBuilder.createButton")}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
