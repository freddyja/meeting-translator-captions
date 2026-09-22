export type SpeechCapability = {
  /** Constructor exists and the page is a secure context (HTTPS or localhost). */
  canListen: boolean;
  /** Lead with type-to-send: no STT, iPhone/iPad, or insecure http. */
  preferType: boolean;
  insecure: boolean;
  appleMobile: boolean;
};

export function isAppleMobile(
  userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "",
  platform = typeof navigator !== "undefined" ? navigator.platform : "",
  maxTouchPoints = typeof navigator !== "undefined" ? navigator.maxTouchPoints : 0,
): boolean {
  if (/iPhone|iPod/i.test(userAgent)) return true;
  if (/iPad/i.test(userAgent)) return true;
  if (platform === "MacIntel" && maxTouchPoints > 1) return true;
  return false;
}

export function hasSpeechRecognitionCtor(
  speech?: { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown } | null,
): boolean {
  const target =
    speech ??
    (typeof window !== "undefined"
      ? (window as Window & { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown })
      : undefined);
  return Boolean(target?.SpeechRecognition || target?.webkitSpeechRecognition);
}

export function detectSpeechCapability(input: {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
  secureContext?: boolean;
  hasSpeechCtor?: boolean;
} = {}): SpeechCapability {
  const userAgent = input.userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : "");
  const platform = input.platform ?? (typeof navigator !== "undefined" ? navigator.platform : "");
  const maxTouchPoints = input.maxTouchPoints ?? (typeof navigator !== "undefined" ? navigator.maxTouchPoints : 0);
  const secureContext =
    input.secureContext ?? (typeof window !== "undefined" ? window.isSecureContext : true);
  const hasSpeechCtor = input.hasSpeechCtor ?? hasSpeechRecognitionCtor();
  const appleMobile = isAppleMobile(userAgent, platform, maxTouchPoints);
  const insecure = !secureContext;
  const canListen = hasSpeechCtor && !insecure;
  const preferType = !canListen || appleMobile;
  return { canListen, preferType, insecure, appleMobile };
}
