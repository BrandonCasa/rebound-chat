import chai from "chai";
import chaiHttp from "chai-http";

chai.use(chaiHttp);

describe("Test '/users' api", function () {
  // Test Routes
  describe("(POST) '/users/register'", function () {
    it("Should register a new user", function (done) {
      chai
        .request("http://127.0.0.1:6001")
        .post("/api/users/register")
        .set("content-type", "application/json")
        .set("Allow-Control-Allow-Origin", "*")
        .send({
          user: {
            username: "testusername",
            email: "test@email.com",
            password: "test_password",
          },
        })
        .end(function (error, response, body) {
          if (error) {
            done(error);
          } else {
            done();
          }
        });
    });
  });
});
