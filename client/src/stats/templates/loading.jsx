import { h, Fragment } from 'jsx-dom';

export default function(params) {
    switch (params.type) {
        case 'leaderboard':
            return (
                <div class="col-12 spinner-wrapper-leaderboard">
                    <div class="spinner"></div>
                </div>
            );
        case 'player':
            return (
                <div class='container'>
                    <div class="col-12 spinner-wrapper-player">
                        <div class="spinner"></div>
                    </div>
                </div>
            )
        case 'match_history':
            return (
                <div class="col-12 spinner-wrapper-match-history">
                    <div class="spinner"></div>
                </div>
            )
    }   
}
