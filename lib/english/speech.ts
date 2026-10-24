// Browser speech helpers for Listening (speech synthesis) and Speaking (speech
// recognition). Both are free browser APIs; recognition exists in Chrome, Edge and Safari.

/** Reads English text aloud with a British voice when the device has one. */
export function speakEnglish(text: string, slow = false): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const voices = synth.getVoices();
  const voice = voices.find((item) => item.lang === "en-GB") ?? voices.find((item) => item.lang.startsWith("en"));
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang ?? "en-GB";
  utterance.rate = slow ? 0.65 : 0.9;
  synth.speak(utterance);
  return true;
}

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

interface RecognitionResultEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

interface Recognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type RecognitionConstructor = new () => Recognition;

function recognitionConstructor(): RecognitionConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  const scope = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
}

export function canRecognize(): boolean {
  return Boolean(recognitionConstructor());
}

/** Listens once and resolves with what was heard. Rejects with a message in Spanish. */
export function listenOnce(): { promise: Promise<string>; stop: () => void } {
  const Constructor = recognitionConstructor();
  if (!Constructor) {
    return { promise: Promise.reject(new Error("Tu navegador no permite usar el micrófono.")), stop: () => undefined };
  }
  const recognition = new Constructor();
  recognition.lang = "en-GB";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  const promise = new Promise<string>((resolve, reject) => {
    let heard = "";
    recognition.onresult = (event) => {
      heard = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
    };
    recognition.onerror = (event) => {
      reject(
        new Error(
          event.error === "not-allowed" || event.error === "service-not-allowed"
            ? "Necesitamos permiso para usar el micrófono."
            : event.error === "no-speech"
              ? "No te hemos oído. Inténtalo de nuevo."
              : "No se ha podido usar el micrófono.",
        ),
      );
    };
    recognition.onend = () => (heard ? resolve(heard) : reject(new Error("No te hemos oído. Inténtalo de nuevo.")));
  });
  recognition.start();
  return { promise, stop: () => recognition.stop() };
}
