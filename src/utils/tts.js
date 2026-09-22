// src/utils/tts.js
//
// Sarvam AI Text-to-Speech (bulbul:v3). Mirrors translate.js: fails open,
// returns null on any error so the frontend can just disable the button.

const SARVAM_API_KEY = process.env.SARVAM_API_KEY;
const SARVAM_TTS_URL = "https://api.sarvam.ai/text-to-speech";
const SARVAM_TTS_MAX_CHARS = 2500; // bulbul:v3 limit
const SARVAM_TTS_TIMEOUT_MS = 10000;

/**
 * @param {string} text
 * @param {string|null} langCode - BCP-47 code (e.g. "hi-IN"). Sarvam's TTS
 *        endpoint requires this (no auto-detect), so we fall back to a
 *        default when the caller doesn't have one.
 * @returns {Promise<{ audioData: string, audioFormat: string } | null>}
 */
export const synthesizeSpeech = async (text, langCode) => {
  if (!SARVAM_API_KEY) {
    console.warn("⚠️ SARVAM_API_KEY not set — skipping TTS");
    return null;
  }
  if (!text || !text.trim()) return null;

  const trimmed = text.trim().slice(0, SARVAM_TTS_MAX_CHARS);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SARVAM_TTS_TIMEOUT_MS);

  try {
    const response = await fetch(SARVAM_TTS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-subscription-key": SARVAM_API_KEY
      },
      body: JSON.stringify({
        text: trimmed,
        language_code: langCode || "hi-IN", // fallback default
        model: "bulbul:v3"
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Sarvam TTS error:", response.status, errText);
      return null;
    }

    const data = await response.json();
    const audio = data?.audios?.[0];

    if (!audio) return null;

    return { audioData: audio, audioFormat: "wav" };
  } catch (error) {
    if (error.name === "AbortError") {
      console.error(`Sarvam TTS timed out after ${SARVAM_TTS_TIMEOUT_MS}ms`);
    } else {
      console.error("Sarvam TTS request failed:", error);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
};