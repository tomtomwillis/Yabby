import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getAuth } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { updateDocShadowed, writeBatchShadowed } from '../api/shadow';
import { db } from '../firebaseConfig';
import { clearUserCache } from '../utils/userCache';
import { sanitizeHtml, sanitizeText } from '../utils/sanitise';
import Header from '../components/basic/Header';
import { readSocials } from '../utils/socials';
import { useAdmin } from '../utils/useAdmin';
import ProfileView from '../components/profile/ProfileView';
import ProfileEditForm from '../components/profile/ProfileEditForm';
import AccountSettings from '../components/profile/AccountSettings';
import {
  EMPTY_PROFILE,
  PRONOUNS_MAX,
  draftFrom,
  sameSocials,
  validateProfileDraft,
  type ProfileDraft,
  type SavedProfile,
} from '../components/profile/profileDraft';
import './Profile.css';

const Profile: React.FC = () => {
  const auth = getAuth();
  const user = auth.currentUser;
  const [profile, setProfile] = useState<SavedProfile>(EMPTY_PROFILE);
  /** The edit form's copy while editing; null when not. */
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const nextSocialId = useRef(0);
  const [avatarBroken, setAvatarBroken] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [limitError, setLimitError] = useState('');
  const [nekoEnabled, setNekoEnabled] = useState(false);
  const [designToolEnabled, setDesignToolEnabled] = useState(false);
  const { isAdmin } = useAdmin();

  useEffect(() => {
    const fetchProfile = async () => {
      const currentUser = auth.currentUser;
      if (currentUser) {
        try {
          const userDoc = doc(db, 'users', currentUser.uid);
          const docSnap = await getDoc(userDoc);

          if (docSnap.exists()) {
            const data = docSnap.data();
            const color = data.color || 'blue';
            const shape = data.shape || 'star';

            setProfile({
              username: data.username || '',
              color,
              shape,
              avatar: data.avatar || `/Stickers/avatar_${shape}_${color}.webp`,
              bio: data.bio || '',
              pronouns: typeof data.pronouns === 'string' ? data.pronouns : '',
              siteUrl: data.siteUrl || '',
              locationFlag: data.locationFlag || '',
              locationText: data.locationText || '',
              socials: readSocials(data.socials),
            });
            setAvatarBroken(false);
            setNekoEnabled(data.nekoEnabled === true);
            setDesignToolEnabled(data.designToolEnabled === true);
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
    setDraft(draftFrom(profile, () => nextSocialId.current++));
    setSaveMessage('');
    setLimitError('');
  };

  const handleCancel = () => {
    setDraft(null);
    setSaveMessage('');
    setLimitError('');
  };

  // Stable, because AvatarPreview's effects depend on the callbacks built on it.
  const updateDraft = useCallback((patch: Partial<ProfileDraft>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }, []);

  const handleSave = async () => {
    if (!user || !draft) return;

    const checked = validateProfileDraft(draft);
    if ('error' in checked) {
      setSaveMessage(checked.error);
      setSaveSuccess(false);
      return;
    }
    const { username: newUsername, socials: newSocials } = checked;

    setSaving(true);
    setSaveMessage('');
    setSaveSuccess(false);

    try {
      const sanitizedBio = sanitizeHtml(draft.bio.trim());
      const sanitizedPronouns = sanitizeText(draft.pronouns.trim()).slice(0, PRONOUNS_MAX);
      // A web address never carries markup, so strip tags outright.
      const sanitizedSiteUrl = sanitizeText(draft.siteUrl.trim());
      const sanitizedLocationText = sanitizeHtml(draft.locationText.trim());
      const userDoc = doc(db, 'users', user.uid);

      // A username is only the writer's while the reservation under its
      // lowercased form is theirs, so a rename has to release the old name and
      // claim the new one alongside the profile write. One batch: if the name
      // is already taken the create fails and the profile keeps its old name.
      const oldKey = profile.username ? profile.username.toLowerCase() : null;
      const newKey = newUsername.toLowerCase();
      const batch = writeBatchShadowed(db);

      if (newKey !== oldKey) {
        // The batch would fail on its own if the name were taken, but only
        // with a permission error that reads like any other write failure.
        const held = await getDoc(doc(db, 'usernames', newKey));
        if (held.exists() && held.data().uid !== user.uid) {
          setSaveMessage('That username is already taken.');
          setSaveSuccess(false);
          setSaving(false);
          return;
        }
        if (oldKey) batch.delete(doc(db, 'usernames', oldKey));
        // Reservations are create-or-delete only, so a name this user already
        // holds is left as it stands rather than rewritten.
        if (!held.exists()) {
          batch.set(doc(db, 'usernames', newKey), { uid: user.uid, username: newUsername });
        }
      }

      batch.set(
        userDoc,
        {
          username: newUsername,
          color: draft.color,
          shape: draft.shape,
          avatar: draft.avatar,
          bio: sanitizedBio,
          pronouns: sanitizedPronouns,
          siteUrl: sanitizedSiteUrl,
          locationFlag: draft.locationFlag,
          locationText: sanitizedLocationText,
        },
        { merge: true }
      );

      await batch.commit();

      // Apart from the batch because a merging set merges nested maps key by
      // key, so a removed account would survive it. An update replaces the
      // field whole.
      if (!sameSocials(newSocials, profile.socials)) {
        await updateDocShadowed(userDoc, { socials: newSocials });
      }

      setProfile({
        username: newUsername,
        color: draft.color,
        shape: draft.shape,
        avatar: draft.avatar,
        bio: sanitizedBio,
        pronouns: sanitizedPronouns,
        siteUrl: sanitizedSiteUrl,
        locationFlag: draft.locationFlag,
        locationText: sanitizedLocationText,
        socials: newSocials,
      });
      setAvatarBroken(false);
      setDraft(null);
      clearUserCache(user.uid);
      setSaveMessage('Profile updated!');
      setSaveSuccess(true);

      setTimeout(() => {
        setSaveMessage('');
        setSaveSuccess(false);
      }, 3000);
    } catch (error) {
      console.error('Error saving profile:', error);
      // A rename that loses the race for a name lands here, since the
      // reservation create is what the rules refuse.
      setSaveMessage(
        newUsername.toLowerCase() !== profile.username.toLowerCase()
          ? 'Could not save — that username may have just been taken.'
          : 'Failed to save. Please try again.'
      );
      setSaveSuccess(false);

      setTimeout(() => {
        setSaveMessage('');
      }, 5000);
    } finally {
      setSaving(false);
    }
  };

  const handleLimitExceeded = (type: 'words' | 'chars', field: string) => {
    const errorMsg = type === 'words'
      ? `${field} word limit exceeded`
      : `${field} character limit exceeded`;
    setLimitError(errorMsg);

    setTimeout(() => {
      setLimitError('');
    }, 3000);
  };

  if (loading) {
    return (
      <div className="me-page">
        <p className="me-status">loading…</p>
      </div>
    );
  }

  const isEditing = draft !== null;

  return (
    <div className="me-page">
      <Header title="Profile" subtitle="Your Corner of the Village" />

      <div className="me-bar">
        <span className="me-bar-label">{isEditing ? 'editing' : 'you'}</span>
        <span className="me-bar-rule" aria-hidden="true"></span>
        {!isEditing && (
          <>
            <button type="button" className="me-act" onClick={handleStartEditing}>edit</button>
            <span className="me-sep" aria-hidden="true">·</span>
          </>
        )}
        {user && (
          <Link to={`/user/${user.uid}`} className="me-act">public page</Link>
        )}
      </div>

      {draft ? (
        <ProfileEditForm
          draft={draft}
          onChange={updateDraft}
          nextSocialId={() => nextSocialId.current++}
          onLimitExceeded={handleLimitExceeded}
          limitError={limitError}
          saveMessage={saveMessage}
          saveSuccess={saveSuccess}
          saving={saving}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      ) : (
        <ProfileView
          profile={profile}
          avatarBroken={avatarBroken}
          onAvatarError={() => setAvatarBroken(true)}
          saveMessage={saveMessage}
          saveSuccess={saveSuccess}
        />
      )}

      <AccountSettings
        user={user}
        isAdmin={isAdmin}
        nekoEnabled={nekoEnabled}
        setNekoEnabled={setNekoEnabled}
        designToolEnabled={designToolEnabled}
        setDesignToolEnabled={setDesignToolEnabled}
      />
    </div>
  );
};

export default Profile;
