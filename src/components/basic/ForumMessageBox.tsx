import React, { useEffect, useState, useRef } from 'react';
import './ForumMessageBox.css';
import Button from './Button';
import { normalizeAvatarPath } from '../../utils/avatarPath';
import PollComposeModal, { type PollDraft } from './PollComposeModal';
import { useTagging, type TagAction } from './tagging/useTagging';
import TagSuggestions from './tagging/TagSuggestions';

// Matches MAX_FILE_SIZE in backend_server/routes/messageImages.js
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

interface ForumMessageBoxProps {
  placeholder?: string;
  onSend?: (text: string) => void;
  disabled?: boolean;
  maxWords?: number;
  maxChars?: number;
  className?: string;
  showSendButton?: boolean;
  initialValue?: string;
  onImageAttach?: (file: File | null) => void;
  onFilmAnnounce?: (variant: 1 | 2 | 3) => Promise<void>;
  /** Admins on the main board and the /test sandbox: `/eventbot` posts this
      week's calendar round-up. */
  onEventAnnounce?: () => Promise<void>;
  onPollAttach?: (poll: PollDraft | null) => void;
  /** The signed-in user's avatar, drawn beside the field on boards that lay
      the composer out as a post. Omitted everywhere else, so nothing changes
      on a board that has never had one. */
  avatar?: string;
  /** Their name, shown under that avatar. Only read when `avatar` is set. */
  avatarName?: string;
  /** Put the send button, the attach button and the counter in a row under the
      field rather than inside it. The ledger boards lay the composer out this
      way; everywhere else keeps the button in the field. */
  outsideControls?: boolean;
  /** A tick box drawn with the controls. The sub-boards use it to offer
      cross-posting to the main board; the box itself is controlled by whoever
      does the writing. */
  crossPost?: {
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
  };
}

const ForumBox: React.FC<ForumMessageBoxProps> = ({
  placeholder = "Type your message...",
  onSend,
  disabled = false,
  maxWords = 250,
  maxChars = 1000,
  className = '',
  showSendButton = true,
  initialValue = '',
  onImageAttach,
  onFilmAnnounce,
  onEventAnnounce,
  onPollAttach,
  avatar,
  avatarName,
  outsideControls,
  crossPost,
}) => {
  const [newMessage, setNewMessage] = useState(initialValue);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [pendingPoll, setPendingPoll] = useState<PollDraft | null>(null);
  const [pollComposeOpen, setPollComposeOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Dragging over a child fires dragleave on the parent, so count depth
  // instead of toggling on the first leave.
  const dragDepthRef = useRef(0);

  // The / commands only some boards offer, on top of the ones every box has.
  const actions: TagAction[] = [];
  if (onFilmAnnounce) {
    actions.push(
      { name: 'filmannounce1', hint: 'announce current film', run: () => void onFilmAnnounce(1) },
      { name: 'filmannounce2', hint: 'remind voting deadline', run: () => void onFilmAnnounce(2) },
      { name: 'filmannounce3', hint: 'announce next month\'s film', run: () => void onFilmAnnounce(3) },
    );
  }
  if (onEventAnnounce) actions.push({ name: 'eventbot', hint: 'post this week\'s events', run: () => void onEventAnnounce() });
  if (onPollAttach) actions.push({ name: 'poll', hint: 'create a poll', run: () => setPollComposeOpen(true) });

  const tagging = useTagging({ value: newMessage, onChange: setNewMessage, textareaRef, maxLength: maxChars, actions });

  const handleSend = () => {
    if ((newMessage.trim() || imagePreviewUrl || pendingPoll) && onSend && !disabled) {
      onSend(newMessage.trim());
      setNewMessage('');
      if (imagePreviewUrl) {
        URL.revokeObjectURL(imagePreviewUrl);
        setImagePreviewUrl(null);
        onImageAttach?.(null);
      }
      if (pendingPoll) {
        setPendingPoll(null);
        onPollAttach?.(null);
      }
      tagging.close();
    }
  };

  const savePollDraft = (draft: PollDraft) => {
    setPendingPoll(draft);
    onPollAttach?.(draft);
    setPollComposeOpen(false);
  };

  const removePollDraft = () => {
    setPendingPoll(null);
    onPollAttach?.(null);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;

    if (value.length > maxChars) return;

    const wordCount = value.trim() ? value.trim().split(/\s+/).length : 0;
    if (wordCount > maxWords) return;

    setNewMessage(value);
    tagging.update(value, e.target.selectionStart);
  };

  const autoResize = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    }
  };

  useEffect(() => {
    autoResize();
  }, [newMessage]);

  // The one path all three attach methods go through: paste, picker, drop.
  const attachImageFile = (file: File, method: 'paste' | 'picker' | 'drop') => {
    // Deliberately looser than the server's allow-list: some platforms report
    // an empty or odd MIME type (HEIC especially), and the server is the gate.
    if (!file.type.startsWith('image/')) {
      alert('Only image files can be attached.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      alert('Image must be under 8 MB.');
      return;
    }
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImagePreviewUrl(URL.createObjectURL(file));
    onImageAttach?.(file);
    window.umami?.track('message-image-attach', { method });
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) return;
        attachImageFile(file, 'paste');
        return;
      }
    }
  };

  const dragEnabled = !!onImageAttach && !disabled;

  const handleDragEnter = (e: React.DragEvent) => {
    if (!dragEnabled || !e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setIsDragOver(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!dragEnabled || !e.dataTransfer.types.includes('Files')) return;
    // Without this the browser navigates to the file and no drop event fires.
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!dragEnabled) return;
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!dragEnabled) return;
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsDragOver(false);
    // Dragging an image out of another web page gives a URL, not a File.
    const file = e.dataTransfer.files?.[0];
    if (file) attachImageFile(file, 'drop');
  };

  const removeImage = () => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImagePreviewUrl(null);
    onImageAttach?.(null);
  };

  const wordCount = newMessage.trim() ? newMessage.trim().split(/\s+/).length : 0;
  const charCount = newMessage.length;
  const canSend = (newMessage.trim().length > 0 || !!imagePreviewUrl || !!pendingPoll) && wordCount <= maxWords && charCount <= maxChars && !disabled;

  // Hoisted because they sit either inside the field or in a row under it,
  // depending on the board.
  const sendButton = (
    <div className="send-button-container">
      <Button
        type="basic"
        label="Send"
        onClick={handleSend}
        size="2.5em"
        disabled={!canSend}
      />
    </div>
  );

  const wordCounter = (
    <div className="word-counter">
      {wordCount}/{maxWords} words | {charCount}/{maxChars} characters
    </div>
  );

  // Only offered where a parent is actually listening for the file — News uses
  // this layout but has nowhere to put an image.
  const attachButton = onImageAttach ? (
    <>
      {/* accept="image/*" rather than the server's exact list: it is what makes
          iOS offer Photo Library / Take Photo / Browse and Android show the
          gallery. No `capture`, so the camera never becomes the only option. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="textbox-attach-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) attachImageFile(file, 'picker');
          e.target.value = ''; // so the same file can be picked again
        }}
      />
      <button
        type="button"
        className="textbox-attach"
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled}
      >
        ▓ attach
      </button>
    </>
  ) : null;

  const crossPostToggle = crossPost ? (
    <label className="textbox-crosspost">
      <input
        type="checkbox"
        checked={crossPost.checked}
        onChange={(e) => crossPost.onChange(e.target.checked)}
        disabled={disabled}
      />
      {crossPost.label}
    </label>
  ) : null;

  return (
    <div
      className={`textbox-container ${disabled ? 'disabled' : ''} ${isDragOver ? 'dragover' : ''} ${className}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {avatar && (
        <>
          {/* The composer's poster gutter: the same column a post has, so the
              field you type into starts on the same edge as everything already
              on the board. */}
          <div className="textbox-poster">
            <img
              className="textbox-avatar"
              src={normalizeAvatarPath(avatar)}
              alt=""
              loading="lazy"
            />
            <p className="textbox-poster-note">Posting as</p>
            {avatarName && <p className="textbox-poster-name">{avatarName}</p>}
          </div>
          <div className="textbox-gutter-rule" aria-hidden="true"></div>
        </>
      )}
      {/* Everything that is not the gutter, in one box — a board that lays the
          composer out in columns needs a single thing to put in the last one. */}
      <div className="textbox-body">
      <div className="input-area">
        <textarea
          ref={textareaRef}
          className="text-input"
          value={newMessage}
          onChange={handleInputChange}
          onPaste={handlePaste}
          onClick={(e) => tagging.update(newMessage, e.currentTarget.selectionStart)}
          onBlur={tagging.onBlur}
          onKeyDown={(e) => {
            if (tagging.onKeyDown(e)) return;
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && canSend) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          aria-autocomplete="list"
          aria-expanded={!!tagging.menu}
        />
        {showSendButton && !outsideControls && sendButton}
      </div>

      {tagging.menu && (
        <TagSuggestions menu={tagging.menu} onSelect={tagging.select} onHover={tagging.setActive} />
      )}

      {outsideControls && (
        <div className="textbox-controls">
          {showSendButton && sendButton}
          {attachButton}
          {crossPostToggle}
          {wordCounter}
        </div>
      )}

      {imagePreviewUrl && (
        <div className="image-preview-container">
          <div className="image-preview-frame">
            <img src={imagePreviewUrl} alt="Attached image preview" className="image-preview" />
            <button className="image-preview-remove" onClick={removeImage} aria-label="Remove image">
              ✕
            </button>
          </div>
        </div>
      )}

      {pendingPoll && (
        <div className="poll-draft-chip" onClick={() => setPollComposeOpen(true)} role="button" tabIndex={0}>
          <span className="poll-draft-chip__label">📊 {pendingPoll.question}</span>
          <span className="poll-draft-chip__meta">{pendingPoll.options.length} options</span>
          <button
            type="button"
            className="poll-draft-chip__remove"
            onClick={(e) => {
              e.stopPropagation();
              removePollDraft();
            }}
            aria-label="Remove poll"
          >
            ✕
          </button>
        </div>
      )}

      {pollComposeOpen && (
        <PollComposeModal
          initialValue={pendingPoll}
          onSave={savePollDraft}
          onCancel={() => setPollComposeOpen(false)}
        />
      )}

      {!outsideControls && crossPostToggle}
      {!outsideControls && wordCounter}
      </div>
    </div>
  );
};

export default ForumBox;
