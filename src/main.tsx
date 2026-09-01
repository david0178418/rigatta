import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.tsx';
import { runAtlasValidationPage } from './export/atlas-validation-page.ts';
import './styles.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
	throw new Error('The application root element is missing.');
}

if (new URLSearchParams(window.location.search).has('atlas-validation')) {
	void runAtlasValidationPage();
} else {
	createRoot(rootElement).render(
		<StrictMode>
			<App />
		</StrictMode>
	);
}
