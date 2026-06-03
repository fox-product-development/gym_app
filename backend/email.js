// backend/email.js
// Email delivery via Resend.
// Sends the weekly coaching report to the user's email address.

const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendWeeklyReport({
  toEmail,
  username,
  reportText,
  weekStartDate,
}) {
  const formattedDate = new Date(weekStartDate).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const htmlBody = `
    <div style="background-color:#0A1226;padding:32px 24px;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif;max-width:600px;margin:0 auto;">
      
      <!-- Header -->
      <div style="margin-bottom:32px;">
        <div style="background-color:#FF7763;width:48px;height:48px;border-radius:14px;display:flex;align-items:center;justify-content:center;margin-bottom:16px;">
          <span style="font-size:24px;line-height:48px;display:block;text-align:center;">★</span>
        </div>
        <p style="font-family:Courier,monospace;font-size:11px;color:rgba(255,255,255,0.35);letter-spacing:0.8px;text-transform:uppercase;margin:0 0 4px;">
          Weekly Report · ${formattedDate}
        </p>
        <h1 style="font-size:26px;font-weight:700;color:#ffffff;margin:0;letter-spacing:-0.4px;">
          Your week in review
        </h1>
      </div>

      <!-- Report body -->
      <div style="background-color:#131D38;border-radius:16px;padding:24px;border:0.5px solid rgba(255,255,255,0.06);">
        <div style="font-size:15px;color:rgba(255,255,255,0.85);line-height:1.75;white-space:pre-wrap;">
${reportText}
        </div>
      </div>

      <!-- Footer -->
      <div style="margin-top:24px;text-align:center;">
        <p style="font-family:Courier,monospace;font-size:10px;color:rgba(255,255,255,0.25);letter-spacing:0.6px;text-transform:uppercase;margin:0;">
          GymApp · gym.activitycoach.co.uk
        </p>
      </div>

    </div>
  `;

  await resend.emails.send({
    from: "GymApp Coach <coach@activitycoach.co.uk>",
    to: toEmail,
    subject: `Weekly Report · ${formattedDate}`,
    html: htmlBody,
  });

  console.log(`✓ Weekly report emailed to ${toEmail}`);
}

module.exports = { sendWeeklyReport };
