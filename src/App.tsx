import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Star from './components/basic/Star';
import Oneko from './components/Oneko';
import Home from './pages/Home';
import Login from './pages/Login';
import './App.css';
import './components/basic/TextAnimations.css';
import PrivateRoute from './components/PrivateRoute';
import PullToRefresh from './components/PullToRefresh';

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
const Radio = lazy(() => import('./pages/Radio'));
const FilmClub = lazy(() => import('./pages/FilmClub'));
const FilmClubSubmit = lazy(() => import('./pages/FilmClubSubmit'));
const FilmClubVote = lazy(() => import('./pages/FilmClubVote'));
const FilmClubMessagePage = lazy(() => import('./pages/FilmClubMessagePage'));
const MediaManager = lazy(() => import('./pages/MediaManager'));
const TravelPage = lazy(() => import('./pages/TravelPage'));
const CinemaPage = lazy(() => import('./pages/CinemaPage'));

function App() {
  return (
    <Router>
      <div className="app-container">
        <PullToRefresh />
        <Star />
        <Oneko />
        <Suspense fallback={null}>
          <Routes>
            {/* Public route */}
            <Route path="/login" element={<Login />} />

            {/* Private routes */}
            <Route path="/" element={<PrivateRoute><Home /></PrivateRoute>} />
            <Route path="/profile" element={<PrivateRoute><Profile /></PrivateRoute>} />
            <Route path="/wiki" element={<PrivateRoute><Wiki /></PrivateRoute>} />
            <Route path="/messageboard" element={<PrivateRoute><MessageBoard /></PrivateRoute>} />
            <Route path="/upload" element={<PrivateRoute><Upload /></PrivateRoute>} />
            <Route path="/stickers" element={<PrivateRoute><Stickers /></PrivateRoute>} />
            <Route path="/lists" element={<PrivateRoute><ListsPage /></PrivateRoute>} />
            <Route path="/lists/:listId" element={<PrivateRoute><ListDetailPage /></PrivateRoute>} />
            <Route path="/user/:userId" element={<PrivateRoute><UserProfile /></PrivateRoute>} />
            <Route path="/news" element={<PrivateRoute><NewsPage /></PrivateRoute>} />
            <Route path="/radio" element={<PrivateRoute><Radio /></PrivateRoute>} />
            <Route path="/film-club" element={<PrivateRoute><FilmClub /></PrivateRoute>} />
            <Route path="/film-club-submit" element={<PrivateRoute><FilmClubSubmit /></PrivateRoute>} />
            <Route path="/film-club-vote" element={<PrivateRoute><FilmClubVote /></PrivateRoute>} />
            <Route path="/filmclubmessage" element={<PrivateRoute><FilmClubMessagePage /></PrivateRoute>} />
            <Route path="/test" element={<PrivateRoute><Test /></PrivateRoute>} />
            <Route path="/media" element={<PrivateRoute><MediaManager /></PrivateRoute>} />
            <Route path="/travel" element={<PrivateRoute><TravelPage /></PrivateRoute>} />
            <Route path="/cinema" element={<PrivateRoute><CinemaPage /></PrivateRoute>} />
          </Routes>
        </Suspense>
      </div>
    </Router>
  );
}

export default App;
