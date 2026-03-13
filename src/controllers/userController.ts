import { Request, Response } from 'express';
import db from '../utils/database';
import { updateProfileSchema } from '../utils/validation';
import { AppError } from '../middleware/errorMiddleware';
import bcrypt from 'bcrypt';

interface AuthRequest extends Request {
  user?: any;
}

/**
 * Get current user profile
 */
export const getProfile = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;

    // Get user from database
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Get user's services count
    const servicesCount = db.prepare('SELECT COUNT(*) as count FROM services WHERE user_id = ?').get(userId) as any;

    // Get user's orders count
    const ordersCount = db.prepare('SELECT COUNT(*) as count FROM orders WHERE user_id = ?').get(userId) as any;

    // Get user's invites count
    const invitesCount = db.prepare('SELECT COUNT(*) as count FROM invites WHERE referrer_id = ?').get(userId) as any;

    // Get invite record if user was invited
    const inviteRecord = db.prepare('SELECT * FROM invites WHERE invitee_id = ?').get(userId);

    // Remove password from response
    const { password, ...userWithoutPassword } = user as any;

    res.json({
      success: true,
      data: {
        ...userWithoutPassword,
        statistics: {
          services: servicesCount.count || 0,
          orders: ordersCount.count || 0,
          invites: invitesCount.count || 0,
        },
        invitedBy: inviteRecord ? {
          referrerId: (inviteRecord as any).referrer_id,
          status: (inviteRecord as any).status,
        } : null,
      },
    });
  } catch (error: any) {
    console.error('Get profile error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Server error',
    });
  }
};

/**
 * Update user profile
 */
export const updateProfile = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const validatedData = updateProfileSchema.parse(req.body);

    // Check if user exists
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Build update fields
    const updates: string[] = [];
    const values: any[] = [];

    if (validatedData.username !== undefined) {
      updates.push('username = ?');
      values.push(validatedData.username);
    }

    if (validatedData.phone !== undefined) {
      updates.push('phone = ?');
      values.push(validatedData.phone);
    }

    if (validatedData.avatar !== undefined) {
      updates.push('avatar = ?');
      values.push(validatedData.avatar);
    }

    // Always update the updated_at timestamp
    updates.push('updated_at = CURRENT_TIMESTAMP');

    // Add userId for WHERE clause
    values.push(userId);

    if (updates.length > 1) { // At least one field to update (plus timestamp)
      const updateStmt = db.prepare(`
        UPDATE users
        SET ${updates.join(', ')}
        WHERE id = ?
      `);
      updateStmt.run(...values);
    }

    // Get updated user
    const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    const { password, ...userWithoutPassword } = updatedUser as any;

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: userWithoutPassword,
    });
  } catch (error: any) {
    console.error('Update profile error:', error);

    if (error.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.errors,
      });
    }

    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Server error',
    });
  }
};

/**
 * Change user password
 */
export const changePassword = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    // Validate input
    if (!currentPassword || !newPassword) {
      throw new AppError('Current password and new password are required', 400);
    }

    if (newPassword.length < 6) {
      throw new AppError('New password must be at least 6 characters', 400);
    }

    // Get user with password
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      throw new AppError('Current password is incorrect', 401);
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    const stmt = db.prepare('UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    stmt.run(hashedPassword, userId);

    res.json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error: any) {
    console.error('Change password error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Server error',
    });
  }
};

/**
 * Get user balance and transaction history
 */
export const getBalance = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;

    // Get user balance
    const user = db.prepare('SELECT balance, points FROM users WHERE id = ?').get(userId) as any;
    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Get recent transactions (orders)
    const transactions = db.prepare(`
      SELECT
        o.id,
        o.order_number,
        o.amount,
        o.payment_method,
        o.payment_status,
        o.status,
        o.created_at,
        s.title as service_title
      FROM orders o
      LEFT JOIN services s ON o.service_id = s.id
      WHERE o.user_id = ?
      ORDER BY o.created_at DESC
      LIMIT 10
    `).all(userId);

    res.json({
      success: true,
      data: {
        balance: user.balance,
        points: user.points,
        transactions,
      },
    });
  } catch (error: any) {
    console.error('Get balance error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Server error',
    });
  }
};

/**
 * Get user's services
 */
export const getUserServices = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const { status } = req.query;

    let query = 'SELECT * FROM services WHERE user_id = ?';
    const params: any[] = [userId];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC';

    const services = db.prepare(query).all(...params);

    res.json({
      success: true,
      data: services,
    });
  } catch (error: any) {
    console.error('Get user services error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Server error',
    });
  }
};

/**
 * Get user's orders
 */
export const getUserOrders = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const { status } = req.query;

    let query = `
      SELECT
        o.*,
        s.title as service_title,
        s.cover_image as service_cover
      FROM orders o
      LEFT JOIN services s ON o.service_id = s.id
      WHERE o.user_id = ?
    `;
    const params: any[] = [userId];

    if (status) {
      query += ' AND o.status = ?';
      params.push(status);
    }

    query += ' ORDER BY o.created_at DESC';

    const orders = db.prepare(query).all(...params);

    res.json({
      success: true,
      data: orders,
    });
  } catch (error: any) {
    console.error('Get user orders error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Server error',
    });
  }
};

/**
 * Get user's invite records
 */
export const getUserInvites = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const { status } = req.query;

    let query = `
      SELECT
        i.*,
        u.email as invitee_email,
        u.username as invitee_username
      FROM invites i
      LEFT JOIN users u ON i.invitee_id = u.id
      WHERE i.referrer_id = ?
    `;
    const params: any[] = [userId];

    if (status) {
      query += ' AND i.status = ?';
      params.push(status);
    }

    query += ' ORDER BY i.created_at DESC';

    const invites = db.prepare(query).all(...params);

    // Get invite statistics
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'accepted' THEN 1 END) as accepted,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        SUM(reward_amount) as total_rewards
      FROM invites
      WHERE referrer_id = ?
    `).get(userId) as any;

    res.json({
      success: true,
      data: {
        invites,
        statistics: {
          total: stats.total || 0,
          accepted: stats.accepted || 0,
          pending: stats.pending || 0,
          totalRewards: stats.total_rewards || 0,
        },
      },
    });
  } catch (error: any) {
    console.error('Get user invites error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Server error',
    });
  }
};