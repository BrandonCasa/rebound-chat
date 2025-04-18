import FriendModel from "../Friend.js";
import UserModel from "../User.js";

/**
 * Validate and retrieve a user by ID.
 * Throws an error with status 404 if not found.
 *
 * @param {String} userId
 * @returns {Object} User document
 * @throws {Error} If user not found
 */
const validateUserById = async (userId) => {
  const user = await UserModel.findById(userId);
  if (!user || user.active === false) {
    const error = new Error("User not found");
    error.status = 404;
    throw error;
  }
  return user;
};

/**
 * Validate and retrieve a friend request by ID.
 * Throws an error with status 404 if not found.
 *
 * @param {String} friendId
 * @returns {Object} Friend document
 * @throws {Error} If friend document not found
 */
const validateFriendById = async (friendId) => {
  const friend = await FriendModel.findById(friendId);
  if (!friend) {
    const error = new Error("Friend request not found");
    error.status = 404;
    throw error;
  }
  return friend;
};

/**
 * Send a friend request from sender to recipient.
 * Throws an error if:
 *  - The recipient has blocked the sender.
 *  - A request has already been sent or received.
 *
 * On success, returns an object with the new friend request's ID.
 *
 * @param {Object} sender - Sender user document.
 * @param {Object} recipient - Recipient user document.
 * @returns {Object} Object containing friendId.
 * @throws {Error} If operation is not allowed.
 */
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

  // Push friend reference onto both user's friend arrays.
  sender.friends.push(newFriend._id);
  await sender.save();
  recipient.friends.push(newFriend._id);
  await recipient.save();

  return { friendId: newFriend._id.toString() };
};

/**
 * Decline a friend request.
 * Only the recipient can decline a pending friend request.
 *
 * @param {String} friendId - The friend request ID.
 * @param {String} currentUserId - The ID of the requesting user.
 * @returns {Boolean} Returns true on success.
 * @throws {Error} If the request has already been confirmed or if unauthorized.
 */
const declineFriend = async (friendId, currentUserId) => {
  const friend = await validateFriendById(friendId);

  if (friend.confirmed) {
    const error = new Error(
      "Cannot decline an already confirmed friend request.",
    );
    error.status = 403;
    throw error;
  }

  if (friend.recipient.toString() !== currentUserId) {
    const error = new Error(
      "Unauthorized: You are not permitted to decline this request.",
    );
    error.status = 401;
    throw error;
  }

  // Remove friend document reference from both sender and recipient.
  const sender = await validateUserById(friend.requester);
  const recipient = await validateUserById(friend.recipient);
  sender.friends.pull(friend._id);
  await sender.save();
  recipient.friends.pull(friend._id);
  await recipient.save();

  await friend.remove();
  return true;
};

/**
 * Cancel a sent friend request.
 * Only the sender can cancel a pending friend request.
 *
 * @param {String} friendId - The friend request ID.
 * @param {String} currentUserId - The ID of the sender.
 * @returns {Boolean} Returns true on success.
 * @throws {Error} If the request has been confirmed or if unauthorized.
 */
const cancelFriend = async (friendId, currentUserId) => {
  const friend = await validateFriendById(friendId);

  if (friend.requester.toString() !== currentUserId) {
    const error = new Error(
      "Unauthorized: You are not permitted to cancel this request.",
    );
    error.status = 401;
    throw error;
  }

  if (friend.confirmed) {
    const error = new Error(
      "Cannot cancel an already confirmed friend request.",
    );
    error.status = 403;
    throw error;
  }

  const sender = await validateUserById(friend.requester);
  const recipient = await validateUserById(friend.recipient);
  sender.friends.pull(friend._id);
  await sender.save();
  recipient.friends.pull(friend._id);
  await recipient.save();

  await friend.remove();
  return true;
};

/**
 * Remove a confirmed friend from both users' friend lists.
 * Either party may perform this action.
 *
 * @param {String} friendId - The friend request ID.
 * @param {String} currentUserId - The ID of the requesting user.
 * @returns {Boolean} Returns true on success.
 * @throws {Error} If the request is not confirmed or if unauthorized.
 */
const removeFriend = async (friendId, currentUserId) => {
  const friend = await validateFriendById(friendId);

  if (
    friend.recipient.toString() !== currentUserId &&
    friend.requester.toString() !== currentUserId
  ) {
    const error = new Error(
      "Unauthorized: You are not permitted to remove this friend.",
    );
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

  await friend.remove();
  return true;
};

export {
  validateUserById,
  validateFriendById,
  sendFriendRequest,
  cancelFriend,
  declineFriend,
  removeFriend,
};
