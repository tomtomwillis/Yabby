import React, { useState } from 'react';
import Header from '../components/basic/Header';
import CopypartyUpload from '../components/CopypartyUpload';
import '../components/CopypartyUpload.css';
import '../components/WikiParser.css';

const Upload: React.FC = () => {
  const [isTipsOpen, setIsTipsOpen] = useState(false);

  const toggleTips = () => {
    setIsTipsOpen(!isTipsOpen);
  };

  return (
    <div className="upload-page-container">
      <Header title="Upload" subtitle="Upload your files" />
      
      

      <div className="upload-iframe-wrapper">
        <CopypartyUpload height="100%" />
      </div>
      {/* Expandable Tips Section */}
      <div className="wiki-collapsible" style={{ maxWidth: '800px', margin: '0 auto 20px auto' }}>
        <div className="wiki-section">
          <h1 
            className={`wiki-section-header ${isTipsOpen ? 'open' : ''}`}
            onClick={toggleTips}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleTips();
              }
            }}
          >
            <span className="wiki-section-title">Upload tips to help processing!</span>
            <span className="wiki-section-arrow">
              {isTipsOpen ? '▼' : '▶'}
            </span>
          </h1>
          
          <div className={`wiki-section-content ${isTipsOpen ? 'open' : 'collapsed'}`}>
            <p>
              For each album you want to upload, add it as a folder, rather than uploading the audio files individually. Please only upload complete albums - no missing tracks!! </p>
            <p>
              320kbps MP3s work best - please don't upload anything lower in quality unless this is unavoidable. Higher quality files ie. flacs, WAVs etc. will be re-encoded to MP3 on import to the library.
            </p>
            <p>
              Cover art should be included if possible. Please upload this as <b>cover.jpg</b> inside each albums folder.
            </p>
            <p>
              You can upload multiple albums at a time, just add multiple folders!
            </p>
            <p>

            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Upload;