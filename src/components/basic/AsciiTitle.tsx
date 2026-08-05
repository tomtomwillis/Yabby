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
        // Write the result straight to the node as well as to state: a repeat
        // measurement that lands on the same scale is a no-op for React, which
        // would otherwise leave the scale(1) written above in place.
        pre.style.transform = `scale(${s})`;
        setScale(s);
        setScaledHeight(Math.ceil(naturalHeight * s));
      }
    };

    const fontsReady = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready;
    if (fontsReady) fontsReady.then(recompute);
    else recompute();

    // Observe the <pre> as well as the wrapper: the pixel font swaps in after
    // fonts.ready resolves, which changes the natural width without changing
    // the wrapper's. Transforms don't affect layout, so this cannot loop.
    const ro = new ResizeObserver(recompute);
    ro.observe(wrapperRef.current);
    ro.observe(preRef.current);
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
