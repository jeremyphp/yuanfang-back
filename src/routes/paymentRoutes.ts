import { Router } from 'express';
import { protect } from '../middleware/authMiddleware';
import {
  createOrder,
  getOrderById,
  getUserOrders,
  updatePaymentStatus,
  cancelOrder,
  completeOrder,
  getPaymentMethods,
  simulatePayment,
} from '../controllers/paymentController';

const router = Router();

// Apply auth middleware to all payment routes (except public ones)
router.use(protect);

/**
 * @swagger
 * /api/payments/orders:
 *   post:
 *     summary: Create a new order
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - serviceId
 *               - paymentMethod
 *             properties:
 *               serviceId:
 *                 type: string
 *                 description: ID of the service to purchase
 *               paymentMethod:
 *                 type: string
 *                 enum: [wechat, alipay]
 *                 description: Payment method to use
 *     responses:
 *       201:
 *         description: Order created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Service not found
 */
router.post('/orders', createOrder);

/**
 * @swagger
 * /api/payments/orders:
 *   get:
 *     summary: Get user's orders
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, processing, completed, cancelled]
 *         description: Filter by order status
 *       - in: query
 *         name: paymentStatus
 *         schema:
 *           type: string
 *           enum: [pending, paid, failed, refunded]
 *         description: Filter by payment status
 *     responses:
 *       200:
 *         description: List of user's orders with statistics
 *       401:
 *         description: Not authenticated
 */
router.get('/orders', getUserOrders);

/**
 * @swagger
 * /api/payments/orders/{id}:
 *   get:
 *     summary: Get order by ID
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Order ID
 *     responses:
 *       200:
 *         description: Order details
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Order not found or unauthorized
 */
router.get('/orders/:id', getOrderById);

/**
 * @swagger
 * /api/payments/orders/{id}/cancel:
 *   post:
 *     summary: Cancel order
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Order ID
 *     responses:
 *       200:
 *         description: Order cancelled successfully
 *       400:
 *         description: Order cannot be cancelled
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Order not found or unauthorized
 */
router.post('/orders/:id/cancel', cancelOrder);

/**
 * @swagger
 * /api/payments/orders/{id}/complete:
 *   post:
 *     summary: Complete order (for service providers)
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Order ID
 *     responses:
 *       200:
 *         description: Order completed successfully
 *       400:
 *         description: Order cannot be completed
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (not the service provider)
 *       404:
 *         description: Order not found
 */
router.post('/orders/:id/complete', completeOrder);

/**
 * @swagger
 * /api/payments/methods:
 *   get:
 *     summary: Get available payment methods
 *     tags: [Payments]
 *     responses:
 *       200:
 *         description: List of available payment methods
 */
router.get('/methods', getPaymentMethods);

/**
 * @swagger
 * /api/payments/callback/{orderNumber}:
 *   post:
 *     summary: Payment callback (simulated for testing)
 *     tags: [Payments]
 *     parameters:
 *       - in: path
 *         name: orderNumber
 *         required: true
 *         schema:
 *           type: string
 *         description: Order number
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - paymentStatus
 *             properties:
 *               paymentStatus:
 *                 type: string
 *                 enum: [pending, paid, failed, refunded]
 *               transactionId:
 *                 type: string
 *                 description: Payment transaction ID
 *     responses:
 *       200:
 *         description: Payment status updated successfully
 *       400:
 *         description: Invalid payment status
 *       404:
 *         description: Order not found
 */
router.post('/callback/:orderNumber', updatePaymentStatus);

/**
 * @swagger
 * /api/payments/simulate/{orderNumber}:
 *   post:
 *     summary: Simulate payment (for testing)
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderNumber
 *         required: true
 *         schema:
 *           type: string
 *         description: Order number
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success:
 *                 type: boolean
 *                 default: true
 *                 description: Whether payment should succeed or fail
 *     responses:
 *       200:
 *         description: Payment simulation completed
 *       404:
 *         description: Order not found
 */
router.post('/simulate/:orderNumber', simulatePayment);

export { router as paymentRoutes };