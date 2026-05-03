// src/utils/sendEmail.js
import nodemailer from 'nodemailer';
import logger     from './logger.js';

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

export const sendEmail = async ({ to, subject, text, html, attachments = [] }) => {
  if (process.env.NODE_ENV === 'development') {
    console.log('DEV MODE: Email delivery suppressed natively', { to, subject }); 
    logger.info('DEV MODE: Email delivery suppressed natively', { to, subject });
    return { messageId: 'dev_mode_mock_id' };
  }

  try {
    const info = await transporter.sendMail({
      from:        process.env.SMTP_FROM,
      to,
      subject,
      text,
      html,
      attachments
    });
    logger.info('Email sent', { to, subject, messageId: info.messageId });
    return info;
  } catch (err) {
    logger.error('Email send failed', { to, subject, err: err.message });
    throw err;
  }
};