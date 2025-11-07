import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';

export const defaultNS = 'common';
export const resources = {
    en: {
        common: en,
    },
} as const;

void i18n.use(initReactI18next).init({
    lng: 'en',
    fallbackLng: 'en',
    defaultNS,
    resources,
    interpolation: {
        escapeValue: false,
    },
});

export { i18n };
