import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Star from './components/basic/Star';
import Home from './pages/Home';
import Profile from './pages/Profile';
import Wiki from './pages/Wiki';
import MessageBoard from './pages/MessageBoardPage';
import Upload from './pages/Upload';
import Stickers from './pages/Stickers';
import './App.css';
import './components/basic/TextAnimations.css';
import Test from './pages/Test';
import Login from './pages/Login';
import PrivateRoute from './components/PrivateRoute';

function App() {
  return (
    <Router>
      <div className="app-container">
        <Star />
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
          <Route path="/test" element={<PrivateRoute><Test /></PrivateRoute>} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
