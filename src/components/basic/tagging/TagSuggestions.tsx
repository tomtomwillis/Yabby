import React from 'react';
import type { TagItem, TagMenu } from './useTagging';
import './TagSuggestions.css';

interface TagSuggestionsProps {
  menu: TagMenu;
  onSelect: (item: TagItem) => void;
  onHover: (index: number) => void;
  /** Drop down over what follows the field, for boxes inside a form. The
      board's composer shows the list in place under its field instead. */
  floating?: boolean;
}

/** The @ and / menu under a tagging text box. */
const TagSuggestions: React.FC<TagSuggestionsProps> = ({ menu, onSelect, onHover, floating = false }) => (
  <div className={`tag-suggest${floating ? ' tag-suggest--floating' : ''}`}>
    <p className="tag-suggest-caption">{menu.caption}</p>
    {menu.items.length === 0 ? (
      <p className="tag-suggest-note">{menu.note}</p>
    ) : (
      <ul className="tag-suggest-list" role="listbox" aria-label={menu.caption}>
        {menu.items.map((item, i) => (
          <li key={`${item.kind}-${item.key}`} role="option" aria-selected={i === menu.active}>
            <button
              type="button"
              className={`tag-suggest-item${i === menu.active ? ' is-active' : ''}`}
              // Keeps focus in the field, so the caret is still where the tag goes.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSelect(item)}
              onMouseEnter={() => onHover(i)}
            >
              <span className="tag-suggest-name">{item.label}</span>
              {item.hint && <span className="tag-suggest-hint">{item.hint}</span>}
            </button>
          </li>
        ))}
      </ul>
    )}
  </div>
);

export default TagSuggestions;
