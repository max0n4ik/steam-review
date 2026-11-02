import { Alert, Divider, Stack } from '@mantine/core';
import type { Job } from '../shared/types.ts';
import AppHeader from './components/app/AppHeader.tsx';
import QueryForm from './components/app/QueryForm.tsx';
import SessionHistory from './components/app/SessionHistory.tsx';
import DownloadStatus from './components/app/DownloadStatus.tsx';
import AnalysisContent from './components/app/AnalysisContent.tsx';
import AppFooter from './components/app/AppFooter.tsx';
import DeleteSessionDialog from './components/app/DeleteSessionDialog.tsx';
import { useReviewQuery } from './hooks/useReviewQuery.ts';
import { useReviewSessions } from './hooks/useReviewSessions.ts';
import { useI18n } from './i18n.tsx';

export default function App() {
  const { t } = useI18n();
  const sessions = useReviewSessions();
  const query = useReviewQuery(sessions.setError);
  const busy = sessions.busy || query.busy;

  async function openSession(job: Job) {
    query.clearPreview();
    await sessions.openSession(job);
  }

  return (
    <div className="app">
      <AppHeader />
      <div className="workspace">
        <aside className="sidebar">
          <Stack gap="lg">
            <QueryForm
              form={query}
              busy={busy}
              downloading={sessions.job?.status === 'running'}
              onDownload={() => query.download(sessions.start)}
            />
            <Divider />
            <SessionHistory
              history={sessions.history}
              currentId={sessions.job?.id}
              onOpen={openSession}
              onDelete={sessions.requestDelete}
              onRefresh={sessions.refreshHistory}
            />
          </Stack>
        </aside>
        <main className="content">
          <Stack gap="lg">
            {sessions.error && (
              <Alert
                color="red"
                title={t('Не удалось выполнить действие')}
                withCloseButton
                closeButtonLabel={t('Закрыть')}
                onClose={() => sessions.setError('')}
              >
                {t(sessions.error)}
              </Alert>
            )}
            {sessions.job && (
              <DownloadStatus
                job={sessions.job}
                busy={busy}
                loadingRows={sessions.loadingRows}
                onAction={sessions.changeStatus}
                onLoadRows={sessions.loadRows}
              />
            )}
            <AnalysisContent
              job={sessions.job}
              rows={sessions.rows}
              loadingRows={sessions.loadingRows}
            />
            <AppFooter />
          </Stack>
        </main>
      </div>
      <DeleteSessionDialog
        job={sessions.pendingDelete}
        busy={busy}
        onCancel={sessions.cancelDelete}
        onConfirm={sessions.confirmDelete}
      />
    </div>
  );
}
