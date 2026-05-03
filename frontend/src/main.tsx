import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';

import App from './app/App';
import { AuthProvider } from './lib/auth/AuthContext';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
          <Toaster
            position="top-right"
            richColors
            closeButton
            toastOptions={{
              style: { fontFamily: 'inherit' },
            }}
            // The close-button anchor (top-right, inside the toast) is set in
            // src/index.css under the [data-sonner-toaster] selector — the
            // documented CSS variables don't override the default
            // `top: 0; transform: translate(-50%, -50%)` that puts the
            // button OUTSIDE the box, so we override the rule directly.
            style={{
              ['--width' as any]: '380px',
            }}
          />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
