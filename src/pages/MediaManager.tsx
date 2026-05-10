import React, { useState } from 'react';
import Header from '../components/basic/Header';
import { useMediaManager } from '../utils/useMediaManager';
import { MediaThemeProvider, useMediaTheme } from '../utils/useMediaTheme';
import CoverArtTool from '../components/media/CoverArtTool';
import BeetsTerminal from '../components/media/BeetsTerminal';
import MetadataEditor from '../components/media/MetadataEditor';
import '../components/media/mediaTheme.css';
import '../App.css';
import './MediaManager.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tab = 'coverart' | 'metadata' | 'import';

const TABS: { key: Tab; label: string }[] = [
  { key: 'coverart', label: 'Cover Art' },
  { key: 'metadata', label: 'Metadata Editor' },
  { key: 'import', label: 'Beets Import' },
];

// ---------------------------------------------------------------------------
// Themed surface — applies the active palette to its descendants
// ---------------------------------------------------------------------------

const ThemedSurface: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { theme } = useMediaTheme();
  return <div data-theme={theme}>{children}</div>;
};

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

      <MediaThemeProvider>
        <ThemedSurface>
          <div className="media-tabs" role="tablist" aria-label="Media tools">
            {TABS.map(tab => (
              <button
                key={tab.key}
                role="tab"
                aria-selected={activeTab === tab.key}
                className={`media-tab ${activeTab === tab.key ? 'media-tab--active' : ''}`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="media-tab-content">
            {activeTab === 'coverart' && <CoverArtTool />}
            {activeTab === 'metadata' && <MetadataEditor />}
            {activeTab === 'import' && <BeetsTerminal />}
          </div>

          {activeTab === 'coverart' && (
            <div style={{
              fontFamily: 'var(--font2)',
              fontSize: '0.8em',
              color: 'var(--colour5)',
              opacity: 0.75,
              textAlign: 'center',
              padding: '24px 20px',
            }}>
              Need help finding cover art? Try{' '}
              <a
                href="https://covers.musichoarders.xyz/"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--colour1)' }}
              >
                covers.musichoarders.xyz
              </a>
            </div>
          )}
        </ThemedSurface>
      </MediaThemeProvider>
    </div>
  );
};

export default MediaManager;
