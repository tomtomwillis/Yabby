import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import Header from '../components/basic/Header';
import Button from '../components/basic/Button';

const normalizeAvatarPath = (avatarPath: string): string => {
  if (!avatarPath) return '';
  const cleanPath = avatarPath.startsWith('/') ? avatarPath.substring(1) : avatarPath;
  if (cleanPath.startsWith('Stickers/')) return `/${cleanPath}`;
  if (cleanPath.includes('/')) return `/Stickers/${cleanPath.split('/').pop()}`;
  return `/Stickers/${cleanPath}`;
};

const UserProfile: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const [username, setUsername] = useState('');
  const [avatar, setAvatar] = useState('');
  const [bio, setBio] = useState('');
  const [locationFlag, setLocationFlag] = useState('');
  const [locationText, setLocationText] = useState('');
  const [loading, setLoading] = useState(true);
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchProfile = async () => {
      if (!userId) {
        setError('No user specified.');
        setLoading(false);
        return;
      }

      try {
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (userDoc.exists()) {
          const data = userDoc.data();
          setUsername(data.username || 'Anonymous');
          setAvatar(data.avatar || '');
          setBio(data.bio || '');
          setLocationFlag(data.locationFlag || '');
          setLocationText(data.locationText || '');
        } else {
          setError('User not found.');
        }

        setIsOwnProfile(auth.currentUser?.uid === userId);
      } catch (err) {
        console.error('Error fetching user profile:', err);
        setError('Failed to load profile.');
      } finally {
        setLoading(false);
      }
    };

    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        setIsOwnProfile(user.uid === userId);
      }
    });

    fetchProfile();
    return () => unsubscribe();
  }, [userId]);

  if (loading) {
    return (
      <div className="Page">
        <p style={{ textAlign: 'center', color: 'var(--colour2)', padding: '40px' }}>Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="Page">
        <Header title="Profile" subtitle="" />
        <p style={{ textAlign: 'center', color: 'var(--colour2)', padding: '40px' }}>{error}</p>
      </div>
    );
  }

  const normalizedAvatar = normalizeAvatarPath(avatar);

  return (
    <div className="Page">
      <Header title={username} subtitle="Public Profile" />

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        maxWidth: '600px',
        width: '100%',
        margin: '0 auto',
        padding: '20px',
      }}>
        {/* Avatar */}
        <div style={{ marginBottom: '16px' }}>
          {normalizedAvatar ? (
            <img
              src={normalizedAvatar}
              alt={`${username}'s avatar`}
              style={{ width: '120px', height: '120px', objectFit: 'cover' }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div style={{
              width: '120px',
              height: '120px',
              borderRadius: '50%',
              backgroundColor: 'var(--colour2)',
              color: 'var(--colour4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '3em',
              fontWeight: 'bold',
            }}>
              {username.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        {/* Bio + Location section */}
        <div style={{ width: '100%', marginTop: '20px' }}>
          <div style={{ textAlign: 'center' }}>
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
                  This user hasn't written a bio yet.
                </p>
              )}

              {(locationFlag || locationText) && (
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
          </div>
        </div>

        {/* Link to edit profile if own profile */}
        {isOwnProfile && (
          <div style={{ marginTop: '24px' }}>
            <Link to="/profile">
              <Button
                type="basic"
                label="Edit Profile"
                onClick={() => {}}
              />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserProfile;
