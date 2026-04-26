import { createContext, useContext } from "react";
import PropTypes from 'prop-types';

const translations = {
  en: { "files.newFolder": "New folder" },
  fr: { "files.newFolder": "Nouveau dossier" },
};

const TranslationContext = createContext(translations.en);

export const useTranslation = () => useContext(TranslationContext);

export const TranslationProvider = ({ children, locale = "en" }) => (
  <TranslationContext.Provider value={translations[locale]}>
    {children}
);

TranslationProvider.propTypes = {
  children: PropTypes.node.isRequired,
  locale: PropTypes.string,
};</TranslationContext.Provider>
);