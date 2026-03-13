import { Router } from 'express';
import { registerSchema, loginSchema } from '../utils/validation';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import db from '../utils/database';
import { v4 as uuidv4 } from 'uuid';
import { processInviteOnRegistration } from '../controllers/inviteController';

const router = Router();

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 6
 *               username:
 *                 type: string
 *               phone:
 *                 type: string
 *               referralCode:
 *                 type: string
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Validation error
 *       409:
 *         description: Email already exists
 */
router.post('/register', async (req, res) => {
  try {
    // Validate request body
    const validatedData = registerSchema.parse(req.body);

    // Check if user already exists
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(validatedData.email);
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'Email already registered',
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(validatedData.password, 10);

    // Generate user ID and referral code
    const userId = uuidv4();
    const referralCode = uuidv4().split('-')[0];

    // If referral code provided, find referrer
    let referrerId = null;
    if (validatedData.referralCode) {
      const referrer = db.prepare('SELECT id FROM users WHERE referral_code = ?').get(validatedData.referralCode);
      if (referrer) {
        referrerId = (referrer as any).id;
      }
    }

    // Insert new user
    const stmt = db.prepare(`
      INSERT INTO users (id, email, password, username, phone, referral_code, referrer_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      userId,
      validatedData.email,
      hashedPassword,
      validatedData.username || null,
      validatedData.phone || null,
      referralCode,
      referrerId
    );

    // Process invite registration if referrer exists
    if (referrerId) {
      await processInviteOnRegistration(userId, validatedData.email, validatedData.referralCode);
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: userId, email: validatedData.email },
      process.env.JWT_SECRET!,
      { expiresIn: process.env.JWT_EXPIRES_IN } as any
    );

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        id: userId,
        email: validatedData.email,
        username: validatedData.username,
        referralCode,
        token,
      },
    });
  } catch (error: any) {
    console.error('Registration error:', error);

    if (error.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.errors,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Server error during registration',
    });
  }
});

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *       400:
 *         description: Validation error
 *       401:
 *         description: Invalid credentials
 *       404:
 *         description: User not found
 */
router.post('/login', async (req, res) => {
  try {
    // Validate request body
    const validatedData = loginSchema.parse(req.body);

    // Find user by email
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(validatedData.email);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password',
      });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(validatedData.password, (user as any).password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password',
      });
    }

    // Check if user is active
    if ((user as any).status !== 'active') {
      return res.status(403).json({
        success: false,
        error: 'Account is disabled',
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: (user as any).id,
        email: (user as any).email,
        membership: (user as any).membership,
      },
      process.env.JWT_SECRET!,
      { expiresIn: process.env.JWT_EXPIRES_IN } as any
    );

    // Update user info (remove password)
    const { password, ...userWithoutPassword } = user as any;

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: userWithoutPassword,
        token,
      },
    });
  } catch (error: any) {
    console.error('Login error:', error);

    if (error.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.errors,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Server error during login',
    });
  }
});

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get current user info
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user info
 *       401:
 *         description: Not authenticated
 */
router.get('/me', (req, res) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
    }

    const token = authHeader.split(' ')[1];

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;

    // Get user from database
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // Remove password from response
    const { password, ...userWithoutPassword } = user as any;

    res.json({
      success: true,
      data: userWithoutPassword,
    });
  } catch (error: any) {
    console.error('Get me error:', error);

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Invalid token',
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expired',
      });
    }

    res.status(500).json({
      success: false,
      error: 'Server error',
    });
  }
});

export { router as authRoutes };