import React, { useRef } from 'react';
import { useTagging } from './useTagging';
import TagSuggestions from './TagSuggestions';
import './TagSuggestions.css';

interface TagTextareaProps {
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  placeholder?: string;
  /** The field's own look; the box around it only positions the menu. */
  className?: string;
  id?: string;
}

/**
 * A form's textarea with the board composer's @ and / tagging. Only for text
 * shown through parseMessageHTML, which turns the [Name](link) it writes into
 * links and hover cards.
 */
const TagTextarea: React.FC<TagTextareaProps> = ({ value, onChange, maxLength, placeholder, className, id }) => {
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const tagging = useTagging({ value, onChange, textareaRef: areaRef, maxLength });

  return (
    <div className="tag-textarea">
      <textarea
        ref={areaRef}
        id={id}
        className={className}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          tagging.update(e.target.value, e.target.selectionStart);
        }}
        onKeyDown={tagging.onKeyDown}
        onClick={(e) => tagging.update(value, e.currentTarget.selectionStart)}
        onBlur={tagging.onBlur}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-autocomplete="list"
        aria-expanded={!!tagging.menu}
      />
      {tagging.menu && (
        <TagSuggestions menu={tagging.menu} onSelect={tagging.select} onHover={tagging.setActive} floating />
      )}
    </div>
  );
};

export default TagTextarea;
