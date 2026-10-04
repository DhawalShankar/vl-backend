// src/utils/languageCodes.js
//
// Maps language names stored in User.languagesKnow to codes.
// Indian languages -> BCP-47 with -IN (Sarvam). Foreign languages -> plain
// ISO codes (Google).

const LANGUAGE_CODES = {
  // Indian languages (Sarvam)
  english: "en-IN",
  hindi: "hi-IN",
  bengali: "bn-IN",
  gujarati: "gu-IN",
  kannada: "kn-IN",
  malayalam: "ml-IN",
  marathi: "mr-IN",
  odia: "od-IN",
  oriya: "od-IN",
  punjabi: "pa-IN",
  tamil: "ta-IN",
  telugu: "te-IN",
  urdu: "ur-IN",
  assamese: "as-IN",
  sanskrit: "sa-IN",
  nepali: "ne-IN",
  konkani: "kok-IN",
  maithili: "mai-IN",
  bodo: "brx-IN",
  dogri: "doi-IN",
  kashmiri: "ks-IN",
  manipuri: "mni-IN",
  santali: "sat-IN",
  sindhi: "sd-IN",

  // Foreign languages (Google)
  spanish: "es",
  french: "fr",
  german: "de",
  italian: "it",
  portuguese: "pt",
  russian: "ru",
  japanese: "ja",
  korean: "ko",
  chinese: "zh",
  mandarin: "zh",
  arabic: "ar",
  turkish: "tr",
  dutch: "nl",
  polish: "pl",
  swedish: "sv",
  thai: "th",
  vietnamese: "vi",
  indonesian: "id",
  persian: "fa",
  farsi: "fa",
  greek: "el",
  hebrew: "he",
  swahili: "sw"
};

export const getLanguageCode = (languageName) => {
  if (!languageName) return null;
  const key = languageName.trim().toLowerCase();
  return LANGUAGE_CODES[key] || null;
};