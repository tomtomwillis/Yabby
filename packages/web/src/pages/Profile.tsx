import React, { useState, useEffect } from 'react';
import { getAuth, sendPasswordResetEmail, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import Header from '../components/basic/Header';
import Button from '../components/basic/Button';
import MessageTextBox from '../components/basic/MessageTextBox';
import AvatarPreview from '../components/AvatarPreview';

const Profile: React.FC = () => {
  const auth = getAuth();
  const user = auth.currentUser;
  const [username, setUsername] = useState('');
  const [selectedColor, setSelectedColor] = useState('blue'); // Default color
  const [selectedShape, setSelectedShape] = useState('star'); // Default shape
  const [avatar, setAvatar] = useState('/Stickers/avatar_star_blue.webp'); // Set default avatar immediately
  const [loading, setLoading] = useState(true);

  const [passwordResetLoading, setPasswordResetLoading] = useState(false);
  const [passwordResetMessage, setPasswordResetMessage] = useState('');
  const [passwordResetSuccess, setPasswordResetSuccess] = useState(false);

  const [updateLoading, setUpdateLoading] = useState(false);
  const [updateMessage, setUpdateMessage] = useState('');
  const [updateSuccess, setUpdateSuccess] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      console.log('fetchProfile called, user:', user); // Debug log
      
      // Wait for auth to be ready
      const currentUser = auth.currentUser;
      console.log('Current user from auth:', currentUser); // Debug log
      
      if (currentUser) {
        try {
          console.log('Fetching profile for user:', currentUser.uid); // Debug log
          const userDoc = doc(db, 'users', currentUser.uid);
          const docSnap = await getDoc(userDoc);

          if (docSnap.exists()) {
            const data = docSnap.data();
            console.log('Fetched user data:', data); // Debug log
            
            const fetchedUsername = data.username || '';
            const fetchedColor = data.color || 'blue';
            const fetchedShape = data.shape || 'star';
            const fetchedAvatar = data.avatar || `/Stickers/avatar_${fetchedShape}_${fetchedColor}.webp`;
            
            setUsername(fetchedUsername);
            setSelectedColor(fetchedColor);
            setSelectedShape(fetchedShape);
            setAvatar(fetchedAvatar);
            
            console.log('Set username to:', fetchedUsername); // Debug log
            console.log('Set avatar to:', fetchedAvatar); // Debug log
          } else {
            console.log('No user document found, using defaults'); // Debug log
            // Keep default values that were already set
          }
        } catch (error) {
          console.error('Error fetching profile:', error);
        }
      } else {
        console.log('No authenticated user found'); // Debug log
      }
      setLoading(false);
    };

    // Listen for auth state changes to ensure user is ready
    const unsubscribe = auth.onAuthStateChanged((user) => {
      console.log('Auth state changed, user:', user); // Debug log
      if (user) {
        fetchProfile();
      } else {
        setLoading(false);
      }
    });

    // Also try to fetch immediately in case auth is already ready
    fetchProfile();

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []); // Remove user dependency

  const handleSave = async () => {
    if (!user) return;

    setUpdateLoading(true);
    setUpdateMessage('');
    setUpdateSuccess(false);

    try {
      const userDoc = doc(db, 'users', user.uid);
      await setDoc(
        userDoc,
        { username, color: selectedColor, shape: selectedShape, avatar },
        { merge: true }
      );
      setUpdateMessage('Profile updated successfully!');
      setUpdateSuccess(true);
      
      // Clear message after 3 seconds
      setTimeout(() => {
        setUpdateMessage('');
        setUpdateSuccess(false);
      }, 3000);
    } catch (error) {
      console.error('Error updating profile:', error);
      setUpdateMessage('Failed to update profile. Please try again.');
      setUpdateSuccess(false);
      
      // Clear error message after 5 seconds
      setTimeout(() => {
        setUpdateMessage('');
      }, 5000);
    } finally {
      setUpdateLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!user || !user.email) {
      setPasswordResetMessage('No email found for current user.');
      setPasswordResetSuccess(false);
      return;
    }

    setPasswordResetLoading(true);
    setPasswordResetMessage('');

    try {
      await sendPasswordResetEmail(auth, user.email);
      setPasswordResetMessage(`Password reset email sent to ${user.email}`);
      setPasswordResetSuccess(true);
    } catch (error) {
      console.error('Error sending password reset email:', error);
      setPasswordResetMessage('Failed to send password reset email. Please try again.');
      setPasswordResetSuccess(false);
    } finally {
      setPasswordResetLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      console.log('User logged out successfully'); // Debug log
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  // Handle username changes from the MessageTextBox
  const handleUsernameChange = (newUsername: string) => {
    console.log('Username changed to:', newUsername); // Debug log
    setUsername(newUsername);
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  console.log('Rendering Profile with username:', username); // Debug log
  console.log('Rendering Profile with avatar:', avatar); // Debug log

  return (
    <div className="Page">
      <Header title="Profile" subtitle="Edit Your Profile" />
      
      <div className="profile-container">
        <div className="form-group">
          
          <label>Username:</label>
          
          <MessageTextBox
            placeholder="Change Username..."
            value={username}
            onChange={handleUsernameChange} // Use onChange instead of onSend
            onSend={handleUsernameChange} // Keep onSend as backup
            maxWords={5}
            showSendButton={false}
            showCounter={false}
            className="form-input"
          />
          
          <div style={{ height: '1rem' }}></div>

          <AvatarPreview
            selectedColor={selectedColor}
            selectedShape={selectedShape}
            avatar={avatar}
            onColorChange={setSelectedColor}
            onShapeChange={setSelectedShape}
            onAvatarChange={setAvatar}
          />
        </div>

        <div style={{ height: '1rem' }}></div>

        <Button
          label={updateLoading ? 'Updating...' : 'Update Profile'}
          onClick={handleSave}
          type="basic"
          className="submit-button center-button"
          disabled={updateLoading}
        />

        {updateMessage && (
          <div
            style={{
              marginTop: '10px',
              padding: '12px',
              borderRadius: '8px',
              backgroundColor: updateSuccess ? '#d4edda' : '#f8d7da',
              color: updateSuccess ? '#155724' : '#721c24',
              border: `1px solid ${updateSuccess ? '#c3e6cb' : '#f5c6cb'}`,
              textAlign: 'center',
              fontSize: '14px',
              fontWeight: '500',
            }}
          >
            {updateMessage}
          </div>
        )}

        <div style={{ height: '1rem' }}></div>

        <div className="form-group">
          <Button
            label={passwordResetLoading ? 'Sending...' : 'Send Password Reset Email'}
            onClick={handlePasswordReset}
            type="basic"
            className="submit-button center-button"
            disabled={passwordResetLoading || passwordResetSuccess}
          />
          {passwordResetMessage && (
            <div
              style={{
                marginTop: '10px',
                padding: '8px',
                borderRadius: '4px',
                backgroundColor: passwordResetSuccess ? '#d4edda' : '#f8d7da',
                color: passwordResetSuccess ? '#155724' : '#721c24',
                border: `1px solid ${passwordResetSuccess ? '#c3e6cb' : '#f5c6cb'}`,
              }}
            >
              {passwordResetMessage}
            </div>
          )}
        </div>

        <div style={{ height: '1rem' }}></div>


        <div className="form-group">
          <Button
            label="Log Out"
            onClick={handleLogout}
            type="basic"
            className="submit-button center-button"
          />
        </div>
      </div>
    </div>
  );
};

export default Profile;