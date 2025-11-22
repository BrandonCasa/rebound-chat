import FriendModel from "../Friend.js";
import UserModel from "../User.js";

const validateUserById = async (userId) => {
	const user = await UserModel.findById(userId);
	if (!user || user.active === false) {
		const error = new Error("User not found");
		error.status = 404;
		throw error;
	}
	return user;
};

const validateFriendById = async (friendId) => {
	const friend = await FriendModel.findById(friendId);
	if (!friend) {
		const error = new Error("Friend request not found");
		error.status = 404;
		throw error;
	}
	return friend;
};

const sendFriendRequest = async (sender, recipient) => {
	if (recipient.isBlocked(sender)) {
		const error = new Error("Action forbidden: You are blocked by this user.");
		error.status = 403;
		throw error;
	}

	const alreadySent = await FriendModel.exists({
		requester: sender._id,
		recipient: recipient._id,
	});
	if (alreadySent) {
		const error = new Error("Friend request already sent.");
		error.status = 403;
		throw error;
	}

	const alreadyReceived = await FriendModel.exists({
		requester: recipient._id,
		recipient: sender._id,
	});
	if (alreadyReceived) {
		const error = new Error("Incoming friend request already exists.");
		error.status = 403;
		throw error;
	}

	const newFriend = new FriendModel({
		requester: sender._id,
		recipient: recipient._id,
	});

	await newFriend.save();

	sender.friends.push(newFriend._id);
	await sender.save();
	recipient.friends.push(newFriend._id);
	await recipient.save();

	return { friendId: newFriend._id.toString() };
};

const declineFriend = async (friendId, currentUserId) => {
	const friend = await validateFriendById(friendId);

	if (friend.confirmed) {
		const error = new Error("Cannot decline an already confirmed friend request.");
		error.status = 403;
		throw error;
	}

	if (friend.recipient.toString() !== currentUserId) {
		const error = new Error("Unauthorized: You are not permitted to decline this request.");
		error.status = 401;
		throw error;
	}

	const sender = await validateUserById(friend.requester);
	const recipient = await validateUserById(friend.recipient);
	sender.friends.pull(friend._id);
	await sender.save();
	recipient.friends.pull(friend._id);
	await recipient.save();

	await friend.deleteOne();
	return true;
};

const cancelFriend = async (friendId, currentUserId) => {
	const friend = await validateFriendById(friendId);

	if (friend.requester.toString() !== currentUserId) {
		const error = new Error("Unauthorized: You are not permitted to cancel this request.");
		error.status = 401;
		throw error;
	}

	if (friend.confirmed) {
		const error = new Error("Cannot cancel an already confirmed friend request.");
		error.status = 403;
		throw error;
	}

	const sender = await validateUserById(friend.requester);
	const recipient = await validateUserById(friend.recipient);
	sender.friends.pull(friend._id);
	await sender.save();
	recipient.friends.pull(friend._id);
	await recipient.save();

	await friend.deleteOne();
	return true;
};

const removeFriend = async (friendId, currentUserId) => {
	const friend = await validateFriendById(friendId);

	if (friend.recipient.toString() !== currentUserId && friend.requester.toString() !== currentUserId) {
		const error = new Error("Unauthorized: You are not permitted to remove this friend.");
		error.status = 401;
		throw error;
	}

	if (!friend.confirmed) {
		const error = new Error("Cannot remove an unconfirmed friend request.");
		error.status = 403;
		throw error;
	}

	const sender = await validateUserById(friend.requester);
	const recipient = await validateUserById(friend.recipient);
	sender.friends.pull(friend._id);
	await sender.save();
	recipient.friends.pull(friend._id);
	await recipient.save();

	await friend.deleteOne();
	return true;
};

export { validateUserById, validateFriendById, sendFriendRequest, cancelFriend, declineFriend, removeFriend };
