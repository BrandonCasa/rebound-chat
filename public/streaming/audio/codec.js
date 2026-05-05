/**
 * Audio codec normalization helpers.
 */

import { lower } from "../codecs.js";
import { AUDIO_CODEC_OPTIONS } from "../defaults.js";

const normalizeAudioCodec = (value) => {
	let codec = lower(value);
	if (codec === "mp3") codec = "libmp3lame";
	if (!AUDIO_CODEC_OPTIONS.includes(codec)) {
		throw new Error(`Audio codec must be one of ${AUDIO_CODEC_OPTIONS.join(", ")}.`);
	}
	return codec;
};

export { normalizeAudioCodec };
