import Header from '../components/basic/Header';
import FilmClubSubmit from '../components/film/FilmClubSubmit';
import '../components/film/FilmClub.css';

function FilmClubSubmitPage() {
  return (
    <div className="fc-page">
      <Header title="Film Club" subtitle="submit a film" />
      <FilmClubSubmit />
    </div>
  );
}

export default FilmClubSubmitPage;
