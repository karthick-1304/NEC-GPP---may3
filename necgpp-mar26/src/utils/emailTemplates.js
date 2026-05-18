// src/utils/emailTemplates.js
/**
 * Professional Email Template System for NEC GATE Portal
 * High-fidelity, responsive HTML templates with inline styles.
 */

const APP_NAME = 'NEC GATE Preparation Portal';
const PRIMARY_COLOR = '#1e3a8a'; // Deep Navy Blue
const SECONDARY_COLOR = '#1d4ed8'; // Medium Blue
const ACCENT_COLOR = '#fbbf24'; // Amber/Gold
const TEXT_COLOR = '#374151'; // Dark Gray
const LIGHT_BG = '#f3f4f6'; // Light Gray Background

/**
 * Wraps content in a professional, responsive HTML layout.
 */
const baseLayout = (content, previewText = '') => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${APP_NAME}</title>
  <style>
    @media only screen and (max-width: 600px) {
      .container { width: 100% !important; padding: 10px !important; }
      .content { padding: 20px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: ${LIGHT_BG}; color: ${TEXT_COLOR}; line-height: 1.6;">
  <div style="display: none; max-height: 0px; overflow: hidden;">${previewText}</div>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: ${LIGHT_BG}; padding: 40px 0;">
    <tr>
      <td align="center">
        <table class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: ${PRIMARY_COLOR}; padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;">
                ${APP_NAME}
              </h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td class="content" style="padding: 40px 30px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 30px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="margin: 0; color: #6b7280; font-size: 14px;">
                &copy; ${new Date().getFullYear()} National Engineering College. All rights reserved.
              </p>
              <p style="margin: 5px 0 0; color: #9ca3af; font-size: 12px;">
                Automated notification from GATE Preparation Portal. Please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

/**
 * Auth Templates
 */


export const resetPasswordSuccessTemplate = (name) => baseLayout(`
  <h2 style="margin-top: 0; color: #10b981; font-size: 20px;">Password Reset Successful</h2>
  <p>Hi <strong>${name}</strong>,</p>
  <p>Your password has been successfully updated. You can now log in using your new password.</p>
  <p>If you did not perform this action, please contact the administrator immediately.</p>
`, 'Your account password has been reset successfully.');

export const changePasswordTemplate = (name) => baseLayout(`
  <h2 style="margin-top: 0; color: ${PRIMARY_COLOR}; font-size: 20px;">Security Alert: Password Changed</h2>
  <p>Hi <strong>${name}</strong>,</p>
  <p>This is a confirmation that your account password has been changed.</p>
  <p>If you did not perform this action, please contact your department head or system administrator.</p>
`, 'Confirming your password change on the GATE Portal.');

/**
 * Subject/Topic/Set Templates
 */
export const genericNotificationTemplate = (title, message, details = []) => {
  let detailsHtml = '';
  if (details.length > 0) {
    detailsHtml = `
      <div style="background-color: #f9fafb; padding: 20px; border-radius: 6px; margin: 20px 0;">
        <ul style="margin: 0; padding-left: 20px; color: #4b5563;">
          ${details.map(d => `<li style="margin-bottom: 8px;">${d}</li>`).join('')}
        </ul>
      </div>`;
  }

  return baseLayout(`
    <h2 style="margin-top: 0; color: ${PRIMARY_COLOR}; font-size: 20px;">${title}</h2>
    <p>${message}</p>
    ${detailsHtml}
    <p>Please log in to the portal to view the details.</p>
  `, title);
};

export const subjectCreatedAdminTemplate = (subjectName, creatorInfo) => baseLayout(`
  <h2 style="margin-top: 0; color: ${PRIMARY_COLOR}; font-size: 20px;">New Subject Creation</h2>
  <p>A new subject has been successfully registered on the portal.</p>
  <div style="background-color: #f9fafb; padding: 20px; border-radius: 6px; margin: 20px 0;">
    <p style="margin: 0;"><strong>Subject Name:</strong> ${subjectName}</p>
    <p style="margin: 5px 0 0;"><strong>Created By:</strong> ${creatorInfo}</p>
  </div>
  <p>You are the Collaborator for this subject. </p>
`, `New subject created: ${subjectName}`);

export const subjectCreatedNoticeTemplate = (subjectName, creatorDept) => baseLayout(`
  <h2 style="margin-top: 0; color: ${PRIMARY_COLOR}; font-size: 20px;">Subject Catalog Update</h2>
  <p>A new subject has been added to the portal directory.</p>
  <div style="background-color: #f9fafb; padding: 20px; border-radius: 6px; margin: 20px 0;">
    <p style="margin: 0;"><strong>Subject Name:</strong> ${subjectName}</p>
    <p style="margin: 5px 0 0;"><strong>Created By: </strong> ${creatorDept}</p>
  </div>
  <p>If your department requires access to this subject for practice, please send a join request through the "Other Subjects" panel.</p>
`, `Subject available: ${subjectName}`);

/**
 * Welcome Templates
 */
export const welcomeEmailTemplate = (name, email, role, tempPassword) => {
  const roleColors = {
    'Admin': '#ef4444',
    'Dept Head': '#8b5cf6',
    'Staff': '#3b82f6',
    'Student': '#10b981'
  };
  const color = roleColors[role] || PRIMARY_COLOR;

  return baseLayout(`
    <h2 style="margin-top: 0; color: ${PRIMARY_COLOR}; font-size: 22px;">Welcome to ${APP_NAME}</h2>
    <p>Hi <strong>${name}</strong>,</p>
    <p>An account has been created for you on the NEC GATE Preparation Portal with the following credentials:</p>
    <div style="background-color: #f9fafb; padding: 25px; border-radius: 8px; border-left: 4px solid ${color}; margin: 25px 0;">
      <p style="margin: 0;"><strong>Login Email:</strong> ${email}</p>
      <p style="margin: 5px 0 0;"><strong>Assigned Role:</strong> <span style="color: ${color}; font-weight: 600;">${role}</span></p>
      ${tempPassword ? `<p style="margin: 10px 0 0; color: #dc2626;"><strong>Temporary Password:</strong> ${tempPassword}</p>` : ''}
    </div>
    <p>Please log in and update your password immediately for security.</p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${process.env.FRONTEND_URL}" style="background-color: ${PRIMARY_COLOR}; color: #ffffff; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">Log in to Portal</a>
    </div>
  `, `Welcome to the GATE Portal, ${name}!`);
};

/**
 * Admin Action Templates
 */
export const adminActionSummaryTemplate = (title, actionMessage, details = []) => {
  let detailsHtml = '';
  if (details.length > 0) {
    detailsHtml = `
      <div style="background-color: #f9fafb; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid ${PRIMARY_COLOR};">
        <ul style="margin: 0; padding-left: 20px; color: #4b5563;">
          ${details.map(d => `<li style="margin-bottom: 8px;">${d}</li>`).join('')}
        </ul>
      </div>`;
  }

  return baseLayout(`
    <h2 style="margin-top: 0; color: ${PRIMARY_COLOR}; font-size: 20px;">${title}</h2>
    <p>${actionMessage}</p>
    ${detailsHtml}
    <p style="font-size: 13px; color: #9ca3af;">Action timestamp: ${new Date().toLocaleString()}</p>
  `, title);
};

export const userProfileUpdatedTemplate = (name) => baseLayout(`
  <h2 style="margin-top: 0; color: ${PRIMARY_COLOR}; font-size: 20px;">Profile Information Updated</h2>
  <p>Hi <strong>${name}</strong>,</p>
  <p>Your account profile information on the NEC GATE Preparation Portal has been updated by an administrator.</p>
  <p>If you did not expect this change, please contact your department head or the system administrator.</p>
`, 'Your profile has been updated.');

/**
 * Test Templates
 */
export const testCreatedTemplate = (testName, startTime, duration) => baseLayout(`
  <h2 style="margin-top: 0; color: ${PRIMARY_COLOR}; font-size: 20px;">New Test Scheduled</h2>
  <p>A new examination has been scheduled and assigned to your department.</p>
  <div style="background-color: #f9fafb; padding: 20px; border-radius: 6px; margin: 20px 0;">
    <p style="margin: 0;"><strong>Test Name:</strong> ${testName}</p>
    <p style="margin: 5px 0 0;"><strong>Start Time:</strong> ${new Date(startTime).toLocaleString()}</p>
    <p style="margin: 5px 0 0;"><strong>Duration:</strong> ${duration} Minutes</p>
  </div>
  <p>Please ensure all students are notified and prepared for the scheduled time.</p>
`, `New Test: ${testName}`);
