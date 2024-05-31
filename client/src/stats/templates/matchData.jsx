import { h, Fragment } from "jsx-dom";;

export default function ({
    loading,
    data,
    error
  }) {
    let team_id = 0;
    let teamIdx = 0;
  
    if (loading) {
      return (
        <div class="col-12 spinner-wrapper-match-data">
          <div class="spinner"></div>
        </div>
      )
    } else if (error || !data || data.length == 0) {
      return (
        <div class='col-lg-10'>
          <div class='m-3'>Error loading content, please try again.</div>
        </div>
      )
    } else {
      return (
        <>
          <div class='match-header-wrapper'>
            <table class='match-table'>
              <thead>
                <tr class='match-headers'>
                  <th class='match-header-rank' scope="col" data-l10n='stats-rank' data-caps='true'>RANK</th>
                  <th class='match-header-icon hide-xs' scope="col"></th>
                  <th class='match-header-player' scope="col" data-l10n='stats-player' data-caps='true'>PLAYER</th>
                  <th class='match-header-stat' scope="col" data-l10n='stats-kills' data-caps='true'>KILLS</th>
                  <th class='match-header-stat hide-xs' scope="col" data-l10n='stats-damage' data-caps='true'>DAMAGE</th>
                  <th class='match-header-stat' scope="col" data-l10n='stats-survived' data-caps='true'>SURVIVED</th>
                </tr>
              </thead>
            </table>
          </div>
          <div class='match-table-wrapper'>
            <table class='match-table'>
              <thead>
                <tr class='match-headers'>
                  <th class='match-header-rank'></th>
                  <th class='match-header-icon hide-xs'></th>
                  <th class='match-header-player'></th>
                  <th class='match-header-stat'></th>
                  <th class='match-header-stat hide-xs'></th>
                  <th class='match-header-stat'></th>
                </tr>
              </thead>
              <tbody class='match-values'>
                {
                  data.map((d) => {
                    var showRank = false;
                    if (team_id != d.team_id) {
                      team_id = d.team_id;
                      teamIdx += 1;
                      showRank = true;
                    }
  
                    return (
                      <tr key={i} className={`main single-player ${teamIdx % 2 === 0 ? 'match-row-dark' : 'match-row-light'} ${d.player_id === localId ? 'match-row-local' : ''}`}>
                        {showRank ? (
                          <td className='data-rank' scope="row">
                            #{d.rank}
                          </td>
                        ) : (
                          <td></td>
                        )}
                        <td class='data-player-status hide-xs'>
                          {
                            (localId != 0 && d.killer_id == localId) && (
                              <div class='player-icon player-kill'></div>
                            )
                          }
                          {
                            (d.killed_ids ?? []).map((killed_id) => {
                              if (localId != 0 && killed_id == localId) {
                                return (<div class='player-icon player-death'></div>)
                              }
                              return null;
                            })
                          }
                        </td>
                        <td class='data-player-names'>
                          <span class='player-name'>
                            {
                              d.slug ? (
                                <a class="player-slug" href={`/stats/${d.slug}`}> {d.username} </a> 
                              ) : (
                                <>{d.username}</>
                              )
                            }
                          </span>
                        </td>
                        <td>{d.kills}</td>
                        <td class='hide-xs'>{ d.damage_dealt }</td>
                        <td>
                          {
                            (() => {
                              // use humanize time helper?  
                              var timeAlive = d.time_alive;
                              var minutes = Math.floor(timeAlive / 60) % 60;
                              var seconds = Math.floor(timeAlive) % 60;
                              if (seconds < 10) {seconds = "0" + seconds};
                              var timeSurv = '';
                              timeSurv += minutes + ':';
                              timeSurv += seconds;
  
                              return timeSurv
                            })()
                          }
                        </td>
                      </tr>
                    )
                  })
                }
              </tbody>
            </table>
          </div>
        </>
      )
    }
  }
