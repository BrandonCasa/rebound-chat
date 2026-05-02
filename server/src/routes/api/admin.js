import { Router } from "express";

import logger from "../../logger.js";
import FriendModel from "../../models/Friend.js";
import ServerModel from "../../models/Server.js";
import ServerInviteModel from "../../models/ServerInvite.js";
import UserModel from "../../models/User.js";
import "dotenv/config";

const router = Router();

router.post("/admin/users/delete", async function (req, res, next) {
	const userId = req.body.userId;
	logger.info(`Starting deletion process for user: ${userId}`);

	try {
		await UserModel.transaction(async (session) => {
                        const friendDocs = await FriendModel.find({
                                $or: [{ requester: userId }, { recipient: userId }],
                        }).session(session);

                        logger.info(`Found ${friendDocs.length} friend request(s) for user: ${userId}`);

                        for (const friend of friendDocs) {
                                const otherUserId = friend.requester.toString() === userId ? friend.recipient : friend.requester;
                                await UserModel.updateOne({ _id: otherUserId }, { $pull: { friends: friend._id } }).session(session);
                                logger.info(`Removed friend document (${friend._id}) from user: ${otherUserId}`);
                        }
                        await UserModel.updateOne({ _id: userId }, { $set: { friends: [] } }).session(session);
                        await FriendModel.deleteMany({
                                $or: [{ requester: userId }, { recipient: userId }],
			}).session(session);

			logger.info(`Cleared friend list and deleted friend documents for user: ${userId}`);

                        const serverInviteDocs = await ServerInviteModel.find({
                                $or: [{ requester: userId }, { recipient: userId }],
                        }).session(session);

                        logger.info(`Found ${serverInviteDocs.length} server invite(s) for user: ${userId}`);

			for (const invite of serverInviteDocs) {
                                const otherUserId = invite.requester.toString() === userId ? invite.recipient : invite.requester;
                                await UserModel.updateOne({ _id: otherUserId }, { $pull: { serverInvites: invite._id } }).session(session);
                                logger.info(`Removed server invite (${invite._id}) from user: ${otherUserId}`);
                        }
                        await UserModel.updateOne({ _id: userId }, { $set: { serverInvites: [] } }).session(session);
                        await ServerInviteModel.deleteMany({
                                $or: [{ requester: userId }, { recipient: userId }],
                        }).session(session);

			logger.info(`Cleared server invites for user: ${userId}`);

                        const serversOwned = await ServerModel.find({ owner: userId }).session(session);

			logger.info(`User ${userId} is owner of ${serversOwned.length} server(s)`);

                        for (const server of serversOwned) {
                                if (server.co_owner) {
                                        logger.info(`Server ${server._id}: transferring ownership from user ${userId} to co_owner ${server.co_owner}`);
                                        server.owner = server.co_owner;
                                        server.co_owner = null;
                                } else {
                                        const otherMembers = server.members.filter((memberId) => memberId.toString() !== userId);
                                        if (otherMembers.length > 0) {
                                                logger.info(`Server ${server._id}: transferring ownership from user ${userId} to oldest member ${otherMembers[0]}`);
						server.owner = otherMembers[0];
					} else {
                                                logger.info(`Server ${server._id}: no members left after removing user ${userId}, setting owner to null`);
                                                server.owner = null;
                                        }
                                }
                                server.members = server.members.filter((memberId) => memberId.toString() !== userId);
                                await server.save({ session });
                        }
                        await ServerModel.updateMany({ members: userId }, { $pull: { members: userId } }).session(session);

			logger.info(`Updated server membership and ownership for user ${userId}`);

                        await UserModel.updateOne(
                                { _id: userId },
                                {
					username: `deleted_user_${userId}`,
					displayName: `Deleted User ${userId.slice(0, 5)}`,
					email: `deleted_user_${userId}@deleted.com`,
					bio: "",
					hash: "",
					salt: "",
					friends: [],
					serverInvites: [],
					active: false,
				}
			).session(session);

			logger.info(`User ${userId} anonymized successfully`);
		});

		logger.info(`User ${userId} deletion process completed successfully`);
		return res.sendStatus(200);
	} catch (error) {
		logger.info(`Error occurred during deletion of user ${userId}: ${error.message}`);
		return next(error);
	}
});

router.post("/admin/friends/cleanup", async function (req, res, next) {
	logger.info("Starting friend request cleanup");
	try {
                await UserModel.transaction(async (session) => {
                        const allFriends = await FriendModel.find({}).session(session);
                        const validIds = new Set(allFriends.map((f) => f._id.toString()));

                        const users = await UserModel.find({}).session(session);
                        const userMap = new Map();
                        for (const user of users) {
				const filtered = user.friends.filter((id) => validIds.has(id.toString()));
				if (filtered.length !== user.friends.length) {
					user.friends = filtered;
					await user.save({ session });
					logger.info(`Cleaned friend list for user ${user._id}`);
                                }
                                userMap.set(user._id.toString(), user);
                        }

                        for (const friend of allFriends) {
                                const requester = userMap.get(friend.requester.toString());
                                const recipient = userMap.get(friend.recipient.toString());

				const requesterHas = requester && requester.friends.some((id) => id.toString() === friend._id.toString());
				const recipientHas = recipient && recipient.friends.some((id) => id.toString() === friend._id.toString());

				if (!requesterHas && !recipientHas) {
					await friend.deleteOne({ session });
					logger.info(`Deleted orphan friend document ${friend._id}`);
					continue;
				}

				if (requester && !requesterHas) {
					requester.friends.push(friend._id);
					await requester.save({ session });
					logger.info(`Added friend document ${friend._id} to user ${requester._id}`);
				}

				if (recipient && !recipientHas) {
					recipient.friends.push(friend._id);
					await recipient.save({ session });
					logger.info(`Added friend document ${friend._id} to user ${recipient._id}`);
				}
			}
		});

		logger.info("Friend request cleanup completed successfully");
		return res.sendStatus(200);
	} catch (error) {
		logger.info(`Error during friend request cleanup: ${error.message}`);
		return next(error);
	}
});

export default router;
