import React, { useCallback } from 'react';
import Button from '../basic/Button';
import MessageTextBox from '../basic/MessageTextBox';
import AvatarPreview from '../AvatarPreview';
import FlagPicker from './FlagPicker';
import { SOCIAL_PLATFORMS, SOCIAL_ORDER, type SocialPlatform } from '../../utils/socials';
import { PRONOUNS_MAX, USERNAME_MAX, type ProfileDraft, type SocialRow } from './profileDraft';

interface ProfileEditFormProps {
  draft: ProfileDraft;
  onChange: (patch: Partial<ProfileDraft>) => void;
  /** Numbers a new social row. */
  nextSocialId: () => number;
  onLimitExceeded: (type: 'words' | 'chars', field: string) => void;
  limitError: string;
  saveMessage: string;
  saveSuccess: boolean;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}

/** The one band on the profile page you type into. */
const ProfileEditForm: React.FC<ProfileEditFormProps> = ({
  draft,
  onChange,
  nextSocialId,
  onLimitExceeded,
  limitError,
  saveMessage,
  saveSuccess,
  saving,
  onSave,
  onCancel,
}) => {
  // AvatarPreview's effects depend on these, so they must not change each render.
  const setColor = useCallback((color: string) => onChange({ color }), [onChange]);
  const setShape = useCallback((shape: string) => onChange({ shape }), [onChange]);
  const setAvatar = useCallback((avatar: string) => onChange({ avatar }), [onChange]);

  const rows = draft.socials;
  const setRows = (socials: SocialRow[]) => onChange({ socials });

  const addSocialRow = () => {
    setRows([...rows, { id: nextSocialId(), platform: '', value: '' }]);
  };

  const updateSocialRow = (id: number, patch: Partial<SocialRow>) => {
    setRows(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const removeSocialRow = (id: number) => {
    setRows(rows.filter((row) => row.id !== id));
  };

  return (
    <div className="me-band">
      <div className="me-field">
        <span className="me-label">username</span>
        <MessageTextBox
          placeholder="Change Username..."
          value={draft.username}
          onChange={(username) => onChange({ username })}
          maxWords={5}
          maxChars={USERNAME_MAX}
          showSendButton={false}
          showCounter={false}
          onLimitExceeded={(type) => onLimitExceeded(type, 'Username')}
        />
      </div>

      <div className="me-field">
        <span className="me-label">pronouns</span>
        <MessageTextBox
          placeholder="e.g. she/her, they/them"
          value={draft.pronouns}
          onChange={(pronouns) => onChange({ pronouns })}
          maxWords={5}
          maxChars={PRONOUNS_MAX}
          showSendButton={false}
          showCounter={false}
          rows={1}
          onLimitExceeded={(type) => onLimitExceeded(type, 'Pronouns')}
        />
      </div>

      <div className="me-field">
        <span className="me-label">sticker</span>
        <AvatarPreview
          selectedColor={draft.color}
          selectedShape={draft.shape}
          avatar={draft.avatar}
          onColorChange={setColor}
          onShapeChange={setShape}
          onAvatarChange={setAvatar}
        />
      </div>

      <div className="me-field">
        <span className="me-label">bio</span>
        <MessageTextBox
          placeholder="Write something about yourself..."
          value={draft.bio}
          onChange={(bio) => onChange({ bio })}
          maxWords={100}
          maxChars={500}
          showSendButton={false}
          showCounter={true}
          rows={3}
          onLimitExceeded={(type) => onLimitExceeded(type, 'Bio')}
        />
      </div>

      <div className="me-field">
        <span className="me-label">website</span>
        <MessageTextBox
          placeholder="your-site.neocities.org"
          value={draft.siteUrl}
          onChange={(siteUrl) => onChange({ siteUrl })}
          maxWords={1}
          maxChars={200}
          showSendButton={false}
          showCounter={false}
          rows={1}
          onLimitExceeded={(type) => onLimitExceeded(type, 'Website')}
        />
      </div>

      <FlagPicker value={draft.locationFlag} onChange={(locationFlag) => onChange({ locationFlag })} />

      <div className="me-field">
        <span className="me-label">where</span>
        <MessageTextBox
          placeholder="Where are you located?"
          value={draft.locationText}
          onChange={(locationText) => onChange({ locationText })}
          maxWords={10}
          maxChars={100}
          showSendButton={false}
          showCounter={true}
          rows={1}
          onLimitExceeded={(type) => onLimitExceeded(type, 'Location')}
        />
      </div>

      <div className="me-field">
        <span className="me-label">socials</span>
        {rows.map((row) => {
          const taken = new Set(rows.filter((r) => r.id !== row.id).map((r) => r.platform));
          return (
            <div key={row.id} className="me-social-row">
              <select
                className="me-social-select"
                value={row.platform}
                onChange={(e) => updateSocialRow(row.id, { platform: e.target.value as SocialPlatform })}
                aria-label="Platform"
              >
                <option value="" disabled>choose…</option>
                {SOCIAL_ORDER.filter((platform) => !taken.has(platform)).map((platform) => (
                  <option key={platform} value={platform}>{SOCIAL_PLATFORMS[platform].label}</option>
                ))}
              </select>
              <input
                type="text"
                className="me-social-input"
                value={row.value}
                onChange={(e) => updateSocialRow(row.id, { value: e.target.value })}
                placeholder={row.platform ? SOCIAL_PLATFORMS[row.platform].placeholder : 'username or link'}
                disabled={!row.platform}
                maxLength={200}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                aria-label={row.platform ? `${SOCIAL_PLATFORMS[row.platform].label} username or link` : 'Username or link'}
              />
              <button type="button" className="me-act me-act--del" onClick={() => removeSocialRow(row.id)}>
                remove
              </button>
            </div>
          );
        })}
        {rows.length < SOCIAL_ORDER.length && (
          <button type="button" className="me-act me-social-add" onClick={addSocialRow}>
            + add social media
          </button>
        )}
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
          onClick={onSave}
          disabled={saving}
          className="me-save basic-button--primary"
        />
        <button type="button" className="me-act" onClick={onCancel}>cancel</button>
      </div>
    </div>
  );
};

export default ProfileEditForm;
