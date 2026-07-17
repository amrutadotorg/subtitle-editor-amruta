export const locales = [
  "ar",
  "bn",
  "de",
  "en",
  "es",
  "fr",
  "hi",
  "mr",
  "pl",
  "pt",
  "ru",
  "yue",
  "zh",
] as const;

type Locale = (typeof locales)[number];

export const localeConfig: Record<
  Locale,
  {
    name: string;
    nativeName: string;
    openGraphLocale: string;
    url: string;
    isRtl: boolean;
  }
> = {
  ar: {
    name: "Arabic",
    nativeName: "العربية",
    openGraphLocale: "ar",
    url: "https://subtitle-editor.org/ar",
    isRtl: true,
  },
  bn: {
    name: "Bengali",
    nativeName: "বাংলা",
    openGraphLocale: "bn",
    url: "https://subtitle-editor.org/bn",
    isRtl: false,
  },
  de: {
    name: "German",
    nativeName: "Deutsch",
    openGraphLocale: "de",
    url: "https://subtitle-editor.org/de",
    isRtl: false,
  },
  en: {
    name: "English",
    nativeName: "English",
    openGraphLocale: "en",
    url: "https://subtitle-editor.org",
    isRtl: false,
  },
  es: {
    name: "Spanish",
    nativeName: "Español",
    openGraphLocale: "es",
    url: "https://subtitle-editor.org/es",
    isRtl: false,
  },
  fr: {
    name: "French",
    nativeName: "Français",
    openGraphLocale: "fr",
    url: "https://subtitle-editor.org/fr",
    isRtl: false,
  },
  hi: {
    name: "Hindi",
    nativeName: "हिन्दी",
    openGraphLocale: "hi",
    url: "https://subtitle-editor.org/hi",
    isRtl: false,
  },
  mr: {
    name: "Marathi",
    nativeName: "मराठी",
    openGraphLocale: "mr",
    url: "https://subtitle-editor.org/mr",
    isRtl: false,
  },
  pl: {
    name: "Polish",
    nativeName: "Polski",
    openGraphLocale: "pl",
    url: "https://subtitle-editor.org/pl",
    isRtl: false,
  },
  pt: {
    name: "Portuguese",
    nativeName: "Português",
    openGraphLocale: "pt",
    url: "https://subtitle-editor.org/pt",
    isRtl: false,
  },
  ru: {
    name: "Russian",
    nativeName: "Русский",
    openGraphLocale: "ru",
    url: "https://subtitle-editor.org/ru",
    isRtl: false,
  },
  yue: {
    name: "Cantonese",
    nativeName: "粵文",
    openGraphLocale: "yue",
    url: "https://subtitle-editor.org/yue",
    isRtl: false,
  },
  zh: {
    name: "Chinese",
    nativeName: "简体中文",
    openGraphLocale: "zh",
    url: "https://subtitle-editor.org/zh",
    isRtl: false,
  },
};

export function isValidLocale(locale: string): locale is Locale {
  return locales.includes(locale as Locale);
}
