const state = require( 'state' );

let getNthBatter = function(game_id, n) {
	if(n < 0) {
		return null; // not supported
	}

	let game = state.getGame( game_id );
	let plateAppearances = state.getPlateAppearancesForGame( game_id );

	let type = game.lineup_type;
	let lineup = game.lineup;

	if(lineup.length == 0) {
		return null;
	}

	if(plateAppearances.length == 0) {
		return lineup[0];
	}

	let batter;
	if(type == 1) {
		batter = normalBattingOrder(plateAppearances, lineup, n);
	} else if (type == 2) {
		batter = genderAlternatingOrder(plateAppearances, lineup, n);
	} else {
		return null;
	}

	return batter;
}

let normalBattingOrder = function(plateAppearances, lineup, n) {
	let mostRecentPlateAppearance = plateAppearances.reduce( ( prev, curr ) => curr.plateAppearanceIndex > prev.plateAppearanceIndex ? curr : prev);
	let previousBatterLineupIndex = lineup.findIndex(v => mostRecentPlateAppearance.id);
	let nextBatterIndex = previousBatterLineupIndex + n % lineup.length;
	return  state.getPlayer(lineup[nextBatterIndex]);
}

let genderAlternatingOrder = function(plateAppearances, lineup, n) {

	let mostRecentPlateAppearance = plateAppearances.reduce( ( prev, curr ) => curr.plateAppearanceIndex > prev.plateAppearanceIndex ? curr : prev);
	let mostRecentPlateAppearancePlayer = state.getPlayer(mostRecentPlateAppearance.player_id);
	let otherGender = mostRecentPlateAppearancePlayer.gender == "F" ? "M" : "F";
	let targetBattersGender = n % 2 == 0 ? mostRecentPlateAppearancePlayer.gender : otherGender;

	if(targetBattersGender == "F") {
		let femalePlateApearances = plateAppearances.filter(pa => state.getPlayer(pa.player_id).gender == "F");
		let mostRecentFemalePlateAppearance = femalePlateApearances.length == 0 ? null : femalePlateApearances.reduce( ( prev, curr ) => curr.plateAppearanceIndex > prev.plateAppearanceIndex ? curr : prev);
		let femaleLineup = lineup.map(player_id => state.getPlayer(player_id)).filter(player => player.gender == "F").map(player => player.id);
		let startLookingIndex = mostRecentFemalePlateAppearance ? femaleLineup.findIndex(v => v == mostRecentFemalePlateAppearance.player_id) : 0;
		return state.getPlayer(femaleLineup[(startLookingIndex+Math.floor(n/2))%femaleLineup.length]);
	} else {
		let malePlateApearances = plateAppearances.filter(pa => state.getPlayer(pa.player_id).gender == "M");
		let mostRecentMalePlateAppearance = malePlateApearances.length == 0 ? null : malePlateApearances.reduce( ( prev, curr ) => curr.plateAppearanceIndex > prev.plateAppearanceIndex ? curr : prev);
		let maleLineup = lineup.map(player_id => state.getPlayer(player_id)).filter(player => player.gender == "M").map(player => player.id);
		let startLookingIndex = mostRecentMalePlateAppearance ? maleLineup.findIndex(v => v == mostRecentMalePlateAppearance.player_id) : 0;
		return state.getPlayer(maleLineup[(startLookingIndex+Math.floor(n/2))%maleLineup.length]);
	}
}

module.exports = {  
    getNthBatter: getNthBatter
}