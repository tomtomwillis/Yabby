import Header from '../components/basic/Header';
import FilmClubSubmit from '../components/film/FilmClubSubmit';
import '../App.css';

function FilmClubSubmitPage() {
  return (
    <div className="app-container">
      <Header title="Film Club" subtitle="submit a film" />
      <FilmClubSubmit />
    </div>
  );
}

export default FilmClubSubmitPage;
