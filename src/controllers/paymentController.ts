import { Request, Response } from 'express';
import db from '../utils/database';
import { createOrderSchema } from '../utils/validation';
import { AppError } from '../middleware/errorMiddleware';
import { v4 as uuidv4 } from 'uuid';

interface AuthRequest extends Request {
  user?: any;
}

/**
 * Create a new order
 */
export const createOrder = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const validatedData = createOrderSchema.parse(req.body);

    // Check if user exists
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Check if service exists and is published
    const service = db.prepare('SELECT * FROM services WHERE id = ? AND status = "published"').get(validatedData.serviceId);
    if (!service) {
      throw new AppError('Service not found or not available', 404);
    }

    // Generate order number and ID
    const orderId = uuidv4();
    const orderNumber = `ORD${Date.now()}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;

    // Calculate amount (service price)
    const amount = (service as any).price;

    // Insert new order
    const stmt = db.prepare(`
      INSERT INTO orders (
        id, order_number, user_id, service_id, amount,
        payment_method, payment_status, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      orderId,
      orderNumber,
      userId,
      validatedData.serviceId,
      amount,
      validatedData.paymentMethod,
      'pending', // payment_status
      'pending'  // order status
    );

    // Get created order with service details
    const newOrder = db.prepare(`
      SELECT
        o.*,
        s.title as service_title,
        s.description as service_description,
        s.cover_image as service_cover,
        s.delivery_method as service_delivery_method
      FROM orders o
      LEFT JOIN services s ON o.service_id = s.id
      WHERE o.id = ?
    `).get(orderId);

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: newOrder,
    });
  } catch (error: any) {
    console.error('Create order error:', error);

    if (error.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.errors,
      });
    }

    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Server error creating order',
    });
  }
};

/**
 * Get order by ID
 */
export const getOrderById = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    // Get order with details
    const order = db.prepare(`
      SELECT
        o.*,
        s.title as service_title,
        s.description as service_description,
        s.cover_image as service_cover,
        s.delivery_method as service_delivery_method,
        u.username as buyer_username,
        u.email as buyer_email
      FROM orders o
      LEFT JOIN services s ON o.service_id = s.id
      LEFT JOIN users u ON o.user_id = u.id
      WHERE o.id = ? AND (o.user_id = ? OR s.user_id = ?)
    `).get(id, userId, userId);

    if (!order) {
      throw new AppError('Order not found or unauthorized', 404);
    }

    res.json({
      success: true,
      data: order,
    });
  } catch (error: any) {
    console.error('Get order error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Server error fetching order',
    });
  }
};

/**
 * Get user's orders
 */
export const getUserOrders = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const { status, paymentStatus } = req.query;

    let whereClause = 'WHERE o.user_id = ?';
    const params: any[] = [userId];

    if (status) {
      whereClause += ' AND o.status = ?';
      params.push(status);
    }

    if (paymentStatus) {
      whereClause += ' AND o.payment_status = ?';
      params.push(paymentStatus);
    }

    const orders = db.prepare(`
      SELECT
        o.*,
        s.title as service_title,
        s.cover_image as service_cover,
        s.delivery_method as service_delivery_method
      FROM orders o
      LEFT JOIN services s ON o.service_id = s.id
      ${whereClause}
      ORDER BY o.created_at DESC
    `).all(...params);

    // Get order statistics
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled,
        SUM(amount) as total_amount
      FROM orders
      WHERE user_id = ?
    `).get(userId) as any;

    res.json({
      success: true,
      data: {
        orders,
        statistics: {
          total: stats.total || 0,
          pending: stats.pending || 0,
          processing: stats.processing || 0,
          completed: stats.completed || 0,
          cancelled: stats.cancelled || 0,
          totalAmount: stats.total_amount || 0,
        },
      },
    });
  } catch (error: any) {
    console.error('Get user orders error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Server error fetching orders',
    });
  }
};

/**
 * Update order payment status (simulated payment callback)
 */
export const updatePaymentStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { orderNumber } = req.params;
    const { paymentStatus, transactionId } = req.body;

    // Validate payment status
    const validStatuses = ['pending', 'paid', 'failed', 'refunded'];
    if (!validStatuses.includes(paymentStatus)) {
      throw new AppError('Invalid payment status', 400);
    }

    // Find order
    const order = db.prepare('SELECT * FROM orders WHERE order_number = ?').get(orderNumber);
    if (!order) {
      throw new AppError('Order not found', 404);
    }

    // Update payment status
    const stmt = db.prepare(`
      UPDATE orders
      SET payment_status = ?, transaction_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE order_number = ?
    `);

    stmt.run(paymentStatus, transactionId || null, orderNumber);

    // If payment is successful, update order status to processing
    if (paymentStatus === 'paid') {
      db.prepare('UPDATE orders SET status = "processing", updated_at = CURRENT_TIMESTAMP WHERE order_number = ?').run(orderNumber);

      // TODO: Add user balance or points based on service type
      // For now, just update user's purchase count or other metrics
    }

    const updatedOrder = db.prepare('SELECT * FROM orders WHERE order_number = ?').get(orderNumber);

    res.json({
      success: true,
      message: 'Payment status updated successfully',
      data: updatedOrder,
    });
  } catch (error: any) {
    console.error('Update payment status error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Server error updating payment status',
    });
  }
};

/**
 * Cancel order
 */
export const cancelOrder = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    // Check if order exists and belongs to user
    const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(id, userId);
    if (!order) {
      throw new AppError('Order not found or unauthorized', 404);
    }

    // Check if order can be cancelled
    const orderStatus = (order as any).status;
    const paymentStatus = (order as any).payment_status;

    if (orderStatus === 'completed' || orderStatus === 'cancelled') {
      throw new AppError(`Order is already ${orderStatus}`, 400);
    }

    if (paymentStatus === 'paid') {
      // If paid, initiate refund process
      // For now, just mark as cancelled
      db.prepare(`
        UPDATE orders
        SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(id);
    } else {
      // If not paid, just cancel
      db.prepare(`
        UPDATE orders
        SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(id);
    }

    res.json({
      success: true,
      message: 'Order cancelled successfully',
    });
  } catch (error: any) {
    console.error('Cancel order error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Server error cancelling order',
    });
  }
};

/**
 * Complete order (for service providers)
 */
export const completeOrder = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    // Check if order exists and service belongs to user
    const order = db.prepare(`
      SELECT o.*, s.user_id as service_user_id, o.user_id as buyer_id
      FROM orders o
      LEFT JOIN services s ON o.service_id = s.id
      WHERE o.id = ?
    `).get(id);

    if (!order) {
      throw new AppError('Order not found', 404);
    }

    if ((order as any).service_user_id !== userId) {
      throw new AppError('Not authorized to complete this order', 403);
    }

    // Check if order can be completed
    if ((order as any).status !== 'processing') {
      throw new AppError('Order cannot be completed in current status', 400);
    }

    // Update order status to completed
    db.prepare('UPDATE orders SET status = "completed", updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);

    // Add service provider's earnings to balance
    const amount = (order as any).amount;
    // TODO: Apply platform commission
    const providerEarnings = amount * 0.8; // 80% to provider, 20% platform commission

    db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(providerEarnings, userId);

    // Record provider earnings transaction
    const providerTransactionId = uuidv4();
    db.prepare(`
      INSERT INTO transactions (
        id, user_id, type, amount, status, description, reference_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      providerTransactionId,
      userId,
      'purchase',
      providerEarnings,
      'completed',
      `服务收入：订单 ${(order as any).order_number}`,
      id
    );

    // Check if buyer has a referrer and this is their first completed order
    const buyerId = (order as any).buyer_id;
    const buyer = db.prepare('SELECT referrer_id FROM users WHERE id = ?').get(buyerId);

    if (buyer && (buyer as any).referrer_id) {
      const referrerId = (buyer as any).referrer_id;

      // Check if this is buyer's first completed order
      const completedOrders = db.prepare(`
        SELECT COUNT(*) as count FROM orders
        WHERE user_id = ? AND status = 'completed'
      `).get(buyerId) as any;

      if (completedOrders.count === 1) {
        // First completed order - pay commission to referrer
        const referrer = db.prepare('SELECT membership FROM users WHERE id = ?').get(referrerId);

        if (referrer) {
          // Get commission rate based on referrer's membership
          const membership = (referrer as any).membership;
          let commissionRate = 0.1; // default 10%

          if (membership === '高级会员') commissionRate = 0.15;
          if (membership === 'VIP会员') commissionRate = 0.2;

          const commissionAmount = amount * commissionRate;

          // Pay commission to referrer
          db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(commissionAmount, referrerId);

          // Record commission transaction
          const commissionTransactionId = uuidv4();
          db.prepare(`
            INSERT INTO transactions (
              id, user_id, type, amount, status, description, reference_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(
            commissionTransactionId,
            referrerId,
            'commission',
            commissionAmount,
            'completed',
            `推荐佣金：被邀请用户首次消费`,
            id
          );

          // Find and update invite record with commission
          const invite = db.prepare(`
            SELECT * FROM invites
            WHERE invitee_id = ? AND referrer_id = ? AND status = 'accepted'
          `).get(buyerId, referrerId);

          if (invite) {
            // Update invite with additional commission reward
            const newTotalReward = (invite as any).reward_amount + commissionAmount;
            db.prepare(`
              UPDATE invites
              SET reward_amount = ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(newTotalReward, (invite as any).id);
          }

          console.log(`Paid ${commissionAmount} commission to referrer ${referrerId} for buyer ${buyerId}'s first purchase`);
        }
      }
    }

    res.json({
      success: true,
      message: 'Order completed successfully',
      data: {
        earnings: providerEarnings,
        commission_paid: buyer && (buyer as any).referrer_id ? true : false,
      },
    });
  } catch (error: any) {
    console.error('Complete order error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Server error completing order',
    });
  }
};

/**
 * Get payment methods
 */
export const getPaymentMethods = async (req: Request, res: Response) => {
  try {
    // In a real application, this would come from configuration or database
    const paymentMethods = [
      {
        id: 'wechat',
        name: '微信支付',
        description: '微信扫码支付',
        icon: 'https://example.com/icons/wechat.png',
        enabled: true,
        minAmount: 0.01,
        maxAmount: 50000,
      },
      {
        id: 'alipay',
        name: '支付宝',
        description: '支付宝扫码支付',
        icon: 'https://example.com/icons/alipay.png',
        enabled: true,
        minAmount: 0.01,
        maxAmount: 50000,
      },
      // Add more payment methods as needed
    ];

    res.json({
      success: true,
      data: paymentMethods,
    });
  } catch (error: any) {
    console.error('Get payment methods error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Server error fetching payment methods',
    });
  }
};

/**
 * Simulate payment (for testing)
 */
export const simulatePayment = async (req: AuthRequest, res: Response) => {
  try {
    const { orderNumber } = req.params;
    const { success = true } = req.body;

    // Find order
    const order = db.prepare('SELECT * FROM orders WHERE order_number = ?').get(orderNumber);
    if (!order) {
      throw new AppError('Order not found', 404);
    }

    const paymentStatus = success ? 'paid' : 'failed';
    const transactionId = `TXN${Date.now()}${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;

    // Update payment status
    db.prepare(`
      UPDATE orders
      SET payment_status = ?, transaction_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE order_number = ?
    `).run(paymentStatus, transactionId, orderNumber);

    if (success) {
      // Update order status to processing
      db.prepare('UPDATE orders SET status = "processing", updated_at = CURRENT_TIMESTAMP WHERE order_number = ?').run(orderNumber);
    }

    const updatedOrder = db.prepare('SELECT * FROM orders WHERE order_number = ?').get(orderNumber);

    res.json({
      success: true,
      message: `Payment simulation ${success ? 'successful' : 'failed'}`,
      data: updatedOrder,
    });
  } catch (error: any) {
    console.error('Simulate payment error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Server error simulating payment',
    });
  }
};