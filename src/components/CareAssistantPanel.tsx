import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Loader2,
  MessageCircle,
  Mic,
  MicOff,
  RotateCcw,
  Send,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useCare } from '../context/CareContext';
import { parseReadableError } from '../lib/utils';
import { askCareAssistant } from '../services/aiService';
import type { CareAssistantMessage } from '../types/healthcare';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  0: SpeechRecognitionAlternativeLike;
  isFinal: boolean;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

interface CareAssistantPanelProps {
  compact?: boolean;
}

const SUGGESTED_QUESTIONS: readonly string[] = [
  'Which medicine should I take next?',
  'Show my medicines for today.',
  'Have I missed any medication?',
  "What is my next doctor's appointment?",
];

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}

export function CareAssistantPanel({ compact = false }: CareAssistantPanelProps) {
  const { activeCircle, profile } = useCare();

  const [messages, setMessages] = useState<CareAssistantMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const voiceInputSupported = Boolean(getSpeechRecognitionConstructor());
  const speechOutputSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, sending]);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        // Ignore cleanup errors
      }
      if (speechOutputSupported) {
        window.speechSynthesis.cancel();
      }
    };
  }, [speechOutputSupported]);

  if (!activeCircle || !profile) return null;

  const submitQuestion = async (rawQuestion: string) => {
    const question = rawQuestion.trim();
    if (!question || sending) return;

    setError(null);
    const userMsg: CareAssistantMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: question,
      timestamp: new Date().toISOString(),
    };

    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setInput('');
    setSending(true);

    try {
      const result = await askCareAssistant({
        circleId: activeCircle.id,
        message: question,
        history: messages.slice(-6).map((m) => ({
          role: m.role,
          text: m.text,
        })),
      });

      const assistantMsg: CareAssistantMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        text: result.reply,
        timestamp: result.generatedAt,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setError(parseReadableError(err));
    } finally {
      setSending(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submitQuestion(input);
  };

  const handleToggleVoiceInput = () => {
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) return;

    if (listening && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore stop errors
      }
      setListening(false);
      return;
    }

    try {
      const recognition = new Recognition();
      recognition.lang = 'en-US';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript?.trim() ?? '';
        if (transcript) {
          setInput(transcript);
        }
      };
      recognition.onerror = () => {
        setListening(false);
      };
      recognition.onend = () => {
        setListening(false);
      };

      recognitionRef.current = recognition;
      setError(null);
      setListening(true);
      recognition.start();
    } catch {
      setListening(false);
    }
  };

  const handleToggleSpeak = (msg: CareAssistantMessage) => {
    if (!speechOutputSupported) return;
    if (speakingId === msg.id) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(msg.text);
      utterance.rate = 0.92;
      utterance.onstart = () => setSpeakingId(msg.id);
      utterance.onend = () => setSpeakingId(null);
      utterance.onerror = () => setSpeakingId(null);
      window.speechSynthesis.speak(utterance);
    } catch {
      setSpeakingId(null);
    }
  };

  const handleClearChat = () => {
    if (speechOutputSupported) {
      window.speechSynthesis.cancel();
    }
    setSpeakingId(null);
    setError(null);
    setMessages([]);
  };

  return (
    <section
      aria-label="Care Routine Assistant"
      className={
        compact
          ? 'space-y-4'
          : 'rounded-2xl border border-[#E5E7EB] bg-white p-6 space-y-5'
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#ECFDF5] text-[#065F46]">
            <MessageCircle className="h-6 w-6" />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold text-[#1F2937]">
              Care Routine Assistant
            </h2>
            <p className="mt-0.5 text-base text-[#4B5563]">
              Ask a simple question about {activeCircle.patientName}&apos;s medicines or doctor visits.
            </p>
          </div>
        </div>

        {messages.length > 0 && (
          <button
            type="button"
            onClick={handleClearChat}
            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-[#D1D5DB] bg-white px-3.5 text-sm font-semibold text-[#374151] hover:bg-[#F3F4F6]"
          >
            <RotateCcw className="h-4 w-4" />
            <span>New Chat</span>
          </button>
        )}
      </div>

      {/* Four Suggested Questions */}
      <div className="space-y-2">
        <p className="text-sm font-semibold text-[#4B5563]">Suggested Questions</p>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {SUGGESTED_QUESTIONS.map((question) => (
            <button
              key={question}
              type="button"
              disabled={sending}
              onClick={() => void submitQuestion(question)}
              className="min-h-[48px] rounded-xl border border-[#D1D5DB] bg-[#F9FAFB] px-4 py-2.5 text-left text-base font-medium text-[#1F2937] transition-colors hover:border-[#065F46] hover:bg-[#ECFDF5] hover:text-[#065F46] disabled:opacity-60"
            >
              {question}
            </button>
          ))}
        </div>
      </div>

      {/* Conversation Area */}
      {(messages.length > 0 || sending) && (
        <div
          className={`space-y-3 overflow-y-auto rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-4 ${
            compact ? 'max-h-[300px]' : 'max-h-[360px]'
          }`}
        >
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={msg.id}
                className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-4 py-3 text-base leading-relaxed ${
                    isUser
                      ? 'bg-[#065F46] font-medium text-white'
                      : 'border border-[#E5E7EB] bg-white text-[#1F2937]'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                  {!isUser && speechOutputSupported && (
                    <div className="mt-2.5 border-t border-[#F3F4F6] pt-2">
                      <button
                        type="button"
                        onClick={() => handleToggleSpeak(msg)}
                        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-[#065F46] hover:bg-[#ECFDF5]"
                      >
                        {speakingId === msg.id ? (
                          <>
                            <VolumeX className="h-4 w-4" />
                            <span>Stop</span>
                          </>
                        ) : (
                          <>
                            <Volume2 className="h-4 w-4" />
                            <span>Listen</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {sending && (
            <div className="flex justify-start">
              <div className="inline-flex items-center gap-2.5 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-base text-[#4B5563]">
                <Loader2 className="h-5 w-5 animate-spin text-[#065F46]" />
                <span>Checking your care schedule...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-base text-[#991B1B]"
        >
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Single Message Input + Optional Voice + Send Button */}
      <form onSubmit={handleFormSubmit} className="flex flex-col gap-2.5 sm:flex-row">
        <div className="flex flex-1 items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={600}
            aria-label="Ask a question about your care routine"
            placeholder={
              listening
                ? 'Listening... speak your question'
                : 'Ask a question (e.g., What appointments do I have?)'
            }
            className="min-h-[52px] w-full flex-1 rounded-xl border border-[#D1D5DB] bg-white px-4 text-base text-[#1F2937] placeholder:text-[#6B7280] focus:border-[#065F46] focus:outline-none"
          />

          {voiceInputSupported && (
            <button
              type="button"
              onClick={handleToggleVoiceInput}
              disabled={sending}
              aria-label={listening ? 'Stop voice input' : 'Speak your question'}
              title={listening ? 'Stop voice input' : 'Speak your question'}
              className={`inline-flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-xl border text-base font-semibold transition-colors ${
                listening
                  ? 'border-[#B91C1C] bg-red-50 text-[#B91C1C]'
                  : 'border-[#D1D5DB] bg-white text-[#374151] hover:bg-[#F3F4F6]'
              }`}
            >
              {listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5 text-[#065F46]" />}
            </button>
          )}
        </div>

        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="inline-flex min-h-[52px] shrink-0 items-center justify-center gap-2 rounded-xl bg-[#065F46] px-6 text-base font-bold text-white hover:bg-[#047857] disabled:opacity-60"
        >
          <Send className="h-5 w-5" />
          <span>{sending ? 'Sending...' : 'Send'}</span>
        </button>
      </form>

      <p className="text-sm text-[#6B7280]">
        For medical advice, diagnosis, or dosage changes, always contact your doctor or pharmacist.
      </p>
    </section>
  );
}
