export default function(params) {
    const templateString = `
  <!-- Overview Card -->
  <div class="container mt-3">
      <div class="card card-leaderboard col-lg-8 col-12 p-0">
        <div class="card-body">
          <div class='row card-row-top'>
            <div class='col-12'>
              <div class="leaderboard-title ml-sm-3 ml-0 mr-0 mt-3" data-l10n='index-leaderboards' data-caps='true'>LEADERBOARDS</div>
          </div>
        </div>
      </div>
    </div>
  </div>
  
  <!-- Mode selectors -->
  <div class='container mt-3'>
      <div class="row">
        <div class='col-lg-2 col-3 pr-lg-3 pr-1'>
          <select id="leaderboard-team-mode" class="leaderboard-opt custom-select">
            <option value="solo" data-l10n='stats-solo'>Solo</option>
            <option value="duo" data-l10n='stats-duo'>Duo</option>
            <option value="squad" data-l10n='stats-squad'>Squad</option>
        </select>
      </div>
      <div class='col-lg-2 col-3 pl-lg-0 pr-lg-3 pl-0 pr-1'>
          <select id="leaderboard-type" class="leaderboard-opt custom-select">
            <option value="most_kills" data-l10n='stats-most-kills'>Most kills</option>
            <option value="most_damage_dealt" data-l10n='stats-most-damage'>Most damage</option>
            <option value="kpg" data-l10n='stats-kpg-full'>Kills per game</option>
            <option value="kills" data-l10n='stats-total-kills'>Total kills</option>
            <option value="wins" data-l10n='stats-total-wins'>Total wins</option>
        </select>
      </div>
      <div class='col-lg-2 col-3 pl-lg-0 pr-lg-3 pl-0 pr-1'>
          <select id="leaderboard-time" class="leaderboard-opt custom-select">
            <option value="daily" data-l10n='stats-today'>Today</option>
            <option value="weekly" data-l10n='stats-this-week'>This week</option>
            <option value="alltime" data-l10n='stats-all-time'>All time</option>
        </select>
      </div>
      <div class='col-lg-2 col-3 pl-0'>
          <select id="leaderboard-map-id" class="leaderboard-opt custom-select">
            <% for (var i = 0; i < gameModes.length; i++) { %>
              <option value="<%= gameModes[i].mapId %>"><%= gameModes[i].desc.name%></option>
            <% } %>
        </select>
      </div>
    </div>
  </div>
  
  <div class='container mt-2 mb-4 p-sm-3 p-0'>
      <div class="row justify-content-center">
        <div class="col-md-12">
          <div class="content"></div>
      </div>
    </div>
  </div>
  `;

    return ejs.render(templateString, params);
}
