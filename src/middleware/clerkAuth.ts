import { clerkMiddleware, requireAuth, getAuth } from '@clerk/express';
import { Request, Response, NextFunction } from 'express';

/**
 * Clerk authentication middleware
 * Adds authentication to Express app
 */
export const clerkAuthMiddleware = clerkMiddleware();

/**
 * Protected route middleware
 * Requires authentication for the route
 */
export const requireAuthMiddleware = requireAuth();

/**
 * Helper to get userId from authenticated request
 */
export const getUserId = (req: Request): string | null => {
  const auth = getAuth(req);
  return auth.userId || null;
};

/**
 * Middleware that extracts userId from Clerk auth and adds it to req
 */
export const extractUserId = (req: Request, res: Response, next: NextFunction) => {
  const userId = getUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized - No user ID found' });
  }
  // Add userId to request for easy access
  (req as any).userId = userId;
  next();
};
