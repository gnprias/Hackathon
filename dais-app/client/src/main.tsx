import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PortalContainerProvider } from '@databricks/appkit-ui/react';
import './index.css';
import App from './App.tsx';
import { ErrorBoundary } from './ErrorBoundary.tsx';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <PortalContainerProvider container={rootElement}>
        <App />
      </PortalContainerProvider>
    </ErrorBoundary>
  </StrictMode>,
);
