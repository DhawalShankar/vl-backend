// src/utils/languageCodes.js
//
// Maps the plain language names stored in User.languagesKnow (e.g. "Hindi",
// "Tamil") to BCP-47 codes the translation providers expect (e.g. "hi-IN").
//
// Note: the default Sarvam model (mayura:v1) only supports 11 of these
// languages + English. The rest (Assamese, Sanskrit, Nepali, Konkani,
// Maithili, Bodo, Dogri, Kashmiri, Manipuri, Santali, Sindhi) need the
// sarvam-translate:v1 model instead — see the comment in translate.js.

const LANGUAGE_CODES = {
  english: "en-IN",
  hindi: "hi-IN",
  bengali: "bn-IN",
  gujarati: "gu-IN",
  kannada: "kn-IN",
  malayalam: "ml-IN",
  marathi: "mr-IN",
  odia: "or-IN",
  oriya: "or-IN", // common alternate spelling
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
  sindhi: "sd-IN"
};

/**
 * @param {string} languageName - as stored in languagesKnow, e.g. "Hindi"
 * @returns {string|null} BCP-47 code, e.g. "hi-IN", or null if unrecognized
 */
export const getLanguageCode = (languageName) => {
  if (!languageName) return null;
  const key = languageName.trim().toLowerCase();
  return LANGUAGE_CODES[key] || null;
};