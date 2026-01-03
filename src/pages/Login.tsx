import React, { useEffect, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { auth } from '../firebaseConfig';
import { useRateLimit } from '../utils/useRateLimit.ts';
import BackgroundStar from '../components/basic/Star';
import { useAuthState } from 'react-firebase-hooks/auth';
import Button from '../components/basic/Button';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [user] = useAuthState(auth);

  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [passwordResetLoading, setPasswordResetLoading] = useState(false);
  const [passwordResetMessage, setPasswordResetMessage] = useState('');
  const [passwordResetSuccess, setPasswordResetSuccess] = useState(false);

  // Rate limiting: 5 attempts per 15 minutes
  const { checkRateLimit, getRemainingAttempts, reset } = useRateLimit({
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
  });
  
  useEffect(() => {
    if (auth.currentUser) {
      navigate('/');
    }
  }, [navigate]);

  const handleSubmit = async (
    e: React.FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();

    // Check rate limit BEFORE attempting login
    if (!checkRateLimit()) {
      const remaining = getRemainingAttempts();
      setError(
        `Too many login attempts. Please wait 15 minutes before trying again. `
      );
      return;
    }
    console.log('Login form submitted');
    console.log('Email:', email, 'Password:', password);

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await signInWithEmailAndPassword(auth, email, password);
      console.log('User logged in successfully');
      reset();
      navigate('/');
    } catch (error) {
      console.error('Login failed:', error);
      
      // Show remaining attempts in error message
      const remaining = getRemainingAttempts();
      
      if (error instanceof Error) {
        // Customize error messages to be more user-friendly
        let errorMessage = 'Login failed. ';
        
        if (error.message.includes('wrong-password') || error.message.includes('user-not-found')) {
          errorMessage += 'Invalid email or password. ';
        } else if (error.message.includes('too-many-requests')) {
          errorMessage += 'Too many failed attempts. Your account has been temporarily locked. ';
        } else {
          errorMessage += 'Please try again. ';
        }

        setError(errorMessage);
      } else {
        setError('An unknown error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!resetEmail) {
      setPasswordResetMessage('Please enter your email address.');
      setPasswordResetSuccess(false);
      return;
    }

    setPasswordResetLoading(true);
    setPasswordResetMessage('');

    try {
      await sendPasswordResetEmail(auth, resetEmail);
      setPasswordResetMessage(
        `If an account exists with ${resetEmail}, a password reset email has been sent.`
      );
      setPasswordResetSuccess(true);
    } catch (error) {
      console.error('Error with password reset:', error);
      setPasswordResetMessage(
        'Failed to send password reset email. Please try again.'
      );
      setPasswordResetSuccess(false);
    } finally {
      setPasswordResetLoading(false);
    }
  };

  const togglePasswordReset = () => {
    setShowPasswordReset(!showPasswordReset);
    setPasswordResetMessage('');
    if (!showPasswordReset) {
      setResetEmail(email);
    }
  };

  if (user) return <Navigate to="/" replace />;

  return (
    <div className="Page">
      <BackgroundStar />

      <h1 className="title1centred">Welcome to YabbyVille</h1>
      <h2 className="header">Login</h2>

      <form onSubmit={handleSubmit} className="login-form">
        <div className="form-group" style={{ marginBottom: '20px' }}>
          <div className="textbox-container">
            <div className="input-area">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => {
                  console.log('Email entered:', e.target.value);
                  setEmail(e.target.value);
                }}
                disabled={loading}
                autoComplete="email"
                className="text-input form-input"
              />
            </div>
          </div>
        <div className="form-group" style={{ marginBottom: '20px' }}>
          <div className="textbox-container">
            <div className="input-area">
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => {
                  console.log('Password entered:', e.target.value);
                  setPassword(e.target.value);
                }}
                disabled={loading}
                className="text-input form-input"
              />
            </div>
          </div>
        </div>
      </div>

        {error && <div className="error-message">{error}</div>}

        <Button
          type="basic"
          htmlType="submit"
          disabled={loading}
          className={`submit-button ${loading ? 'loading' : ''} center-button`}
          label={loading ? 'Loading...' : 'Login'}
        />

        <div style={{ marginTop: '20px', textAlign: 'center' }}>
          <Button
            type="basic"
            onClick={togglePasswordReset}
            className="link-button center-button"
            label={
              showPasswordReset ? 'Hide Password Reset' : 'Forgot Password?'
            }
          />
        </div>
      </form>

      {showPasswordReset && (
        <div style={{ marginTop: '20px', padding: '20px', border: '1px solid #ddd', borderRadius: '4px' }}>
          <h3 style={{ marginBottom: '15px', fontSize: '16px' }}>Reset Password</h3>
          <div className="form-group" style={{ marginBottom: '20px' }}>
            <input
              type="email"
              placeholder="Enter your email address"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              disabled={passwordResetLoading}
              autoComplete="email"
              className="form-input"
            />
          </div>
          <Button
            type="basic"
            onClick={handlePasswordReset}
            disabled={passwordResetLoading}
            className="submit-button center-button"
            label={passwordResetLoading ? 'Sending...' : 'Send Password Reset Email'}
          />
          {passwordResetMessage && (
            <div
              style={{
                marginTop: '10px',
                padding: '8px',
                borderRadius: '4px',
                backgroundColor: passwordResetSuccess ? '#d4edda' : '#f8d7da',
                color: passwordResetSuccess ? '#155724' : '#721c24',
                border: `1px solid ${
                  passwordResetSuccess ? '#c3e6cb' : '#f5c6cb'
                }`,
              }}
            >
              {passwordResetMessage}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Login;