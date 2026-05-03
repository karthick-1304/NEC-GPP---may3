// src/services/email.service.js
import { sendEmail } from '../utils/sendEmail.js';
import { executeQuery } from '../config/db.js';
import * as templates from '../utils/emailTemplates.js';
import logger from '../utils/logger.js';
import { isMaintenanceActive } from './emailGate.service.js';

// ─── Suppression gate (maintenance mode) ──────────────────────────────────────
// Most emails are management noise. During system bring-up / yearly maintenance
// an Admin can flip a kill switch (see emailGate.service). `suppressed()`
// returns true for non-mandatory callers and they short-circuit.
const suppressed = async (subject) => {
  if (await isMaintenanceActive()) {
    logger.info('Email suppressed (maintenance mode)', { subject });
    return true;
  }
  return false;
};

// ─── Shared: fetch all admin emails ──────────────────────────────────────────
const getAdminEmails = async () => {
  const rows = await executeQuery(`SELECT email FROM users WHERE role = 'Admin'`);
  return rows.map(r => r.email);
};

// ─── Shared: fetch emails for a dept (students + staff) ──────────────────────
const getDeptMemberEmails = async (deptId) => {
  const rows = await executeQuery(
    `SELECT u.email FROM users u
     JOIN students s ON u.user_id = s.student_id WHERE s.dept_id = ?
     UNION
     SELECT u.email FROM users u
     JOIN staffs st ON u.user_id = st.staff_id WHERE st.dept_id = ?`,
    [deptId, deptId]
  );
  return rows.map(r => r.email);
};

// ─── Shared: fetch dept head email for a dept ────────────────────────────────
const getDeptHeadEmail = async (deptId) => {
  const rows = await executeQuery(
    `SELECT u.email FROM users u
     JOIN departments d ON d.head_user_id = u.user_id
     WHERE d.dept_id = ?`,
    [deptId]
  );
  return rows[0]?.email ?? null;
};

// ─── Shared: fetch all collaborator dept head emails for a subject ────────────
const getCollaboratorEmails = async (subjectId) => {
  const rows = await executeQuery(
    `SELECT u.email FROM users u
     JOIN departments d   ON d.head_user_id = u.user_id
     JOIN subject_access_dept sad ON sad.dept_id = d.dept_id
     WHERE sad.subject_id = ?`,
    [subjectId]
  );
  return rows.map(r => r.email);
};

// ─── Helper: send to array of recipients, skipping empty ─────────────────────
const bulkSend = async ({ to, subject, html, attachments = [] }) => {
  let recipients = [];
  if (Array.isArray(to)) recipients = to;
  else if (typeof to === 'string') recipients = to.split(',').map(s => s.trim());

  recipients = [...new Set(recipients.filter(Boolean))];
  if (!recipients.length) return;
  try {
    await sendEmail({ to: recipients.join(','), subject, html, attachments });
  } catch (err) {
    logger.error('Bulk email failed', { subject, err: err.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH & USER MANAGEMENT EMAILS
// ═══════════════════════════════════════════════════════════════════════════════

export const sendWelcomeEmail = async (user, tempPassword = null) => {
  const html = templates.welcomeEmailTemplate(user.full_name, user.email, user.role, tempPassword);
  await sendEmail({
    to: user.email,
    subject: `Welcome to ${user.role === 'Admin' ? 'Admin Panel — NEC GATE Preparation Portal' : 'NEC GATE Preparation Portal'}`,
    html
  });

  // Also notify admins of new user (single)
  const adminEmails = await getAdminEmails();
  const adminHtml = templates.adminActionSummaryTemplate(
    'New User Created',
    `A new <strong>${user.role}</strong> account has been created manually by an administrator.`,
    [`Name: ${user.full_name}`, `Email: ${user.email}`, `Role: ${user.role}`]
  );
  await bulkSend({ to: adminEmails, subject: `System Notification: New ${user.role} Created`, html: adminHtml });
};

export const sendWelcomeEmailToUserOnly = async (user, tempPassword = null) => {
  const html = templates.welcomeEmailTemplate(user.full_name, user.email, user.role, tempPassword);
  await sendEmail({
    to: user.email,
    subject: `Welcome to ${user.role === 'Admin' ? 'Admin Panel — NEC GATE Preparation Portal' : 'NEC GATE Preparation Portal'}`,
    html
  });
};

export const sendBulkCreationSummary = async (role, count, additionalDetails = []) => {
  if (await suppressed('Bulk user creation summary')) return;
  const adminEmails = await getAdminEmails();
  const html = templates.adminActionSummaryTemplate(
    'Bulk User Creation Successful',
    `A total of <strong>${count} ${role}s</strong> have been successfully imported via Excel.`,
    additionalDetails
  );
  await bulkSend({ to: adminEmails, subject: `System Notification: Bulk ${role} Import`, html });
};

export const sendUserEditedNotice = async (user, editorUserId) => {
  if (await suppressed('User profile updated')) return;
  // 1. Notify the user
  const userHtml = templates.userProfileUpdatedTemplate(user.full_name);
  await sendEmail({ to: user.email, subject: 'Your Profile Has Been Updated', html: userHtml });

  // 2. Notify all admins
  const adminEmails = await getAdminEmails();
  const adminHtml = templates.adminActionSummaryTemplate(
    'User Profile Updated',
    `Administrator (ID: ${editorUserId}) has updated the profile for user: <strong>${user.full_name}</strong>.`,
    [`Email: ${user.email}`, `Role: ${user.role}`]
  );
  await bulkSend({ to: adminEmails, subject: `System Notification: User Profile Update`, html: adminHtml });
};

export const sendUserDeletedNotice = async (userName, userEmail, userRole, editorUserId) => {
  if (await suppressed('User deletion notice')) return;
  const adminEmails = await getAdminEmails();
  const html = templates.adminActionSummaryTemplate(
    'User Deleted',
    `Administrator (ID: ${editorUserId}) has permanently deleted a user account.`,
    [`Name: ${userName}`, `Email: ${userEmail}`, `Role: ${userRole}`]
  );
  await bulkSend({ to: adminEmails, subject: `System Notification: User Deletion`, html });
};

export const sendBulkDeletionSummary = async (count, details, editorUserId) => {
  if (await suppressed('Bulk deletion summary')) return;
  const adminEmails = await getAdminEmails();
  const html = templates.adminActionSummaryTemplate(
    'Bulk Deletion Executed',
    `Administrator (ID: ${editorUserId}) has performed a bulk deletion.`,
    [`Action: ${details}`, `Records removed: ${count}`]
  );
  await bulkSend({ to: adminEmails, subject: `System Notification: Bulk Deletion`, html });
};

export const sendForgotPasswordEmail = async (user, otp, expiryMinutes) => {
  const content = `
    <h2 style="margin-top: 0; color: #1e3a8a; font-size: 20px;">Verification Code</h2>
    <p>Hi <strong>${user.full_name}</strong>,</p>
    <p>You requested a password reset for your NEC GATE Preparation Portal account. Use the code below to proceed:</p>
    <div style="background-color: #f3f4f6; padding: 25px; text-align: center; border-radius: 8px; margin: 25px 0;">
      <h1 style="margin: 0; letter-spacing: 8px; font-size: 32px; color: #1e3a8a;">${otp}</h1>
    </div>
    <p style="font-size: 14px; color: #6b7280;">This code will expire in ${expiryMinutes} minutes. If you did not request this, please ignore this email.</p>
  `;
  const html = templates.genericNotificationTemplate('Password Reset Request', content);
  await sendEmail({ to: user.email, subject: 'Password Reset OTP — NEC GATE Portal', html });
};

export const sendPasswordChangedEmail = async (user) => {
  const html = templates.changePasswordTemplate(user.full_name);
  await sendEmail({ to: user.email, subject: 'Security Alert: Password Changed', html });
};

// ═══════════════════════════════════════════════════════════════════════════════
// SUBJECT EMAILS
// ═══════════════════════════════════════════════════════════════════════════════

export const sendSubjectCreatedMails = async (subject, collaboratorDeptIds, allDeptIds) => {
  if (await suppressed(`Subject created: ${subject?.subject_name}`)) return;
  const allHeadRows = await executeQuery(
    `SELECT u.email, d.dept_id FROM users u
     JOIN departments d ON d.head_user_id = u.user_id`
  );

  const collaboratorEmails = allHeadRows.filter(r => collaboratorDeptIds.includes(r.dept_id)).map(r => r.email);
  const nonCollaboratorEmails = allHeadRows.filter(r => !collaboratorDeptIds.includes(r.dept_id)).map(r => r.email);
  const adminEmails = await getAdminEmails();

  // (a) To Non-Collaborators
  const htmlNotice = templates.subjectCreatedNoticeTemplate(subject.subject_name, subject.creator || 'Admin');
  await bulkSend({
    to: nonCollaboratorEmails,
    subject: `New Subject: ${subject.subject_name}`,
    html: htmlNotice
  });

  // (b) To Collaborators + Admins
  const htmlAdmin = templates.subjectCreatedAdminTemplate(subject.subject_name, subject.creator || 'Admin');
  await bulkSend({
    to: [...collaboratorEmails, ...adminEmails],
    subject: `New Collaborative Subject: ${subject.subject_name}`,
    html: htmlAdmin
  });
};

export const sendSubjectUpdatedMail = async (subjectId, oldName, newName) => {
  if (await suppressed(`Subject renamed: ${oldName} → ${newName}`)) return;
  const collaboratorEmails = await getCollaboratorEmails(subjectId);
  const adminEmails = await getAdminEmails();
  const html = templates.genericNotificationTemplate(
    'Subject Renamed',
    `The subject <strong>${oldName}</strong> has been renamed to <strong>${newName}</strong>.`
  );
  await bulkSend({ to: [...collaboratorEmails, ...adminEmails], subject: `Subject Renamed: "${oldName}" → "${newName}"`, html });
};

export const sendSubjectLockMail = async (subjectId, subjectName, locked) => {
  if (await suppressed(`Subject lock toggle: ${subjectName}`)) return;
  const collaboratorEmails = await getCollaboratorEmails(subjectId);
  const adminEmails = await getAdminEmails();
  const action = locked ? 'Locked' : 'Unlocked';
  const html = templates.genericNotificationTemplate(
    `Subject ${action}`,
    `Access to the subject <strong>${subjectName}</strong> has been ${action.toLowerCase()} by the Admin/subject owner.`
  );
  await bulkSend({ to: [...collaboratorEmails, ...adminEmails], subject: `Subject ${action}: ${subjectName}`, html });
};

export const sendDeptViewLockMail = async (deptId, subjectName, locked) => {
  if (await suppressed(`Dept view lock: ${subjectName}`)) return;
  const memberEmails = await getDeptMemberEmails(deptId);
  const action = locked ? 'Hidden' : 'Visible';
  const html = templates.genericNotificationTemplate(
    'Visibility Changed',
    `The subject <strong>${subjectName}</strong> is now <strong>${action.toLowerCase()}</strong> for your department based on your Department Head's settings.`
  );
  await bulkSend({ to: memberEmails, subject: `Visibility Change: ${subjectName}`, html });
};

export const sendCollaboratorAddedMail = async (subjectId, subjectName, addedDeptName) => {
  if (await suppressed(`Collaborator added: ${subjectName}`)) return;
  const collaboratorEmails = await getCollaboratorEmails(subjectId);
  const adminEmails = await getAdminEmails();
  const html = templates.genericNotificationTemplate(
    'New Collaborator Added',
    `Department <strong>${addedDeptName}</strong> has been granted collaborating access to the subject <strong>${subjectName}</strong>.`
  );
  await bulkSend({ to: [...collaboratorEmails, ...adminEmails], subject: `Collaborator Added: ${subjectName}`, html });
};

export const sendCollaboratorRemovedMail = async (subjectId, subjectName, removedDeptId, removedDeptName) => {
  if (await suppressed(`Collaborator removed: ${subjectName}`)) return;
  const collaboratorEmails = await getCollaboratorEmails(subjectId);
  const adminEmails = await getAdminEmails();
  const removedHeadEmail = await getDeptHeadEmail(removedDeptId);

  // Notice to remaining collaborators
  const htmlRemaining = templates.genericNotificationTemplate(
    'Collaborator Removed',
    `Department <strong>${removedDeptName}</strong> is no longer collaborating on the subject <strong>${subjectName}</strong>.`
  );
  await bulkSend({ to: [...collaboratorEmails, ...adminEmails], subject: `Collaborator Removed: ${subjectName}`, html: htmlRemaining });

  // Notice to the removed department head
  if (removedHeadEmail) {
    const htmlRemoved = templates.genericNotificationTemplate(
      'Access Revoked',
      `Your department's collaborating access to the subject <strong>${subjectName}</strong> has been revoked by the Admin/ subject owner.`
    );
    await sendEmail({ to: removedHeadEmail, subject: `Subject Access Revoked: ${subjectName}`, html: htmlRemoved });
  }
};

export const sendCollaboratorLeftMail = async (subjectId, subjectName, leftDeptName) => {
  if (await suppressed(`Collaborator left: ${subjectName}`)) return;
  const collaboratorEmails = await getCollaboratorEmails(subjectId);
  const adminEmails = await getAdminEmails();
  const html = templates.genericNotificationTemplate(
    'Collaborator Left',
    `Department <strong>${leftDeptName}</strong> has chosen to leave the subject <strong>${subjectName}</strong>.`
  );
  await bulkSend({ to: [...collaboratorEmails, ...adminEmails], subject: `Collaborator Left: ${subjectName}`, html });
};

export const sendJoinRequestMail = async (subjectId, subjectName, requestingDeptName) => {
  const superAccessRows = await executeQuery(
    `SELECT u.email FROM users u
     JOIN departments d ON d.head_user_id = u.user_id
     JOIN subjects s ON s.creator = d.dept_code
     WHERE s.subject_id = ?`,
    [subjectId]
  );
  const adminEmails = await getAdminEmails();
  const ownerEmails = superAccessRows.map(r => r.email);
  const html = templates.genericNotificationTemplate(
    'Join Request Received',
    `Department <strong>${requestingDeptName}</strong> has requested access to collaborate on <strong>${subjectName}</strong>.`,
    ['Please review this request in your subject management panel.']
  );
  await bulkSend({ to: [...ownerEmails, ...adminEmails], subject: `Join Request: ${subjectName}`, html });
};

export const sendSubjectDeletedMail = async (subjectName, collaboratorEmails, coreBuffer, attemptsBuffer) => {
  if (await suppressed(`Subject deleted: ${subjectName}`)) return;
  const adminEmails = await getAdminEmails();
  const recipients = [...new Set([...collaboratorEmails, ...adminEmails]).values()].filter(Boolean);
  const html = templates.genericNotificationTemplate(
    'Subject Permanently Deleted',
    `The subject <strong>${subjectName}</strong> has been removed from the platform. All associated data has been exported and attached below.`
  );

  const attachments = [];
  if (coreBuffer) attachments.push({ filename: `${subjectName}_Structure.xlsx`, content: coreBuffer, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  if (attemptsBuffer) attachments.push({ filename: `${subjectName}_Attempts.xlsx`, content: attemptsBuffer, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  await bulkSend({ to: recipients, subject: `Subject Deleted: ${subjectName}`, html, attachments });
};

// ═══════════════════════════════════════════════════════════════════════════════
// TOPIC & SET EMAILS
// ═══════════════════════════════════════════════════════════════════════════════

export const sendTopicChangeMail = async (subjectId, subjectName, topicName, action, oldTopicName = null) => {
  if (await suppressed(`Topic ${action}: ${topicName}`)) return;
  const collaboratorEmails = await getCollaboratorEmails(subjectId);
  const adminEmails = await getAdminEmails();
  let body;
  if (action === 'updated' && oldTopicName && oldTopicName !== topicName) {
    body = `The topic <strong>${oldTopicName}</strong> in subject <strong>${subjectName}</strong> has been renamed to <strong>${topicName}</strong>.`;
  } else {
    body = `A topic titled <strong>${topicName}</strong> has been ${action} within the subject <strong>${subjectName}</strong>.`;
  }
  const html = templates.genericNotificationTemplate(
    `Topic ${action === 'created' ? 'Created' : 'Renamed'}`,
    body
  );
  const emailSubject = action === 'updated' && oldTopicName && oldTopicName !== topicName
    ? `Topic Renamed: "${oldTopicName}" → "${topicName}"`
    : `Topic ${action}: ${topicName}`;
  await bulkSend({ to: [...collaboratorEmails, ...adminEmails], subject: emailSubject, html });
};

export const sendTopicDeletedMail = async (subjectId, subjectName, topicName, coreBuffer, attemptsBuffer) => {
  if (await suppressed(`Topic deleted: ${topicName}`)) return;
  const collaboratorEmails = await getCollaboratorEmails(subjectId);
  const adminEmails = await getAdminEmails();
  const html = templates.genericNotificationTemplate(
    'Topic Deleted',
    `The topic <strong>${topicName}</strong> in subject <strong>${subjectName}</strong> has been deleted. All associated data has been exported and attached below.`
  );
  const attachments = [];
  if (coreBuffer) attachments.push({ filename: `${topicName}_Topics.xlsx`, content: coreBuffer });
  if (attemptsBuffer) attachments.push({ filename: `${topicName}_Attempts.xlsx`, content: attemptsBuffer });
  await bulkSend({ to: [...collaboratorEmails, ...adminEmails], subject: `Topic Deleted: ${topicName}`, html, attachments });
};

export const sendSetChangeMail = async (subjectId, subjectName, topicName, action) => {
  if (await suppressed(`Set ${action} in ${topicName}`)) return;
  const collaboratorEmails = await getCollaboratorEmails(subjectId);
  const adminEmails = await getAdminEmails();
  const html = templates.genericNotificationTemplate(
    `Practice Set ${action === 'created' ? 'Added' : 'Updated'}`,
    `A practice set in topic <strong>${topicName}</strong> (Subject: ${subjectName}) has been ${action}.`
  );
  await bulkSend({ to: [...collaboratorEmails, ...adminEmails], subject: `Set ${action} in ${topicName}`, html });
};

export const sendSetDeletedMail = async (subjectId, subjectName, topicName, coreBuffer, attemptsBuffer) => {
  if (await suppressed(`Set deleted in ${topicName}`)) return;
  const collaboratorEmails = await getCollaboratorEmails(subjectId);
  const adminEmails = await getAdminEmails();
  const html = templates.genericNotificationTemplate(
    'Practice Set Deleted',
    `A practice set from <strong>${topicName}</strong> in <strong>${subjectName}</strong> was deleted. Exported data is attached.`
  );
  const attachments = [];
  if (coreBuffer) attachments.push({ filename: 'Set_Questions.xlsx', content: coreBuffer });
  if (attemptsBuffer) attachments.push({ filename: 'Set_Attempts.xlsx', content: attemptsBuffer });
  await bulkSend({ to: [...collaboratorEmails, ...adminEmails], subject: 'Set Deleted', html, attachments });
};

// ═══════════════════════════════════════════════════════════════════════════════
// TEST EMAILS
// ═══════════════════════════════════════════════════════════════════════════════

export const sendTestCreatedMail = async (test, deptIds) => {
  if (await suppressed(`Test created: ${test?.test_name}`)) return;
  const adminEmails = await getAdminEmails();
  const deptHeadEmails = await Promise.all(deptIds.map(id => getDeptHeadEmail(id)));

  const recipients = [...new Set([...adminEmails, ...deptHeadEmails])].filter(Boolean);
  const html = templates.testCreatedTemplate(test.test_name, test.start_time, test.duration_minutes);

  await bulkSend({ to: recipients, subject: `New Test Scheduled: ${test.test_name}`, html });
};

export const sendTestUpdatedMail = async (test, changes) => {
  if (await suppressed(`Test updated: ${test?.test_name}`)) return;
  const adminEmails = await getAdminEmails();
  const rows = await executeQuery('SELECT dept_id FROM test_assignment WHERE test_id = ?', [test.test_id]);
  const deptIds = rows.map(r => r.dept_id);
  const deptHeadEmails = await Promise.all(deptIds.map(id => getDeptHeadEmail(id)));

  const recipients = [...new Set([...adminEmails, ...deptHeadEmails])].filter(Boolean);

  const content = `
    <h2 style="margin-top: 0; color: #1e3a8a; font-size: 20px;">Test Schedule Updated</h2>
    <p>The test <strong>${test.test_name}</strong> has been modified. Important changes are listed below:</p>
    <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 20px; margin: 20px 0;">
      <ul style="margin: 0; padding-left: 20px; color: #92400e;">
        ${changes.map(c => `<li style="margin-bottom: 5px;">${c}</li>`).join('')}
      </ul>
    </div>
    <p>Please log in to the portal to review the updated schedule.</p>
  `;
  const html = templates.genericNotificationTemplate('Test Update Alert', content);

  await bulkSend({ to: recipients, subject: `Alert: Test Updated - ${test.test_name}`, html });
};

export const sendTestDeletedMail = async (testName, deptIds) => {
  if (await suppressed(`Test deleted: ${testName}`)) return;
  const adminEmails = await getAdminEmails();
  const deptHeadEmails = await Promise.all(deptIds.map(id => getDeptHeadEmail(id)));

  const recipients = [...new Set([...adminEmails, ...deptHeadEmails])].filter(Boolean);
  const html = templates.genericNotificationTemplate(
    'Test Cancelled',
    `The scheduled test <strong>${testName}</strong> has been cancelled and removed from the portal.`
  );

  await bulkSend({ to: recipients, subject: `Cancellation: ${testName}`, html });
};

export const sendTestReportMail = async (test, results, toList, attachments) => {
  if (await suppressed(`Test report: ${test?.test_name}`)) return;
  const html = templates.genericNotificationTemplate(
    'Final Test Report',
    `The examination <strong>${test.test_name}</strong> has successfully completed. Detailed statistics and student results are attached.`,
    [
      `Total Participants: ${results.length}`,
      `Average Score: ${(results.reduce((s, r) => s + Number(r.total_score), 0) / (results.length || 1)).toFixed(2)}`
    ]
  );
  await sendEmail({ to: toList, subject: `Test Report: ${test.test_name}`, html, attachments });
};