import { z } from 'zod';

// User validation schemas
export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  username: z.string().optional(),
  phone: z.string().optional(),
  referralCode: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const updateProfileSchema = z.object({
  username: z.string().optional(),
  phone: z.string().optional(),
  avatar: z.string().url('Invalid URL').optional(),
});

// Service validation schemas
export const createServiceSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100, 'Title too long'),
  description: z.string().min(1, 'Description is required').max(2000, 'Description too long'),
  category: z.enum(['tutorial', 'online', 'onsite']),
  price: z.number().min(0, 'Price must be positive'),
  coverImage: z.string().url('Invalid URL').optional(),
  deliveryMethod: z.enum(['tutorial', 'online', 'onsite']),
  coverage: z.number().min(0).max(100),
});

export const updateServiceSchema = createServiceSchema.partial();

// Payment validation schemas
export const createOrderSchema = z.object({
  serviceId: z.string().min(1, 'Service ID is required'),
  paymentMethod: z.enum(['wechat', 'alipay']),
});

// Invite validation schemas
export const createInviteSchema = z.object({
  inviteeEmail: z.string().email('Invalid email address'),
});

// Chat validation schemas
export const createChatSchema = z.object({
  title: z.string().optional(),
  aiModel: z.enum(['gemini-pro', 'gemini-pro-vision']).default('gemini-pro'),
});

export const addMessageSchema = z.object({
  content: z.string().min(1, 'Message content is required'),
  role: z.enum(['user', 'assistant']).default('user'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type CreateServiceInput = z.infer<typeof createServiceSchema>;
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type CreateInviteInput = z.infer<typeof createInviteSchema>;
export type CreateChatInput = z.infer<typeof createChatSchema>;
export type AddMessageInput = z.infer<typeof addMessageSchema>;