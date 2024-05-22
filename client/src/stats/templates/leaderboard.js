export default function(params) {
    const templateString = `
  <table id='leaderboard-table'>
    <thead>
    <tr class='leaderboard-headers'>
    <th class='header-rank' scope="col" data-l10n='stats-rank' data-caps='true'>RANK</th>
    <th class='header-player' scope="col" data-l10n='stats-player' data-caps='true'>PLAYER</th>
    <!--
    <th class='header-active' scope="col" data-l10n='stats-active' data-caps='true'>ACTIVE</th>
    -->
    <th class='header-stat' scope="col" data-l10n='<%= statName %>' data-caps='true'>STAT</th>
    <% if (type != 'most_kills' && type != 'win_streak') { %>
    <th class='header-games' scope="col" data-l10n='stats-games' data-caps='true'>GAMES (><%= minGames %>)</th>
    <% } %>
    <th class='header-region' scope="col" data-l10n='stats-region' data-caps='true'>REGION</th>
  </tr>
  </thead>
    <tbody class='leaderboard-values'>
    <% for (var i = 0; i < data.length; i++) { %>
    <% if (Array.isArray(data[i].slugs)) { %>
    <tr class='main multiple-players'>
    <td class='data-rank' scope="row">#<%= i + 1 %></td>
    <td class='data-player-names'>
    <% for (var j = 0; j < data[i].slugs.length; j++) { %>
    <span class='player-name'>
    <% if (data[i].slugs[j]) { %>
    <a href="/stats/<%= data[i].slugsUncensored[j] %>"><%= data[i].usernames[j] %></a>
    <% } else { %>
    <%= data[i].usernames[j] %>
    <% } %>
  </span>
    <% } %>
  </td>
    <td><%= data[i].val %></td>
    <td><%= data[i].region ? data[i].region.toUpperCase() : '' %></td>
    <!--
    <td class='<%= data[i].active ? 'active' : 'inactive' %>'></td>
    -->
  </tr>
    <% } else { %>
    <tr class='main single-player'>
    <td class='data-rank' scope="row">#<%= i + 1 %></td>
    <td class='data-player-names'>
    <span class='player-name'>
    <% if (data[i].slug) { %>
    <a href="/stats/<%= data[i].slugUncensored%>"><%= data[i].username %></a>
    <% } else { %>
    <%= data[i].username %>
    <% } %>
  </span>
  </td>
    <!--
    <td class='<%= data[i].active ? 'active' : 'inactive' %>'></td>
    -->
    <td><%= data[i].val %></td>
    <% if (type != 'most_kills' && type != 'win_streak') { %>
    <td><%= data[i].games %></td>
    <% } %>
    <td class='data-region'><%= data[i].region ? data[i].region.toUpperCase() : '' %></td>
  </tr>
    <% } %>
    <% } %>
  </tbody>
  </table>
  
  `;

    return ejs.render(templateString, params);
}
