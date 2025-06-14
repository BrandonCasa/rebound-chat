export function parseMentions(text, users = []) {
	const mentions = [];
	users.forEach((u) => {
		if (!u?.displayName || !u?.id) return;
		const regex = new RegExp(`@${u.displayName}\\b`, "g");
		let m;
		while ((m = regex.exec(text)) !== null) {
			mentions.push({ user: u.id, start: m.index, end: m.index + m[0].length });
		}
	});
	return mentions;
}

export function highlightMentions(text, mentions) {
	const parts = [];
	let last = 0;
	mentions
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
