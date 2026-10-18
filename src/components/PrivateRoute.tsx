import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../firebaseConfig';
import { useMusicSessionReady } from '../utils/musicSession';


const PrivateRoute = ({ children }: { children: React.ReactElement }) => {
    const [user, loading] = useAuthState(auth);
    // Covers and audio load by cookie, so pages wait for it to be set.
    const musicReady = useMusicSessionReady();
  
    if (loading || (user && !musicReady)) return <div>Loading...</div>;
    if (!user) return <Navigate to="/login" replace />;
  
    return children;
  };
  
  export default PrivateRoute;