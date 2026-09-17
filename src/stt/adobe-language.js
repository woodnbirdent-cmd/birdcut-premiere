"use strict";
(function (root) {
/**
 * Adobe Premiere languageCode values (ISO 639-1 + ISO 3166-1).
 * Docs use "en-US"; the transcript JSON spec stores lowercase "en-us".
 * querySupportedLanguages() returns the host's languageCode strings — match those.
 */
const SHORT_TO_ADOBE = {
  en: "en-US",
  "en-us": "en-US",
  "en-gb": "en-GB",
  es: "es-ES",
  "es-es": "es-ES",
  de: "de-DE",
  "de-de": "de-DE",
  fr: "fr-FR",
  "fr-fr": "fr-FR",
  ja: "ja-JP",
  "ja-jp": "ja-JP",
  pt: "pt-BR",
  "pt-br": "pt-BR",
  "pt-pt": "pt-PT",
  ko: "ko-KR",
  "ko-kr": "ko-KR",
  it: "it-IT",
  "it-it": "it-IT",
  ru: "ru-RU",
  "ru-ru": "ru-RU",
  hi: "hi-IN",
  "hi-in": "hi-IN",
  nb: "nb-NO",
  no: "nb-NO",
  "nb-no": "nb-NO",
  sv: "sv-SE",
  "sv-se": "sv-SE",
  nl: "nl-NL",
  "nl-nl": "nl-NL",
  da: "da-DK",
  "da-dk": "da-DK",
  id: "id-ID",
  "id-id": "id-ID",
  th: "th-TH",
  "th-th": "th-TH",
  vi: "vi-VN",
  "vi-vn": "vi-VN",
  ms: "ms-MY",
  "ms-my": "ms-MY",
  tr: "tr-TR",
  "tr-tr": "tr-TR",
  pl: "pl-PL",
  "pl-pl": "pl-PL",
  fil: "fil-PH",
  tl: "fil-PH",
  "fil-ph": "fil-PH",
  te: "te-IN",
  "te-in": "te-IN",
  ml: "ml-IN",
  "ml-in": "ml-IN",
  pa: "pa-IN",
  "pa-in": "pa-IN",
  zh: "cmn-Hans",
  "zh-cn": "cmn-Hans",
  "cmn-hans": "cmn-Hans",
  "zh-tw": "cmn-Hant",
  "cmn-hant": "cmn-Hant",
  "zh-hk": "zh-HK"
};

function fold(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
}

function candidateCodes(settingsLanguage) {
  const raw = String(settingsLanguage || "").trim();
  if (!raw) return [];
  const folded = fold(raw);
  const mapped = SHORT_TO_ADOBE[folded];
  const out = [];
  if (raw) out.push(raw);
  if (mapped) out.push(mapped);
  if (folded && folded !== raw) out.push(folded);
  if (/^[a-z]{2}$/i.test(folded)) out.push(`${folded}-${folded.toUpperCase()}`);
  return out.filter(Boolean);
}

function matchSupported(code, supported) {
  const want = fold(code);
  if (!want) return null;
  for (let i = 0; i < supported.length; i += 1) {
    const item = supported[i] || {};
    const languageCode = item.languageCode || item.code || "";
    const locale = item.locale || "";
    if (fold(languageCode) === want || fold(locale) === want) return languageCode || locale;
  }
  const prefix = want.split("-")[0];
  for (let i = 0; i < supported.length; i += 1) {
    const item = supported[i] || {};
    const languageCode = item.languageCode || item.code || "";
    const locale = item.locale || "";
    if (fold(languageCode).split("-")[0] === prefix || fold(locale).split("-")[0] === prefix) {
      return languageCode || locale;
    }
  }
  return null;
}

function resolveAdobeLanguage(settingsLanguage, supportedLanguages) {
  const supported = Array.isArray(supportedLanguages) ? supportedLanguages : [];
  const candidates = candidateCodes(settingsLanguage);
  for (let i = 0; i < candidates.length; i += 1) {
    if (supported.length) {
      const matched = matchSupported(candidates[i], supported);
      if (matched) return matched;
    }
  }
  if (!supported.length && candidates.length) {
    const folded = fold(candidates[0]);
    return SHORT_TO_ADOBE[folded] || (candidates[0].indexOf("-") >= 0 ? candidates[0] : "");
  }
  return "";
}

const api = { SHORT_TO_ADOBE, candidateCodes, resolveAdobeLanguage };

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== "undefined") {
  globalThis.BirdCutAdobeLanguage = api;
}

})(typeof globalThis !== "undefined" ? globalThis : this);
