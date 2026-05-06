import Header from '../components/basic/Header';
import FilmClub from '../components/film/FilmClub';
import '../App.css';

function FilmClubPage() {
  return (
    <div className="app-container">
      <Header title="Film Club" subtitle="watch with yabbyville" />
      <FilmClub />
    </div>
  );
}

export default FilmClubPage;
