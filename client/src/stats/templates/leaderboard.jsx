import { h, Fragment } from "jsx-dom";

export default function ({
  type,
  statName,
  data,
  minGames
}) {
  return (
    <table id='leaderboard-table'>
  <thead>
    <tr className='leaderboard-headers'>
      <th className='header-rank' scope="col" data-l10n='stats-rank' data-caps='true'>RANK</th>
      <th className='header-player' scope="col" data-l10n='stats-player' data-caps='true'>PLAYER</th>
      {/* <th className='header-active' scope="col" data-l10n='stats-active' data-caps='true'>ACTIVE</th> */}
      <th className='header-stat' scope="col" data-l10n={statName} data-caps='true'>STAT</th>
      {type !== 'most_kills' && type !== 'win_streak' &&
        <th className='header-games' scope="col" data-l10n='stats-games' data-caps='true'>GAMES ({">"}{minGames})</th>
      }
      <th className='header-region' scope="col" data-l10n='stats-region' data-caps='true'>REGION</th>
    </tr>
  </thead>
  <tbody className='leaderboard-values'>
    {data.map((item, i) => (
      Array.isArray(item.slugs) ? (
        <tr key={i} className='main multiple-players'>
          <td className='data-rank' scope="row">#{i + 1}</td>
          <td className='data-player-names'>
            {item.slugs.map((slug, j) => (
              <span key={j} className='player-name'>
                {slug ? (
                  <a href={`/stats/${item.slugsUncensored[j]}`}>{item.usernames[j]}</a>
                ) : (
                  item.usernames[j]
                )}
              </span>
            ))}
          </td>
          <td>{item.val}</td>
          <td>{item.region ? item.region.toUpperCase() : ''}</td>
          {/* <td className={item.active ? 'active' : 'inactive'}></td> */}
        </tr>
      ) : (
        <tr key={i} className='main single-player'>
          <td className='data-rank' scope="row">#{i + 1}</td>
          <td className='data-player-names'>
            <span className='player-name'>
              {item.slug ? (
                <a href={`/stats/${item.slugUncensored}`}>{item.username}</a>
              ) : (
                item.username
              )}
            </span>
          </td>
          {/* <td className={item.active ? 'active' : 'inactive'}></td> */}
          <td>{item.val}</td>
          {type !== 'most_kills' && type !== 'win_streak' && <td>{item.games}</td>}
          <td className='data-region'>{item.region ? item.region.toUpperCase() : ''}</td>
        </tr>
      )
    ))}
  </tbody>
</table>

  )
}
