/* eslint-disable no-unused-expressions */
/* eslint-disable jest/valid-expect */
import chai, { assert, expect } from "chai";
import chaiHttp from "chai-http";
import { io } from "socket.io-client";

chai.use(chaiHttp);

const chaiAgent = chai.request.agent("http://127.0.0.1:6001");

function waitFor(socket, event) {
  return new Promise((resolve) => {
    socket.once(event, resolve);
  });
}

describe("Test '/dev' api", () => {
  // Test Routes
  describe("(PUT) '/dev/database/wipe'", () => {
    it("Wipe MongoDB", (done) => {
      chaiAgent
        .put("/api/dev/database/wipe")
        .set("Content-Type", "application/json")
        .set("Allow-Control-Allow-Origin", "*")
        .send()
        .end((err, res) => {
          try {
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

describe("Test '/users' api", () => {
  let billyId = "";
  let billyToken = "";

  let jonesId = "";
  let jonesToken = "";

  let friendId = "";

  // Test Routes
  describe("(POST) '/users/register'", () => {
    it("Register Billy", (done) => {
      chaiAgent
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
      chaiAgent
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
    it("Login Jones", (done) => {
      chaiAgent
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
      chaiAgent
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
      chaiAgent
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
    it("Modify Billy's Profile", (done) => {
      chaiAgent
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
    it("Add Friend Correct", (done) => {
      chaiAgent
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

    it("Add Friend Wrong", (done) => {
      chaiAgent
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
      chaiAgent
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
      chaiAgent
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

  describe("(PUT) '/users/removefriend'", () => {
    it("Remove Friend", (done) => {
      chaiAgent
        .put("/api/users/removefriend")
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

describe("Test SocketIO", () => {
  let billyId, billyToken, jonesId, jonesToken, testRoomId;
  let clientSocket = io();

  it("Wipe MongoDB", (done) => {
    chaiAgent
      .put("/api/dev/database/wipe")
      .set("Content-Type", "application/json")
      .set("Allow-Control-Allow-Origin", "*")
      .send()
      .end((err, res) => {
        try {
          if (res.status !== 200) {
            assert.fail(`Status code is ${res.status}, not 200.`);
          }
          done();
        } catch (e) {
          done(e);
        }
      });
  });

  it("Register Billy", (done) => {
    chaiAgent
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
    chaiAgent
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

  it("Login Jones", (done) => {
    chaiAgent
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

  it("Make Test Room", (done) => {
    chaiAgent
      .post("/api/dev/database/testroom")
      .set("Content-Type", "application/json")
      .set("Allow-Control-Allow-Origin", "*")
      .send()
      .end((err, res) => {
        try {
          if (res.status !== 200) {
            assert.fail(`Status code is ${res.status}, not 200.`);
          }
          testRoomId = res.body.roomId;
          done();
        } catch (e) {
          done(e);
        }
      });
  });

  it("Connect Jones", (done) => {
    const URL = process.env.NODE_ENV === "production" ? undefined : "http://localhost:3000";
    clientSocket = io.connect(URL, {
      query: { token: jonesToken },
    });

    clientSocket.on("connected", () => {
      clientSocket.off("connected");
      done();
    });
  });

  it("Join Room Jones", (done) => {
    clientSocket.emit("join_room", testRoomId);

    clientSocket.on("joined_room", (roomId) => {
      done();
    });
  });

  it("Leave Room Jones", (done) => {
    clientSocket.emit("leave_room", testRoomId);

    clientSocket.on("left_room", (roomId) => {
      done();
    });
  });

  it("On Disconnect Jones", (done) => {
    clientSocket.on("disconnect", () => {
      clientSocket.off("disconnect");
      done();
    });

    clientSocket.disconnect();
  });
});
