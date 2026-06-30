import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
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
import { MarkdownText } from "./MarkdownText";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  onClose?: () => void;
  onCreated?: (agentId: string) => void;
}

export function AiAgentBuilder({ onClose, onCreated }: Props) {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AgentDraft | null>(null);
  const [connectors, setConnectors] = useState<RequiredConnector[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: voiceConfig } = useQuery({
    queryKey: ["voice-config"],
    queryFn: getVoiceConfig,
  });

  const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";
  const micAvailable = voiceConfig?.stt && isHttps;

  const initSession = useCallback(async () => {
    try {
      const session = await createBuilderSession();
      setSessionId(session.session_id);
    } catch {
      setError("Failed to initialize builder session");
    }
  }, []);

  useEffect(() => {
    if (!sessionId) {
      initSession();
    }
  }, [sessionId, initSession]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!sessionId || !text.trim() || streaming) return;

      setError(null);
      setInput("");
      setStreaming(true);
      const userMsg: ChatMessage = { role: "user", content: text };
      setMessages((prev) => [...prev, userMsg]);

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
            audio.onended = () => URL.revokeObjectURL(audioUrl);
            audio.onerror = () => URL.revokeObjectURL(audioUrl);
            audio.play().catch(() => {});
          } catch {
            // TTS failed, continue silently
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to send message");
      } finally {
        setStreaming(false);
        inputRef.current?.focus();
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
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : MediaRecorder.isTypeSupported("audio/mp4")
            ? "audio/mp4"
            : "";
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      audioChunksRef.current = [];
      const recordedMimeType = recorder.mimeType || "audio/webm";

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(audioChunksRef.current, { type: recordedMimeType });
        if (blob.size < 500) {
          setError("Recording too short — try speaking for longer");
          return;
        }
        setTranscribing(true);
        try {
          const result = await transcribeAudio(blob);
          if (result.text && result.text.trim()) {
            await sendMessage(result.text);
          } else {
            setError("No speech detected — try again");
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Speech recognition failed";
          setError(`Transcription failed: ${msg}`);
        } finally {
          setTranscribing(false);
        }
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch {
      setError("Microphone access denied");
    }
  }, [recording, sendMessage]);

  const ready = draft?.friendly_name && draft?.system_prompt;

  return (
    <div className="grid gap-6">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl text-[var(--text-display)]">✨ {t("agentBuilder.title")}</h1>
          {voiceConfig?.tts && (
            <button
              onClick={() => setTtsEnabled((v) => !v)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                ttsEnabled
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--bg-hover)] text-[var(--text-muted)]"
              }`}
            >
              🔊 TTS
            </button>
          )}
        </div>
        {onClose && (
          <Link
            to="/agents"
            className="rounded-lg px-4 py-2 text-sm text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
          >
            ← {t("agents.title")}
          </Link>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* Chat section */}
        <section className="panel-frame flex flex-col" style={{ minHeight: "70vh" }}>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {messages.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center text-center text-[var(--text-muted)]">
                <div className="mb-4 text-5xl">🤖</div>
                <p className="text-lg font-medium text-[var(--text)]">{t("agentBuilder.welcome")}</p>
                <p className="mt-2 max-w-md text-sm">{t("agentBuilder.placeholder")}</p>
              </div>
            )}
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`mb-4 flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-[var(--accent)] text-white"
                      : "bg-[var(--bg-hover)] text-[var(--text)]"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <MarkdownText>{msg.content || "…"}</MarkdownText>
                  ) : (
                    msg.content || "…"
                  )}
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

          {/* Input bar */}
          <div className="border-t border-[var(--border)] px-4 py-4">
            {voiceConfig?.stt && !isHttps && (
              <p className="mb-2 px-2 text-xs text-amber-500">
                ⚠️ Voice input requires HTTPS. Current connection is HTTP — mic is disabled.
              </p>
            )}
            <div className="flex items-center gap-2">
              {micAvailable && (
                <button
                  onClick={toggleRecording}
                  disabled={streaming || transcribing}
                  title={recording ? "Stop recording" : transcribing ? "Transcribing..." : "Record voice message"}
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg transition ${
                    recording
                      ? "animate-pulse bg-red-500 text-white"
                      : transcribing
                        ? "animate-spin bg-[var(--accent)] text-white"
                        : "bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text)]"
                  }`}
                >
                  {recording ? "⏹" : transcribing ? "⟳" : "🎤"}
                </button>
              )}
              <input
                ref={inputRef}
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
                className="h-12 flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={streaming || !input.trim()}
                className="h-12 shrink-0 rounded-xl bg-[var(--accent)] px-6 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {streaming ? "…" : "Send"}
              </button>
            </div>
          </div>
        </section>

        {/* Draft sidebar */}
        <aside className="panel-frame flex flex-col overflow-y-auto" style={{ maxHeight: "70vh" }}>
          <div className="p-6">
            {!draft && connectors.length === 0 && (
              <div className="py-12 text-center text-sm text-[var(--text-muted)]">
                {t("agentBuilder.draftTitle")} — {t("agentBuilder.placeholder")}
              </div>
            )}

            {draft && (
              <>
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  {t("agentBuilder.draftTitle")}
                </h3>
                <dl className="space-y-3 text-sm">
                  {draft.friendly_name && (
                    <div>
                      <dt className="text-xs text-[var(--text-muted)]">Name</dt>
                      <dd className="font-medium text-[var(--text)]">{draft.friendly_name}</dd>
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
                <h3 className="mb-4 mt-6 text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  {t("agentBuilder.connectorsTitle")}
                </h3>
                <div className="space-y-3">
                  {connectors.map((c) => (
                    <div
                      key={c.slug}
                      className={`rounded-lg border p-4 text-sm ${
                        c.installed
                          ? "border-green-500/30 bg-green-500/5"
                          : "border-amber-500/30 bg-amber-500/5"
                      }`}
                    >
                      <div className="flex items-center gap-2 font-medium text-[var(--text)]">
                        {c.installed ? "✅" : "⚠️"} {c.name}
                      </div>
                      {!c.installed && c.admin_instructions && (
                        <div className="mt-2 flex items-start gap-2">
                          <p className="flex-1 text-xs text-[var(--text-muted)]">{c.admin_instructions}</p>
                          <button
                            onClick={() => navigator.clipboard.writeText(c.admin_instructions)}
                            className="shrink-0 text-xs text-[var(--accent)] hover:underline"
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
                className="mt-6 w-full rounded-xl bg-[var(--accent)] px-4 py-3.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {handleFinalize.isPending ? t("agentBuilder.creating") : t("agentBuilder.createButton")}
              </button>
            )}

            {handleFinalize.isError && (
              <p className="mt-3 text-center text-xs text-red-500">
                Failed to create agent. Check the chat for details.
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
