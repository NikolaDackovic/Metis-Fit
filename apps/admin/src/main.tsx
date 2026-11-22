import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { AppRouter } from './app/router';
import { ToastViewport } from './components/ui/Toast';
import { ApiError } from './lib/api';
import { useClubName } from './lib/club';

function ClubName() {
  useClubName();
  return null;
}
import { initAuth } from './lib/auth';
import { setupI18n } from './lib/i18n';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      // Never retry client errors (4xx): they will not fix themselves.
      retry: (count, error) =>
        !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
    },
  },
});

const [i18n] = await Promise.all([setupI18n(), initAuth()]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <ClubName />
        <AppRouter />
        <ToastViewport />
      </QueryClientProvider>
    </I18nextProvider>
  </StrictMode>,
);
