// src/utils/translate.js
//
// Routing:
//   - Target is a Sarvam language -> Sarvam (mayura first when it supports
//     the target, else sarvam-translate with an explicit source).
//   - Target is a foreign language, OR Sarvam failed -> Google (auto-detects source).
// TRANSLATION_PROVIDER=google forces Google for everything.
// Never blocks message sending: any failure returns null.

const TRANSLATION_PROVIDER = (process.env.TRANSLATION_PROVIDER || "sarvam").toLowerCase();

const SARVAM_API_KEY = process.env.SARVAM_API_KEY;
const SARVAM_TRANSLATE_URL = "https://api.sarvam.ai/translate";
const SARVAM_MAX_CHARS = 1000;
const SARVAM_TIMEOUT_MS = 10000;

const GOOGLE_TRANSLATE_API_KEY = process.env.GOOGLE_TRANSLATE_API_KEY;
const GOOGLE_TRANSLATE_URL = "https://translation.googleapis.com/language/translate/v2";
const GOOGLE_TIMEOUT_MS = 10000;

const MAYURA_LANGS = new Set([
  "en-IN", "hi-IN", "bn-IN", "gu-IN", "kn-IN", "ml-IN",
  "mr-IN", "od-IN", "pa-IN", "ta-IN", "te-IN"
]);

// mayura languages + the extra ones only sarvam-translate supports
const SARVAM_LANGS = new Set([
  ...MAYURA_LANGS,
  "as-IN", "brx-IN", "doi-IN", "kok-IN", "ks-IN", "mai-IN",
  "mni-IN", "ne-IN", "sa-IN", "sat-IN", "sd-IN", "ur-IN"
]);

// Defensive: older data may use or-IN for Odia
const normalizeCode = (code) => (code === "or-IN" ? "od-IN" : code);

// Google uses plain codes ("hi", "es"); Odia is "or" there, not "od"
const toGoogleLang = (code) => {
  const base = code.split("-")[0].toLowerCase();
  return base === "od" ? "or" : base;
};

// Is the text mostly Latin script (so almost surely English)?
const looksLatin = (text) => {
  const letters = text.match(/\p{L}/gu) || [];
  if (!letters.length) return false;
  const latin = letters.filter((ch) => /\p{Script=Latin}/u.test(ch)).length;
  return latin / letters.length > 0.8;
};

// One Sarvam call. Never throws.
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
      console.error(`Sarvam translation error (${model}):`, response.status, errText.slice(0, 300));
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

// Returns a result, or null (caller then tries Google)
const translateWithSarvam = async (text, targetLang, fallbackSourceLang) => {
  if (!SARVAM_API_KEY) {
    console.warn("⚠️ SARVAM_API_KEY not set — skipping Sarvam");
    return null;
  }

  if (text.length > SARVAM_MAX_CHARS) {
    console.warn(`⚠️ Message exceeds ${SARVAM_MAX_CHARS}-char limit — skipping Sarvam`);
    return null;
  }

  // Step 1: mayura, only if it can produce the target language
  if (MAYURA_LANGS.has(targetLang)) {
    const first = await callSarvam({
      text,
      sourceLang: "auto",
      targetLang,
      model: "mayura:v1"
    });
    if (first.ok) {
      return { translatedText: first.translatedText, detectedLang: first.detectedLang };
    }
    // Retry only on request errors, not on 401/429/timeouts
    if (first.status !== 400 && first.status !== 422) return null;
  }

  // Step 2: sarvam-translate with an explicit source.
  // Latin text is treated as English, unless the matched language is a
  // foreign one (then it's probably Spanish/French etc., which Sarvam can't read).
  const fallback = fallbackSourceLang ? normalizeCode(fallbackSourceLang) : null;
  let source = null;
  if (looksLatin(text)) {
    source = fallback && !SARVAM_LANGS.has(fallback) ? null : "en-IN";
  } else {
    source = fallback && SARVAM_LANGS.has(fallback) ? fallback : null;
  }

  if (!source || source === targetLang) {
    console.warn(`⚠️ No usable Sarvam source language (target ${targetLang})`);
    return null;
  }

  console.log(`↩️ Using sarvam-translate (source ${source} → target ${targetLang})`);
  const second = await callSarvam({
    text,
    sourceLang: source,
    targetLang,
    model: "sarvam-translate:v1"
  });

  if (second.ok) {
    return { translatedText: second.translatedText, detectedLang: second.detectedLang || source };
  }
  return null;
};

const translateWithGoogle = async (text, targetLang) => {
  if (!GOOGLE_TRANSLATE_API_KEY) {
    console.warn("⚠️ GOOGLE_TRANSLATE_API_KEY not set — skipping translation");
    return null;
  }

  const googleLang = toGoogleLang(targetLang);

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
      console.error("Google translation error:", response.status, errText.slice(0, 300));
      return null;
    }

    const data = await response.json();
    const translation = data?.data?.translations?.[0];
    if (!translation?.translatedText) return null;

    console.log(`🌐 Google translated → ${googleLang}`);
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
 * @param {string} targetLang - "hi-IN" (Indian) or "es" (foreign)
 * @param {string|null} fallbackSourceLang - language both users matched on;
 *        used only when Sarvam auto-detect fails
 */
export const translateMessage = async (text, targetLang, fallbackSourceLang = null) => {
  if (!text || !text.trim() || !targetLang) return null;

  const clean = text.trim();
  const target = normalizeCode(targetLang);

  if (TRANSLATION_PROVIDER === "google") {
    return translateWithGoogle(clean, target);
  }

  // Indian target -> Sarvam first
  if (SARVAM_LANGS.has(target)) {
    const result = await translateWithSarvam(clean, target, fallbackSourceLang);
    if (result) return result;
  }

  // Foreign target, or Sarvam couldn't do it -> Google
  return translateWithGoogle(clean, target);
};