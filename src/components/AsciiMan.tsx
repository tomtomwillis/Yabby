import React, { useEffect, useState } from 'react';
import './Stats.css';

const asciiMan = [
  `
      ___
    d(♥_♥)b    ♬·¯·♩¸¸♪·¯·♫¸

    `,
  `
      ___
    d(♥.♥)b    ♬.-.♩.-♪·_,♫

    `,
];

interface AsciiManProps {
  /** Hold the first pose instead of cycling — he only dances to something. */
  frozen?: boolean;
}

const AsciiMan: React.FC<AsciiManProps> = ({ frozen = false }) => {
  const [pose, setPose] = useState(0);

  useEffect(() => {
    if (frozen) {
      setPose(0);
      return;
    }
    const interval = setInterval(() => {
      setPose((prev) => (prev + 1) % 2);
    }, 500);
    return () => clearInterval(interval);
  }, [frozen]);

  return <pre className="ascii-art">{asciiMan[pose]}</pre>;
};

export default AsciiMan;
