
// Begin: Stuff to move to a different file ------------------

let tableReferences = ['teams', 'players', 'plateAppearances', 'games', 'lineup'];
let tableNames = ['teams', 'players', 'plate_appearances', 'games', 'player_games'];

let getSqlFromPatch = function(patch) {
	let result = [];
	getSqlFromPatchInternal(patch, [], result);
	return result;
}

let getSqlFromPatchInternal = function(patch, path, result) {
	let keys = Object.keys(patch);
	for (var i = 0; i < keys.length; i++) {
		let key = keys[i];
		let value = patch[key];
		if(isRoot(value)) {
			let applicableTableReference = getTableReferenceFromPath(path, value.key);
			let applicableTable = getTableFromReference(applicableTableReference);
			let op = value.op;

			if(op == "Delete") {
				// We have to delete references first
				if(applicableTable == "teams") {
					result.push({
						query:"DELETE FROM games WHERE game_id IN (SELECT id FROM games WHERE team_id IN ($1))",
						values:[value.key]
					});
					result.push({
						query:"DELETE FROM plate_appearances WHERE team_id IN ($1)",
						values:[value.key]
					});
					result.push({
						query:"DELETE FROM games WHERE team_id IN ($1)",
						values:[value.key]
					});
				}

				if(applicableTable == "games") {
					result.push({
						query:"DELETE FROM player_games WHERE game_id IN ($1)",
						values:[value.key]
					});
					result.push({
						query:"DELETE FROM plate_appearances WHERE game_id IN ($1)",
						values:[value.key]
					});
				}

				result.push({
					query:"DELETE FROM " + applicableTable + " WHERE id IN ($1)",
					values:[value.key]
				});
			} else if(op == "ArrayAdd") {
				// We need to add the key back to the object
				let insertObject = {};
				insertObject[applicableTableReference] = JSON.parse(value.param1);

				// Get the parent ids from the path
				let parents = {};
				if(applicableTableReference == 'games') {
					parents.teamId = path[1];
				} else if(applicableTableReference == 'plateAppearances') {
					parents.teamId = path[1];
					parents.gameId = path[3];
				} else if(applicableTableReference == 'lineup') {
					parents.gameId = path[3];
					insertObject.position = value.param2; // lineup is not based on primary key ordering so we need to specify a position
				}
				printInsertStatementsFromPatch(insertObject, parents, result);
			} else if(op == "ReOrder") {
				let param1 = value.param1.substring(1, value.param1.length-1);
				let param2 = value.param2.substring(1, value.param2.length-1);

				let oldOrder = param1.split(',');
				let newOrder = param2.split(',');

				if(applicableTable != "player_games") {
					throw "Something unexpected was reordered!" + applicableTable; // The only thing that should be re-orederable is the lineup, other things are all ordered by primary key
				}

				for(let entry = 0; entry < oldOrder.length; entry++) {
					result.push({
						query:"UPDATE player_games SET lineup_index = (SELECT lineup_index FROM players_games WHERE id = $1) WHERE id IN ($2);",
						values:[oldOrder[entry], newOrder[entry]]
					});
				}
			} else if(op == "Edit") {
				result.push({
					query:"UPDATE " + applicableTable + " SET " + getColNameFromJSONValue(value.key) + " = $1 WHERE id IN ($2);",
					values:[value.param2, getIdFromPath(path)]
				});
			} else  {
				throw "Unrecognized operation: " + op + " " + JSON.stringify(patchObj[key])
			}
			
		} else if (hasProperties(value)) {
			path.push(key);
			getSqlFromPatchInternal(patch[key], path, result);
			path.pop(key);
		} else {
			console.log("Warning: don't know what to do with this");
		}
	}
}

let printInsertStatementsFromPatch = function(obj, parents, result) {

	if(obj.players) {
		result.push({
			query:"INSERT INTO players (name, gender) VALUES($1, $2);",
			values:[obj.players.name, obj.players.gender]
		});
	} 
	
	if(obj.teams) {
		result.push({
			query:"INSERT INTO teams (name) VALUES($1);",
			values:[obj.teams.name]
		});
		if(obj.teams.games) {
			let insertObject = {};
			insertObject.games = obj.teams.games;

			parents.teamId = obj.teams.id;
			printInsertStatementsFromRaw(insertObject, parents, result);
			parents.teamId = undefined;
		}
	}
	
	if(obj.games) {
		result.push({
			query:"INSERT INTO games (date, opponent, park, score_us, score_them, team_id, lineup_type) VALUES($1, $2, $3, $4, $5, $6, $7);",
			values:[obj.games.date, obj.games.opponent, obj.games.park, obj.games.score_us, obj.games.score_them, parents.teamId, obj.games.lineup_type]
		});
		if(obj.games.plateAppearances) {
			let insertObject = {};
			insertObject.plateAppearances = obj.games.plateAppearances;

			parents.gameId = obj.games.id;
			printInsertStatementsFromRaw(insertObject, parents, result);
			parents.gameId = undefined;
		}
		if(obj.games.lineup) {
			let insertObject = {};
			insertObject.lineup = obj.games.lineup;

			parents.gameId = obj.games.id;
			printInsertStatementsFromRaw(insertObject, parents, result);
			parents.gameId = undefined;
		}
	}
	
	if(obj.lineup) {
		result.push({
			query:"UPDATE players_games SET lineup_index = lineup_index + 1 WHERE lineup_index >= $1 AND game_id = $2;",
			values:[obj.position, parents.gameId]
		});
		result.push({
			query:"INSERT INTO players_games (player_id, game_id, lineup_index) VALUES($1, $2, $3);",
			values:[obj.lineup, parents.gameId, obj.position]
		});
	}
	
	if(obj.plateAppearances) {
		result.push({
			query:"INSERT INTO plate_appearances (result, player_id, game_id, team_id, hit_location_x, hit_location_y, index_in_game) VALUES($1, $2, $3, $4, $5, $6);",
			values:[obj.plateAppearances.result, obj.plateAppearances.player_id, obj.plateAppearances.game_id, obj.plateAppearances.team_id, obj.plateAppearances.location.x, obj.plateAppearances.location.y, obj.plateAppearances.index_in_game]
		});
	}
	
}


let printInsertStatementsFromRaw = function(obj, parents, result) {

	if(obj.players) {
		for(let i = 0; i < obj.players.length; i++) {
			//console.log('INSERT INTO players (name, gender) VALUES($1, $2);')
			//console.log(obj.players[i].name, obj.players[i].gender);
			result.push({
				query:"INSERT INTO players (name, gender) VALUES($1, $2);",
				values:[obj.players[i].name, obj.players[i].gender]
			});
		}
	} 
	
	if(obj.teams) {
		for(let i = 0; i < obj.teams.length; i++) {
			//console.log('INSERT INTO teams (name) VALUES($1);')
			//console.log(obj.teams[i].name);
			result.push({
				query:"INSERT INTO teams (name) VALUES($1);",
				values:[obj.teams[i].name]
			});
			if(obj.teams[i].games) {
				let insertObject = {};
				insertObject.games = obj.teams[i].games;

				parents.teamId = obj.teams[i].id;
				printInsertStatementsFromRaw(insertObject, parents, result);
				parents.teamId = undefined;
			}
		}
	}
	
	if(obj.games && obj.games.length > 0) {
		for(let i = 0; i < obj.games.length; i++) {
			//console.log('INSERT INTO games (date, opponent, park, score_us, score_them, team_id, lineup_type) VALUES($1, $2, $3, $4, $5, $6, $7);')
			//console.log(obj.games[i].date, obj.games[i].opponent, obj.games[i].park, obj.games[i].score_us, obj.games[i].score_them, parents.teamId, obj.games[i].lineup_type);
			result.push({
				query:"INSERT INTO games (date, opponent, park, score_us, score_them, team_id, lineup_type) VALUES($1, $2, $3, $4, $5, $6, $7);",
				values:[obj.games[i].date, obj.games[i].opponent, obj.games[i].park, obj.games[i].score_us, obj.games[i].score_them, parents.teamId, obj.games[i].lineup_type]
			});
			if(obj.games[i].plateAppearances) {
				let insertObject = {};
				insertObject.plateAppearances = obj.games[i].plateAppearances;

				parents.gameId = obj.games[i].id;
				printInsertStatementsFromRaw(insertObject, parents, result);
				parents.gameId = undefined;
			}
			if(obj.games[i].lineup) {
				let insertObject = {};
				insertObject.lineup = obj.games[i].lineup;

				parents.gameId = obj.games[i].id;
				printInsertStatementsFromRaw(insertObject, parents, result);
				parents.gameId = undefined;
			}
		}
	}
	
	if(obj.lineup && obj.lineup.length > 0) {
		for(let i = 0; i < obj.lineup.length; i++) {
			//console.log('INSERT INTO players_games (player_id, game_id, lineup_index) VALUES($1, $2, $3);');
			//console.log(obj.lineup[i], parents.gameId, i+1);
			result.push({
				query:"INSERT INTO players_games (player_id, game_id, lineup_index) VALUES($1, $2, $3);",
				values:[obj.lineup[i], parents.gameId, i+1]
			});
		}
	}
	
	if(obj.plateAppearances && obj.plateAppearances.length > 0) {
		for(let i = 0; i < obj.plateAppearances.length; i++) {
			//console.log('INSERT INTO plate_appearances (result, player_id, game_id, team_id, hit_location_x, hit_location_y, index_in_game) VALUES($1, $2, $3, $4. $5, $6);');
			//console.log(obj.plateAppearances[i].result, obj.plateAppearances[i].player_id, parents.gameId, parents.teamId, obj.plateAppearances[i].location.x, obj.plateAppearances[i].location.y, obj.plateAppearances[i].index_in_game);
			result.push({
				query:"INSERT INTO plate_appearances (result, player_id, game_id, team_id, hit_location_x, hit_location_y, index_in_game) VALUES($1, $2, $3, $4. $5, $6);",
				values:[obj.plateAppearances[i].result, obj.plateAppearances[i].player_id, parents.gameId, parents.teamId, obj.plateAppearances[i].location.x, obj.plateAppearances[i].location.y, obj.plateAppearances[i].index_in_game]
			});
		}
	}
	
}

let getColNameFromJSONValue = function(value) {
	let map = {
		x:"hit_location_x",
		y:"hit_location_y"
	}
	if(map[value]) {
		return map[value];
	} else {
		return value;
	}
}

let getTableFromReference = function(reference) {
	return tableNames[tableReferences.indexOf(reference)];
}

// If 'key' is a table reference, it is returned. Otherwise, this function returns the latest value in the 'path' array that is a table reference. 
let getTableReferenceFromPath = function(path, key) {
	// Map JSON names to db table names

	if(tableReferences.indexOf(key) >= 0) {
		//console.log("Key is tableRef " + key + " " + tableNames[tableReferences.indexOf(key)]);
		return tableReferences[tableReferences.indexOf(key)];
	}
	for(let i = (path.length-1); i >= 0; i--) {
		if(tableReferences.indexOf(path[i]) >= 0) {
			//console.log("Path has tableRef " + path[i] + " " + tableNames[tableReferences.indexOf(path[i])]);
			return tableReferences[tableReferences.indexOf(path[i])];
		}
	}
	//console.log("Warning: not sure what to do with this");
	return null;
}

let getIdFromPath = function(path) {
	for(let i = (path.length-1); i >= 0; i--) {
		if(isNumeric(path[i])) {
			return path[i];
		}
	}
}

// returns true if the obj has any properties assigned
let hasProperties = function(obj) {
	//console.log(Object.keys(obj));
	if(Object.keys(obj).length > 0)  {
		return true;
	} else {
		return false;
	}
}

// Returns true if none of the object's properties are objects themselves.
let isRoot = function (obj) {
	let keys = Object.keys(obj);
	for (var i = 0; i < keys.length; i++) {
		let key = keys[i];
		if (obj[key] !== null && typeof obj[key] === 'object') {
			return false;
		}
	}
	return true;
}

let isNumeric = function(value) {
  return !isNaN(value - parseFloat(value));
}

module.exports = {  
    getSqlFromPatch: getSqlFromPatch
}