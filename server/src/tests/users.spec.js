/* eslint-disable no-unused-expressions */
/* eslint-disable jest/valid-expect */
import chai, { assert, expect } from "chai";
import chaiHttp from "chai-http";

chai.use(chaiHttp);

describe("Test '/users' api", () => {
  var agent = chai.request.agent("http://127.0.0.1:6001");
  let billyId = "";
  let billyToken = "";

  let jonesId = "";
  let jonesToken = "";

  let friendId = "";

  // Test Routes
  describe("(POST) '/users/register'", () => {
    it("Register Billy", (done) => {
      agent
        .post("/api/users/register")
        .set("Content-Type", "application/json")
        .set("Allow-Control-Allow-Origin", "*")
        .send({
          user: {
            username: "billy",
            email: "billy@email.com",
            displayName: "Billy Bob",
            bio: "I am Billy Bob!!!",
            password: "billyabc1[",
          },
        })
        .end((err, res) => {
          try {
            if (res.body.hasOwnProperty("errors")) {
              assert.fail(JSON.stringify(res.body.errors));
            }
            if (res.status !== 200) {
              assert.fail(`Status code is ${res.status}, not 200.`);
            }
            billyId = res.body.user.id;
            billyToken = res.body.user.token;
            done();
          } catch (e) {
            done(e);
          }
        });
    });

    it("Register Jones", (done) => {
      agent
        .post("/api/users/register")
        .set("Content-Type", "application/json")
        .set("Allow-Control-Allow-Origin", "*")
        .send({
          user: {
            username: "jones",
            email: "jones@email.com",
            displayName: "Jones Junior",
            bio: "I am Jones Junior!!!",
            password: "jonesabc1[",
          },
        })
        .end((err, res) => {
          try {
            if (res.body.hasOwnProperty("errors")) {
              assert.fail(JSON.stringify(res.body.errors));
            }
            if (res.status !== 200) {
              assert.fail(`Status code is ${res.status}, not 200.`);
            }
            jonesId = res.body.user.id;
            jonesToken = res.body.user.token;
            done();
          } catch (e) {
            done(e);
          }
        });
    });
  });

  describe("(GET) '/users/login'", () => {
    it("Login Billy", (done) => {
      agent
        .get("/api/users/login")
        .set("Content-Type", "application/json")
        .set("Allow-Control-Allow-Origin", "*")
        .send({
          user: {
            email: "billy@email.com",
            password: "billyabc1[",
          },
        })
        .end((err, res) => {
          try {
            if (res.body.hasOwnProperty("errors")) {
              assert.fail(JSON.stringify(res.body.errors));
            }
            if (res.status !== 200) {
              assert.fail(`Status code is ${res.status}, not 200.`);
            }
            done();
          } catch (e) {
            done(e);
          }
        });
    });

    it("Login Jones", (done) => {
      agent
        .get("/api/users/login")
        .set("Content-Type", "application/json")
        .set("Allow-Control-Allow-Origin", "*")
        .send({
          user: {
            email: "jones@email.com",
            password: "jonesabc1[",
          },
        })
        .end((err, res) => {
          try {
            if (res.body.hasOwnProperty("errors")) {
              assert.fail(JSON.stringify(res.body.errors));
            }
            if (res.status !== 200) {
              assert.fail(`Status code is ${res.status}, not 200.`);
            }
            done();
          } catch (e) {
            done(e);
          }
        });
    });
  });

  describe("(GET) '/users/profile'", () => {
    it("Get Billy's Profile (Billy)", (done) => {
      agent
        .get("/api/users/profile")
        .set("Content-Type", "application/json")
        .set("Allow-Control-Allow-Origin", "*")
        .set("authorization", `Bearer ${billyToken}`)
        .send({
          id: billyId,
        })
        .end((err, res) => {
          try {
            if (res.body.hasOwnProperty("errors")) {
              assert.fail(JSON.stringify(res.body.errors));
            }
            if (res.status !== 200) {
              assert.fail(`Status code is ${res.status}, not 200.`);
            }
            done();
          } catch (e) {
            done(e);
          }
        });
    });

    it("Get Jones's Profile (Billy)", (done) => {
      agent
        .get("/api/users/profile")
        .set("Content-Type", "application/json")
        .set("Allow-Control-Allow-Origin", "*")
        .set("authorization", `Bearer ${billyToken}`)
        .send({
          id: jonesId,
        })
        .end((err, res) => {
          try {
            if (res.body.hasOwnProperty("errors")) {
              assert.fail(JSON.stringify(res.body.errors));
            }
            if (res.status !== 200) {
              assert.fail(`Status code is ${res.status}, not 200.`);
            }
            done();
          } catch (e) {
            done(e);
          }
        });
    });
  });

  describe("(PUT) '/users/modify'", () => {
    it("Modify Profile", (done) => {
      agent
        .put("/api/users/modify")
        .set("Content-Type", "application/json")
        .set("Allow-Control-Allow-Origin", "*")
        .set("authorization", `Bearer ${billyToken}`)
        .send({
          user: {
            displayName: "Billy Joe",
            bio: "I am Billy Joe!!!",
            password: "billyabc2[",
          },
        })
        .end((err, res) => {
          try {
            if (res.body.hasOwnProperty("errors")) {
              assert.fail(JSON.stringify(res.body.errors));
            }
            if (res.status !== 200) {
              assert.fail(`Status code is ${res.status}, not 200.`);
            }
            done();
          } catch (e) {
            done(e);
          }
        });
    });
  });

  describe("(PUT) '/users/addfriend'", () => {
    it("Add Friend Pass", (done) => {
      agent
        .put("/api/users/addfriend")
        .set("Content-Type", "application/json")
        .set("Allow-Control-Allow-Origin", "*")
        .set("authorization", `Bearer ${billyToken}`)
        .send({
          recipientId: jonesId,
        })
        .end((err, res) => {
          try {
            if (res.body.hasOwnProperty("errors")) {
              assert.fail(JSON.stringify(res.body.errors));
            }
            if (res.status !== 200) {
              assert.fail(`Status code is ${res.status}, not 200.`);
            }
            friendId = res.body.friendId;
            done();
          } catch (e) {
            done(e);
          }
        });
    });

    it("Add Friend Duplicate", (done) => {
      agent
        .put("/api/users/addfriend")
        .set("Content-Type", "application/json")
        .set("Allow-Control-Allow-Origin", "*")
        .set("authorization", `Bearer ${billyToken}`)
        .send({
          recipientId: jonesId,
        })
        .end((err, res) => {
          try {
            if (res.body.hasOwnProperty("errors")) {
              assert.fail(JSON.stringify(res.body.errors));
            }
            if (res.status !== 403) {
              assert.fail(`Status code is ${res.status}, not 403.`);
            }
            done();
          } catch (e) {
            done(e);
          }
        });
    });
  });

  describe("(PUT) '/users/acceptfriend'", () => {
    it("Accept Friend Wrong", (done) => {
      agent
        .put("/api/users/acceptfriend")
        .set("Content-Type", "application/json")
        .set("Allow-Control-Allow-Origin", "*")
        .set("authorization", `Bearer ${billyToken}`)
        .send({
          friendId: friendId,
        })
        .end((err, res) => {
          try {
            if (res.body.hasOwnProperty("errors")) {
              assert.fail(JSON.stringify(res.body.errors));
            }
            if (res.status !== 401) {
              assert.fail(`Status code is ${res.status}, not 401.`);
            }
            done();
          } catch (e) {
            done(e);
          }
        });
    });

    it("Accept Friend Correct", (done) => {
      agent
        .put("/api/users/acceptfriend")
        .set("Content-Type", "application/json")
        .set("Allow-Control-Allow-Origin", "*")
        .set("authorization", `Bearer ${jonesToken}`)
        .send({
          friendId: friendId,
        })
        .end((err, res) => {
          try {
            if (res.body.hasOwnProperty("errors")) {
              assert.fail(JSON.stringify(res.body.errors));
            }
            if (res.status !== 200) {
              assert.fail(`Status code is ${res.status}, not 200.`);
            }
            done();
          } catch (e) {
            done(e);
          }
        });
    });
  });
});
