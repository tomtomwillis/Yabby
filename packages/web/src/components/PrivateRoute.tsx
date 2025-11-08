import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../firebaseConfig';


const PrivateRoute = ({ children }: { children: React.ReactElement }) => {
    const [user, loading] = useAuthState(auth);
  
    if (loading) return <div>Loading...</div>;
    if (!user) return <Navigate to="/login" replace />;
  
    return children;
  };
  
  export default PrivateRoute;