import React from 'react';
import Header from '../components/basic/Header';
import CopypartyUpload from '../components/CopypartyUpload';
import '../components/CopypartyUpload.css';


const Upload: React.FC = () => {
    return (
        <div className="upload-page-container">
          <Header title="Upload" subtitle="Upload your files" />
          <div className="upload-iframe-wrapper">
            <CopypartyUpload height="100%" />
          </div>
        </div>
      );
};

export default Upload;