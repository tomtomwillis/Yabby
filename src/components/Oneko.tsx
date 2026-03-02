import { useEffect, useRef, useState } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { getAuth } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

// Adjust this value to change the cat's movement speed (original: 10)
const NEKO_SPEED = 8;
const SPRITE_SETS: Record<string, number[][]> = {
  idle: [[-3, -3]],
  alert: [[-7, -3]],
  scratchSelf: [[-5, 0], [-6, 0], [-7, 0]],
  scratchWallN: [[0, 0], [0, -1]],
  scratchWallS: [[-7, -1], [-6, -2]],
  scratchWallE: [[-2, -2], [-2, -3]],
  scratchWallW: [[-4, 0], [-4, -1]],
  tired: [[-3, -2]],
  sleeping: [[-2, 0], [-2, -1]],
  N: [[-1, -2], [-1, -3]],
  NE: [[0, -2], [0, -3]],
  E: [[-3, 0], [-3, -1]],
  SE: [[-5, -1], [-5, -2]],
  S: [[-6, -3], [-7, -2]],
  SW: [[-5, -3], [-6, -1]],
  W: [[-4, -2], [-4, -3]],
  NW: [[-1, 0], [-1, -1]],
};

const Oneko: React.FC = () => {
  const auth = getAuth();
  const [user] = useAuthState(auth);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const nekoRef = useRef<HTMLDivElement | null>(null);
  const animFrameRef = useRef<number>(0);
  const pinnedRef = useRef(false);
  const stateRef = useRef({
    // Spawn in a random position within the central 70% of the viewport
    nekoPosX: window.innerWidth * 0.15 + Math.random() * window.innerWidth * 0.7,
    nekoPosY: window.innerHeight * 0.15 + Math.random() * window.innerHeight * 0.7,
    mousePosX: 0,
    mousePosY: 0,
    frameCount: 0,
    idleTime: 0,
    idleAnimation: null as string | null,
    idleAnimationFrame: 0,
    lastFrameTimestamp: 0,
  });

  // Check preference on mount and when user changes
  useEffect(() => {
    if (!user) return;

    // Check localStorage first for instant response
    const cached = localStorage.getItem('nekoEnabled');
    if (cached !== null) {
      setEnabled(cached === 'true');
    }

    // Then verify with Firestore
    const checkFirestore = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const val = userDoc.data().nekoEnabled === true;
          setEnabled(val);
          localStorage.setItem('nekoEnabled', String(val));
        } else {
          setEnabled(false);
        }
      } catch {
        // If Firestore fails, rely on localStorage value or default off
        if (cached === null) setEnabled(false);
      }
    };
    checkFirestore();
  }, [user]);

  // Listen for toggle events from the Profile page
  useEffect(() => {
    const handler = (e: Event) => {
      const val = (e as CustomEvent<boolean>).detail;
      setEnabled(val);
    };
    window.addEventListener('oneko-toggle', handler);
    return () => window.removeEventListener('oneko-toggle', handler);
  }, []);

  // Manage the cat lifecycle
  useEffect(() => {
    if (enabled !== true) {
      // Clean up if disabled
      pinnedRef.current = false;
      if (nekoRef.current) {
        nekoRef.current.remove();
        nekoRef.current = null;
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = 0;
      }
      return;
    }

    // No cat on mobile or when reduced motion is preferred
    const isMobile = window.matchMedia('(pointer: coarse)').matches;
    const isReducedMotion =
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (isMobile || isReducedMotion) return;

    // Create neko element
    const nekoEl = document.createElement('div');
    nekoEl.id = 'oneko';
    nekoEl.setAttribute('aria-hidden', 'true');
    Object.assign(nekoEl.style, {
      width: '32px',
      height: '32px',
      position: 'fixed',
      pointerEvents: 'auto',
      imageRendering: 'pixelated',
      cursor: 'pointer',
      left: `${stateRef.current.nekoPosX - 16}px`,
      top: `${stateRef.current.nekoPosY - 16}px`,
      zIndex: '2147483647',
      backgroundImage: 'url(/oneko.gif)',
    });
    document.body.appendChild(nekoEl);
    nekoRef.current = nekoEl;

    const state = stateRef.current;

    // Drag state
    let isDragging = false;
    let didDrag = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    const onNekoMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      isDragging = true;
      didDrag = false;
      dragOffsetX = e.clientX - state.nekoPosX;
      dragOffsetY = e.clientY - state.nekoPosY;
      nekoEl.style.cursor = 'grabbing';
    };
    nekoEl.addEventListener('mousedown', onNekoMouseDown);

    const onDocMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const newX = Math.min(Math.max(16, e.clientX - dragOffsetX), window.innerWidth - 16);
        const newY = Math.min(Math.max(16, e.clientY - dragOffsetY), window.innerHeight - 16);
        if (!didDrag && (Math.abs(newX - state.nekoPosX) > 2 || Math.abs(newY - state.nekoPosY) > 2)) {
          didDrag = true;
        }
        state.nekoPosX = newX;
        state.nekoPosY = newY;
        // Mirror mouse pos to cat pos so the cat stays put on release
        state.mousePosX = newX;
        state.mousePosY = newY;
        nekoEl.style.left = `${state.nekoPosX - 16}px`;
        nekoEl.style.top = `${state.nekoPosY - 16}px`;
      } else {
        state.mousePosX = e.clientX;
        state.mousePosY = e.clientY;
      }
    };
    document.addEventListener('mousemove', onDocMouseMove);

    const onDocMouseUp = () => {
      if (isDragging) {
        isDragging = false;
        nekoEl.style.cursor = 'pointer';
      }
    };
    document.addEventListener('mouseup', onDocMouseUp);

    // Double-click to pin/unpin. Ignore if the mouse just finished a drag.
    const onNekoDblClick = () => {
      if (didDrag) {
        didDrag = false;
        return;
      }
      pinnedRef.current = !pinnedRef.current;
      if (!pinnedRef.current) {
        // Wake up: reset idle so the cat reacts naturally to the cursor
        state.idleTime = 0;
        state.idleAnimation = null;
        state.idleAnimationFrame = 0;
      } else {
        // Go to sleep immediately
        state.idleAnimation = 'sleeping';
        state.idleAnimationFrame = 0;
      }
    };
    nekoEl.addEventListener('dblclick', onNekoDblClick);

    function setSprite(name: string, frame: number) {
      const sprites = SPRITE_SETS[name];
      if (!sprites) return;
      const sprite = sprites[frame % sprites.length];
      nekoEl.style.backgroundPosition = `${sprite[0] * 32}px ${sprite[1] * 32}px`;
    }

    function sleep() {
      if (state.idleAnimationFrame < 8) {
        setSprite('tired', 0);
      } else {
        setSprite('sleeping', Math.floor(state.idleAnimationFrame / 4));
      }
      state.idleAnimationFrame += 1;
      // After the tired intro, loop the sleeping frames indefinitely
      if (state.idleAnimationFrame > 192) {
        state.idleAnimationFrame = 8;
      }
    }

    function resetIdleAnimation() {
      state.idleAnimation = null;
      state.idleAnimationFrame = 0;
    }

    function idle() {
      state.idleTime += 1;

      if (
        state.idleTime > 10 &&
        Math.floor(Math.random() * 200) === 0 &&
        state.idleAnimation === null
      ) {
        const available = ['sleeping', 'scratchSelf'];
        if (state.nekoPosX < 32) available.push('scratchWallW');
        if (state.nekoPosY < 32) available.push('scratchWallN');
        if (state.nekoPosX > window.innerWidth - 32) available.push('scratchWallE');
        if (state.nekoPosY > window.innerHeight - 32) available.push('scratchWallS');
        state.idleAnimation = available[Math.floor(Math.random() * available.length)];
      }

      switch (state.idleAnimation) {
        case 'sleeping':
          if (state.idleAnimationFrame < 8) {
            setSprite('tired', 0);
            break;
          }
          setSprite('sleeping', Math.floor(state.idleAnimationFrame / 4));
          if (state.idleAnimationFrame > 192) resetIdleAnimation();
          break;
        case 'scratchWallN':
        case 'scratchWallS':
        case 'scratchWallE':
        case 'scratchWallW':
        case 'scratchSelf':
          setSprite(state.idleAnimation, state.idleAnimationFrame);
          if (state.idleAnimationFrame > 9) resetIdleAnimation();
          break;
        default:
          setSprite('idle', 0);
          return;
      }
      state.idleAnimationFrame += 1;
    }

    function frame() {
      state.frameCount += 1;

      if (pinnedRef.current) {
        sleep();
        return;
      }

      const diffX = state.nekoPosX - state.mousePosX;
      const diffY = state.nekoPosY - state.mousePosY;
      const distance = Math.sqrt(diffX ** 2 + diffY ** 2);

      if (distance < NEKO_SPEED || distance < 48) {
        idle();
        return;
      }

      state.idleAnimation = null;
      state.idleAnimationFrame = 0;

      if (state.idleTime > 1) {
        setSprite('alert', 0);
        state.idleTime = Math.min(state.idleTime, 7);
        state.idleTime -= 1;
        return;
      }

      let direction = '';
      direction = diffY / distance > 0.5 ? 'N' : '';
      direction += diffY / distance < -0.5 ? 'S' : '';
      direction += diffX / distance > 0.5 ? 'W' : '';
      direction += diffX / distance < -0.5 ? 'E' : '';
      setSprite(direction, state.frameCount);

      state.nekoPosX -= (diffX / distance) * NEKO_SPEED;
      state.nekoPosY -= (diffY / distance) * NEKO_SPEED;

      state.nekoPosX = Math.min(Math.max(16, state.nekoPosX), window.innerWidth - 16);
      state.nekoPosY = Math.min(Math.max(16, state.nekoPosY), window.innerHeight - 16);

      nekoEl.style.left = `${state.nekoPosX - 16}px`;
      nekoEl.style.top = `${state.nekoPosY - 16}px`;
    }

    function onAnimationFrame(timestamp: number) {
      if (!nekoRef.current?.isConnected) return;
      if (!state.lastFrameTimestamp) state.lastFrameTimestamp = timestamp;
      if (timestamp - state.lastFrameTimestamp > 100) {
        state.lastFrameTimestamp = timestamp;
        frame();
      }
      animFrameRef.current = window.requestAnimationFrame(onAnimationFrame);
    }

    animFrameRef.current = window.requestAnimationFrame(onAnimationFrame);

    return () => {
      nekoEl.removeEventListener('mousedown', onNekoMouseDown);
      nekoEl.removeEventListener('dblclick', onNekoDblClick);
      document.removeEventListener('mousemove', onDocMouseMove);
      document.removeEventListener('mouseup', onDocMouseUp);
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = 0;
      }
      if (nekoRef.current) {
        nekoRef.current.remove();
        nekoRef.current = null;
      }
      state.lastFrameTimestamp = 0;
    };
  }, [enabled]);

  return null;
};

export default Oneko;
