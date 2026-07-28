import React, { useEffect, useRef, useState } from 'react';
import './BlockRange.css';

export const SEEK_CELL_PX = 9;
export const SEEK_MIN_BLOCKS = 16;
export const VOLUME_CELL_PX = 8;
export const VOLUME_MIN_BLOCKS = 6;

function blockStates(ratio: number, width: number): boolean[] {
  const filled = Math.round(Math.min(Math.max(ratio, 0), 1) * width);
  return Array.from({ length: width }, (_, i) => i < filled);
}

interface BlockRangeProps {
  label: string;
  value: number;
  max: number;
  step: number;
  cellPx: number;
  minBlocks: number;
  className?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}

// Each block is its own CSS grid cell (1fr), so the row of cells always sums to
// exactly the container's rendered width — a fixed-length unicode string doesn't,
// since its width comes from font metrics, not the flex box it sits in. Block
// *count* is measured off the container too (ResizeObserver), so a bar that's
// wide gets rendered at a proportionally higher resolution instead of the same
// handful of blocks stretched apart with gaps.
const BlockRange: React.FC<BlockRangeProps> = ({
  label, value, max, step, cellPx, minBlocks, className, disabled, onChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [blockCount, setBlockCount] = useState(minBlocks);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setBlockCount(Math.max(minBlocks, Math.round(entry.contentRect.width / cellPx)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [cellPx, minBlocks]);

  const cells = blockStates(max > 0 ? value / max : 0, blockCount);
  return (
    <div ref={containerRef} className={className ? `sp-blocks ${className}` : 'sp-blocks'}>
      <span
        className="sp-blocks-glyphs"
        aria-hidden="true"
        style={{ gridTemplateColumns: `repeat(${blockCount}, 1fr)` }}
      >
        {cells.map((filled, i) => (
          <span key={i} className={filled ? 'sp-blocks-cell sp-blocks-fill' : 'sp-blocks-cell sp-blocks-rest'}>
            {filled ? '█' : '░'}
          </span>
        ))}
      </span>
      <input
        className="sp-range"
        type="range"
        min={0}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
};

export default BlockRange;
