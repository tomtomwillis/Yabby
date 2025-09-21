import React from 'react';
import Header from '../components/basic/Header';

const Upload: React.FC = () => {
    return (
        <div className="app-container">
          <Header title="Upload" subtitle="Upload your files" />
          <p style={{ textAlign: 'center', marginTop: '20px', color: 'gray' }}>
            This page is a work in progress. Come back later!
          </p>
        </div>
      );
};

export default Upload;