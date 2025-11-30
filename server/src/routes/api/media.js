import { Router } from "express";
import { auth } from "../auth.js";
import MediaModel from "../../models/Media/MediaAttachment.js";

const router = Router();

const NIBBLE_POPCOUNT = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

const hexHammingDistance = (hexA = "", hexB = "") => {
	const minLength = Math.min(hexA.length, hexB.length);
	const maxLength = Math.max(hexA.length, hexB.length);

	let distance = 0;
	for (let i = 0; i < minLength; i++) {
		const nibbleA = parseInt(hexA[i], 16);
		const nibbleB = parseInt(hexB[i], 16);

		if (Number.isNaN(nibbleA) || Number.isNaN(nibbleB)) continue;

		const xor = nibbleA ^ nibbleB;
		distance += NIBBLE_POPCOUNT[xor];
	}

	// Account for any trailing unmatched nibbles as full differences.
	distance += (maxLength - minLength) * 4;

	return distance;
};

router.post("/media/check", auth.required, async (req, res, next) => {
	const { hashes = [] } = req.body || {};

	if (!Array.isArray(hashes)) {
		return res.status(400).json({ error: "Payload must include an array of hashes." });
	}

	try {
		const coarseValues = hashes.map((entry) => entry?.coarse).filter((hash) => typeof hash === "string" && hash.length);

		const existingMedia = await MediaModel.find({
			perceptualHashCoarse: { $in: coarseValues },
		})
			.select("perceptualHashCoarse perceptualHashDense size contentType url originalName")
			.lean();

		const results = hashes.map((entry, index) => {
			if (!entry?.coarse || !entry?.fine) return { index, matches: [] };

			const coarseMatches = existingMedia.filter((media) => media.perceptualHashCoarse === entry.coarse);

			const matches = coarseMatches
				.map((media) => {
					const distance = hexHammingDistance(entry.fine, media.perceptualHashDense);
					const bitLength = Math.min(entry.fine.length, media.perceptualHashDense.length) * 4;
					const similarity = bitLength ? 100 - (distance / bitLength) * 100 : 0;
					return {
						_id: media._id,
						url: media.url,
						size: media.size,
						contentType: media.contentType,
						originalName: media.originalName,
						distance,
						similarity,
					};
				})
				.filter((candidate) => candidate.similarity >= 97); // within 3% hamming distance

			return { index, matches };
		});

		return res.json({ results });
	} catch (err) {
		return next(err);
	}
});

export default router;
