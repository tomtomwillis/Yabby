import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { doc } from 'firebase/firestore';
import { trackedGetDoc as getDoc } from '../utils/firestoreMetrics';
import { db } from '../firebaseConfig';
import Header from '../components/basic/Header';
import MessageBoard from '../components/MessageBoard';
import Tips from '../components/basic/Tips';
import './IssuesPage.css';

type IssueStatus = 'inprogress' | 'complete';

const TABS: { key: IssueStatus; label: string }[] = [
  { key: 'inprogress', label: 'In Progress' },
  { key: 'complete', label: 'Completed' },
];

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

  return (
    <div className="app-container">
      <Header title="Issues" subtitle="Report Bugs & Problems" />
      <Tips
        text={<>💡 <strong>Tip:</strong> Paste screenshots straight into the message box to include them in your report!</>}
        showOnMobile={true}
        showOnDesktop={true}
      />
      <div className="issues-tabs" role="tablist" aria-label="Issue status">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
            className={`issues-tab ${activeTab === tab.key ? 'issues-tab--active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <MessageBoard
        key={activeTab}
        collectionName="issues"
        enableReactions={true}
        enableReplies={true}
        enablePolls={false}
        enableFilmAnnounce={false}
        statusFilter={activeTab}
        showComposer={activeTab === 'inprogress'}
        highlightMessageId={deepLink && deepLink.status === activeTab ? deepLink.id : undefined}
      />
    </div>
  );
};

export default IssuesPage;
