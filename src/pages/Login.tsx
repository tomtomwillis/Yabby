import React, { useEffect, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebaseConfig';
import BackgroundStar from '../components/basic/Star';
import { useAuthState } from 'react-firebase-hooks/auth';
import Button from '../components/basic/Button';
import TextBox from '../components/basic/MessageTextBox';

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

  useEffect(() => {
    if (auth.currentUser) {
      navigate('/');
    }
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    console.log('Login form submitted'); // Debug log to check if the function is triggered
    console.log('Email:', email, 'Password:', password); // Debug log to check state values

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
      console.log('User logged in successfully'); // Debug log after successful login
      navigate('/');
    } catch (error) {
      console.error('Login failed:', error); // Debug log for errors
      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError('An unknown error occurred');
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
      setPasswordResetMessage(`If an account exists with ${resetEmail}, a password reset email has been sent.`);
      setPasswordResetSuccess(true);
    } catch (error) {
      console.error('Error with password reset:', error);
      setPasswordResetMessage('Failed to send password reset email. Please try again.');
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
        <div className="form-group">
          <TextBox
            placeholder="Email"
            onChange={(text) => {
              console.log('Email entered:', text); // Debug log to check the email value
              setEmail(text);
            }}
            disabled={loading}
            showSendButton={false}
            showCounter={false}
            maxWords={50}
            className="form-input"
          />
        </div>

        <div className="form-group" style={{ marginBottom: '20px' }}>
          <TextBox
            placeholder="Password"
            onChange={(text) => {
              console.log('Password entered:', text); // Debug log to check the password value
              setPassword(text);
            }}
            disabled={loading}
            showSendButton={false}
            showCounter={false}
            maxWords={50}
            className="form-input"
          />
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <Button
          type="basic"
          htmlType="submit" // Set the HTML type to "submit"
          disabled={loading}
          className={`submit-button ${loading ? 'loading' : ''} center-button`}
          label={loading ? 'Loading...' : 'Login'}
        />

        <div style={{ marginTop: '20px', textAlign: 'center' }}>
          <Button
            type="basic"
            onClick={togglePasswordReset}
            className="link-button center-button"
            label={showPasswordReset ? 'Hide Password Reset' : 'Forgot Password?'}
          />
        </div>
      </form>

      {showPasswordReset && (
        <div style={{ marginTop: '20px', padding: '20px', border: '1px solid #ddd', borderRadius: '4px' }}>
          <h3 style={{ marginBottom: '15px', fontSize: '16px' }}>Reset Password</h3>
          <div className="form-group" style={{ marginBottom: '20px' }}>
            <TextBox
              placeholder="Enter your email address"
              onSend={(text) => setResetEmail(text)}
              disabled={passwordResetLoading}
              showSendButton={false}
              showCounter={false}
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
                border: `1px solid ${passwordResetSuccess ? '#c3e6cb' : '#f5c6cb'}`
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