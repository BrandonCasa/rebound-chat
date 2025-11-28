const escapeRegExp = (value = "") => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function parseMentions(text, users = []) {
	const mentions = [];
	users.forEach((u) => {
		const userId = u?.id ?? u?._id;
		if (!u?.displayName || !userId) return;
		const regex = new RegExp(`@${escapeRegExp(u.displayName)}\\b`, "g");
		let m;
		while ((m = regex.exec(text)) !== null) {
			mentions.push({ user: userId, start: m.index, end: m.index + m[0].length });
		}
	});
	return mentions;
}

export function highlightMentions(text, mentions) {
	const parts = [];
	let last = 0;
	[...mentions]
		.sort((a, b) => a.start - b.start)
		.forEach(({ start, end }, idx) => {
			if (start > last) {
				parts.push({ text: text.slice(last, start), key: `t${idx}-b` });
			}
			parts.push({ text: text.slice(start, end), mention: true, key: `m${idx}` });
			last = end;
		});
	if (last < text.length) {
		parts.push({ text: text.slice(last), key: `t-end` });
	}
	return parts;
}
