import Header from '../components/basic/Header';
import FilmClubVote from '../components/film/FilmClubVote';
import '../App.css';

function FilmClubVotePage() {
  return (
    <div className="app-container">
      <Header title="Film Club" subtitle="rank your picks" />
      <FilmClubVote />
    </div>
  );
}

export default FilmClubVotePage;
