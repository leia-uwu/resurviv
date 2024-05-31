import { h, Fragment } from 'jsx-dom';

export default function(params) {
    return (
      <>
      {/* Overview Card */}
      <div className="container mt-3">
        <div className="card card-leaderboard col-lg-8 col-12 p-0">
          <div className="card-body">
            <div className='row card-row-top'>
              <div className='col-12'>
                <div className="leaderboard-title ml-sm-3 ml-0 mr-0 mt-3" data-l10n='index-leaderboards' data-caps='true'>LEADERBOARDS</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mode selectors */}
      <div className='container mt-3'>
        <div className="row">
          <div className='col-lg-2 col-3 pr-lg-3 pr-1'>
            <select id="leaderboard-team-mode" className="leaderboard-opt custom-select">
              <option value="solo" data-l10n='stats-solo'>Solo</option>
              <option value="duo" data-l10n='stats-duo'>Duo</option>
              <option value="squad" data-l10n='stats-squad'>Squad</option>
            </select>
          </div>
          <div className='col-lg-2 col-3 pl-lg-0 pr-lg-3 pl-0 pr-1'>
            <select id="leaderboard-type" className="leaderboard-opt custom-select">
              <option value="most_kills" data-l10n='stats-most-kills'>Most kills</option>
              <option value="most_damage_dealt" data-l10n='stats-most-damage'>Most damage</option>
              <option value="kpg" data-l10n='stats-kpg-full'>Kills per game</option>
              <option value="kills" data-l10n='stats-total-kills'>Total kills</option>
              <option value="wins" data-l10n='stats-total-wins'>Total wins</option>
            </select>
          </div>
          <div className='col-lg-2 col-3 pl-lg-0 pr-lg-3 pl-0 pr-1'>
            <select id="leaderboard-time" className="leaderboard-opt custom-select">
              <option value="daily" data-l10n='stats-today'>Today</option>
              <option value="weekly" data-l10n='stats-this-week'>This week</option>
              <option value="alltime" data-l10n='stats-all-time'>All time</option>
            </select>
          </div>
          <div className='col-lg-2 col-3 pl-0'>
            <select id="leaderboard-map-id" className="leaderboard-opt custom-select">
              {params.gameModes.map((mode, index) => (
                <option key={index} value={mode.mapId}>{mode.desc.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className='container mt-2 mb-4 p-sm-3 p-0'>
        <div className="row justify-content-center">
          <div className="col-md-12">
            <div className="content"></div>
          </div>
        </div>
      </div>
    </>

    )
}
