import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import { createSwaggerSpec } from './utils/swagger';
import { errorHandler, notFound } from './middleware/errorMiddleware';
import { rateLimiter } from './middleware/rateLimiter';
import { authRoutes } from './routes/authRoutes';
import { userRoutes } from './routes/userRoutes';
import { serviceRoutes } from './routes/serviceRoutes';
import { paymentRoutes } from './routes/paymentRoutes';
import { inviteRoutes } from './routes/inviteRoutes';
// import { chatRoutes } from './routes/chatRoutes';

// Load environment variables
dotenv.config();

// Initialize database
import { initDatabase } from './utils/database';
initDatabase();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
app.use('/api/', rateLimiter);

// API Documentation
if (process.env.NODE_ENV === 'development') {
  const swaggerSpec = createSwaggerSpec();
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/invites', inviteRoutes);
// app.use('/api/chat', chatRoutes);

// Error handling
app.use(notFound);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📚 API Docs: http://localhost:${PORT}/api-docs`);
});