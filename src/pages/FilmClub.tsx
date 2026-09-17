import Header from '../components/basic/Header';
import FilmClub from '../components/film/FilmClub';
import '../components/film/FilmClub.css';

function FilmClubPage() {
  return (
    <div className="fc-page">
      <Header title="Film Club" subtitle="watch with yabbyville" />
      <FilmClub />
    </div>
  );
}

export default FilmClubPage;
