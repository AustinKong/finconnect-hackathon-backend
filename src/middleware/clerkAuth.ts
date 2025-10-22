import { clerkMiddleware, requireAuth, getAuth } from '@clerk/express';
import { Request, Response, NextFunction } from 'express';

const isTestMode = process.env.NODE_ENV === 'test';

/**
 * Clerk authentication middleware
 * Adds authentication to Express app
 * In test mode, this is bypassed
 */
export const clerkAuthMiddleware = isTestMode 
  ? (req: Request, res: Response, next: NextFunction) => next()
  : clerkMiddleware();

/**
 * Protected route middleware
 * Requires authentication for the route
 * In test mode, this allows requests with userId in headers or body
 */
export const requireAuthMiddleware = isTestMode
  ? (req: Request, res: Response, next: NextFunction) => {
      // In test mode, allow userId from header or body for testing
      const testUserId = req.headers['x-test-user-id'] as string || (req as any).testUserId;
      if (testUserId) {
        (req as any).auth = { userId: testUserId };
      }
      next();
    }
  : requireAuth();

/**
 * Helper to get userId from authenticated request
 * In test mode, checks for test userId in headers or request body/params
 */
export const getUserId = (req: Request): string | null => {
  if (isTestMode) {
    // In test mode, try multiple sources
    const testUserId = req.headers['x-test-user-id'] as string;
    if (testUserId) return testUserId;
    
    // Check if auth was set by requireAuthMiddleware
    if ((req as any).auth?.userId) {
      return (req as any).auth.userId;
    }
    
    // Try body or params as fallback for test compatibility
    if ((req as any).body?.userId) return (req as any).body.userId;
    if ((req as any).params?.userId) return (req as any).params.userId;
    
    return null;
  }
  
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
