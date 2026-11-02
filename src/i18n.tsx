import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DatesProvider } from '@mantine/dates';
import 'dayjs/locale/ru';
import 'dayjs/locale/es';
import {
  chooseLanguage,
  formatDate,
  formatNumber,
  intlLocales,
  reviewLanguageName,
  translate,
  type Language,
} from '../shared/i18n.ts';

function initialLanguage(): Language {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem('steam-review-lab.language');
  } catch {
    /* Storage may be disabled. */
  }
  return chooseLanguage(saved, navigator.languages ?? [navigator.language]);
}
function useLanguageState() {
  const [language, updateLanguage] = useState<Language>(initialLanguage);
  const setLanguage = useCallback((value: Language) => {
    updateLanguage(value);
    try {
      localStorage.setItem('steam-review-lab.language', value);
    } catch {
      /* Switching works without persistence. */
    }
  }, []);
  const t = useCallback(
    (key: string, args: readonly unknown[] = []) => translate(language, key, args),
    [language],
  );
  const n = useCallback(
    (value: number | null | undefined) => formatNumber(language, value),
    [language],
  );
  const fmt = useCallback((value: number) => formatDate(language, value), [language]);
  const utcDay = useCallback((value: number) => formatDate(language, value, true), [language]);
  const languageName = useCallback(
    (code: string) => reviewLanguageName(language, code),
    [language],
  );
  const numberSymbols = useMemo(() => {
    const parts = new Intl.NumberFormat(intlLocales[language]).formatToParts(12345.6);
    return {
      group: parts.find((part) => part.type === 'group')?.value ?? ',',
      decimal: parts.find((part) => part.type === 'decimal')?.value ?? '.',
    };
  }, [language]);
  const calendarLabels = useMemo(
    () => ({
      nextMonth: t('Следующий месяц'),
      previousMonth: t('Предыдущий месяц'),
      nextYear: t('Следующий год'),
      previousYear: t('Предыдущий год'),
      nextDecade: t('Следующее десятилетие'),
      previousDecade: t('Предыдущее десятилетие'),
      monthLevelControl: t('Месяц'),
      yearLevelControl: t('Год'),
    }),
    [t],
  );
  const pageItemProps = useCallback(
    (page: number) => ({ 'aria-label': t('Страница {0}', [n(page)]) }),
    [t, n],
  );
  const pageControlProps = useCallback(
    (control: 'first' | 'previous' | 'next' | 'last') => ({
      'aria-label': t(
        {
          first: 'Первая страница',
          previous: 'Предыдущая страница',
          next: 'Следующая страница',
          last: 'Последняя страница',
        }[control],
      ),
    }),
    [t],
  );
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  return useMemo(
    () => ({
      language,
      setLanguage,
      t,
      n,
      fmt,
      utcDay,
      calendarLabels,
      languageName,
      numberSymbols,
      pageItemProps,
      pageControlProps,
      locale: intlLocales[language],
    }),
    [
      language,
      setLanguage,
      t,
      n,
      fmt,
      utcDay,
      calendarLabels,
      languageName,
      numberSymbols,
      pageItemProps,
      pageControlProps,
    ],
  );
}
type I18n = ReturnType<typeof useLanguageState>;
const I18nContext = createContext<I18n | null>(null);
export function I18nProvider({ children }: { children: React.ReactNode }) {
  const value = useLanguageState();
  return (
    <I18nContext.Provider value={value}>
      <DatesProvider settings={{ locale: value.language, firstDayOfWeek: 1, weekendDays: [0, 6] }}>
        {children}
      </DatesProvider>
    </I18nContext.Provider>
  );
}
export function useI18n(): I18n {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n requires I18nProvider');
  return value;
}
