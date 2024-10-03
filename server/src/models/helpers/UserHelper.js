import FriendModel from "../Friend.js";
import UserModel from "../User.js";

const validateUserById = async (userId, res) => {
	const user = await UserModel.findById(userId);
	if (!user) {
		return res.sendStatus(404);
	}
	return user;
};

const validateFriendById = async (friendId, res) => {
	const friend = await FriendModel.findById(friendId);
	if (!friend) {
		return res.sendStatus(404);
	}
	return friend;
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

const removeFriend = async (friend, res) => {
	if (!friend.confirmed) {
		return res.sendStatus(403);
	}

	const sender = await validateUserById(friend.requester._id, res);
	const recipient = await validateUserById(friend.recipient._id, res);

	sender.friends.pull(friend._id);
	await sender.save();
	recipient.friends.pull(friend._id);
	await recipient.save();

	await friend.remove();

	return res.sendStatus(200);
};

export { validateUserById, validateFriendById, sendFriendRequest, removeFriend };
