import mocha from "mocha";
import chai from "chai";
import chaiHttp from "chai-http";
import UserModel from "../models/User.js";

process.env.NODE_ENV = "test";
let should = chai.should();

chai.use(chaiHttp);

describe("Test '/users' api", () => {
  //Before each test we empty the database
  beforeEach((done) => {
    UserModel.remove({}, (err) => {
      done();
    });
  });

  // Test Routes
  describe("(GET) '/users/profile'", () => {
    it("should GET a user's public profile", (done) => {
      chai
        .request(server)
        .get("/book")
        .end((err, res) => {
          res.should.have.status(200);
          res.body.should.be.a("array");
          res.body.length.should.be.eql(0);
          done();
        });
    });
  });
});

describe("Retrieve a user profile '/users/profile'", function () {
  it("idk lol", function (done) {
    const actualResult = healthCheckSync();
    expect(actualResult).to.equal("OK");
    done();
  });
});
