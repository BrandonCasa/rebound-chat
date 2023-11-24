/* eslint-disable no-unused-expressions */
/* eslint-disable jest/valid-expect */
import chai, { assert, expect } from "chai";
import chaiHttp from "chai-http";

chai.use(chaiHttp);

describe("Test '/users' api", () => {
  let theId = "";
  let theToken = "";

  // Test Routes
  describe("(POST) '/users/register'", () => {
    var agent = chai.request.agent("http://127.0.0.1:6001");

    it("Should register a new user", (done) => {
      agent
        .post("/api/users/register")
        .set("Content-Type", "application/json")
        .set("Allow-Control-Allow-Origin", "*")
        .send({
          user: {
            username: "testusername",
            email: "test@email.com",
            password: "test_password",
          },
        })
        .end((err, res) => {
          try {
            if (res.body.hasOwnProperty("errors")) {
              assert.fail(JSON.stringify(res.body.errors));
            }
            if (res.status !== 200) {
              assert.fail(`Status code is ${res.status}, not 200`);
            }
            done();
          } catch (e) {
            done(e);
          }
        });
    });

    it("Should login", (done) => {
      agent
        .post("/api/users/login")
        .set("Content-Type", "application/json")
        .set("Allow-Control-Allow-Origin", "*")
        .send({
          user: {
            email: "test@email.com",
            password: "test_password",
          },
        })
        .end((err, res) => {
          try {
            if (res.body.hasOwnProperty("errors")) {
              assert.fail(JSON.stringify(res.body.errors));
            }
            if (res.status !== 200) {
              assert.fail(`Status code is ${res.status}, not 200`);
            }
            theId = res.body.user.id;
            theToken = res.body.user.token;
            done();
          } catch (e) {
            done(e);
          }
        });
    });

    it("Should get profile", (done) => {
      agent
        .get("/api/users/profile")
        .set("Content-Type", "application/json")
        .set("Allow-Control-Allow-Origin", "*")
        .set("authorization", `Token ${theToken}`)
        .send({
          id: theId,
        })
        .end((err, res) => {
          try {
            if (res.body.hasOwnProperty("errors")) {
              assert.fail(JSON.stringify(res.body.errors));
            }
            if (res.status !== 200) {
              assert.fail(`Status code is ${res.status}, not 200`);
            }
            done();
          } catch (e) {
            done(e);
          }
        });
    });
  });
});
