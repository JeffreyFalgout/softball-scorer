/*eslint no-process-exit:*/
"use strict";

const objectHash = require("object-hash");
const got = require("got");

const CacheCallsLocal = require("../cache-calls-local");
const ComputeLocal = require("../compute-local");
const config = require("../config");
const DatabaseCallsPostgres = require("../database-calls-postgres");
const SoftballServer = require("../softball-server");
const utils = require("./test-utils.js");
const objectMerge = require("../../object-merge.js");

describe("sync", () => {
  beforeAll(async () => {
    const pghost = config.database.host;
    const pgport = config.database.port;
    const username = config.database.username;
    const password = config.database.password;
    this.databaseCalls = new DatabaseCallsPostgres(
      pghost,
      pgport,
      username,
      password
    );
    this.compute = new ComputeLocal();
    this.cache = new CacheCallsLocal();
    this.server = new SoftballServer(this.databaseCalls, this.cache);
    this.server.start();
  });

  afterAll(() => {
    this.server.stop();
    this.databaseCalls.disconnect();
  });

  test("Test account lifecycle", async () => {
    let email = `lifecycleTest${utils.randomId(10)}@softball.app`;
    let password = "pizza";

    // Signup
    await utils.signup(email, password);

    // Login
    let sessionId = await utils.login(email, password);

    // Delete
    await utils.deleteAccount(sessionId);
  });

  test("Sync", async () => {
    let email = `syncTest${utils.randomId(10)}@softball.app`;
    let password = "pizza";

    await utils.signup(email, password);
    let sessionId = await utils.login(email, password);

    try {
      // Sync - Create Team
      let clientAncestorState = { teams: [], players: [] };
      let clientLocalState = {
        teams: [
          {
            id: "4MWewta24olLam",
            name: "BigTeam",
            games: []
          }
        ],
        players: []
      };
      let clientPatch = objectMerge.diff(clientAncestorState, clientLocalState);
      let clientHash = utils.getMd5(clientLocalState);

      const response = await utils.sync(sessionId, clientHash, clientPatch);
      let serverMd5 = response.body.md5;

      expect(serverMd5).toEqual(clientHash);
    } finally {
      await utils.deleteAccount(sessionId);
    }
  });
});
