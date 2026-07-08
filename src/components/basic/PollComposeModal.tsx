import { useState } from 'react';
import './PollComposeModal.css';

export interface PollDraft {
  question: string;
  options: string[];
  multiple: boolean;
}

interface PollComposeModalProps {
  initialValue?: PollDraft | null;
  onSave: (draft: PollDraft) => void;
  onCancel: () => void;
}

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;

export default function PollComposeModal({ initialValue, onSave, onCancel }: PollComposeModalProps) {
  const [question, setQuestion] = useState(initialValue?.question ?? '');
  const [options, setOptions] = useState<string[]>(initialValue?.options ?? ['', '']);
  const [multiple, setMultiple] = useState(initialValue?.multiple ?? false);
  const [error, setError] = useState<string | null>(null);

  const updateOption = (index: number, value: string) => {
    setOptions((prev) => prev.map((o, i) => (i === index ? value.slice(0, 100) : o)));
  };

  const addOption = () => {
    if (options.length >= MAX_OPTIONS) return;
    setOptions((prev) => [...prev, '']);
  };

  const removeOption = (index: number) => {
    if (options.length <= MIN_OPTIONS) return;
    setOptions((prev) => prev.filter((_, i) => i !== index));
  };

  const canSubmit = question.trim().length > 0 && options.every((o) => o.trim().length > 0);

  const handleSubmit = () => {
    if (!canSubmit) {
      setError('Add a question and fill in every option.');
      return;
    }
    setError(null);
    onSave({ question: question.trim(), options: options.map((o) => o.trim()), multiple });
  };

  return (
    <div className="poll-compose-overlay">
      <div className="poll-compose">
        <h3 className="poll-compose__heading">{initialValue ? 'Edit poll' : 'Add a poll'}</h3>

        <input
          className="poll-compose__question"
          type="text"
          placeholder="Ask a question..."
          value={question}
          onChange={(e) => setQuestion(e.target.value.slice(0, 300))}
        />

        <div className="poll-compose__options">
          {options.map((option, index) => (
            <div key={index} className="poll-compose__option-row">
              <input
                className="poll-compose__option-input"
                type="text"
                placeholder={`Option ${index + 1}`}
                value={option}
                onChange={(e) => updateOption(index, e.target.value)}
              />
              <button
                type="button"
                className="poll-compose__option-remove"
                onClick={() => removeOption(index)}
                disabled={options.length <= MIN_OPTIONS}
                aria-label="Remove option"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          className="poll-compose__btn"
          onClick={addOption}
          disabled={options.length >= MAX_OPTIONS}
        >
          + Add option
        </button>

        <label className="poll-compose__mode-label">
          <span className="poll-compose__mode-hint">Voting mode</span>
          <select
            className="poll-compose__mode-select"
            value={multiple ? 'multiple' : 'single'}
            onChange={(e) => setMultiple(e.target.value === 'multiple')}
          >
            <option value="single">Single choice</option>
            <option value="multiple">Multiple choice</option>
          </select>
        </label>

        <div className="poll-compose__actions">
          <button
            type="button"
            className="poll-compose__btn poll-compose__btn--primary"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            Save poll
          </button>
          <button type="button" className="poll-compose__btn" onClick={onCancel}>
            Cancel
          </button>
        </div>

        {error && <p className="poll-compose__error">{error}</p>}
      </div>
    </div>
  );
}
