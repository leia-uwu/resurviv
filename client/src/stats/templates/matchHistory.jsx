import { h, Fragment } from "jsx-dom";

export default function ({
    error,
    games,
    moreGamesAvailable,
    loading
  }) {
  return (
    <>
      <div class='header-extra'>MATCH HISTORY</div>
      {
        (() => {
          if (error) {
            return (
              <div class='col-lg-10'>
                <div class="m-3">Error loading content, please try again.</div>
              </div>
            )
          } else if (games.length == 0) {
            <div class='col-lg-10'>
              <div class="m-3">No recent games played.</div>
            </div>
          } else {
            return (
              <>
                <div className='col-lg-12'>
                  {games.map((game, index) => (
                    <div key={index} className={`row row-match match-link js-match-data ${game.expanded ? 'match-link-expanded' : ''}`} data-game-id={game.summary.guid}>
                      <div className={`match-link-mode-color match-link-mode-${game.summary.team_mode}`}></div>
                      <div className='hide-xs col-2'>
                        <div className='match-link-player-icons'>
                          {[...Array(game.summary.team_count)].map((_, index) => (
                            <div key={index} className='match-link-player-icon'></div>
                          ))}
                        </div>
                        <div className='match-link-start-time'>
                          {(() => {
                            let timeDiff = '';
                            let timeStart = new Date(game.summary.end_time);
                            let now = Date.now();
                            let secondsPast = (now - timeStart.getTime()) / 1000;
                            if (secondsPast < 3600) {
                              let minutes = Math.round(secondsPast / 60);
                              timeDiff = minutes < 2 ? '1 minute ago' : `${minutes} minutes ago`;
                            } else if (secondsPast <= 86400) {
                              let hours = Math.round(secondsPast / 3600);
                              timeDiff = hours === 1 ? 'an hour ago' : `${hours} hours ago`;
                            } else if (secondsPast > 86400 && secondsPast < 172800) {
                              timeDiff = `${Math.floor(secondsPast / 86400)} day ago`;
                            } else if (secondsPast > 86400) {
                              timeDiff = `${Math.floor(secondsPast / 86400)} days ago`;
                            }
                            return timeDiff;
                          })()}
                        </div>
                      </div>
                      <div className='col-3'>
                        <div className='match-link-stat'>
                          {(() => {
                            let modeText = game.summary.team_mode;
                            modeText = modeText.charAt(0).toUpperCase() + modeText.slice(1);
                            return (
                              <>
                                <div className='match-link-stat-name match-link-stat-name-lg'>{modeText} Rank</div>
                                <div className='match-link-stat-value match-link-stat-value-lg'>
                                  <span className={`match-link-stat-rank match-link-stat-${game.summary.rank}`}>#{game.summary.rank}</span>
                                  /{game.summary.team_total || 80}
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                      <div className='col-2 col-md-1'>
                        <div className='match-link-stat'>
                          <div className='match-link-stat-name match-link-stat-name-md'>Kills</div>
                          <div className='match-link-stat-value match-link-stat-value-md'>{game.summary.kills}</div>
                        </div>
                      </div>
                      {game.summary.team_mode !== 'solo' && (
                        <div className='hide-xs col-md-1'>
                          <div className='match-link-stat'>
                            <div className='match-link-stat-name match-link-stat-name-md'>Team Kills</div>
                            <div className='match-link-stat-value match-link-stat-value-md'>{game.summary.team_kills || 0}</div>
                          </div>
                        </div>
                      )}
                      <div className={`col-2 col-md-1 ${game.summary.team_mode === 'solo' ? 'offset-md-1' : ''}`}>
                        <div className='match-link-stat'>
                          <div className='match-link-stat-name match-link-stat-name-md'>Damage Dealt</div>
                          <div className='match-link-stat-value match-link-stat-value-md'>{game.summary.damage_dealt}</div>
                        </div>
                      </div>
                      <div className='col-2 col-md-1'>
                        <div className='match-link-stat'>
                          <div className='match-link-stat-name match-link-stat-name-md'>Damage Taken</div>
                          <div className='match-link-stat-value match-link-stat-value-md'>{game.summary.damage_taken}</div>
                        </div>
                      </div>
                      <div className='col-2 col-md-1'>
                        <div className='match-link-stat'>
                          <div className='match-link-stat-name match-link-stat-name-md'>Survived</div>
                          <div className='match-link-stat-value match-link-stat-value-md'>
                            {(() => {
                              let timeAlive = game.summary.time_alive;
                              let minutes = Math.floor(timeAlive / 60) % 60;
                              let seconds = Math.floor(timeAlive) % 60;
                              if (seconds < 10) seconds = `0${seconds}`;
                              let timeSurv = `${minutes}:${seconds}`;
                              return timeSurv;
                            })()}
                          </div>
                        </div>
                      </div>
                      <div className='hide-xs col-md-1'>
                        {game.summary.icon && (
                          <div className='match-link-stat'>
                            <div className='game-mode-icon' style={{ backgroundImage: `url(/${game.summary.icon})` }}></div>
                          </div>
                        )}
                      </div>
                      <div className='offset-0 col-1 pl-0 pr-0'>
                        <div className={`match-link-expand ${game.expanded ? 'match-link-expand-up' : 'match-link-expand-down'}`}></div>
                      </div>
                      {game.expanded && (
                        <div id='match-data' className='col-lg-12'>
                          // um?
                          {/* match-data.ejs */}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {
                  moreGamesAvailable && (
                    loading ? (
                      // <!-- Loading more games -->
                      <div class="col-12 spinner-wrapper-match-data">
                        <div class="spinner"></div>
                      </div>
                    ) : (
                      <div class='col-12 js-match-load-more btn-darken'>More</div>
                    )
                  )
                }
              </>
            )
          }
        })()
      }
    </>

  )
}
