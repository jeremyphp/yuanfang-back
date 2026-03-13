/**
 * Email utility for sending invitation emails
 * In production, integrate with a real email service (SendGrid, AWS SES, etc.)
 */

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Send email (mock implementation for development)
 * In production, replace with actual email service integration
 */
export async function sendEmail(options: EmailOptions): Promise<boolean> {
  const { to, subject, html } = options;

  console.log('📧 [Email Mock] Sending email:');
  console.log(`   To: ${to}`);
  console.log(`   Subject: ${subject}`);
  console.log(`   HTML: ${html.substring(0, 100)}...`);

  // In development, just log the email
  if (process.env.NODE_ENV === 'development') {
    console.log('📧 Email would be sent in production. To enable real emails:');
    console.log('   1. Uncomment email config in .env file');
    console.log('   2. Configure SMTP settings');
    console.log('   3. Replace this function with real email service');

    // Simulate async email sending
    await new Promise(resolve => setTimeout(resolve, 100));

    return true;
  }

  // In production, you would implement real email sending here
  // Example with nodemailer:
  /*
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const mailOptions = {
    from: process.env.EMAIL_FROM || 'noreply@yuanfang.com',
    to,
    subject,
    html,
    text: options.text || html.replace(/<[^>]*>/g, ''),
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 Email sent to ${to}`);
    return true;
  } catch (error) {
    console.error('📧 Email sending failed:', error);
    return false;
  }
  */

  return false;
}

/**
 * Send invitation email
 */
export async function sendInvitationEmail(
  inviteeEmail: string,
  referralCode: string,
  inviteCode: string
): Promise<boolean> {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const inviteLink = `${frontendUrl}/register?ref=${referralCode}`;

  const subject = `🎉 邀请您加入元方AI服务平台`;
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>加入元方AI服务平台</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #4f46e5; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { padding: 30px; background-color: #f9fafb; }
        .button { display: inline-block; padding: 12px 30px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; }
        .footer { padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }
        .code { background-color: #f3f4f6; padding: 10px; border-radius: 5px; font-family: monospace; margin: 10px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎉 加入元方AI服务平台</h1>
          <p>您的好友邀请您一起体验AI服务的魅力</p>
        </div>
        <div class="content">
          <h2>亲爱的朋友，</h2>
          <p>您的好友邀请您加入 <strong>元方AI服务平台</strong>，一个专业的AI服务交易平台。</p>

          <p>通过此链接注册，您可以：</p>
          <ul>
            <li>体验各种AI服务（教程、在线咨询、上门服务）</li>
            <li>发布自己的AI服务并赚取收入</li>
            <li>享受新用户专属优惠</li>
            <li>获得邀请奖励</li>
          </ul>

          <p style="text-align: center; margin: 30px 0;">
            <a href="${inviteLink}" class="button">立即注册</a>
          </p>

          <p>或者复制以下链接到浏览器：</p>
          <div class="code">${inviteLink}</div>

          <p>邀请码：<strong>${inviteCode}</strong></p>

          <p>如果您没有注册意向，请忽略此邮件。</p>

          <p>祝您使用愉快！</p>
          <p><strong>元方AI服务平台团队</strong></p>
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} 元方AI服务平台. 保留所有权利.</p>
          <p>如果您有任何问题，请联系我们：support@yuanfang.com</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: inviteeEmail,
    subject,
    html,
  });
}