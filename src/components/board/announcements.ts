import { collection, doc } from 'firebase/firestore';
import { trackedGetDoc as getDoc } from '../../utils/firestoreMetrics';
import { addDocShadowed, SERVER_TIME } from '../../api/shadow';
import { db } from '../../firebaseConfig';
import { sanitizeHtml } from '../../utils/sanitise';
import { getCurrentMonthId, getPrevMonthId } from '../../utils/useFilmClub';
import type { Message } from '../../types/firestore';

type FilmData = { tmdbId: number; title: string; releaseYear: string; posterPath: string | null; submittedByUsername: string };

/** Admin-only: the Film Club Bot's post for this month. 1 announces the film,
 *  2 is the voting reminder, 3 announces next month's pick. Resolves to the
 *  post as the board shows it, or to the reason nothing was posted. */
export async function postFilmAnnouncement(
  collectionName: string,
  variant: 1 | 2 | 3,
  uid: string,
): Promise<{ message: Message } | { error: string }> {
  const monthId = getCurrentMonthId();
  const prevMonthId = getPrevMonthId();
  const [snap, prevSnap] = await Promise.all([
    getDoc(doc(db, 'filmClub', monthId)),
    getDoc(doc(db, 'filmClub', prevMonthId)),
  ]);
  const monthData = snap.exists() ? snap.data() : null;
  const prevMonthData = prevSnap.exists() ? prevSnap.data() : null;

  const film = (monthData?.currentFilm ?? prevMonthData?.nextFilm) as FilmData | undefined;

  if (!film) {
    return { error: 'No film set for this month. Set one in the Film Club admin panel first.' };
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const lastDay = new Date(year, month, 0).getDate();
  const origin = 'https://yabbyville.xyz';

  let text: string;
  let posterUrl: string | undefined;

  if (variant === 1) {
    const monthName = now.toLocaleDateString('en-GB', { month: 'long' });
    const leavingDate = new Date(year, month, 0).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });

    let trailerUrl: string | null = null;
    try {
      const r = await fetch(`https://api.themoviedb.org/3/movie/${film.tmdbId}/videos?api_key=${import.meta.env.VITE_TMDB_API_KEY}`);
      const data = await r.json();
      const trailer = (data.results ?? []).find(
        (v: { type: string; site: string; key: string }) => v.type === 'Trailer' && v.site === 'YouTube'
      );
      trailerUrl = trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : null;
    } catch { /* no trailer */ }

    posterUrl = film.posterPath ? `https://image.tmdb.org/t/p/w342${film.posterPath}` : undefined;

    const submitter = film.submittedByUsername || 'the community';
    const description = monthData?.currentFilmDescription as string | undefined;

    text = `The film has been selected for ${monthName} as <b>${film.title}</b> (${film.releaseYear}). `
      + `This was chosen by ${submitter} and will be available until ${leavingDate}. `
      + `Join the discussion over at the [film-club page](${origin}/film-club).\n\n`;

    if (description) text += `${submitter} said "${description}".\n\n`;
    const trailerPart = trailerUrl ? `Watch the trailer [here](${trailerUrl}) or ` : '';
    text += `${trailerPart}Submit your votes for next month's film [here](${origin}/film-club-vote).`;
  } else if (variant === 2) {
    const votingDeadlineDay = lastDay - 5;
    const daysUntilClose = votingDeadlineDay - now.getDate();

    posterUrl = film.posterPath ? `https://image.tmdb.org/t/p/w342${film.posterPath}` : undefined;

    text = `Filmbot reminder!\n\nYou have <b>${daysUntilClose}</b> day${daysUntilClose !== 1 ? 's' : ''} until voting closes for next month's film on [film club](${origin}/film-club)! Submit and vote for films or discuss this month's film <b>${film.title}</b> on the [message board](${origin}/filmclubmessage).`;
  } else {
    const nextFilm = monthData?.nextFilm as FilmData | undefined;
    if (!nextFilm) {
      return { error: 'No next month\'s film set yet. Run IRV first.' };
    }
    const daysLeft = lastDay - now.getDate();
    const nextMonthName = new Date(year, month, 1).toLocaleDateString('en-GB', { month: 'long' });

    posterUrl = nextFilm.posterPath ? `https://image.tmdb.org/t/p/w342${nextFilm.posterPath}` : undefined;

    text = `Voting has now ended and <b>${nextMonthName}</b>'s film will be <b>${nextFilm.title}</b>. You've still got <b>${daysLeft}</b> day${daysLeft !== 1 ? 's' : ''} to watch this month's film <b>${film.title}</b> and join the discussion on the dedicated [messageboard](${origin}/filmclubmessage)!`;
  }

  const sanitizedText = sanitizeHtml(text);

  const messageData: Record<string, unknown> = {
    text: sanitizedText,
    userId: uid,
    timestamp: SERVER_TIME,
    lastActivityAt: SERVER_TIME,
    username: 'Film Club Bot',
    avatar: 'avatar_filmbot.webp',
    reactedBy: [],
    reactionCount: 0,
    isBot: true,
  };
  if (posterUrl) messageData.posterUrl = posterUrl;

  const newDoc = await addDocShadowed(collection(db, collectionName), messageData);

  return {
    message: {
      id: newDoc.id,
      text: sanitizedText,
      userId: uid,
      timestamp: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
      lastActivityAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
      username: 'Film Club Bot',
      avatar: 'avatar_filmbot.webp',
      reactedBy: [],
      reactionCount: 0,
      replyCount: 0,
      currentUserReacted: false,
      posterUrl,
      isBot: true,
    },
  };
}
