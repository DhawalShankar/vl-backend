// src/utils/translate.js
//
// Translation layer with two backends: "sarvam" (default) and "google".
// Never blocks message sending: any failure returns null and the caller
// just shows the original text.
//
// Sarvam flow:
//   1. mayura:v1 with source_language_code "auto"   (fast, 11 languages)
//   2. If Sarvam answers 422 (e.g. Sanskrit, which mayura can't detect)
//      AND we know the language both users matched on, retry once with
//      sarvam-translate:v1 and that explicit source code (22 languages).

const TRANSLATION_PROVIDER = (process.env.TRANSLATION_PROVIDER || "sarvam").toLowerCase();

const SARVAM_API_KEY = process.env.SARVAM_API_KEY;
const SARVAM_TRANSLATE_URL = "https://api.sarvam.ai/translate";
const SARVAM_MAX_CHARS = 1000; // mayura:v1 input limit
const SARVAM_TIMEOUT_MS = 10000;

const GOOGLE_TRANSLATE_API_KEY = process.env.GOOGLE_TRANSLATE_API_KEY;
const GOOGLE_TRANSLATE_URL = "https://translation.googleapis.com/language/translate/v2";
const GOOGLE_TIMEOUT_MS = 10000;

// One Sarvam call. Never throws; returns { ok, status, translatedText?, detectedLang? }
const callSarvam = async ({ text, sourceLang, targetLang, model }) => {
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
        source_language_code: sourceLang,
        target_language_code: targetLang,
        model,
        mode: "formal"
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`Sarvam translation error (${model}):`, response.status, errText.slice(0, 200));
      return { ok: false, status: response.status };
    }

    const data = await response.json();
    if (!data?.translated_text) return { ok: false, status: 200 };

    return {
      ok: true,
      status: 200,
      translatedText: data.translated_text,
      detectedLang: data.source_language_code || null
    };
  } catch (error) {
    if (error.name === "AbortError") {
      console.error(`Sarvam translation timed out after ${SARVAM_TIMEOUT_MS}ms`);
    } else {
      console.error("Sarvam translation request failed:", error);
    }
    return { ok: false, status: 0 };
  } finally {
    clearTimeout(timeout);
  }
};

const translateWithSarvam = async (text, targetLang, fallbackSourceLang) => {
  if (!SARVAM_API_KEY) {
    console.warn("⚠️ SARVAM_API_KEY not set — skipping translation");
    return null;
  }

  if (text.length > SARVAM_MAX_CHARS) {
    console.warn(`⚠️ Message exceeds ${SARVAM_MAX_CHARS}-char limit — skipping translation`);
    return null;
  }

  // Step 1: mayura + auto-detect
  const first = await callSarvam({
    text,
    sourceLang: "auto",
    targetLang,
    model: "mayura:v1"
  });
  if (first.ok) {
    return { translatedText: first.translatedText, detectedLang: first.detectedLang };
  }

  // Step 2: only on 422, and only if we have a usable fallback source
  if (first.status !== 422 || !fallbackSourceLang || fallbackSourceLang === targetLang) {
    return null;
  }

  console.log(`↩️ Auto-detect failed, retrying with sarvam-translate (source ${fallbackSourceLang})`);
  const second = await callSarvam({
    text,
    sourceLang: fallbackSourceLang,
    targetLang,
    model: "sarvam-translate:v1"
  });
  if (second.ok) {
    return {
      translatedText: second.translatedText,
      detectedLang: second.detectedLang || fallbackSourceLang
    };
  }

  return null;
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

    if (!translation?.translatedText) return null;

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
 * @param {string} text
 * @param {string} targetLang - BCP-47, e.g. "hi-IN"
 * @param {string|null} fallbackSourceLang - BCP-47 of the language both users
 *        matched on; used only if Sarvam auto-detect fails
 */
export const translateMessage = async (text, targetLang, fallbackSourceLang = null) => {
  if (!text || !text.trim() || !targetLang) return null;

  if (TRANSLATION_PROVIDER === "google") {
    return translateWithGoogle(text.trim(), targetLang);
  }

  return translateWithSarvam(text.trim(), targetLang, fallbackSourceLang);
};