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

const AsciiMan: React.FC = () => {
  const [pose, setPose] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setPose((prev) => (prev + 1) % 2);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  return <pre className="ascii-art">{asciiMan[pose]}</pre>;
};

export default AsciiMan;
