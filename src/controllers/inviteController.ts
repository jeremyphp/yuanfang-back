import { Request, Response } from 'express';
import db from '../utils/database';
import { createInviteSchema } from '../utils/validation';
import { AppError } from '../middleware/errorMiddleware';
import { v4 as uuidv4 } from 'uuid';
import { sendInvitationEmail } from '../utils/email';

interface AuthRequest extends Request {
  user?: any;
}

/**
 * Get invite center information
 */
export const getInviteCenter = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;

    // Check and expire old invites
    checkAndExpireInvites();

    // Get user info
    const user = db.prepare('SELECT referral_code, membership FROM users WHERE id = ?').get(userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Get invite statistics
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total_invites,
        COUNT(CASE WHEN status = 'accepted' THEN 1 END) as accepted_invites,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_invites,
        SUM(reward_amount) as total_rewards,
        SUM(CASE WHEN reward_status = 'paid' THEN reward_amount ELSE 0 END) as paid_rewards
      FROM invites
      WHERE referrer_id = ?
    `).get(userId) as any;

    // Get reward rules based on membership
    const rewardRules = getRewardRules((user as any).membership);

    // Generate invite link
    const inviteLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/register?ref=${(user as any).referral_code}`;

    // Get recent invites
    const recentInvites = db.prepare(`
      SELECT
        i.*,
        u.email as invitee_email,
        u.username as invitee_username,
        u.created_at as invitee_joined_date
      FROM invites i
      LEFT JOIN users u ON i.invitee_id = u.id
      WHERE i.referrer_id = ?
      ORDER BY i.created_at DESC
      LIMIT 10
    `).all(userId);

    res.json({
      success: true,
      data: {
        referral_code: (user as any).referral_code,
        invite_link: inviteLink,
        qr_code_url: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(inviteLink)}`,
        statistics: {
          total_invites: stats.total_invites || 0,
          accepted_invites: stats.accepted_invites || 0,
          pending_invites: stats.pending_invites || 0,
          total_rewards: stats.total_rewards || 0,
          paid_rewards: stats.paid_rewards || 0,
        },
        reward_rules: rewardRules,
        recent_invites: recentInvites,
      },
    });
  } catch (error: any) {
    console.error('Get invite center error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Server error fetching invite center',
    });
  }
};

/**
 * Create new invite
 */
export const createInvite = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const validatedData = createInviteSchema.parse(req.body);

    // Get user info
    const user = db.prepare('SELECT referral_code FROM users WHERE id = ?').get(userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Check if invitee email already exists
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(validatedData.inviteeEmail);
    if (existingUser) {
      throw new AppError('User with this email already exists', 400);
    }

    // Check if invite already exists for this email
    const existingInvite = db.prepare('SELECT * FROM invites WHERE invitee_email = ? AND referrer_id = ?').get(validatedData.inviteeEmail, userId);
    if (existingInvite) {
      throw new AppError('Invite already sent to this email', 400);
    }

    // Generate invite code
    const inviteCode = uuidv4().split('-')[0].toUpperCase();

    // Create invite
    const inviteId = uuidv4();
    const stmt = db.prepare(`
      INSERT INTO invites (id, referrer_id, invitee_email, invite_code, status)
      VALUES (?, ?, ?, ?, 'pending')
    `);

    stmt.run(inviteId, userId, validatedData.inviteeEmail, inviteCode);

    // Get created invite
    const newInvite = db.prepare('SELECT * FROM invites WHERE id = ?').get(inviteId);

    // Send invitation email
    try {
      await sendInvitationEmail(validatedData.inviteeEmail, (user as any).referral_code, inviteCode);
    } catch (emailError) {
      console.warn('Failed to send invitation email:', emailError);
      // Continue even if email fails - invite is still created
    }

    res.status(201).json({
      success: true,
      message: 'Invite created successfully',
      data: newInvite,
      email_sent: true,
    });
  } catch (error: any) {
    console.error('Create invite error:', error);

    if (error.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.errors,
      });
    }

    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Server error creating invite',
    });
  }
};

/**
 * Get invite records
 */
export const getInviteRecords = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const { status, page = 1, limit = 20 } = req.query;

    let whereClause = 'WHERE referrer_id = ?';
    const params: any[] = [userId];

    if (status) {
      whereClause += ' AND status = ?';
      params.push(status);
    }

    // Calculate pagination
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM invites ${whereClause}`;
    const countResult = db.prepare(countQuery).get(...params) as any;
    const total = countResult.total || 0;

    // Get invites with pagination
    const invites = db.prepare(`
      SELECT
        i.*,
        u.email as invitee_email,
        u.username as invitee_username,
        u.created_at as invitee_joined_date,
        u.membership as invitee_membership
      FROM invites i
      LEFT JOIN users u ON i.invitee_id = u.id
      ${whereClause}
      ORDER BY i.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, parseInt(limit as string), offset);

    // Get statistics by status
    const statusStats = db.prepare(`
      SELECT
        status,
        COUNT(*) as count,
        SUM(reward_amount) as total_rewards
      FROM invites
      WHERE referrer_id = ?
      GROUP BY status
    `).all(userId);

    res.json({
      success: true,
      data: {
        invites,
        statistics: {
          by_status: statusStats,
        },
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          pages: Math.ceil(total / parseInt(limit as string)),
        },
      },
    });
  } catch (error: any) {
    console.error('Get invite records error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Server error fetching invite records',
    });
  }
};

/**
 * Get reward records
 */
export const getRewardRecords = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const { rewardStatus, page = 1, limit = 20 } = req.query;

    let whereClause = 'WHERE referrer_id = ?';
    const params: any[] = [userId];

    if (rewardStatus) {
      whereClause += ' AND reward_status = ?';
      params.push(rewardStatus);
    }

    // Only get invites with rewards
    whereClause += ' AND reward_amount > 0';

    // Calculate pagination
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM invites ${whereClause}`;
    const countResult = db.prepare(countQuery).get(...params) as any;
    const total = countResult.total || 0;

    // Get reward records
    const rewards = db.prepare(`
      SELECT
        i.*,
        u.email as invitee_email,
        u.username as invitee_username,
        u.created_at as invitee_joined_date
      FROM invites i
      LEFT JOIN users u ON i.invitee_id = u.id
      ${whereClause}
      ORDER BY i.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, parseInt(limit as string), offset);

    // Get total rewards statistics
    const totalStats = db.prepare(`
      SELECT
        SUM(reward_amount) as total_earned,
        SUM(CASE WHEN reward_status = 'pending' THEN reward_amount ELSE 0 END) as pending_amount,
        SUM(CASE WHEN reward_status = 'paid' THEN reward_amount ELSE 0 END) as paid_amount
      FROM invites
      WHERE referrer_id = ? AND reward_amount > 0
    `).get(userId) as any;

    res.json({
      success: true,
      data: {
        rewards,
        statistics: {
          total_earned: totalStats.total_earned || 0,
          pending_amount: totalStats.pending_amount || 0,
          paid_amount: totalStats.paid_amount || 0,
        },
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          pages: Math.ceil(total / parseInt(limit as string)),
        },
      },
    });
  } catch (error: any) {
    console.error('Get reward records error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Server error fetching reward records',
    });
  }
};

/**
 * Get referrer information
 */
export const getReferrerInfo = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;

    // Get user's referrer
    const user = db.prepare('SELECT referrer_id FROM users WHERE id = ?').get(userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    const referrerId = (user as any).referrer_id;
    if (!referrerId) {
      return res.json({
        success: true,
        data: null,
        message: 'No referrer found',
      });
    }

    // Get referrer info
    const referrer = db.prepare('SELECT id, username, email, avatar, created_at FROM users WHERE id = ?').get(referrerId);
    if (!referrer) {
      throw new AppError('Referrer not found', 404);
    }

    // Get invite record
    const invite = db.prepare('SELECT * FROM invites WHERE invitee_id = ? AND referrer_id = ?').get(userId, referrerId);

    res.json({
      success: true,
      data: {
        referrer,
        invite: invite || null,
      },
    });
  } catch (error: any) {
    console.error('Get referrer info error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Server error fetching referrer info',
    });
  }
};

/**
 * Claim rewards
 */
export const claimRewards = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const { inviteId } = req.body;

    // Check if invite exists and belongs to user
    const invite = db.prepare('SELECT * FROM invites WHERE id = ? AND referrer_id = ?').get(inviteId, userId);
    if (!invite) {
      throw new AppError('Invite not found or unauthorized', 404);
    }

    // Check if reward is claimable
    if ((invite as any).status !== 'accepted') {
      throw new AppError('Invite must be accepted before claiming rewards', 400);
    }

    if ((invite as any).reward_status !== 'pending') {
      throw new AppError('Rewards already claimed', 400);
    }

    if ((invite as any).reward_amount <= 0) {
      throw new AppError('No rewards available to claim', 400);
    }

    // Update reward status to paid
    db.prepare('UPDATE invites SET reward_status = "paid", updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(inviteId);

    // Add rewards to user balance
    const rewardAmount = (invite as any).reward_amount;
    db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(rewardAmount, userId);

    // Create reward transaction record
    const transactionId = uuidv4();
    db.prepare(`
      INSERT INTO transactions (
        id, user_id, type, amount, status, description, reference_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      transactionId,
      userId,
      'invite_reward',
      rewardAmount,
      'completed',
      `奖励金：邀请好友 ${(invite as any).invitee_email || '新用户'} 注册`,
      inviteId
    );

    res.json({
      success: true,
      message: 'Rewards claimed successfully',
      data: {
        amount: rewardAmount,
        new_balance: db.prepare('SELECT balance FROM users WHERE id = ?').get(userId) as any,
        transaction_id: transactionId,
      },
    });
  } catch (error: any) {
    console.error('Claim rewards error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Server error claiming rewards',
    });
  }
};

/**
 * Generate new referral code
 */
export const generateReferralCode = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;

    // Generate new referral code
    const newReferralCode = uuidv4().split('-')[0].toUpperCase();

    // Update user's referral code
    db.prepare('UPDATE users SET referral_code = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newReferralCode, userId);

    // Generate new invite link
    const inviteLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/register?ref=${newReferralCode}`;

    res.json({
      success: true,
      message: 'New referral code generated',
      data: {
        referral_code: newReferralCode,
        invite_link: inviteLink,
        qr_code_url: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(inviteLink)}`,
      },
    });
  } catch (error: any) {
    console.error('Generate referral code error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Server error generating referral code',
    });
  }
};

/**
 * Helper function: Get reward rules based on membership
 */
function getRewardRules(membership: string) {
  const rules: any = {
    '普通会员': {
      base_reward: 5,
      commission_rate: 0.1, // 10% of invitee's first purchase
      max_rewards_per_invite: 50,
      description: '每成功邀请一位好友注册，可获得5元奖励；好友首次消费您可获得10%的佣金',
    },
    '高级会员': {
      base_reward: 10,
      commission_rate: 0.15, // 15% of invitee's first purchase
      max_rewards_per_invite: 100,
      description: '每成功邀请一位好友注册，可获得10元奖励；好友首次消费您可获得15%的佣金',
    },
    'VIP会员': {
      base_reward: 20,
      commission_rate: 0.2, // 20% of invitee's first purchase
      max_rewards_per_invite: 200,
      description: '每成功邀请一位好友注册，可获得20元奖励；好友首次消费您可获得20%的佣金',
    },
  };

  return rules[membership] || rules['普通会员'];
}

/**
 * Helper function: Check and expire old invites
 */
function checkAndExpireInvites() {
  // Expire invites older than 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const formattedDate = thirtyDaysAgo.toISOString().replace('T', ' ').substring(0, 19);

  const result = db.prepare(`
    UPDATE invites
    SET status = 'expired', updated_at = CURRENT_TIMESTAMP
    WHERE status = 'pending' AND created_at < ?
  `).run(formattedDate);

  if (result.changes > 0) {
    console.log(`Expired ${result.changes} old invites`);
  }
}

/**
 * Process invite when new user registers (to be called from auth controller)
 */
export const processInviteOnRegistration = async (inviteeId: string, inviteeEmail: string, referralCode?: string) => {
  try {
    if (!referralCode) return;

    // Find referrer by referral code
    const referrer = db.prepare('SELECT id, membership FROM users WHERE referral_code = ?').get(referralCode);
    if (!referrer) return;

    const referrerId = (referrer as any).id;

    // Find pending invite for this email
    const pendingInvite = db.prepare('SELECT * FROM invites WHERE invitee_email = ? AND referrer_id = ? AND status = "pending"').get(inviteeEmail, referrerId);

    if (pendingInvite) {
      // Update existing invite
      const rewardRules = getRewardRules((referrer as any).membership);
      const baseReward = rewardRules.base_reward;

      db.prepare(`
        UPDATE invites
        SET invitee_id = ?, status = 'accepted', reward_amount = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(inviteeId, baseReward, (pendingInvite as any).id);

      // Update user's referrer_id
      db.prepare('UPDATE users SET referrer_id = ? WHERE id = ?').run(referrerId, inviteeId);
    } else {
      // Create new invite record
      const inviteId = uuidv4();
      const inviteCode = uuidv4().split('-')[0].toUpperCase();
      const rewardRules = getRewardRules((referrer as any).membership);
      const baseReward = rewardRules.base_reward;

      db.prepare(`
        INSERT INTO invites (id, referrer_id, invitee_id, invitee_email, invite_code, status, reward_amount)
        VALUES (?, ?, ?, ?, ?, 'accepted', ?)
      `).run(inviteId, referrerId, inviteeId, inviteeEmail, inviteCode, baseReward);

      // Update user's referrer_id
      db.prepare('UPDATE users SET referrer_id = ? WHERE id = ?').run(referrerId, inviteeId);
    }
  } catch (error) {
    console.error('Process invite on registration error:', error);
  }
};