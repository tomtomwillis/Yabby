import { useState } from 'react';
import './PollBlock.css';

interface PollBlockProps {
  question: string;
  options: string[];
  multiple: boolean;
  votes: Record<string, number[]>;
  currentUserId?: string;
  voterNames?: Record<number, string[]>;
  onToggleVote?: (optionIndex: number) => void;
  onVoterHover?: (optionIndex: number) => void;
}

export default function PollBlock({
  question,
  options,
  multiple,
  votes,
  currentUserId,
  voterNames,
  onToggleVote,
  onVoterHover,
}: PollBlockProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const totalVoters = Object.keys(votes).length;
  const mySelection = currentUserId ? votes[currentUserId] ?? [] : [];

  return (
    <div className="poll-block">
      <div className="poll-block__question">{question}</div>
      <div className="poll-block__options">
        {options.map((option, index) => {
          const voterCount = Object.values(votes).filter((selection) => selection.includes(index)).length;
          const percent = totalVoters > 0 ? Math.round((voterCount / totalVoters) * 100) : 0;
          const selected = mySelection.includes(index);

          return (
            <div
              key={index}
              className={`poll-block__option ${selected ? 'poll-block__option--selected' : ''}`}
              onClick={() => onToggleVote?.(index)}
              onMouseEnter={() => {
                setHoveredIndex(index);
                onVoterHover?.(index);
              }}
              onMouseLeave={() => setHoveredIndex(null)}
              role="button"
              tabIndex={0}
              aria-label={`Vote for ${option}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onToggleVote?.(index);
                }
              }}
            >
              <div className="poll-block__option-row">
                <span className={`poll-block__indicator ${multiple ? 'poll-block__indicator--checkbox' : 'poll-block__indicator--radio'}`}>
                  {selected && <span className="poll-block__indicator-fill" />}
                </span>
                <span className="poll-block__option-label">{option}</span>
                <span className="poll-block__option-count">{voterCount}</span>
              </div>
              <div className="poll-block__bar-track">
                <div className="poll-block__bar-fill" style={{ width: `${percent}%` }} />
              </div>
              {hoveredIndex === index && voterNames?.[index] && voterNames[index].length > 0 && (
                <div className="poll-block__tooltip">
                  {voterNames[index].map((name, i) => (
                    <div key={i}>{name}</div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
