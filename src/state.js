'use strict';

const expose = require( 'expose' );
const objectMerge = require( '../object-merge.js' );
const hasher = require( 'object-hash' );

const uuidv4 = require('uuid/v4');

let ANCESTOR_STATE = {"teams":[], "players": []};
let ANCESTOR_STATE_TIMESTAMP = -1;
let LOCAL_STATE = {"teams":[], "players": []};

exports.getServerUrl = function(path) {
	return window.location.href + path;
};

exports.updateState = function(callback, force) { // TODO: swap param order

	let should_load_from_local_state = !LOCAL_STATE && localStorage && localStorage.LOCAL_STATE && localStorage.ANCESTOR_STATE;

	// TODO: block concurrent syncs or at least disable the buttons in the ui
	if( should_load_from_local_state ) {
		// TODO: do we need to do some basic validation here?
		try {
			LOCAL_STATE = JSON.parse(localStorage.LOCAL_STATE);
			ANCESTOR_STATE = JSON.parse(localStorage.ANCESTOR_STATE);
			console.log("State loaded from local storage");
			callback( null, LOCAL_STATE );
		} catch( e ) {
			console.warn( 'Error loading from local state:', e );
			should_load_from_local_state = false;
		}
	}

	if( !should_load_from_local_state ) {
		var xmlHttp = new XMLHttpRequest();
		// TODO: use fetch api for this instead of xmlhttp, its much easier (uses promises)
		xmlHttp.onreadystatechange = function() {
			if (xmlHttp.readyState === 4 && xmlHttp.status === 200) {
				try {
					if(LOCAL_STATE && (force === false)) {
						LOCAL_STATE = exports.merge(LOCAL_STATE, ANCESTOR_STATE, JSON.parse(xmlHttp.responseText));
					} else {
						LOCAL_STATE = JSON.parse(xmlHttp.responseText);
					}
					ANCESTOR_STATE = JSON.parse(xmlHttp.responseText);
					console.log("State loaded from API call");
					callback( null, LOCAL_STATE );
				} catch(error) {
					callback( error );
					console.log("There was an error while attempting to load state from API call");
					console.log(error);
				}
			}
		};
		xmlHttp.open("GET", exports.getServerUrl('state') , true);
		xmlHttp.send(null);
	}
};

exports.sync = async function(fullSync) {
	console.log("Sync requested!", fullSync ? "full" : "patchOnly");

	// TODO: do we want to cancel any in_progress syncs?

	// Save a deep copy of the local state
	let localStateCopy = JSON.parse(JSON.stringify(state.getState()));
	let localState = state.getState();

	// Get the patch ready to send to the server
	let ancestorChecksum = state.getAncestorStateChecksum() || "";
	let body = {
		md5: (fullSync ? "-" : ancestorChecksum), // TODO: use base 64 to save space?
		patch: objectMerge.diff(state.getAncestorState(), localState)
	}

	// Ship it
	let response = await fetch(state.getServerUrl('sync'), {
		method: 'POST',
		credentials: 'same-origin',
	    headers: {
	      'content-type': 'application/json'
	    },
	    body: JSON.stringify(body),
	});

	if(response.status === 200) {
		let serverState = await response.json();
		console.log("Received",serverState);

		// First gather any changes that were made locally while the request was still working
		console.log("Pre",localStateCopy, localState);
		let localChangesDuringRequest = objectMerge.diff(localStateCopy, localState);
		console.log("localChangesDuringRequest", localChangesDuringRequest);

		// Update the ancestor if updates were received from server
		if(serverState.base) {
			// The entire state was sent, we can just save it directly
			state.setAncestorState(serverState.base);
		} else if(serverState.patches) {
			// Patches were sent, apply all patches to ancestor state
			let ancestorState = state.getAncestorState();
			if(serverState.patches) {
				console.log(`Applying ${serverState.patches.length} patches ` , serverState.patches);
				serverState.patches.forEach(patch => {
					objectMerge.patch(ancestorState, patch)
				});
			}
		} else {
			console.log("No updates recieved from server");
		}

		// If the server state changed, verify the ancesor state (after updates) has the same hash as the server state
		if(serverState.base || serverState.patches) {
			// Verify checksum
			let ancestorHash = hasher(state.getAncestorState(), { 
					algorithm: 'md5',  
					excludeValues: false, 
					respectFunctionProperties: false, 
					respectFunctionNames: false, 
					respectType: false
				} );
			console.log(ancestorHash, serverState.md5);
			if (ancestorHash !== serverState.md5) {
				if(fullSync) {
					// Something went wrong and we can't do anything about it!
					// serverState.base should have contained a verbatium copy of what the server has, so this is weird.
					console.log("Yikes");
				} else {
					// Something bad happened, repeat the request with a invalid checksum so we'll get the whole state back
					console.log("Something went wrong -- Attempting hard sync");
					await exports.sync(true);
					return;
				}
			} else {
				console.log("Patch was successful! (client and server checksums match)");
			}
		}
		// Copy
		let newLocalState = JSON.parse(JSON.stringify(state.getAncestorState()));

		// Apply any changes that were made during the request to the new local state (I'm guessing this will be a no-op most times)
		objectMerge.patch(newLocalState, localChangesDuringRequest, true);
		
		// Set local state to a copy of ancestor state
		state.setLocalState(newLocalState);
	}
	return response.status;
}

// TODO: remove
exports.getState = function() {
	return LOCAL_STATE;
};

exports.setState = function( s ) {
	LOCAL_STATE = s;
	expose.set_state( 'main', {
		render: true
	} );
};

exports.getAncestorState = function() {
	return ANCESTOR_STATE;
};

exports.getLocalState = function() {
	return LOCAL_STATE;
};

exports.setLocalState = function( s ) {
	LOCAL_STATE = s;
	expose.set_state( 'main', {
		render: true
	} );
};

exports.getAncestorStateChecksum = function() {
	let checksum = hasher(ANCESTOR_STATE, { 
					algorithm: 'md5',  
					excludeValues: false, 
					respectFunctionProperties: false, 
					respectFunctionNames: false, 
					respectType: false
				});
	return checksum;
}

exports.getAncestorStateTimestamp = function() {
	return ANCESTOR_STATE_TIMESTAMP;
}

exports.setAncestorStateTimestamp = function( s ) {
	ANCESTOR_STATE_TIMESTAMP = s;
}

exports.setAncestorState = function( s ) {
	ANCESTOR_STATE = s;
	expose.set_state( 'main', {
		render: true
	} );
};

exports.saveStateToLocalStorage = function() {
	localStorage.setItem("LOCAL_STATE", JSON.stringify(LOCAL_STATE));
	localStorage.setItem("ANCESTOR_STATE", JSON.stringify(ANCESTOR_STATE));
};


function isEmpty(obj) {
	for(var prop in obj) {
		if(obj.hasOwnProperty(prop)) {
			return false;
		}
	}
	return JSON.stringify(obj) === JSON.stringify({});
}

exports.merge = function(mine, ancestor, yours) {

	let myChangesOnly = objectMerge.diff(ancestor, mine);
	let yourChangesOnly = objectMerge.diff(ancestor, yours);
	if(!isEmpty(myChangesOnly) && !isEmpty(yourChangesOnly)) {
		let myChangesWin = objectMerge.diff3(mine, ancestor, yours);
		let yourChangesWin = objectMerge.diff3(yours, ancestor, mine);
		if(JSON.stringify(myChangesWin) === JSON.stringify(yourChangesWin)) { // Does this need to be stable to prevent different orderings from returning false
			console.log("Remote and local changes merged (No Conflicts)");
			console.log(JSON.stringify(myChangesWin,null,2));
			let myChangesWinResult = objectMerge.patch(ancestor,myChangesWin);
			return myChangesWinResult;
		} else {
			console.log(JSON.stringify(myChangesWin,null,2));
			console.log(JSON.stringify(yourChangesWin,null,2));
			console.log("Conflicts! Local changes and remote changes were detected but not merged due to conflicts");
			throw "Conflicts detected";
		}
	} else if(!isEmpty(myChangesOnly)) {
		console.log("Local changes merged");
		console.log(JSON.stringify(myChangesOnly,null,2));
		return objectMerge.patch(ancestor,myChangesOnly);
	} else if(!isEmpty(yourChangesOnly)) {
		console.log("Remote changes merged");
		console.log(JSON.stringify(yourChangesOnly,null,2));
		return objectMerge.patch(ancestor,yourChangesOnly);
	} else {
		console.log("No changes detected");
		return ancestor;
	}
};

exports.getQueryObj = function() {
	let queryString = window.location.search || '';
	if ( queryString[ 0 ] === '?' ) {
		queryString = queryString.slice( 1 );
	}
	let params = {},
		queries, temp, i, l;
	queries = queryString.split( '&' );
	for ( i = 0, l = queries.length; i < l; i++ ) {
		temp = queries[ i ].split( '=' );
		params[ temp[ 0 ] ] = temp[ 1 ];
	}
	return params;
};

exports.getNextTeamId = function() {
	return uuidv4();
};

exports.getNextPlayerId = function() {
	return uuidv4();
};

exports.getNextGameId = function() {
	return uuidv4();
};

exports.getNextPlateAppearanceId = function() {
	return uuidv4();
};

exports.getNextPlateAppearanceNumber = function( game_id ) {
	let plateAppearances = exports.getGame( game_id ).plateAppearances;
	let nextPlateAppearanceIndex = 1; // Start at 0 or 1?
	if(plateAppearances && plateAppearances.length > 0) {
		nextPlateAppearanceIndex = Math.max.apply(Math,plateAppearances.map(function(o){return o.plateAppearanceIndex;})) + 1;
	}
	return nextPlateAppearanceIndex;
};

exports.getGame = function( game_id, state ) {
	for ( let team of ( state || LOCAL_STATE ).teams ) {
		for ( let game of team.games ) {
			if ( game.id === game_id ) {
				return game;
			}
		}
	}

	return null;
};

exports.getTeam = function( team_id, state ) {
	return ( state || LOCAL_STATE ).teams.reduce( ( prev, curr ) => {
		return curr.id === team_id  ? curr : prev;
	}, null );
};

exports.getPlayer = function( player_id, state ) {
	return ( state || LOCAL_STATE ).players.reduce( ( prev, curr ) => {
		return curr.id === player_id  ? curr : prev;
	}, null );
};

exports.getAllPlayers = function () {
	return LOCAL_STATE.players;
};

// TODO: allow for passing team and game ids to improve perf
exports.getPlateAppearance = function( pa_id, state ) {
	for ( let team of ( state || LOCAL_STATE ).teams ) {
		for ( let game of team.games ) {
			for ( let pa of game.plateAppearances ) {
				if ( pa.id === pa_id ) {
					return pa;
				}
			}
		}
	}
	return null;
};

exports.getPlateAppearancesForGame = function( game_id ) {
	let game = exports.getGame( game_id );
	if (!game) {
		return null;
	}
	return game.plateAppearances;
};

exports.getPlateAppearancesForPlayerInGame = function( player_id, game_id ) {
	let game = exports.getGame( game_id );
	let player = exports.getPlayer( player_id );
	if (!game || !player ) {
		return null;
	}
	return game.plateAppearances.filter( pa => pa.player_id === player_id );
};

exports.getPlateAppearances = function( team_id, player_id ) {
	let team = exports.getTeam( team_id );
	let plateAppearances = [];

	if ( team.games ) {
		team.games.forEach( game => {
			if ( game.plateAppearances ) {
				const plateAppearancesThisGame = game.plateAppearances.filter(pa => player_id === pa.player_id);
				plateAppearances = plateAppearances.concat(plateAppearancesThisGame);
			}
		});
	}
	return plateAppearances;
};

exports.updatePlateAppearanceResult = function( plateAppearance, result ) {
	plateAppearance.result = result;
	exports.setState( LOCAL_STATE );
};

exports.updatePlateAppearanceLocation = function( plateAppearance, location ) {
	plateAppearance.location = {};
	plateAppearance.location.x = location[0];
	plateAppearance.location.y = location[1];
	exports.setState( LOCAL_STATE );
};

exports.updateLineup = function( lineup, player_id, position_index ) {
	let ind = lineup.indexOf( player_id );
	lineup.splice( ind, 1 );
	lineup.splice( position_index, 0, player_id );
	exports.setState( LOCAL_STATE );
	return lineup;
};

exports.addTeam = function( team_name ) {
	const id = exports.getNextTeamId();
	let new_state = exports.getState();
	let team = {
		id: id,
		name: team_name,
		games: []
	};
	new_state.teams.push( team );
	exports.setState( new_state );
	return team;
};

exports.addPlayerToLineup = function( lineup, player_id ) {
	lineup.push(player_id);
	exports.setState( LOCAL_STATE );
};

exports.addPlayer = function( player_name, gender ) {
	const id = exports.getNextPlayerId();
	let new_state = exports.getState();
	let player = {
		id: id,
		name: player_name,
		gender: gender
	};
	new_state.players.push( player );
	exports.setState( new_state );
	return player;
};

exports.addGame = function( team_id, opposing_team_name ) {
	let new_state = exports.getState();
	const id = exports.getNextGameId();
	const team = exports.getTeam( team_id, new_state );
	let last_lineup = [];
	if ( team.games.length ) {
		let last_game = team.games[ team.games.length - 1 ];
		last_lineup = last_game.lineup.slice();
	}
	let game = {
		id: id,
		opponent: opposing_team_name,
		lineup: last_lineup,
		date: (new Date().getTime()),
		park: "Stazio",
		score_us: 0,
		score_them: 0,
		lineup_type: 2,
		plateAppearances: []
	};
	team.games.push( game );
	exports.setState( new_state );
	return game;
};

exports.addPlateAppearance = function ( player_id, game_id, team_id ) {
	let new_state = exports.getState();
	let game = exports.getGame( game_id );
	let plateAppearances = game.plateAppearances;
	let plateAppearanceIndex = exports.getNextPlateAppearanceNumber( game_id );
	let id = exports.getNextPlateAppearanceId();
	let plateAppearance = {
		id: id,
		player_id: player_id,
		plateAppearanceIndex: plateAppearanceIndex
	};
	plateAppearances.push( plateAppearance );
	exports.setState( new_state );
	return plateAppearance;
};

exports.removeTeam = function( team_id ) {
	let new_state = exports.getState();
	new_state.teams = new_state.teams.filter( ( team ) => {
		return team.id !== team_id;
	} );
	exports.setState( new_state );
};

exports.removeGame = function( game_id, team_id ) {
	let new_state = exports.getState();
	let team = exports.getTeam( team_id );
	var index = new_state.teams.indexOf(team);

	team.games = team.games.filter( game => {
		return game.id !== game_id;
	} );

	if (index > -1) {
		new_state.teams[index] = team;
	} else {
		console.log("Game not found " + game_id);
	}

	exports.setState( new_state );
};

exports.removePlateAppearance = function ( plateAppearance_id, game_id ) {
	let new_state = exports.getState();
	let game = exports.getGame( game_id );

	game.plateAppearances = game.plateAppearances.filter( pa => {
		return pa.id !== plateAppearance_id;
	} );

	exports.setState( new_state );
};


exports.removePlayerFromLineup = function( lineup, player_id ) {
	let index = lineup.indexOf( player_id );
	lineup.splice(index, 1);
	exports.setState( LOCAL_STATE );
};

exports.buildStatsObject = function( team_id, player_id ) {
	let stats = {};
	stats.plateAppearances = 0;
	stats.totalBasesByHit = 0;
	stats.atBats = 0;
	stats.hits = 0;
	stats.doubles = 0;
	stats.triples = 0;
	stats.insideTheParkHR = 0;
	stats.outsideTheParkHR = 0;
	stats.reachedOnError = 0;
	stats.walks = 0;
	stats.fieldersChoice = 0;

	let plateAppearances = exports.getPlateAppearances(team_id, player_id);

	plateAppearances.forEach( pa => {
		if (pa.result) {
			stats.plateAppearances++;
			if (pa.result === "BB") {
				stats.walks++; // Boo!
			} else if (!pa.result || pa.result === "") {
				// Intentionally blank
			} else {
				stats.atBats++;
				if (pa.result === "E") {
					stats.reachedOnError++;
				} else if (pa.result === "FC") {
					stats.fieldersChoice++;
				} else if (pa.result === "Out") {
					// Intentionally blank
				} else {
					stats.hits++;
					if (pa.result === "1B") {
						stats.totalBasesByHit++;
					} else if(pa.result === "2B") {
						stats.doubles++;
						stats.totalBasesByHit += 2;
					} else if(pa.result === "3B") {
						stats.triples++;
						stats.totalBasesByHit += 3;
					} else if(pa.result === "HRi") {
						stats.insideTheParkHR++;
						stats.totalBasesByHit += 4;
					} else if(pa.result === "HRo") {
						stats.outsideTheParkHR++;
						stats.totalBasesByHit += 4;
					}
				}
			}
		}
	});

	if(stats.atBats != 0) {
		stats.battingAverage = (stats.hits/stats.atBats).toFixed(3);
		stats.sluggingPercentage = (stats.totalBasesByHit/stats.atBats).toFixed(3);
	} else {
		stats.battingAverage = "-";
		stats.sluggingPercentage = "-";
	}

	return stats;
};

window.state = exports;
