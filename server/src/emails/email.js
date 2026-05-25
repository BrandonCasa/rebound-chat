import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import nodemailer from "nodemailer";

import logger from "../logger.js";

let emailTransport = null;
let emailTransportKind = null;
let initialized = false;
let verified = false;

const shouldDisableEmail = () => {
	if (process.env.EMAIL_DISABLED === "true") return true;
	return process.env.NODE_ENV === "test" && process.env.EMAIL_SEND_IN_TEST !== "true";
};

const resolveSesRegion = () => process.env.AWS_SES_REGION || process.env.SES_REGION || process.env.AWS_REGION || null;

const createSesTransport = () => {
	const region = resolveSesRegion();
	if (!region) return null;

	const sesClient = new SESv2Client({ region });
	return {
		kind: "ses",
		transport: nodemailer.createTransport({
			SES: { sesClient, SendEmailCommand },
		}),
	};
};

const createSmtpTransport = () => {
	if (!process.env.SMTP_HOST) return null;

	return {
		kind: "smtp",
		transport: nodemailer.createTransport({
			host: process.env.SMTP_HOST,
			port: Number(process.env.SMTP_PORT || 587),
			secure: process.env.SMTP_SECURE === "true",
			auth:
				process.env.SMTP_USER && process.env.SMTP_PASS
					? {
							user: process.env.SMTP_USER,
							pass: process.env.SMTP_PASS,
						}
					: undefined,
		}),
	};
};

const initializeEmail = () => {
	if (initialized) {
		return getEmailStatus();
	}

	if (shouldDisableEmail()) {
		emailTransport = null;
		emailTransportKind = null;
		initialized = true;
		verified = false;
		logger.info("Email transport disabled.");
		return getEmailStatus();
	}

	const resolvedTransport = createSesTransport() || createSmtpTransport();
	emailTransport = resolvedTransport?.transport || null;
	emailTransportKind = resolvedTransport?.kind || null;
	initialized = true;
	verified = false;

	if (emailTransportKind) {
		logger.info(`Email transport initialized using ${emailTransportKind.toUpperCase()}.`);
	} else {
		logger.warn("Email transport is not configured. Outbound emails will be logged instead of sent.");
	}

	return getEmailStatus();
};

const getEmailTransport = () => {
	if (!initialized) {
		initializeEmail();
	}

	return emailTransport;
};

const getEmailStatus = () => ({
	configured: Boolean(emailTransport),
	transport: emailTransportKind,
	verified,
});

const getDefaultMailFrom = () => process.env.MAIL_FROM || process.env.SMTP_FROM || "Rebound <no-reply@rebound.nexus>";

const getPasswordResetMailFrom = () => process.env.PASSWORD_RESET_FROM || getDefaultMailFrom();

const getSesMessageOptions = ({ purpose } = {}) => {
	if (!initialized) {
		initializeEmail();
	}

	if (emailTransportKind !== "ses") return undefined;

	const configurationSetName = process.env.PASSWORD_RESET_SES_CONFIGURATION_SET || process.env.AWS_SES_CONFIGURATION_SET || process.env.SES_CONFIGURATION_SET;
	if (!configurationSetName && !purpose) return undefined;

	return {
		...(configurationSetName ? { ConfigurationSetName: configurationSetName } : {}),
		...(purpose ? { EmailTags: [{ Name: "purpose", Value: purpose }] } : {}),
	};
};

const sendEmail = async (mailOptions) => {
	const transport = getEmailTransport();
	if (!transport) return null;

	return transport.sendMail(mailOptions);
};

const verifyEmailTransport = async ({ required = false } = {}) => {
	const transport = getEmailTransport();

	if (!transport) {
		if (required) {
			throw new Error("Email transport is required but not configured.");
		}

		return false;
	}

	try {
		await transport.verify();
		verified = true;
		logger.info(`Email transport verified using ${emailTransportKind.toUpperCase()}.`);
		return true;
	} catch (err) {
		verified = false;
		emailTransport = null;
		emailTransportKind = null;

		const message = `Email transport verification failed: ${err.message}`;
		if (required) {
			throw new Error(message, { cause: err });
		}

		logger.error(message);
		return false;
	}
};

export {
	getDefaultMailFrom,
	getEmailStatus,
	getEmailTransport,
	getPasswordResetMailFrom,
	getSesMessageOptions,
	initializeEmail,
	sendEmail,
	verifyEmailTransport,
};
