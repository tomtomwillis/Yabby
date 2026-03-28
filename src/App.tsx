import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Star from './components/basic/Star';
import Oneko from './components/Oneko';
import Home from './pages/Home';
import Profile from './pages/Profile';
import Wiki from './pages/Wiki';
import MessageBoard from './pages/MessageBoardPage';
import Upload from './pages/Upload';
import Stickers from './pages/Stickers';
import ListsPage from './pages/ListsPage';
import ListDetailPage from './pages/ListDetailPage';
import './App.css';
import './components/basic/TextAnimations.css';
import Test from './pages/Test';
import NewsPage from './pages/NewsPage';
import Login from './pages/Login';
import UserProfile from './pages/UserProfile';
import Radio from './pages/Radio';
import FilmClub from './pages/FilmClub';
import FilmClubSubmit from './pages/FilmClubSubmit';
import FilmClubVote from './pages/FilmClubVote';
import PrivateRoute from './components/PrivateRoute';
import MediaManager from './pages/MediaManager';

function App() {
  return (
    <Router>
      <div className="app-container">
        <Star />
        <Oneko />
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
          <Route path="/test" element={<PrivateRoute><Test /></PrivateRoute>} />
          <Route path="/media" element={<PrivateRoute><MediaManager /></PrivateRoute>} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
