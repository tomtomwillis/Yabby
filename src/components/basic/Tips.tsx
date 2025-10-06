import React, { useState, useEffect } from 'react';
import './Tips.css';

interface TipsProps {
  text: string;
  showOnMobile?: boolean;
  showOnDesktop?: boolean;
}

const Tips: React.FC<TipsProps> = ({
  text,
  showOnMobile = true,
  showOnDesktop = false
}) => {
  const [isMobile, setIsMobile] = useState(false);
  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.matchMedia('(max-width: 768px)').matches;
      setIsMobile(mobile);

      // Determine if tip should show based on device and props
      if (mobile && showOnMobile) {
        setShouldShow(true);
      } else if (!mobile && showOnDesktop) {
        setShouldShow(true);
      } else {
        setShouldShow(false);
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => window.removeEventListener('resize', checkMobile);
  }, [showOnMobile, showOnDesktop]);

  if (!shouldShow) return null;

  return (
    <div className="tip">
      {text}
    </div>
  );
};

export default Tips;
