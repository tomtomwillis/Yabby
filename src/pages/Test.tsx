import { useCallback, useEffect, useState } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../firebaseConfig';
import { getUserData } from '../utils/userCache';
import { testSuites, MARKER, SANDBOX_MESSAGES, type TestContext, type TestSuite } from './testSuites';
import { quickChecks } from './testChecks';
import Header from '../components/basic/Header';
import Button from '../components/basic/Button';
import TextBox from '../components/basic/MessageTextBox';
import UserMessage from '../components/basic/UserMessages';
import Carousel from '../components/basic/Carousel';
import CarouselAlbums from '../components/CarouselAlbums';
import MessageBoard from '../components/MessageBoard';
import '../App.css';
import '../components/basic/TextAnimations.css';
import './Test.css';

type Status = 'pending' | 'running' | 'pass' | 'fail';

interface TestResult {
  status: Status;
  detail: string;
  ms: number;
}

const resultKey = (suiteId: string, testName: string) => `${suiteId}::${testName}`;

const STATUS_ICON: Record<Status, string> = {
  pending: '·',
  running: '…',
  pass: '✓',
  fail: '✕',
};

function errorMessage(err: unknown): string {
  const code = (err as { code?: string }).code;
  const message = err instanceof Error ? err.message : String(err);
  return code ? `${message} (${code})` : message;
}

export default function Test() {
  const [user] = useAuthState(auth);
  const [profile, setProfile] = useState<{ username: string; avatar: string } | null>(null);
  const [results, setResults] = useState<Record<string, TestResult>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [runningSuite, setRunningSuite] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    getUserData(user.uid).then(setProfile);
  }, [user]);

  const runSuite = useCallback(
    async (suite: TestSuite) => {
      if (!user || !profile) return;
      setRunningSuite(suite.id);
      setNotes((prev) => ({ ...prev, [suite.id]: '' }));
      setResults((prev) => {
        const next = { ...prev };
        for (const test of suite.tests) {
          next[resultKey(suite.id, test.name)] = { status: 'pending', detail: '', ms: 0 };
        }
        return next;
      });

      const pending: { label: string; fn: () => Promise<void> }[] = [];
      const ctx: TestContext = {
        uid: user.uid,
        username: profile.username,
        avatar: profile.avatar,
        cleanup: (label, fn) => {
          const entry = { label, fn };
          pending.push(entry);
          return () => {
            const index = pending.indexOf(entry);
            if (index >= 0) pending.splice(index, 1);
          };
        },
      };

      for (const test of suite.tests) {
        const key = resultKey(suite.id, test.name);
        setResults((prev) => ({ ...prev, [key]: { status: 'running', detail: '', ms: 0 } }));
        const started = performance.now();
        try {
          const detail = await test.run(ctx);
          setResults((prev) => ({
            ...prev,
            [key]: { status: 'pass', detail, ms: Math.round(performance.now() - started) },
          }));
        } catch (err) {
          setResults((prev) => ({
            ...prev,
            [key]: { status: 'fail', detail: errorMessage(err), ms: Math.round(performance.now() - started) },
          }));
        }
      }

      // Removes anything a test created but did not delete, which usually means
      // an assertion failed before it got that far.
      const failed: string[] = [];
      let removed = 0;
      for (const entry of pending.slice().reverse()) {
        try {
          await entry.fn();
          removed += 1;
        } catch {
          failed.push(entry.label);
        }
      }
      setNotes((prev) => ({
        ...prev,
        [suite.id]: failed.length
          ? `Could not clean up: ${failed.join(', ')}. Delete these by hand.`
          : removed
            ? `Cleaned up ${removed} leftover doc${removed === 1 ? '' : 's'}.`
            : '',
      }));
      setRunningSuite(null);
    },
    [user, profile],
  );

  const runAll = useCallback(async () => {
    for (const suite of testSuites) {
      await runSuite(suite);
    }
  }, [runSuite]);

  const suiteTally = (suite: TestSuite) => {
    const all = suite.tests.map((t) => results[resultKey(suite.id, t.name)]);
    return {
      pass: all.filter((r) => r?.status === 'pass').length,
      fail: all.filter((r) => r?.status === 'fail').length,
      run: all.filter((r) => r && r.status !== 'pending').length,
    };
  };

  return (
    <div className="app-container">
      <Header title="Test" subtitle="Check nothing broke before shipping" />

      <QuickChecks />

      <section className="test-panel">
        <h2 className="test-panel__heading">Test suites</h2>
        <p className="test-panel__intro">
          These run as whoever is signed in on this browser. They write to separate test collections that no
          other page reads, so nothing here ever shows up on the real message board, lists, stickers or map.
          Everything they create is tagged <code>{MARKER}</code> and deleted at the end, even if a test fails.
        </p>
        <p className="test-panel__intro">
          Run them after changing anything that reads or writes Firestore, or after changing the security
          rules. A failure names the exact step that broke.
        </p>

        <div className="test-panel__actions">
          <Button
            type="basic"
            label={runningSuite ? 'Running…' : 'Run all suites'}
            onClick={runAll}
            disabled={!!runningSuite || !profile}
          />
          {!user && <span className="test-panel__warn">Sign in to run these.</span>}
        </div>

        {testSuites.map((suite) => {
          const tally = suiteTally(suite);
          return (
            <div key={suite.id} className="test-suite">
              <div className="test-suite__head">
                <div>
                  <h3 className="test-suite__title">
                    {suite.name}
                    {tally.run > 0 && (
                      <span className={tally.fail ? 'test-suite__tally fail' : 'test-suite__tally pass'}>
                        {tally.pass}/{suite.tests.length} passed
                      </span>
                    )}
                  </h3>
                  <p className="test-suite__desc">{suite.description}</p>
                </div>
                <Button
                  type="basic"
                  label={runningSuite === suite.id ? 'Running…' : 'Run'}
                  onClick={() => runSuite(suite)}
                  disabled={!!runningSuite || !profile}
                />
              </div>

              <ul className="test-list">
                {suite.tests.map((test) => {
                  const result = results[resultKey(suite.id, test.name)];
                  const status = result?.status ?? 'pending';
                  return (
                    <li key={test.name} className={`test-row test-row--${status}`}>
                      <span className="test-row__icon">{STATUS_ICON[status]}</span>
                      <span className="test-row__name">{test.name}</span>
                      {result?.ms ? <span className="test-row__ms">{result.ms}ms</span> : null}
                      {result?.detail && <span className="test-row__detail">{result.detail}</span>}
                    </li>
                  );
                })}
              </ul>

              {notes[suite.id] && <p className="test-suite__note">{notes[suite.id]}</p>}
            </div>
          );
        })}

        <div className="test-suite">
          <h3 className="test-suite__title">What these do not cover</h3>
          <ul className="test-manual">
            <li>Adding travel pins. The backend writes those and has no test mode, so a test would put a real pin on the map.</li>
            <li>Image uploads. The backend cannot delete images, so a test would leave files behind. Try one by hand on the board below.</li>
            <li>The map itself, place search, media manager, beets, radio, film club and cinema.</li>
          </ul>
        </div>
      </section>

      <section className="test-panel">
        <h2 className="test-panel__heading">Sandbox message board</h2>
        <p className="test-panel__intro">
          A real message board wired to the <code>{SANDBOX_MESSAGES}</code> collection. Post, react, reply,
          edit and delete here to check the board by hand. Nobody sees any of it. Images you attach do get
          uploaded for real, because the server has no way to delete them.
        </p>
        <MessageBoard
          collectionName={SANDBOX_MESSAGES}
          enableReactions
          enableReplies
          enableFilmAnnounce={false}
        />
      </section>

      <section className="test-gallery">
        <h2 className="test-panel__heading">Component rendering</h2>

        <Carousel
          loop
          autoplay
          autoplayDelay={3000}
          slides={[
            <img src="/Stickers/avatar_astro_blue.webp" alt="One" />,
            <img src="/Stickers/avatar_astro_red.webp" alt="Two" />,
            <img src="/Stickers/avatar_astro_pink.webp" alt="Three" />,
            <img src="/Stickers/avatar_charli_pink.webp" alt="Four" />,
            <img src="/Stickers/avatar_charli_green.webp" alt="Five" />,
            <img src="/Stickers/avatar_devilboy_blue.webp" alt="Six" />,
            <img src="/Stickers/avatar_devilboy_pink.webp" alt="Seven" />,
            <img src="/Stickers/avatar_devilboy_red.webp" alt="Eight" />,
            <img src="/Stickers/avatar_astro_green.webp" alt="Nine" />,
          ]}
        />

        <CarouselAlbums />

        <h1 className="title1 animated-text drift-circular pause-on-hover">Yabbyville</h1>
        <h1 className="links">links</h1>
        <h1 className="normal-text">testing the normal text</h1>

        <Button label="Sign In" onClick={() => alert('Button clicked!')} />
        <Button type="close" onClick={() => alert('Close clicked!')} className="custom-close-button" />
        <Button type="arrow-left" onClick={() => alert('Left clicked!')} className="custom-arrow-button" />
        <Button type="arrow-right" onClick={() => alert('Right clicked!')} className="custom-arrow-button" />

        <TextBox
          placeholder="Type your message here..."
          onSend={(text) => console.log('Sent:', text)}
          maxWords={250}
          disabled={false}
        />

        <TextBox
          placeholder="Email"
          onSend={(text) => console.log('Email entered:', text)}
          maxWords={250}
          disabled={false}
          showSendButton={false}
        />

        <MessageVariants />
      </section>
    </div>
  );
}

/** Runs on load so the state of the site's dependencies is visible without
 *  running anything. */
function QuickChecks() {
  const [user] = useAuthState(auth);
  const [results, setResults] = useState<Record<string, { ok: boolean; detail: string } | null>>({});
  const [running, setRunning] = useState(false);

  const run = useCallback(async () => {
    setRunning(true);
    setResults({});
    await Promise.all(
      quickChecks.map(async (check) => {
        try {
          const detail = await check.run();
          setResults((prev) => ({ ...prev, [check.name]: { ok: true, detail } }));
        } catch (err) {
          setResults((prev) => ({
            ...prev,
            [check.name]: { ok: false, detail: err instanceof Error ? err.message : String(err) },
          }));
        }
      }),
    );
    setRunning(false);
  }, []);

  // Waits for auth so the signed-in checks are not racing the session restore.
  useEffect(() => {
    if (user === undefined) return;
    run();
  }, [user, run]);

  const failures = Object.values(results).filter((r) => r && !r.ok).length;

  return (
    <section className="quick-checks">
      <div className="quick-checks__head">
        <h2 className="test-panel__heading">
          Status
          {!running && Object.keys(results).length > 0 && (
            <span className={failures ? 'quick-checks__summary fail' : 'quick-checks__summary ok'}>
              {failures ? `${failures} failing` : 'all good'}
            </span>
          )}
        </h2>
        <Button type="basic" label={running ? 'Checking…' : 'Re-check'} onClick={run} disabled={running} />
      </div>

      <div className="quick-checks__grid">
        {quickChecks.map((check) => {
          const result = results[check.name];
          const state = !result ? 'wait' : result.ok ? 'ok' : 'fail';
          return (
            <div key={check.name} className={`quick-check quick-check--${state}`}>
              <div className="quick-check__top">
                <span className="quick-check__name">{check.name}</span>
                <span className="quick-check__badge">
                  {state === 'wait' ? '…' : state === 'ok' ? 'OK' : 'FAIL'}
                </span>
              </div>
              <span className="quick-check__detail">{result?.detail ?? 'checking'}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Static renders covering the layouts the message board produces: plain text,
 *  overflow, an edited post with likes and replies, and a poll. */
function MessageVariants() {
  const [reacted, setReacted] = useState(false);
  const [repliesOpen, setRepliesOpen] = useState(false);
  const [votes, setVotes] = useState<Record<string, number[]>>({ me: [] });

  return (
    <>
      <UserMessage
        username="bumblebee"
        message="Your message here, testing the word wrapping and layout."
        timestamp="2.30pm - 12.05.25"
        userSticker="/Stickers/avatar_astro_blue.webp"
        onClose={() => {}}
        hideCloseButton
      />

      <UserMessage
        username="testing out a longer name here"
        message="Looking at your code, the issue is that the flex properties aren't properly handling the content height on mobile devices. The main problem is in the .user-message-text class where flex: none is removing the flexible behavior, but the container isn't properly adjusting."
        timestamp="2.30pm - 12.05.25"
        userSticker="/Stickers/avatar_devilboy_pink.webp"
        onClose={() => {}}
        hideCloseButton
      />

      <UserMessage
        username="charli"
        message='An <b>edited</b> post with a like and a reply, also checking <a href="https://yabbyville.xyz">link rendering</a>.'
        timestamp="2.30pm - 12.05.25"
        userSticker="/Stickers/avatar_charli_green.webp"
        onClose={() => {}}
        hideCloseButton
        edited
        reactionCount={reacted ? 2 : 1}
        currentUserReacted={reacted}
        onToggleReaction={() => setReacted((v) => !v)}
        enableReplies
        replyCount={1}
        repliesExpanded={repliesOpen}
        onToggleReplies={() => setRepliesOpen((v) => !v)}
        replies={[
          {
            id: 'demo-reply',
            text: 'And this is what a reply looks like.',
            userId: 'demo-user',
            timestamp: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
            username: 'bumblebee',
            avatar: '/Stickers/avatar_astro_red.webp',
            reactionCount: 0,
          },
        ]}
      />

      <UserMessage
        username="devilboy"
        message="A post carrying a poll."
        timestamp="2.30pm - 12.05.25"
        userSticker="/Stickers/avatar_devilboy_red.webp"
        onClose={() => {}}
        hideCloseButton
        pollQuestion="Does the poll block render?"
        pollOptions={['Yes', 'No', 'Ask again later']}
        pollMultiple={false}
        pollVotes={votes}
        onTogglePollVote={(optionIndex) =>
          setVotes((prev) => ({ me: prev.me?.[0] === optionIndex ? [] : [optionIndex] }))
        }
      />
    </>
  );
}
