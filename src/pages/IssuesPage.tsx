import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { doc } from 'firebase/firestore';
import { trackedGetDoc as getDoc } from '../utils/firestoreMetrics';
import { db } from '../firebaseConfig';
import Header from '../components/basic/Header';
import MessageBoard from '../components/MessageBoard';
import BoardsRail from '../components/BoardsRail';
import type { RailEntry } from '../components/BoardsRail';
import Tips from '../components/basic/Tips';
import './MessageBoardPage.css';
import './IssuesPage.css';

type IssueStatus = 'inprogress' | 'complete';

const STATUSES: { key: IssueStatus; label: string; note: string }[] = [
  { key: 'inprogress', label: 'in progress', note: 'still open' },
  { key: 'complete', label: 'completed', note: 'closed' },
];

const tip: React.ComponentProps<typeof Tips> = {
  text: <><span className="mb-tip-mark">tip ▸</span> paste a screenshot straight into the box to include it in the report</>,
  showOnMobile: true,
  showOnDesktop: true,
};

/* The same ledger as the three conversation boards — same components, same
   stylesheet — over the issues collection. The two statuses are the rail's
   tree rather than a row of tabs: one set with the one you are reading marked,
   which is what the rail already draws for the boards. */
const IssuesPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<IssueStatus>('inprogress');
  const [deepLink, setDeepLink] = useState<{ id: string; status: IssueStatus } | null>(null);
  const [searchParams] = useSearchParams();

  useEffect(() => {
    window.umami?.track?.('issues-open');
    const issueId = searchParams.get('issue');
    if (!issueId) return;
    // One read to learn which tab the linked issue lives on.
    getDoc(doc(db, 'issues', issueId))
      .then((snap) => {
        if (!snap.exists()) return;
        const status: IssueStatus = snap.data().status === 'complete' ? 'complete' : 'inprogress';
        setDeepLink({ id: issueId, status });
        setActiveTab(status);
      })
      .catch((error) => console.error('Error resolving linked issue:', error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const entries: RailEntry[] = useMemo(
    () =>
      STATUSES.map((status) => ({
        key: status.key,
        label: status.label,
        onSelect: () => setActiveTab(status.key),
      })),
    []
  );

  const note = STATUSES.find((status) => status.key === activeTab)?.note ?? '';

  return (
    <div className="app-container mb-board is-issues">
      <div className="mb-shell">
        <div className="mb-column">
          <Header title="Issues" subtitle="Report Bugs & Problems" />

          <BoardsRail current={activeTab} entries={entries} heading="status" />

          <Tips {...tip} />

          <MessageBoard
            key={activeTab}
            collectionName="issues"
            enableReactions={true}
            enableReplies={true}
            enablePolls={false}
            enableFilmAnnounce={false}
            showPosterStats={true}
            showComposerAvatar={true}
            replyPreviewCount={2}
            ledger={true}
            statusFilter={activeTab}
            showComposer={activeTab === 'inprogress'}
            highlightMessageId={deepLink && deepLink.status === activeTab ? deepLink.id : undefined}
            composerPlaceholder="Describe the problem..."
            listHeader={
              <div className="mb-board-bar">
                <span className="mb-board-bar-label">reports</span>
                <span className="mb-board-bar-rule" aria-hidden="true"></span>
                <span className="mb-board-bar-note">{note}</span>
              </div>
            }
          />
        </div>
      </div>
    </div>
  );
};

export default IssuesPage;
