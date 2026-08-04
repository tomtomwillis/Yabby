import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Star from './components/basic/Star';
import Oneko from './components/Oneko';
import Home from './pages/Home';
import HomeDashboard from './pages/HomeDashboard';
import Login from './pages/Login';
import NotFound from './pages/NotFound';
import './App.css';
import './components/basic/TextAnimations.css';
import PrivateRoute from './components/PrivateRoute';
import DesignTool from './components/DesignTool';
import PullToRefresh from './components/PullToRefresh';
import { PlayerProvider } from './utils/usePlayer';
import { NavidromeCardProvider } from './utils/useNavidromeCard';
import { useJoinDate } from './utils/useJoinDate';

// Route-level code splitting: heavy dependencies (leaflet, hls.js, xterm,
// marked) stay out of the initial bundle. Home and Login load eagerly.
const Profile = lazy(() => import('./pages/Profile'));
const Wiki = lazy(() => import('./pages/Wiki'));
const MessageBoard = lazy(() => import('./pages/MessageBoardPage'));
const Upload = lazy(() => import('./pages/Upload'));
const Stickers = lazy(() => import('./pages/Stickers'));
const ListsPage = lazy(() => import('./pages/ListsPage'));
const ListDetailPage = lazy(() => import('./pages/ListDetailPage'));
const Test = lazy(() => import('./pages/Test'));
const NewsPage = lazy(() => import('./pages/NewsPage'));
const UserProfile = lazy(() => import('./pages/UserProfile'));
const FilmClub = lazy(() => import('./pages/FilmClub'));
const FilmClubSubmit = lazy(() => import('./pages/FilmClubSubmit'));
const FilmClubVote = lazy(() => import('./pages/FilmClubVote'));
const FilmClubMessagePage = lazy(() => import('./pages/FilmClubMessagePage'));
const MediaManager = lazy(() => import('./pages/MediaManager'));
const TravelPage = lazy(() => import('./pages/TravelPage'));
const CinemaPage = lazy(() => import('./pages/CinemaPage'));
const IssuesPage = lazy(() => import('./pages/IssuesPage'));

function App() {
  useJoinDate();

  return (
    <PlayerProvider>
      <NavidromeCardProvider>
        <Router>
          <div className="app-container">
            <PullToRefresh />
            <Star />
            <Oneko />
            <DesignTool />
            <Suspense fallback={null}>
              <Routes>
                {/* Public route */}
                <Route path="/login" element={<Login />} />

                {/* Cinema takes over the whole viewport — its blackout layer is
                    fixed to the viewport, so it cannot live inside the shell. */}
                <Route path="/cinema" element={<PrivateRoute><CinemaPage /></PrivateRoute>} />

                {/* Every other private route renders into the home shell's body
                    column, so the rail, wordmark and player never unmount. */}
                <Route element={<PrivateRoute><Home /></PrivateRoute>}>
                  <Route path="/" element={<HomeDashboard />} />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/wiki" element={<Wiki />} />
                  <Route path="/messageboard" element={<MessageBoard />} />
                  <Route path="/upload" element={<Upload />} />
                  <Route path="/stickers" element={<Stickers />} />
                  <Route path="/lists" element={<ListsPage />} />
                  <Route path="/lists/:listId" element={<ListDetailPage />} />
                  <Route path="/user/:userId" element={<UserProfile />} />
                  <Route path="/news" element={<NewsPage />} />
                  <Route path="/film-club" element={<FilmClub />} />
                  <Route path="/film-club-submit" element={<FilmClubSubmit />} />
                  <Route path="/film-club-vote" element={<FilmClubVote />} />
                  <Route path="/filmclubmessage" element={<FilmClubMessagePage />} />
                  <Route path="/test" element={<Test />} />
                  <Route path="/media" element={<MediaManager />} />
                  <Route path="/travel" element={<TravelPage />} />
                  <Route path="/issues" element={<IssuesPage />} />

                  {/* Inside the shell rather than beside it: an unknown URL
                      still gets the rail and the player to leave by. */}
                  <Route path="*" element={<NotFound />} />
                </Route>
              </Routes>
            </Suspense>
          </div>
        </Router>
      </NavidromeCardProvider>
    </PlayerProvider>
  );
}

export default App;
