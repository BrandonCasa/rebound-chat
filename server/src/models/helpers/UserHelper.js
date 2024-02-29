import FriendModel from "../Friend.js";
import UserModel from "../User.js";

const getUserById = async (userId) => {
  const user = await UserModel.findById(userId);
  return user;
};

const sendFriendRequest = async (sender, recipient, res) => {
  if (recipient.isBlocked(sender)) {
    return res.sendStatus(403);
  }

  let alreadySent = await FriendModel.exists({ requester: sender, recipient: recipient });
  if (alreadySent !== null) {
    return res.sendStatus(403);
  }

  let alreadyReceived = await FriendModel.exists({ requester: recipient, recipient: sender });
  if (alreadyReceived !== null) {
    // realistically should just accept it at this point
    return res.sendStatus(403);
  }

  let newFriend = new FriendModel();
  newFriend.requester = sender;
  newFriend.recipient = recipient;

  await newFriend.save();

  sender.friends.push(newFriend);
  await sender.save();
  recipient.friends.push(newFriend);
  await recipient.save();

  return res.json({ friendId: newFriend._id.toString() });
};

export { getUserById, sendFriendRequest };
