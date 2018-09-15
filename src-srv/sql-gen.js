const HandledError = require( './handled-error.js' );
const idUtils = require( '../id-utils.js' );

const tableReferences = ['teams', 'players', 'plateAppearances', 'games', 'lineup'];
const tableNames = ['teams', 'players', 'plate_appearances', 'games', 'players_games'];

/*
 *  This class contains the logic for translating the json structure applicationData on client side to sql satatments on the server. It's a hot mess.
 */

// These works show up in the patch object. We need to identify which parts of the patch object are not id's, do do so we reference this list.
const keywords = tableReferences
	.concat(['date', 'opponent', 'park', 'scoreUs', 'scoreThem', 'lineupType']) // game columns TODO: with the underscore??
	.concat(['result', 'location', 'x', 'y']) // plate_appearance columns
	.concat(['name', 'gender', 'picture', 'songLink', 'songStart']) // player columns
	.concat(['date', 'opponent', 'park']) // team columns
	.concat([/*name already present*/]) // teams columns

let getSqlFromPatch = function(patch, accountId) {
	console.log("PATCH", patch);
	let result = [];
	getSqlFromPatchInternal(patch, [], result, accountId);
	return result;
}

let getSqlFromPatchInternal = function(patch, path, result, accountId) {
	if(accountId === undefined) {
		throw new HandledError(500,"Internal Server Error", "Tried to generate sql while accountId was undefined (no account logged in, or at least no data was stored in the session)");
	}
	let keys = Object.keys(patch);
	for (var i = 0; i < keys.length; i++) {
		let key = keys[i];
		let value = patch[key];
		if(isRoot(value)) {
			let applicableTableReference = getTableReferenceFromPath(path, value.key);
			let applicableTable = getTableFromReference(applicableTableReference);
			let op = value.op;

			if(op === "Delete") {
				// We have to delete references first
				if(applicableTable === "teams") {
					result.push({
						// We need to do the subquery here because we don't have the game id available in the path
						query:"DELETE FROM players_games WHERE game_id IN (SELECT id FROM games WHERE team_id IN ($1) AND account_id IN ($2)) AND account_id IN ($2)",
						values:[idUtils.base62ToHexUuid(value.key), accountId]
					});
					result.push({
						query:"DELETE FROM plate_appearances WHERE team_id IN ($1) AND account_id IN ($2)",
						values:[idUtils.base62ToHexUuid(value.key), accountId]
					});
					result.push({
						query:"DELETE FROM games WHERE team_id IN ($1) AND account_id IN ($2)",
						values:[idUtils.base62ToHexUuid(value.key), accountId]
					});
				}

				if(applicableTable === "games") {
					result.push({
						query:"DELETE FROM players_games WHERE game_id IN ($1) AND account_id IN ($2)",
						values:[idUtils.base62ToHexUuid(value.key), accountId]
					});
					result.push({
						query:"DELETE FROM plate_appearances WHERE game_id IN ($1) AND account_id IN ($2)",
						values:[idUtils.base62ToHexUuid(value.key), accountId]
					});
				}

				if(applicableTable === "players_games") {
					result.push({
						query:"UPDATE players_games SET lineup_index = lineup_index - 1 WHERE lineup_index >= (SELECT lineup_index FROM players_games WHERE game_id = $2 AND player_id = $1 AND account_id = $3) AND game_id = $2 AND account_id = $3",
						values:[idUtils.base62ToHexUuid(value.key), idUtils.base62ToHexUuid(getIdFromPath(path, "games")), accountId]
					});
					result.push({
						query:"DELETE FROM players_games WHERE player_id IN ($1) AND game_id IN ($2) AND account_id IN ($3)",
						values:[idUtils.base62ToHexUuid(value.key), idUtils.base62ToHexUuid(getIdFromPath(path, "games")), accountId]
					});
				} else {
					result.push({
						query:"DELETE FROM " + applicableTable + " WHERE id IN ($1) AND account_id IN ($2)",
						values:[idUtils.base62ToHexUuid(value.key), accountId]
					});
				}
			} else if(op === "ArrayAdd") {
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
				printInsertStatementsFromPatch(insertObject, parents, result, accountId);
			} else if(op === "ReOrder") {
				let oldOrder = JSON.parse(value.param1);
				let newOrder = JSON.parse(value.param2);

				if(applicableTable != "players_games") {
					throw "Something unexpected was reordered!" + applicableTable; // The only thing that should be re-orederable is the lineup, other things are all ordered by created_at timestamp.
				}

				let reOrderQuery = 
				`UPDATE players_games AS pg SET lineup_index = c.lineup_index FROM (values`;
				let values = [idUtils.base62ToHexUuid(getIdFromPath(path, "games")), accountId];
				for(let entry = 0; entry < oldOrder.length; entry++) {
					reOrderQuery += `($1, $${entry*2+3}, (SELECT lineup_index FROM players_games WHERE player_id = $${entry*2+4} AND game_id = $1 AND account_id = $2))`
					if(entry !== (oldOrder.length - 1)){
						reOrderQuery += ",";
					}
					values.push(idUtils.base62ToHexUuid(newOrder[entry]));
					values.push(idUtils.base62ToHexUuid(oldOrder[entry]));
				}
				reOrderQuery += `) AS c(game_id, player_id, lineup_index) WHERE uuid(c.player_id) = pg.player_id AND uuid(c.game_id) = pg.game_id AND account_id = $2;`; 

				result.push({
					query: reOrderQuery,
					values: values
				});
			} else if(op === "Edit") {
				if(applicableTable === "games" && getColNameFromJSONValue(value.key) === "date") {
					result.push({
						query:"UPDATE games SET date = to_timestamp($1) WHERE id IN ($2) AND account_id IN ($3);",
						values:[value.param2, idUtils.base62ToHexUuid(getIdFromPath(path)), accountId]
					});
				} else {
					console.log(path);
					result.push({
						query:"UPDATE " + applicableTable + " SET " + getColNameFromJSONValue(value.key) + " = $1 WHERE id IN ($2) AND account_id IN ($3);",
						values:[value.param2, idUtils.base62ToHexUuid(getIdFromPath(path)), accountId]
					});
				}
			} else if(op === "Add") {
				// we can't add things to a table that aren't defined in the schema. That's okay because we shouldn't get these anyways.
				console.log("WARNING: skipped add");
			} else  {
				throw new HandledError(400, "The request specified an invalid operation. Try again.", "Unrecognized operation: " + op + " " + (patch ? JSON.stringify(patch[key]) : patch));
			}
		} else if (hasProperties(value)) {
			path.push(key);
			getSqlFromPatchInternal(patch[key], path, result, accountId);
			path.pop(key);
		} else {
			console.log("Warning: don't know what to do with this");
		}
	}
}

let printInsertStatementsFromPatch = function(obj, parents, result, accountId) {
	if(accountId === undefined) {
		throw new HandledError(500,"Internal Server Error", "Tried to generate sql while accountId was undefined (no account logged in, or at least data was not stored in the session)");
	}
	if(obj.players) {
		result.push({
			query:"INSERT INTO players (id, name, gender, account_id) VALUES($1, $2, $3, $4)",
			values:[idUtils.base62ToHexUuid(obj.players.id), obj.players.name, obj.players.gender, accountId]
		});
	} 
	if(obj.teams) {
		result.push({
			query:"INSERT INTO teams (id, name, account_id) VALUES($1, $2, $3)",
			values:[idUtils.base62ToHexUuid(obj.teams.id), obj.teams.name, accountId]
		});
		if(obj.teams.games) {
			let insertObject = {};
			insertObject.games = obj.teams.games;

			parents.teamId = obj.teams.id;
			
			printInsertStatementsFromRaw(insertObject, parents, result, accountId);
			parents.teamId = undefined;
		}
	}
	
	if(obj.games) {
		result.push({
			query:"INSERT INTO games (id, date, opponent, park, score_us, score_them, team_id, lineup_type, account_id) VALUES($1, to_timestamp($2), $3, $4, $5, $6, $7, $8, $9)",
			values:[idUtils.base62ToHexUuid(obj.games.id), obj.games.date, obj.games.opponent, obj.games.park, obj.games.scoreUs, obj.games.scoreThem, idUtils.base62ToHexUuid(parents.teamId), obj.games.lineupType, accountId]
		});
		if(obj.games.plateAppearances) {
			let insertObject = {};
			insertObject.plateAppearances = obj.games.plateAppearances;

			parents.gameId = obj.games.id;
			printInsertStatementsFromRaw(insertObject, parents, result, accountId);
			parents.gameId = undefined;
		}
		if(obj.games.lineup) {
			let insertObject = {};
			insertObject.lineup = obj.games.lineup;

			parents.gameId = obj.games.id;
			printInsertStatementsFromRaw(insertObject, parents, result, accountId);
			parents.gameId = undefined;
		}
	}
	
	if(obj.lineup) {
		result.push({
			query:"UPDATE players_games SET lineup_index = lineup_index + 1 WHERE lineup_index >= $1 AND game_id = $2 AND account_id = $3",
			values:[obj.position+1, idUtils.base62ToHexUuid(parents.gameId), accountId] // lineup oredering starts at 1 not 0
		});
		result.push({
			query:"INSERT INTO players_games (player_id, game_id, lineup_index, account_id) VALUES($1, $2, $3, $4)",
			values:[idUtils.base62ToHexUuid(obj.lineup), idUtils.base62ToHexUuid(parents.gameId), obj.position+1, accountId], // lineup oredering starts at 1 not 0
		});
	}
	
	if(obj.plateAppearances) {
		let x;
		let y;
		if(obj.plateAppearances.location) {
			x = obj.plateAppearances.location.x;
			y = obj.plateAppearances.location.y;
		}
		result.push({
			query:"INSERT INTO plate_appearances (id, result, player_id, game_id, team_id, hit_location_x, hit_location_y, account_id) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id;",
			values:[idUtils.base62ToHexUuid(obj.plateAppearances.id), obj.plateAppearances.result, idUtils.base62ToHexUuid(obj.plateAppearances.player_id), idUtils.base62ToHexUuid(parents.gameId), idUtils.base62ToHexUuid(parents.teamId), x, y, accountId]
		});
	}
}

let printInsertStatementsFromRaw = function(obj, parents, result, accountId) {
	if(!accountId) {
		throw new HandledError(500,"Internal Server Error", "Tried to generate sql while accountId was undefined (no account loged in)");
	}
	if(obj.players) {
		for(let i = 0; i < obj.players.length; i++) {
			result.push({
				query:"INSERT INTO players (id, name, gender, account_id) VALUES($1, $2, $3, $4) RETURNING id;",
				values:[idUtils.base62ToHexUuid(obj.players[i].id), obj.players[i].name, obj.players[i].gender, accountId]
			});
		}
	}
	
	if(obj.teams) {
		for(let i = 0; i < obj.teams.length; i++) {
			result.push({
				query:"INSERT INTO teams (id, name, account_id) VALUES($1, $2) RETURNING id;",
				values:[idUtils.base62ToHexUuid(obj.teams[i].id), obj.teams[i].name, accountId]
			});
			if(obj.teams[i].games) {
				let insertObject = {};
				insertObject.games = obj.teams[i].games;

				parents.teamId = obj.teams[i].id;
				printInsertStatementsFromRaw(insertObject, parents, result, accountId);
				parents.teamId = undefined;
			}
		}
	}
	
	if(obj.games && obj.games.length > 0) {
		for(let i = 0; i < obj.games.length; i++) {
			result.push({
				query:"INSERT INTO games (id, date, opponent, park, score_us, score_them, team_id, lineup_type, account_id) VALUES($1, to_timestamp($2), $3, $4, $5, $6, $7, $8, $9) RETURNING id;",
				values:[idUtils.base62ToHexUuid(obj.games[i].id), obj.games[i].date, obj.games[i].opponent, obj.games[i].park, obj.games[i].scoreUs, obj.games[i].scoreThem, idUtils.base62ToHexUuid(parents.teamId), obj.games[i].lineupType, accountId]
			});
			if(obj.games[i].plateAppearances) {
				let insertObject = {};
				insertObject.plateAppearances = obj.games[i].plateAppearances;

				parents.gameId = obj.games[i].id;
				printInsertStatementsFromRaw(insertObject, parents, result, accountId);
				parents.gameId = undefined;
			}
			if(obj.games[i].lineup) {
				let insertObject = {};
				insertObject.lineup = obj.games[i].lineup;

				parents.gameId = obj.games[i].id;
				printInsertStatementsFromRaw(insertObject, parents, result, accountId);
				parents.gameId = undefined;
			}
		}
	}
	
	if(obj.lineup && obj.lineup.length > 0) {
		for(let i = 0; i < obj.lineup.length; i++) {
			result.push({
				query:"INSERT INTO players_games (player_id, game_id, lineup_index, account_id) VALUES($1, $2, $3, $4)",
				values:[idUtils.base62ToHexUuid(obj.lineup[i]), idUtils.base62ToHexUuid(parents.gameId), i+1, accountId]
			});
		}
	}
	
	if(obj.plateAppearances && obj.plateAppearances.length > 0) {
		for(let i = 0; i < obj.plateAppearances.length; i++) {
			let x;
			let y;
			if(obj.plateAppearances[i].location) {
				x = obj.plateAppearances[i].location.x;
				y = obj.plateAppearances[i].location.y;
			}
			result.push({
				query:"INSERT INTO plate_appearances (id, result, player_id, game_id, team_id, hit_location_x, hit_location_y, account_id) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id;",
				values:[idUtils.base62ToHexUuid(obj.plateAppearances[i].id), obj.plateAppearances[i].result, idUtils.base62ToHexUuid(obj.plateAppearances[i].player_id), idUtils.base62ToHexUuid(parents.gameId), idUtils.base62ToHexUuid(parents.teamId), x, y, accountId]
			});
		}
	}
}

let getColNameFromJSONValue = function(value) {
	let map = {
		x:"hit_location_x",
		y:"hit_location_y",
		lineupType:"lineupType",
		scoreUs:"score_us",
		scoreThem:"score_them"
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
		return tableReferences[tableReferences.indexOf(key)];
	}
	for(let i = (path.length-1); i >= 0; i--) {
		if(tableReferences.indexOf(path[i]) >= 0) {
			return tableReferences[tableReferences.indexOf(path[i])];
		}
	}
	//console.log("Warning: not sure what to do with this");
	return null;
}

// Returns the id of type from the path. If no type is specified, returns latest id.
let getIdFromPath = function(path, type) {
	if(type) {
		for(let i = (path.length-1); i >= 0; i--) {
			if(path[i] === type) {
				return path[i+1];
			}
		}
	} else {
		for(let i = (path.length-1); i >= 0; i--) {
			// TODO: sorting the keywords and binary searching through them would be better here
			if(!keywords.includes(path[i])) {
				return path[i];
			} else {
				console.log("Rejected", path[i])
			}
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

module.exports = {  
    getSqlFromPatch: getSqlFromPatch
}