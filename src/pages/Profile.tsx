import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getAuth, sendPasswordResetEmail, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { updateDocShadowed, writeBatchShadowed } from '../api/shadow';
import { db } from '../firebaseConfig';
import { clearUserCache } from '../utils/userCache';
import { sanitizeHtml, sanitizeText } from '../utils/sanitise';
import Header from '../components/basic/Header';
import Button from '../components/basic/Button';
import SiteLink from '../components/basic/SiteLink';
import { useAdmin } from '../utils/useAdmin';
import MessageTextBox from '../components/basic/MessageTextBox';
import AvatarPreview from '../components/AvatarPreview';
import './Profile.css';

const USERNAME_MIN = 2;
const USERNAME_MAX = 20;
const USERNAME_PATTERN = /^[a-zA-Z0-9]+([ ._-][a-zA-Z0-9]+)*$/;

/** Usernames are reserved case-insensitively, so "alice " and "al  ice" must
 *  not be able to stand in for "alice" on a post. */
const normaliseUsername = (value: string) => value.trim().replace(/\s+/g, ' ');

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
  const [avatarBroken, setAvatarBroken] = useState(false);
  const [loading, setLoading] = useState(true);

  const [passwordResetLoading, setPasswordResetLoading] = useState(false);
  const [passwordResetMessage, setPasswordResetMessage] = useState('');
  const [passwordResetSuccess, setPasswordResetSuccess] = useState(false);

  const [bio, setBio] = useState('');
  const [siteUrl, setSiteUrl] = useState('');
  const [locationFlag, setLocationFlag] = useState('');
  const [locationText, setLocationText] = useState('');

  const [isEditing, setIsEditing] = useState(false);
  const [editUsername, setEditUsername] = useState('');
  const [editColor, setEditColor] = useState('blue');
  const [editShape, setEditShape] = useState('star');
  const [editAvatar, setEditAvatar] = useState('/Stickers/avatar_star_blue.webp');
  const [editBio, setEditBio] = useState('');
  const [editSiteUrl, setEditSiteUrl] = useState('');
  const [editLocationFlag, setEditLocationFlag] = useState('');
  const [editLocationText, setEditLocationText] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [flagSearch, setFlagSearch] = useState('');
  const [flagDropdownOpen, setFlagDropdownOpen] = useState(false);
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
            const fetchedUsername = data.username || '';
            const fetchedColor = data.color || 'blue';
            const fetchedShape = data.shape || 'star';
            const fetchedAvatar = data.avatar || `/Stickers/avatar_${fetchedShape}_${fetchedColor}.webp`;

            setUsername(fetchedUsername);
            setSelectedColor(fetchedColor);
            setSelectedShape(fetchedShape);
            setAvatar(fetchedAvatar);
            setAvatarBroken(false);
            setBio(data.bio || '');
            setSiteUrl(data.siteUrl || '');
            setLocationFlag(data.locationFlag || '');
            setLocationText(data.locationText || '');
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
    setEditUsername(username);
    setEditColor(selectedColor);
    setEditShape(selectedShape);
    setEditAvatar(avatar);
    setEditBio(bio);
    setEditSiteUrl(siteUrl);
    setEditLocationFlag(locationFlag);
    setEditLocationText(locationText);
    setIsEditing(true);
    setSaveMessage('');
    setLimitError('');
  };

  const handleCancel = () => {
    setIsEditing(false);
    setFlagDropdownOpen(false);
    setFlagSearch('');
    setSaveMessage('');
    setLimitError('');
  };

  const handleSave = async () => {
    if (!user) return;

    // Matches isValidUsername in firestore.rules, minus the stray-space cases
    // that normaliseUsername has already removed.
    const newUsername = normaliseUsername(editUsername);
    if (newUsername.length < USERNAME_MIN || newUsername.length > USERNAME_MAX) {
      setSaveMessage(`Username must be ${USERNAME_MIN}–${USERNAME_MAX} characters.`);
      setSaveSuccess(false);
      return;
    }
    if (!USERNAME_PATTERN.test(newUsername)) {
      setSaveMessage(
        'Username must start and end with a letter or number, and can use spaces, dots, hyphens and underscores between them.',
      );
      setSaveSuccess(false);
      return;
    }

    setSaving(true);
    setSaveMessage('');
    setSaveSuccess(false);

    try {
      const sanitizedBio = sanitizeHtml(editBio.trim());
      // A web address never carries markup, so strip tags outright.
      const sanitizedSiteUrl = sanitizeText(editSiteUrl.trim());
      const sanitizedLocationText = sanitizeHtml(editLocationText.trim());
      const userDoc = doc(db, 'users', user.uid);

      // A username is only the writer's while the reservation under its
      // lowercased form is theirs, so a rename has to release the old name and
      // claim the new one alongside the profile write. One batch: if the name
      // is already taken the create fails and the profile keeps its old name.
      const oldKey = username ? username.toLowerCase() : null;
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
          color: editColor,
          shape: editShape,
          avatar: editAvatar,
          bio: sanitizedBio,
          siteUrl: sanitizedSiteUrl,
          locationFlag: editLocationFlag,
          locationText: sanitizedLocationText,
        },
        { merge: true }
      );

      await batch.commit();

      setUsername(newUsername);
      setEditUsername(newUsername);
      setSelectedColor(editColor);
      setSelectedShape(editShape);
      setAvatar(editAvatar);
      setAvatarBroken(false);
      setBio(sanitizedBio);
      setSiteUrl(sanitizedSiteUrl);
      setLocationFlag(editLocationFlag);
      setLocationText(sanitizedLocationText);
      setIsEditing(false);
      setFlagDropdownOpen(false);
      setFlagSearch('');
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
        newUsername.toLowerCase() !== username.toLowerCase()
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

  const handleNekoToggle = async () => {
    if (!user) return;
    const newValue = !nekoEnabled;
    setNekoEnabled(newValue);
    localStorage.setItem('nekoEnabled', String(newValue));
    window.dispatchEvent(new CustomEvent('oneko-toggle', { detail: newValue }));

    try {
      await updateDocShadowed(doc(db, 'users', user.uid), { nekoEnabled: newValue });
      clearUserCache(user.uid);
    } catch {
      // Revert on failure
      setNekoEnabled(!newValue);
      localStorage.setItem('nekoEnabled', String(!newValue));
      window.dispatchEvent(new CustomEvent('oneko-toggle', { detail: !newValue }));
    }
  };

  const handleDesignToolToggle = async () => {
    if (!user) return;
    const newValue = !designToolEnabled;
    setDesignToolEnabled(newValue);
    localStorage.setItem('designToolEnabled', String(newValue));
    window.dispatchEvent(new CustomEvent('design-tool-toggle', { detail: newValue }));

    try {
      await updateDocShadowed(doc(db, 'users', user.uid), { designToolEnabled: newValue });
      clearUserCache(user.uid);
    } catch {
      setDesignToolEnabled(!newValue);
      localStorage.setItem('designToolEnabled', String(!newValue));
      window.dispatchEvent(new CustomEvent('design-tool-toggle', { detail: !newValue }));
    }
  };

  const filteredFlags = FLAG_OPTIONS.filter((opt) =>
    opt.label.toLowerCase().includes(flagSearch.toLowerCase())
  );

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

  const hasLocation = locationFlag || locationText;
  const flagLabel = FLAG_OPTIONS.find((opt) => opt.flag === editLocationFlag)?.label ?? 'none';

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

      {isEditing ? (
        /* ── EDIT MODE: the one band on the page you type into ── */
        <div className="me-band">
          <div className="me-field">
            <span className="me-label">username</span>
            <MessageTextBox
              placeholder="Change Username..."
              value={editUsername}
              onChange={setEditUsername}
              maxWords={5}
              maxChars={USERNAME_MAX}
              showSendButton={false}
              showCounter={false}
              onLimitExceeded={(type) => handleLimitExceeded(type, 'Username')}
            />
          </div>

          <div className="me-field">
            <span className="me-label">sticker</span>
            <AvatarPreview
              selectedColor={editColor}
              selectedShape={editShape}
              avatar={editAvatar}
              onColorChange={setEditColor}
              onShapeChange={setEditShape}
              onAvatarChange={setEditAvatar}
            />
          </div>

          <div className="me-field">
            <span className="me-label">bio</span>
            <MessageTextBox
              placeholder="Write something about yourself..."
              value={editBio}
              onChange={setEditBio}
              maxWords={100}
              maxChars={500}
              showSendButton={false}
              showCounter={true}
              rows={3}
              onLimitExceeded={(type) => handleLimitExceeded(type, 'Bio')}
            />
          </div>

          <div className="me-field">
            <span className="me-label">website</span>
            <MessageTextBox
              placeholder="your-site.neocities.org"
              value={editSiteUrl}
              onChange={setEditSiteUrl}
              maxWords={1}
              maxChars={200}
              showSendButton={false}
              showCounter={false}
              rows={1}
              onLimitExceeded={(type) => handleLimitExceeded(type, 'Website')}
            />
          </div>

          {/* The travel filter's facet: the value stated on the line, and an
              index of the alternatives unrolled under it in flow rather than
              dropped over the page. */}
          <div className="me-field me-flag">
            <span className="me-label">flag</span>
            <button
              type="button"
              className={`me-facet${flagDropdownOpen ? ' is-open' : ''}`}
              onClick={() => setFlagDropdownOpen(!flagDropdownOpen)}
              aria-expanded={flagDropdownOpen}
              aria-controls="me-flag-panel"
            >
              <span className="me-facet-glyph">{editLocationFlag || '🏳️'}</span>
              <span className="me-facet-val">{flagLabel.toLowerCase()}</span>
              <span className="me-facet-mark" aria-hidden="true">›</span>
            </button>

            <div
              id="me-flag-panel"
              className={`me-flag-panel${flagDropdownOpen ? ' is-open' : ''}`}
            >
              <div className="me-flag-panel-inner">
                <div className="me-flag-body">
                  <input
                    type="text"
                    className="me-flag-search"
                    placeholder="search…"
                    value={flagSearch}
                    onChange={(e) => setFlagSearch(e.target.value)}
                    aria-label="Search countries"
                  />

                  {filteredFlags.length > 0 ? (
                    <ul className="me-flag-opts">
                      {filteredFlags.map((opt) => (
                        <li key={opt.label}>
                          <button
                            type="button"
                            className={`me-flag-opt${editLocationFlag === opt.flag ? ' is-sel' : ''}`}
                            onClick={() => {
                              setEditLocationFlag(opt.flag);
                              setFlagDropdownOpen(false);
                              setFlagSearch('');
                            }}
                          >
                            <span className="me-flag-opt-glyph">{opt.flag || '✕'}</span>
                            <span className="me-flag-opt-name">{opt.label.toLowerCase()}</span>
                            <span className="me-flag-opt-leader" aria-hidden="true"></span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="me-flag-none">no matches.</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="me-field">
            <span className="me-label">where</span>
            <MessageTextBox
              placeholder="Where are you located?"
              value={editLocationText}
              onChange={setEditLocationText}
              maxWords={10}
              maxChars={100}
              showSendButton={false}
              showCounter={true}
              rows={1}
              onLimitExceeded={(type) => handleLimitExceeded(type, 'Location')}
            />
          </div>

          {limitError && (
            <p className="me-msg me-msg--bad me-msg--in-band" role="alert">{limitError}</p>
          )}
          {saveMessage && (
            <p
              className={`me-msg me-msg--in-band ${saveSuccess ? 'me-msg--good' : 'me-msg--bad'}`}
              role="status"
            >
              {saveMessage}
            </p>
          )}

          <div className="me-band-foot">
            <Button
              label={saving ? 'saving…' : 'save'}
              onClick={handleSave}
              disabled={saving}
              className="me-save basic-button--primary"
            />
            <button type="button" className="me-act" onClick={handleCancel}>cancel</button>
          </div>
        </div>
      ) : (
        /* ── READ-ONLY: the card everyone else sees ── */
        <>
          <div className="me-card">
            <div className={`me-avatar${avatar && !avatarBroken ? '' : ' me-avatar--none'}`}>
              {avatar && !avatarBroken ? (
                <img
                  src={avatar}
                  alt={`${username || 'your'} sticker`}
                  onError={() => setAvatarBroken(true)}
                />
              ) : (
                (username || 'A').charAt(0).toUpperCase()
              )}
            </div>

            <span className="me-channel" aria-hidden="true"></span>

            <div className="me-body">
              <p className="me-name">{username || 'Anonymous'}</p>

              {bio ? (
                <p className="me-bio">{bio}</p>
              ) : (
                <p className="me-bio me-bio--none">no bio yet.</p>
              )}

              {(siteUrl || hasLocation) && (
                <dl className="me-facts">
                  {siteUrl && (
                    <>
                      <dt className="me-fact-key">
                        site<span className="me-fact-leader" aria-hidden="true"></span>
                      </dt>
                      <dd className="me-fact-val"><SiteLink url={siteUrl} /></dd>
                    </>
                  )}

                  {hasLocation && (
                    <>
                      <dt className="me-fact-key">
                        where<span className="me-fact-leader" aria-hidden="true"></span>
                      </dt>
                      <dd className="me-fact-val">
                        {locationFlag && <span className="me-flag-inline">{locationFlag}</span>}
                        {locationText}
                      </dd>
                    </>
                  )}
                </dl>
              )}
            </div>
          </div>

          {saveMessage && (
            <p
              className={`me-msg ${saveSuccess ? 'me-msg--good' : 'me-msg--bad'}`}
              role="status"
            >
              {saveMessage}
            </p>
          )}
        </>
      )}

      {/* ── The account itself ── */}
      <h2 className="me-h">
        <span className="me-h-label">account</span>
        <span className="me-h-rule" aria-hidden="true"></span>
        {user?.email && <span className="me-h-note">{user.email}</span>}
      </h2>

      <ul className="me-rows">
        <li className="me-row">
          <span className="me-row-key">password</span>
          <span className="me-row-leader" aria-hidden="true"></span>
          <span className="me-row-val">
            <button
              type="button"
              className="me-act"
              onClick={handlePasswordReset}
              disabled={passwordResetLoading || passwordResetSuccess}
            >
              {passwordResetLoading ? 'sending…' : passwordResetSuccess ? 'sent' : 'send reset email'}
            </button>
          </span>
        </li>

        {/* The cat follows a pointer, so there is nothing for it to follow on a
            touch screen — the setting is not offered where it cannot apply. */}
        {!window.matchMedia('(pointer: coarse)').matches && (
          <li className="me-row">
            <span className="me-row-key">oneko</span>
            <span className="me-row-leader" aria-hidden="true"></span>
            <span className="me-row-val">
              <label className="me-check">
                <input type="checkbox" checked={nekoEnabled} onChange={handleNekoToggle} />
                <span className="me-check-mark" aria-hidden="true">
                  {nekoEnabled ? '[x] on' : '[ ] off'}
                </span>
              </label>
            </span>
          </li>
        )}

        {isAdmin && (
          <li className="me-row">
            <span className="me-row-key">design tool</span>
            <span className="me-row-leader" aria-hidden="true"></span>
            <span className="me-row-val">
              <label className="me-check">
                <input
                  type="checkbox"
                  checked={designToolEnabled}
                  onChange={handleDesignToolToggle}
                />
                <span className="me-check-mark" aria-hidden="true">
                  {designToolEnabled ? '[x] on' : '[ ] off'}
                </span>
              </label>
            </span>
          </li>
        )}

        <li className="me-row">
          <span className="me-row-key">session</span>
          <span className="me-row-leader" aria-hidden="true"></span>
          <span className="me-row-val">
            <button type="button" className="me-act me-act--del" onClick={handleLogout}>
              log out
            </button>
          </span>
        </li>
      </ul>

      {passwordResetMessage && (
        <p
          className={`me-msg ${passwordResetSuccess ? 'me-msg--good' : 'me-msg--bad'}`}
          role="status"
        >
          {passwordResetMessage}
        </p>
      )}
    </div>
  );
};

export default Profile;
