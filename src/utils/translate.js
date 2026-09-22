// src/utils/translate.js
//
// Pluggable translation layer with two backends:
//   - "sarvam"  -> Sarvam AI /translate (mayura:v1) — best for Indic languages,
//                  auto source-language detection, colloquial tone for chat
//   - "google"  -> Google Cloud Translation API v2 — wider language coverage,
//                  useful as a fallback for languages Sarvam doesn't cover
//
// Pick the active provider with TRANSLATION_PROVIDER in .env
// ("sarvam" or "google"). Defaults to "sarvam" since VartaLang's user base
// is primarily Indian-language speakers and Sarvam is purpose-built for that.
//
// Design goal for BOTH providers: NEVER block message sending. Any failure
// here (missing key, network error, quota, bad language pair) returns null,
// and the caller just falls back to sending the original, untranslated text.
//
// Target language codes: store these on User.translationPreference.language
// in Sarvam's BCP-47 form, e.g. "hi-IN", "ta-IN", "bn-IN", "en-IN". When the
// Google provider is active, the "-IN" suffix is stripped automatically
// (Google's codes are plain "hi", "ta", "bn", "en").

const TRANSLATION_PROVIDER = (process.env.TRANSLATION_PROVIDER || "sarvam").toLowerCase();

const SARVAM_API_KEY = process.env.SARVAM_API_KEY;
const SARVAM_TRANSLATE_URL = "https://api.sarvam.ai/translate";
const SARVAM_MAX_CHARS = 1000; // mayura:v1 input limit

const GOOGLE_TRANSLATE_API_KEY = process.env.GOOGLE_TRANSLATE_API_KEY;
const GOOGLE_TRANSLATE_URL = "https://translation.googleapis.com/language/translate/v2";

/**
 * Sarvam AI translation — mayura:v1, auto source detection, colloquial mode.
 * Best for the 11 major Indic languages + English; use sarvam-translate:v1
 * instead (swap the `model` below) if you need the full 22-language set
 * (Bodo, Dogri, Maithili, Manipuri, Santali, etc.) — that model is tuned for
 * formal/document text rather than chat, though.
 */
const SARVAM_TIMEOUT_MS = 10000;
const GOOGLE_TIMEOUT_MS = 10000;

const translateWithSarvam = async (text, targetLang) => {
  if (!SARVAM_API_KEY) {
    console.warn("⚠️ SARVAM_API_KEY not set — skipping translation");
    return null;
  }

  if (text.length > SARVAM_MAX_CHARS) {
    console.warn(`⚠️ Message exceeds Sarvam's ${SARVAM_MAX_CHARS}-char limit — skipping translation`);
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SARVAM_TIMEOUT_MS);

  try {
    const response = await fetch(SARVAM_TRANSLATE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-subscription-key": SARVAM_API_KEY
      },
      body: JSON.stringify({
        input: text,
        source_language_code: "auto",
        target_language_code: targetLang,
        model: "mayura:v1",
        mode: "modern-colloquial"
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Sarvam translation error:", response.status, errText);
      return null;
    }

    const data = await response.json();

    if (!data?.translated_text) {
      return null;
    }

    return {
      translatedText: data.translated_text,
      detectedLang: data.source_language_code || null
    };
  } catch (error) {
    if (error.name === "AbortError") {
      console.error(`Sarvam translation timed out after ${SARVAM_TIMEOUT_MS}ms`);
    } else {
      console.error("Sarvam translation request failed:", error);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

const translateWithGoogle = async (text, targetLang) => {
  if (!GOOGLE_TRANSLATE_API_KEY) {
    console.warn("⚠️ GOOGLE_TRANSLATE_API_KEY not set — skipping translation");
    return null;
  }

  const googleLang = targetLang.split("-")[0];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GOOGLE_TIMEOUT_MS);

  try {
    const response = await fetch(`${GOOGLE_TRANSLATE_URL}?key=${GOOGLE_TRANSLATE_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        q: text,
        target: googleLang,
        format: "text"
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Google translation error:", response.status, errText);
      return null;
    }

    const data = await response.json();
    const translation = data?.data?.translations?.[0];

    if (!translation?.translatedText) {
      return null;
    }

    return {
      translatedText: translation.translatedText,
      detectedLang: translation.detectedSourceLanguage || null
    };
  } catch (error) {
    if (error.name === "AbortError") {
      console.error(`Google translation timed out after ${GOOGLE_TIMEOUT_MS}ms`);
    } else {
      console.error("Google translation request failed:", error);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

/**
 * Translate `text` into `targetLang` using whichever provider is configured.
 * @param {string} text - original message text
 * @param {string} targetLang - BCP-47 code, e.g. "hi-IN", "ta-IN", "en-IN"
 * @returns {Promise<{ translatedText: string, detectedLang: string|null } | null>}
 *          null means "could not translate, use original text instead"
 */
export const translateMessage = async (text, targetLang) => {
  if (!text || !text.trim() || !targetLang) {
    return null;
  }

  if (TRANSLATION_PROVIDER === "google") {
    return translateWithGoogle(text.trim(), targetLang);
  }

  // Default: sarvam
  return translateWithSarvam(text.trim(), targetLang);
};