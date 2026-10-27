import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './mobile.css';
import { LanguageProvider } from './i18n';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element was not found.');

createRoot(rootElement).render(<React.StrictMode><LanguageProvider><App /></LanguageProvider></React.StrictMode>);
