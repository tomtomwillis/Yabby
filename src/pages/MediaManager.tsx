import React, { useState } from 'react';
import Header from '../components/basic/Header';
import { useMediaManager } from '../utils/useMediaManager';
import CoverArtTool from '../components/media/CoverArtTool';
import BeetsTerminal from '../components/media/BeetsTerminal';
import '../App.css';
import './MediaManager.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tab = 'coverart' | 'import';

const TABS: { key: Tab; label: string }[] = [
  { key: 'coverart', label: 'Cover Art' },
  { key: 'import', label: 'Beets Import' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const MediaManager: React.FC = () => {
  const { isMediaManager, loading } = useMediaManager();
  const [activeTab, setActiveTab] = useState<Tab>('coverart');

  if (loading) {
    return (
      <div className="app-container">
        <Header title="Media Manager" subtitle="Loading..." />
        <p style={{ textAlign: 'center', color: 'var(--colour2)', padding: '40px' }}>
          Checking permissions...
        </p>
      </div>
    );
  }

  if (!isMediaManager) {
    return (
      <div className="app-container">
        <Header title="Media Manager" subtitle="Access Denied" />
        <p style={{ textAlign: 'center', color: 'var(--colour5)', padding: '40px' }}>
          You do not have media manager permissions.
        </p>
      </div>
    );
  }

  return (
    <div className="app-container">
      <Header title="Media Manager" subtitle={TABS.find(t => t.key === activeTab)?.label ?? 'Media Manager'} />

      <div className="media-tabs">
        {TABS.map(tab => (
          <button
            key={tab.key}
            className={`media-tab ${activeTab === tab.key ? 'media-tab--active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="media-tab-content">
        {activeTab === 'coverart' && <CoverArtTool />}
        {activeTab === 'import' && <BeetsTerminal />}
      </div>
    </div>
  );
};

export default MediaManager;
