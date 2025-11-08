import React, { useEffect, useState, useCallback } from 'react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import './CopypartyUpload.css';

interface CopypartyUploadProps {
  height?: string;
  baseUrl?: string;
}

const CopypartyUpload: React.FC<CopypartyUploadProps> = ({
  height = 'calc(100vh - 200px)', // Fill viewport minus header space
  baseUrl = import.meta.env.VITE_COPYPARTY_BASE_URL || import.meta.env.VITE_COPYPARTY_LOCAL_URL
}) => {
  const [authUrl, setAuthUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const MAX_RETRIES = 3;

  const establishSession = useCallback(async () => {
    try {
      const auth = getAuth();
      const user = auth.currentUser;

      if (!user) {
        setError('You must be logged in to upload files');
        setLoading(false);
        return;
      }

      // Get fresh token
      const token = await user.getIdToken(true);

      // Hide all UI elements except the uploader
      const uiParams = '&nombar&noacci&nosrvi&nonav&nolbar&noctxb&norepl';
      const uploadUrl = `${baseUrl}/uploads/?token=${token}${uiParams}`;

      setAuthUrl(uploadUrl);
      setLoading(false);
      setError(null);

    } catch (err) {
      console.error('Failed to establish upload session:', err);

      if (retryCount < MAX_RETRIES) {
        setRetryCount(prev => prev + 1);
        setTimeout(establishSession, 2000 * (retryCount + 1)); // Exponential backoff
      } else {
        setError('Failed to connect to upload server. Please refresh the page.');
        setLoading(false);
      }
    }
  }, [baseUrl, retryCount]);

  useEffect(() => {
    const auth = getAuth();

    // Listen for auth state changes
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        establishSession();
      } else {
        setError('Please log in to upload files');
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [establishSession]);

  // Handle iframe errors
  const handleIframeError = useCallback(() => {
    setError('Failed to load upload interface. Please check your connection.');
    setLoading(false);
  }, []);

  // Retry button handler
  const handleRetry = useCallback(() => {
    setRetryCount(0);
    setLoading(true);
    setError(null);
    establishSession();
  }, [establishSession]);

  if (loading) {
    return (
      <div className="copyparty-upload-loading" style={{ height }}>
        <div>
          <div className="copyparty-upload-loading-text">Loading upload interface...</div>
          <div className="copyparty-upload-loading-spinner-container">
            <div className="copyparty-upload-spinner"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="copyparty-upload-error" style={{ height }}>
        <div className="copyparty-upload-error-message">⚠️ {error}</div>
        <button onClick={handleRetry} className="copyparty-upload-retry-button">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="copyparty-upload-container" style={{ height }}>
      <iframe
        src={authUrl}
        className="copyparty-upload-iframe"
        title="File Upload Interface"
        onError={handleIframeError}
        allow="clipboard-write"
      />
    </div>
  );
};

export default CopypartyUpload;