import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getVoiceConfig, transcribeAudio, synthesizeText } from "../api/voice";
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

interface EditableDraft extends AgentDraft {
  _friendly_name?: string;
  _description?: string;
  _system_prompt?: string;
  _runtime_profile?: string;
}

const TEMPLATES = [
  {
    name: "Agente de Soporte",
    prompt: "Crea un agente de soporte al cliente que pueda responder preguntas sobre nuestro producto, escalar problemas a agentes humanos y mantener un tono amable.",
  },
  {
    name: "Resumidor de Noticias",
    prompt: "Crea un agente que busque noticias sobre un tema específico, las resuma en un digest diario y lo envíe por correo o Telegram.",
  },
  {
    name: "Asistente Administrativo",
    prompt: "Crea un asistente administrativo que pueda gestionar eventos de calendario, redactar correos y organizar documentos en SharePoint.",
  },
  {
    name: "Analista de Datos",
    prompt: "Crea un analista de datos que pueda leer archivos CSV/Excel, generar reportes con gráficos y responder preguntas sobre los datos.",
  },
  {
    name: "Monitor de Redes",
    prompt: "Crea un agente técnico que monitore equipos de red, ejecute diagnósticos (ping, traceroute) y reporte el estado de la infraestructura.",
  },
  {
    name: "Gestor de Tareas",
    prompt: "Crea un agente supervisor que pueda delegar tareas a otros agentes, hacer seguimiento del estado y reportar resultados consolidados.",
  },
];

const SESSION_KEY = "hermeshq.builder.session";

export function AiAgentBuilder({ onClose, onCreated }: Props) {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(
    () => localStorage.getItem(SESSION_KEY),
  );
  const [draft, setDraft] = useState<EditableDraft | null>(null);
  const [connectors, setConnectors] = useState<RequiredConnector[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);

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
    if (sessionId) return;
    try {
      const session = await createBuilderSession();
      setSessionId(session.session_id);
      localStorage.setItem(SESSION_KEY, session.session_id);
    } catch {
      setError("Failed to initialize builder session");
    }
  }, [sessionId]);

  useEffect(() => {
    initSession();
  }, [initSession]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!sessionId || !text.trim() || streaming) return;

      setError(null);
      setInput("");
      setStreaming(true);
      setShowTemplates(false);
      const userMsg: ChatMessage = { role: "user", content: text };
      setMessages((prev) => {
        const withUser = [...prev, userMsg];
        return [...withUser, { role: "assistant", content: "" }];
      });

      const assistantIdx = messages.length + 1;
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

        setDraft({
          ...turn.draft,
          _friendly_name: turn.draft.friendly_name,
          _description: turn.draft.description,
          _system_prompt: turn.draft.system_prompt,
          _runtime_profile: turn.draft.runtime_profile,
        });
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
    mutationFn: () => {
      const overrides: Record<string, string> = {};
      if (draft?._friendly_name) overrides.friendly_name = draft._friendly_name;
      if (draft?._description) overrides.description = draft._description;
      if (draft?._system_prompt) overrides.system_prompt = draft._system_prompt;
      if (draft?._runtime_profile) overrides.runtime_profile = draft._runtime_profile;
      return finalizeAgent(sessionId!, overrides);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      localStorage.removeItem(SESSION_KEY);
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

  function handleClearSession() {
    localStorage.removeItem(SESSION_KEY);
    setSessionId(null);
    setMessages([]);
    setDraft(null);
    setConnectors([]);
    setError(null);
    initSession();
  }

  const ready = draft?._friendly_name && draft?._system_prompt;

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
          {messages.length > 0 && (
            <button
              onClick={handleClearSession}
              className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
              title="Start over"
            >
              ↻ New session
            </button>
          )}
        </div>
        {onClose && (
          <Link
            to="/v2/agents"
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
            {messages.length === 0 && !streaming && (
              <div className="flex h-full flex-col items-center justify-center text-center text-[var(--text-muted)]">
                <div className="mb-4 text-5xl">🤖</div>
                <p className="text-lg font-medium text-[var(--text)]">{t("agentBuilder.welcome")}</p>
                <p className="mt-2 max-w-md text-sm">{t("agentBuilder.placeholder")}</p>
                <div className="mt-6 grid gap-2 sm:grid-cols-2">
                  {TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.name}
                      onClick={() => sendMessage(tpl.prompt)}
                      className="rounded-xl border border-[var(--border)] bg-[var(--bg-hover)] px-4 py-3 text-left text-sm transition hover:border-[var(--accent)] hover:bg-[var(--bg-hover)]"
                    >
                      <span className="font-medium text-[var(--text)]">{tpl.name}</span>
                      <span className="mt-1 block text-xs text-[var(--text-muted)] line-clamp-2">{tpl.prompt.slice(0, 80)}…</span>
                    </button>
                  ))}
                </div>
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
                    msg.content === "" && streaming && idx === messages.length - 1 ? (
                      <div className="flex items-center gap-1 py-1">
                        <span className="h-2 w-2 animate-bounce rounded-full bg-current opacity-60" style={{ animationDelay: "0ms" }} />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-current opacity-60" style={{ animationDelay: "150ms" }} />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-current opacity-60" style={{ animationDelay: "300ms" }} />
                      </div>
                    ) : (
                      <MarkdownText>{msg.content || "…"}</MarkdownText>
                    )
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
                  <div>
                    <dt className="text-xs text-[var(--text-muted)]">Name</dt>
                    <dd>
                      <input
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
                        value={draft._friendly_name ?? ""}
                        onChange={(e) => setDraft({ ...draft, _friendly_name: e.target.value })}
                      />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--text-muted)]">Profile</dt>
                    <dd>
                      <select
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
                        value={draft._runtime_profile ?? "standard"}
                        onChange={(e) => setDraft({ ...draft, _runtime_profile: e.target.value })}
                      >
                        <option value="standard">Standard</option>
                        <option value="technical">Technical</option>
                      </select>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--text-muted)]">Description</dt>
                    <dd>
                      <textarea
                        rows={2}
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
                        value={draft._description ?? ""}
                        onChange={(e) => setDraft({ ...draft, _description: e.target.value })}
                      />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--text-muted)]">System Prompt</dt>
                    <dd>
                      <textarea
                        rows={6}
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
                        value={draft._system_prompt ?? ""}
                        onChange={(e) => setDraft({ ...draft, _system_prompt: e.target.value })}
                      />
                    </dd>
                  </div>
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
