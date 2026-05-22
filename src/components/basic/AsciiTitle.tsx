import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import './AsciiTitle.css';

interface AsciiTitleProps {
  src?: string;
}

const AsciiTitle: React.FC<AsciiTitleProps> = ({ src = '/asciititle.txt' }) => {
  const [text, setText] = useState('');
  const [scale, setScale] = useState(1);
  const [scaledHeight, setScaledHeight] = useState<number | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(src)
      .then((res) => res.text())
      .then((t) => { if (!cancelled) setText(t.replace(/\n+$/, '')); })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [src]);

  useLayoutEffect(() => {
    if (!wrapperRef.current || !preRef.current || !text) return;

    const recompute = () => {
      const wrapper = wrapperRef.current;
      const pre = preRef.current;
      if (!wrapper || !pre) return;
      pre.style.transform = 'scale(1)';
      const naturalWidth = pre.scrollWidth;
      const naturalHeight = pre.scrollHeight;
      const available = wrapper.clientWidth;
      if (naturalWidth > 0 && available > 0) {
        const s = Math.min(1, available / naturalWidth);
        setScale(s);
        setScaledHeight(Math.ceil(naturalHeight * s));
      }
    };

    const fontsReady = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready;
    if (fontsReady) fontsReady.then(recompute);
    else recompute();

    const ro = new ResizeObserver(recompute);
    ro.observe(wrapperRef.current);
    window.addEventListener('orientationchange', recompute);
    return () => {
      ro.disconnect();
      window.removeEventListener('orientationchange', recompute);
    };
  }, [text]);

  return (
    <div
      className="ascii-title"
      ref={wrapperRef}
      style={scaledHeight != null ? { height: scaledHeight } : undefined}
    >
      <pre
        ref={preRef}
        className="ascii-title-pre"
        style={{ transform: `scale(${scale})` }}
        aria-hidden="true"
      >
        {text}
      </pre>
    </div>
  );
};

export default AsciiTitle;
