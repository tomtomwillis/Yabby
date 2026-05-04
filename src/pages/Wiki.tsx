import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import parse from 'html-react-parser';
import { marked } from 'marked';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import Header from '../components/basic/Header';
import Tips from '../components/basic/Tips';
import { useAdmin } from '../utils/useAdmin';
import { sanitizeWikiHtml } from '../utils/sanitise';
import '../components/WikiParser.css';

const MEDIA_API_URL = import.meta.env.VITE_MEDIA_API_URL || '/api/media';

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

interface WikiSection {
  id: string;
  title: string;
  body: string;
}

function parseSections(text: string): WikiSection[] {
  const lines = text.split('\n');
  const sections: WikiSection[] = [];
  let current: WikiSection | null = null;

  for (const line of lines) {
    if (line.startsWith('# ')) {
      if (current) sections.push(current);
      const title = line.slice(2).trim();
      current = { id: slugify(title), title, body: '' };
    } else if (current) {
      current.body += line + '\n';
    }
  }
  if (current) sections.push(current);
  return sections;
}

function renderBody(markdown: string): React.ReactNode {
  const html = marked(markdown) as string;
  const safe = sanitizeWikiHtml(html);
  return parse(safe);
}

const Wiki: React.FC = () => {
  const [wikiText, setWikiText] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>('');
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState<string>('');
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isAdmin } = useAdmin();

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const snap = await getDoc(doc(db, 'wiki', 'content'));
        const text = snap.exists() ? (snap.data().text as string) : '';
        setWikiText(text);
        setOpenSections(new Set());
        setError('');
      } catch {
        setError('Failed to load wiki content');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Deep linking: open section matching URL hash on first load
  useEffect(() => {
    if (loading || !wikiText) return;
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    setOpenSections((prev) => {
      const next = new Set(prev);
      next.add(hash);
      return next;
    });
    setTimeout(() => {
      document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, [loading, wikiText]);

  const toggleSection = (id: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        // Update URL hash without triggering a navigation
        history.replaceState(null, '', `#${id}`);
      }
      return next;
    });
  };

  const handleEditOpen = () => {
    setEditText(wikiText);
    setImagePreviewUrl(null);
    setPendingImage(null);
    setIsEditing(true);
  };

  const handleEditCancel = () => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImagePreviewUrl(null);
    setPendingImage(null);
    setIsEditing(false);
  };

  const handleSave = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setSaving(true);
    try {
      await setDoc(doc(db, 'wiki', 'content'), {
        text: editText,
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      });
      setWikiText(editText);
      setOpenSections(new Set(parseSections(editText).map((s) => s.id)));
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
      setImagePreviewUrl(null);
      setPendingImage(null);
      setIsEditing(false);
    } catch {
      alert('Failed to save wiki content. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const editHeadings = useMemo(() => {
    return editText.split('\n')
      .map((line, lineIndex) => {
        if (line.startsWith('## ')) return { title: line.slice(3).trim(), lineIndex, level: 2 };
        if (line.startsWith('# ')) return { title: line.slice(2).trim(), lineIndex, level: 1 };
        return null;
      })
      .filter(Boolean) as Array<{ title: string; lineIndex: number; level: number }>;
  }, [editText]);

  const scrollToEditLine = useCallback((lineIndex: number) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const lines = editText.split('\n');
    const charOffset = lines.slice(0, lineIndex).join('\n').length + (lineIndex > 0 ? 1 : 0);
    ta.focus();
    ta.selectionStart = ta.selectionEnd = charOffset;
  }, [editText]);

  const insertAtCursor = useCallback((insertion: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const before = editText.slice(0, start);
    const after = editText.slice(end);
    const next = before + insertion + after;
    setEditText(next);
    // Restore cursor after insertion
    requestAnimationFrame(() => {
      ta.selectionStart = ta.selectionEnd = start + insertion.length;
      ta.focus();
    });
  }, [editText]);

  const uploadImage = useCallback(async (file: File) => {
    setUploadingImage(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Not authenticated');
      const idToken = await user.getIdToken(true);
      const formData = new FormData();
      formData.append('image', file);
      const resp = await fetch(`${MEDIA_API_URL}/mb-images/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
        body: formData,
      });
      if (!resp.ok) throw new Error('Upload failed');
      const data = await resp.json();
      const url = `${MEDIA_API_URL}/mb-images/${data.imageId}.webp`;
      insertAtCursor(`![image](${url})`);
    } catch {
      alert('Image upload failed. Please try again.');
    } finally {
      setUploadingImage(false);
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
      setImagePreviewUrl(null);
      setPendingImage(null);
    }
  }, [imagePreviewUrl, insertAtCursor]);

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find((i) => i.type.startsWith('image/'));
    if (!imageItem) return;
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be under 5 MB.');
      return;
    }
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImagePreviewUrl(URL.createObjectURL(file));
    setPendingImage(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be under 5 MB.');
      return;
    }
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImagePreviewUrl(URL.createObjectURL(file));
    setPendingImage(file);
    // Reset input so same file can be re-selected if needed
    e.target.value = '';
  };

  const removePreview = () => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImagePreviewUrl(null);
    setPendingImage(null);
  };

  if (loading) {
    return (
      <div className="app-container">
        <Header title="Wiki" subtitle="How to use Yabby" />
        <div className="wiki-container">
          <div className="wiki-loading">Loading wiki...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-container">
        <Header title="Wiki" subtitle="How to use Yabby" />
        <div className="wiki-container">
          <div className="wiki-error">
            <h3>Error Loading Wiki</h3>
            <p>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const sections = parseSections(wikiText);

  return (
    <div className="app-container">
      <Header title="Wiki" subtitle="How to use Yabby" />
      {isAdmin && (
        <Tips
          showOnMobile
          showOnDesktop
          text={<>
            <strong>Markdown guide:</strong>{' '}
            <code># Section</code> collapsible section &nbsp;·&nbsp;
            <code>## Heading</code> subheading &nbsp;·&nbsp;
            <code>**bold**</code> &nbsp;·&nbsp;
            <code>*italic*</code> &nbsp;·&nbsp;
            <code>[text](url)</code> link &nbsp;·&nbsp;
            <code>- item</code> bullet list &nbsp;·&nbsp;
            <code>1. item</code> numbered list &nbsp;·&nbsp;
            <code>`code`</code> inline code
          </>}
        />
      )}
      <div className="wiki-container">
        {isEditing ? (
          <div className="wiki-edit-panel">
            <div className="wiki-edit-header">
              <span className="wiki-edit-title">Edit Wiki</span>
              <div className="wiki-edit-hint">Use # for sections, ## for subheadings. Standard markdown supported.</div>
            </div>
            <div className="wiki-edit-body">
              {editHeadings.length > 0 && (
                <aside className="wiki-edit-sidebar">
                  <div className="wiki-edit-sidebar-label">Sections</div>
                  {editHeadings.map((h) => (
                    <button
                      key={h.lineIndex}
                      className={`wiki-edit-sidebar-item wiki-edit-sidebar-item--level${h.level}`}
                      onClick={() => scrollToEditLine(h.lineIndex)}
                    >
                      {h.title}
                    </button>
                  ))}
                </aside>
              )}
              <textarea
                ref={textareaRef}
                className="wiki-edit-textarea"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onPaste={handlePaste}
                placeholder="# Section Title&#10;&#10;Content goes here...&#10;&#10;## Subheading&#10;&#10;More content..."
                spellCheck
              />
            </div>
            {imagePreviewUrl && (
              <div className="wiki-image-preview-container">
                <div className="wiki-image-preview-frame">
                  <img src={imagePreviewUrl} alt="Image preview" className="wiki-image-preview" />
                  <button className="wiki-image-preview-remove" onClick={removePreview} aria-label="Remove image">✕</button>
                </div>
                <button
                  className="wiki-image-upload-btn"
                  onClick={() => pendingImage && uploadImage(pendingImage)}
                  disabled={uploadingImage}
                >
                  {uploadingImage ? 'Uploading…' : 'Insert image'}
                </button>
              </div>
            )}
            <div className="wiki-edit-actions">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="wiki-file-input"
                onChange={handleFileSelect}
              />
              <button
                className="wiki-attach-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
                title="Attach image"
              >
                📎 Attach image
              </button>
              <div className="wiki-edit-actions-right">
                <button className="wiki-cancel-btn" onClick={handleEditCancel} disabled={saving}>
                  Cancel
                </button>
                <button className="wiki-save-btn" onClick={handleSave} disabled={saving || uploadingImage}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="wiki-content">
            <div className="wiki-collapsible">
              <div className="wiki-title-section">
                <h1 className="wiki-main-title">Yabbyville Wiki</h1>
                {isAdmin && (
                  <button className="wiki-edit-open-btn" onClick={handleEditOpen}>
                    Edit Wiki
                  </button>
                )}
              </div>

              {sections.length === 0 ? (
                <div className="wiki-empty">
                  {wikiText
                    ? renderBody(wikiText)
                    : isAdmin
                      ? 'No content yet. Click "Edit Wiki" to add some.'
                      : 'Wiki content coming soon.'}
                </div>
              ) : (
                sections.map((section) => (
                  <div key={section.id} id={section.id} className="wiki-section">
                    <h1
                      className={`wiki-section-header ${openSections.has(section.id) ? 'open' : ''}`}
                      onClick={() => toggleSection(section.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleSection(section.id);
                        }
                      }}
                    >
                      <span className="wiki-section-title">{section.title}</span>
                      <span className="wiki-section-arrow">
                        {openSections.has(section.id) ? '▼' : '▶'}
                      </span>
                    </h1>
                    <div className={`wiki-section-content ${openSections.has(section.id) ? 'open' : 'collapsed'}`}>
                      {renderBody(section.body)}
                    </div>
                  </div>
                ))
              )}

            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Wiki;
