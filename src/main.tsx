import React from 'react';
import ReactDOM from 'react-dom/client';
import { MantineProvider, createTheme } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import 'dayjs/locale/ru';
import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import './style.css';
import App from './App.tsx';

const theme = createTheme({
  primaryColor: 'teal',
  defaultRadius: 'sm',
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  headings: { fontFamily: 'inherit', fontWeight: '600' },
  components: {
    Button: { defaultProps: { fw: 500 } },
    Paper: { defaultProps: { withBorder: true } },
  },
});
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="light">
      <DatesProvider settings={{ locale: 'ru', firstDayOfWeek: 1, weekendDays: [0, 6] }}>
        <App />
      </DatesProvider>
    </MantineProvider>
  </React.StrictMode>,
);
