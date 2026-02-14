import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getAuth, sendPasswordResetEmail, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { sanitizeHtml } from '../utils/sanitise';
import Header from '../components/basic/Header';
import Button from '../components/basic/Button';
import MessageTextBox from '../components/basic/MessageTextBox';
import AvatarPreview from '../components/AvatarPreview';

const FLAG_OPTIONS: { flag: string; label: string }[] = [
  { flag: '', label: 'None' },
  { flag: '🇦🇷', label: 'Argentina' },
  { flag: '🇦🇺', label: 'Australia' },
  { flag: '🇦🇹', label: 'Austria' },
  { flag: '🇧🇩', label: 'Bangladesh' },
  { flag: '🇧🇪', label: 'Belgium' },
  { flag: '🇧🇷', label: 'Brazil' },
  { flag: '🇨🇦', label: 'Canada' },
  { flag: '🇨🇱', label: 'Chile' },
  { flag: '🇨🇳', label: 'China' },
  { flag: '🇨🇴', label: 'Colombia' },
  { flag: '🇨🇿', label: 'Czech Republic' },
  { flag: '🇩🇰', label: 'Denmark' },
  { flag: '🇪🇬', label: 'Egypt' },
  { flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', label: 'England' },
  { flag: '🇫🇮', label: 'Finland' },
  { flag: '🇫🇷', label: 'France' },
  { flag: '🇩🇪', label: 'Germany' },
  { flag: '🇬🇷', label: 'Greece' },
  { flag: '🇭🇺', label: 'Hungary' },
  { flag: '🇮🇳', label: 'India' },
  { flag: '🇮🇩', label: 'Indonesia' },
  { flag: '🇮🇪', label: 'Ireland' },
  { flag: '🇮🇱', label: 'Israel' },
  { flag: '🇮🇹', label: 'Italy' },
  { flag: '🇯🇵', label: 'Japan' },
  { flag: '🇰🇪', label: 'Kenya' },
  { flag: '🇰🇷', label: 'South Korea' },
  { flag: '🇲🇾', label: 'Malaysia' },
  { flag: '🇲🇽', label: 'Mexico' },
  { flag: '🇳🇱', label: 'Netherlands' },
  { flag: '🇳🇿', label: 'New Zealand' },
  { flag: '🇳🇬', label: 'Nigeria' },
  { flag: '🇳🇴', label: 'Norway' },
  { flag: '🇵🇰', label: 'Pakistan' },
  { flag: '🇵🇭', label: 'Philippines' },
  { flag: '🇵🇱', label: 'Poland' },
  { flag: '🇵🇹', label: 'Portugal' },
  { flag: '🇷🇴', label: 'Romania' },
  { flag: '🇷🇺', label: 'Russia' },
  { flag: '🇸🇦', label: 'Saudi Arabia' },
  { flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', label: 'Scotland' },
  { flag: '🇸🇬', label: 'Singapore' },
  { flag: '🇿🇦', label: 'South Africa' },
  { flag: '🇪🇸', label: 'Spain' },
  { flag: '🇸🇪', label: 'Sweden' },
  { flag: '🇨🇭', label: 'Switzerland' },
  { flag: '🇹🇭', label: 'Thailand' },
  { flag: '🇹🇷', label: 'Turkey' },
  { flag: '🇺🇦', label: 'Ukraine' },
  { flag: '🇬🇧', label: 'United Kingdom' },
  { flag: '🇺🇸', label: 'United States' },
  { flag: '🇻🇳', label: 'Vietnam' },
  { flag: '🏴󠁧󠁢󠁷󠁬󠁳󠁿', label: 'Wales' },
  { flag: '☘️', label: 'Ireland Shamrock' },
  { flag: '🏴‍☠️', label: 'Pirate' },
  { flag: '🏳️‍🌈', label: 'Rainbow' },
  { flag: '🌍', label: 'Globe Africa Europe' },
  { flag: '🌎', label: 'Globe Americas' },
  { flag: '🌏', label: 'Globe Asia' },
];

const Profile: React.FC = () => {
  const auth = getAuth();
  const user = auth.currentUser;
  const [username, setUsername] = useState('');
  const [selectedColor, setSelectedColor] = useState('blue');
  const [selectedShape, setSelectedShape] = useState('star');
  const [avatar, setAvatar] = useState('/Stickers/avatar_star_blue.webp');
  const [loading, setLoading] = useState(true);

  const [passwordResetLoading, setPasswordResetLoading] = useState(false);
  const [passwordResetMessage, setPasswordResetMessage] = useState('');
  const [passwordResetSuccess, setPasswordResetSuccess] = useState(false);

  const [bio, setBio] = useState('');
  const [locationFlag, setLocationFlag] = useState('');
  const [locationText, setLocationText] = useState('');

  const [isEditing, setIsEditing] = useState(false);
  const [editUsername, setEditUsername] = useState('');
  const [editColor, setEditColor] = useState('blue');
  const [editShape, setEditShape] = useState('star');
  const [editAvatar, setEditAvatar] = useState('/Stickers/avatar_star_blue.webp');
  const [editBio, setEditBio] = useState('');
  const [editLocationFlag, setEditLocationFlag] = useState('');
  const [editLocationText, setEditLocationText] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [flagSearch, setFlagSearch] = useState('');
  const [flagDropdownOpen, setFlagDropdownOpen] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      const currentUser = auth.currentUser;
      if (currentUser) {
        try {
          const userDoc = doc(db, 'users', currentUser.uid);
          const docSnap = await getDoc(userDoc);

          if (docSnap.exists()) {
            const data = docSnap.data();
            const fetchedUsername = data.username || '';
            const fetchedColor = data.color || 'blue';
            const fetchedShape = data.shape || 'star';
            const fetchedAvatar = data.avatar || `/Stickers/avatar_${fetchedShape}_${fetchedColor}.webp`;

            setUsername(fetchedUsername);
            setSelectedColor(fetchedColor);
            setSelectedShape(fetchedShape);
            setAvatar(fetchedAvatar);
            setBio(data.bio || '');
            setLocationFlag(data.locationFlag || '');
            setLocationText(data.locationText || '');
          }
        } catch (error) {
          console.error('Error fetching profile:', error);
        }
      }
      setLoading(false);
    };

    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        fetchProfile();
      } else {
        setLoading(false);
      }
    });

    fetchProfile();
    return () => unsubscribe();
  }, []);

  const handleStartEditing = () => {
    setEditUsername(username);
    setEditColor(selectedColor);
    setEditShape(selectedShape);
    setEditAvatar(avatar);
    setEditBio(bio);
    setEditLocationFlag(locationFlag);
    setEditLocationText(locationText);
    setIsEditing(true);
    setSaveMessage('');
  };

  const handleCancel = () => {
    setIsEditing(false);
    setFlagDropdownOpen(false);
    setFlagSearch('');
    setSaveMessage('');
  };

  const handleSave = async () => {
    if (!user) return;

    setSaving(true);
    setSaveMessage('');
    setSaveSuccess(false);

    try {
      const sanitizedBio = sanitizeHtml(editBio.trim());
      const sanitizedLocationText = sanitizeHtml(editLocationText.trim());
      const userDoc = doc(db, 'users', user.uid);
      await setDoc(
        userDoc,
        {
          username: editUsername,
          color: editColor,
          shape: editShape,
          avatar: editAvatar,
          bio: sanitizedBio,
          locationFlag: editLocationFlag,
          locationText: sanitizedLocationText,
        },
        { merge: true }
      );

      setUsername(editUsername);
      setSelectedColor(editColor);
      setSelectedShape(editShape);
      setAvatar(editAvatar);
      setBio(sanitizedBio);
      setLocationFlag(editLocationFlag);
      setLocationText(sanitizedLocationText);
      setIsEditing(false);
      setFlagDropdownOpen(false);
      setFlagSearch('');
      setSaveMessage('Profile updated!');
      setSaveSuccess(true);

      setTimeout(() => {
        setSaveMessage('');
        setSaveSuccess(false);
      }, 3000);
    } catch (error) {
      console.error('Error saving profile:', error);
      setSaveMessage('Failed to save. Please try again.');
      setSaveSuccess(false);

      setTimeout(() => {
        setSaveMessage('');
      }, 5000);
    } finally {
      setSaving(false);
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
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const filteredFlags = FLAG_OPTIONS.filter((opt) =>
    opt.label.toLowerCase().includes(flagSearch.toLowerCase())
  );

  if (loading) {
    return <div>Loading...</div>;
  }

  const hasLocation = locationFlag || locationText;

  return (
    <div className="Page">
      <Header title="Profile Settings" subtitle="Edit Your Profile" />

      {user && (
        <div style={{ textAlign: 'center', marginBottom: '16px' }}>
          <Link
            to={`/user/${user.uid}`}
            style={{
              color: 'var(--colour3)',
              textDecoration: 'none',
              fontFamily: 'var(--font2)',
              fontSize: '0.9em',
            }}
          >
            View your public profile page
          </Link>
        </div>
      )}

      <div className="profile-container">
        <div className="form-group">
          {isEditing ? (
            /* ── EDIT MODE ── */
            <div>
              <label>Username:</label>
              <MessageTextBox
                placeholder="Change Username..."
                value={editUsername}
                onChange={setEditUsername}
                maxWords={5}
                showSendButton={false}
                showCounter={false}
                className="form-input"
              />

              <div style={{ height: '1rem' }}></div>

              <AvatarPreview
                selectedColor={editColor}
                selectedShape={editShape}
                avatar={editAvatar}
                onColorChange={setEditColor}
                onShapeChange={setEditShape}
                onAvatarChange={setEditAvatar}
              />

              <div style={{ height: '1rem' }}></div>

              <label>Bio:</label>
              <MessageTextBox
                placeholder="Write something about yourself..."
                value={editBio}
                onChange={setEditBio}
                maxWords={100}
                showSendButton={false}
                showCounter={true}
                rows={3}
              />

              <div style={{ height: '0.75rem' }}></div>

              {/* Dashed separator */}
              <div style={{
                borderBottom: '4px dashed var(--colour2)',
                marginBottom: '6px',
                width: '100%',
              }} />

              <div style={{ height: '0.5rem' }}></div>

              <label style={{
                fontFamily: 'var(--font2)',
                fontSize: '0.85em',
                display: 'block',
                marginBottom: '6px',
              }}>
                Location:
              </label>

              {/* Flag searchable dropdown */}
              <div style={{ position: 'relative', marginBottom: '10px' }}>
                <div
                  onClick={() => setFlagDropdownOpen(!flagDropdownOpen)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    border: '1px solid var(--colour2)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontFamily: 'var(--font2)',
                    fontSize: '0.95em',
                    backgroundColor: 'var(--colour4)',
                    color: 'var(--colour5)',
                  }}
                >
                  <span style={{ fontSize: '1.4em' }}>{editLocationFlag || '🏳️'}</span>
                  <span>{FLAG_OPTIONS.find(f => f.flag === editLocationFlag)?.label || 'Select a flag...'}</span>
                </div>

                {flagDropdownOpen && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    zIndex: 10,
                    backgroundColor: 'var(--colour4)',
                    border: '1px solid var(--colour2)',
                    borderRadius: '8px',
                    marginTop: '4px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    maxHeight: '200px',
                    overflowY: 'auto',
                  }}>
                    <div style={{ padding: '8px', position: 'sticky', top: 0, backgroundColor: 'var(--colour4)', zIndex: 1 }}>
                      <input
                        type="text"
                        placeholder="Search country..."
                        value={flagSearch}
                        onChange={(e) => setFlagSearch(e.target.value)}
                        autoFocus
                        style={{
                          width: '100%',
                          padding: '6px 10px',
                          border: '1px solid var(--colour2)',
                          borderRadius: '6px',
                          fontFamily: 'var(--font2)',
                          fontSize: '0.9em',
                          boxSizing: 'border-box',
                          outline: 'none',
                        }}
                      />
                    </div>
                    {filteredFlags.map((opt, i) => (
                      <div
                        key={i}
                        onClick={() => {
                          setEditLocationFlag(opt.flag);
                          setFlagDropdownOpen(false);
                          setFlagSearch('');
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '8px 12px',
                          cursor: 'pointer',
                          backgroundColor: editLocationFlag === opt.flag ? 'var(--colour2)' : 'transparent',
                          color: editLocationFlag === opt.flag ? 'var(--colour4)' : 'var(--colour5)',
                          fontFamily: 'var(--font2)',
                          fontSize: '0.9em',
                          transition: 'background-color 0.15s ease',
                        }}
                        onMouseEnter={(e) => {
                          if (editLocationFlag !== opt.flag) {
                            e.currentTarget.style.backgroundColor = 'rgba(0,0,255,0.08)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (editLocationFlag !== opt.flag) {
                            e.currentTarget.style.backgroundColor = 'transparent';
                          }
                        }}
                      >
                        <span style={{ fontSize: '1.3em' }}>{opt.flag || '✕'}</span>
                        <span>{opt.label}</span>
                      </div>
                    ))}
                    {filteredFlags.length === 0 && (
                      <div style={{
                        padding: '12px',
                        textAlign: 'center',
                        color: 'var(--colour5)',
                        opacity: 0.6,
                        fontFamily: 'var(--font2)',
                        fontSize: '0.85em',
                      }}>
                        No matches found
                      </div>
                    )}
                  </div>
                )}
              </div>

              <MessageTextBox
                placeholder="City, country, etc..."
                value={editLocationText}
                onChange={setEditLocationText}
                maxWords={10}
                showSendButton={false}
                showCounter={true}
                rows={1}
              />

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '16px' }}>
                <Button
                  type="basic"
                  label={saving ? 'Saving...' : 'Save'}
                  onClick={handleSave}
                  disabled={saving}
                />
                <button
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--colour2)',
                    color: 'var(--colour2)',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontFamily: 'var(--font2)',
                    fontSize: '0.85em',
                  }}
                  onClick={handleCancel}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            /* ── READ-ONLY MODE ── */
            <div style={{ textAlign: 'center' }}>
              {/* Avatar */}
              <div style={{ marginBottom: '12px' }}>
                {avatar && (
                  <img
                    src={avatar}
                    alt={`${username}'s avatar`}
                    style={{ width: '100px', height: '100px', objectFit: 'cover' }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                )}
              </div>

              {/* Username */}
              <p style={{
                fontFamily: 'var(--font1)',
                fontSize: '1.4em',
                fontWeight: 'bold',
                color: 'var(--colour2)',
                margin: '0 0 12px 0',
              }}>
                {username || 'Anonymous'}
              </p>

              {/* Bio + Location box */}
              <div style={{
                backgroundColor: 'var(--colour2)',
                color: 'var(--colour4)',
                borderRadius: '12px',
                padding: '16px',
                maxWidth: '600px',
                margin: '0 auto',
              }}>
                {bio ? (
                  <p style={{
                    fontFamily: 'var(--font2)',
                    lineHeight: '1.6',
                    whiteSpace: 'pre-wrap',
                    margin: 0,
                  }}>
                    {bio}
                  </p>
                ) : (
                  <p style={{
                    fontFamily: 'var(--font2)',
                    fontStyle: 'italic',
                    opacity: 0.6,
                    margin: 0,
                  }}>
                    No bio yet.
                  </p>
                )}

                {hasLocation && (
                  <>
                    {/* Dashed separator */}
                    <div style={{
                      borderBottom: '4px dashed var(--colour4)',
                      width: '60%',
                      margin: '12px auto',
                      opacity: 0.4,
                    }} />
                    <p style={{
                      fontFamily: 'var(--font2)',
                      fontSize: '1em',
                      margin: 0,
                    }}>
                      {locationFlag && <span style={{ fontSize: '1.4em', marginRight: '8px' }}>{locationFlag}</span>}
                      {locationText}
                    </p>
                  </>
                )}
              </div>

              <div style={{ marginTop: '12px' }}>
                <Button
                  type="basic"
                  label="Edit Profile"
                  onClick={handleStartEditing}
                  className="submit-button center-button"
                />
              </div>

              {saveMessage && (
                <div
                  style={{
                    marginTop: '10px',
                    padding: '12px',
                    borderRadius: '8px',
                    backgroundColor: saveSuccess ? '#d4edda' : '#f8d7da',
                    color: saveSuccess ? '#155724' : '#721c24',
                    border: `1px solid ${saveSuccess ? '#c3e6cb' : '#f5c6cb'}`,
                    textAlign: 'center',
                    fontSize: '14px',
                    fontWeight: '500',
                  }}
                >
                  {saveMessage}
                </div>
              )}
            </div>
          )}
        </div>

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
