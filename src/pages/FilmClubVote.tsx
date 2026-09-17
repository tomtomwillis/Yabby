import Header from '../components/basic/Header';
import FilmClubVote from '../components/film/FilmClubVote';
import '../components/film/FilmClub.css';

function FilmClubVotePage() {
  return (
    <div className="fc-page">
      <Header title="Film Club" subtitle="rank your picks" />
      <FilmClubVote />
    </div>
  );
}

export default FilmClubVotePage;
