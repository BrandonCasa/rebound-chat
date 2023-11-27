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

  // Test Routes
  describe("(POST) '/users/register' (1)", () => {
    it("Register User Billy", (done) => {
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
            done();
          } catch (e) {
            done(e);
          }
        });
    });
  });

  describe("(POST) '/users/register' (2)", () => {
    it("Register User Jones", (done) => {
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

  describe("(GET) '/users/login' (1)", () => {
    it("Login", (done) => {
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
            billyId = res.body.user.id;
            billyToken = res.body.user.token;
            done();
          } catch (e) {
            done(e);
          }
        });
    });
  });

  describe("(GET) '/users/profile' (1)", () => {
    it("Get Public Profile", (done) => {
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
  });

  describe("(GET) '/users/profile' (2)", () => {
    it("Get Public Profile", (done) => {
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

  describe("(PUT) '/users/modify' (1)", () => {
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

  describe("(PUT) '/users/addfriend' (1)", () => {
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
            done();
          } catch (e) {
            done(e);
          }
        });
    });

    it("Add Friend Fail", (done) => {
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
});
