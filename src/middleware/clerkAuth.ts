import { Request, Response, NextFunction } from 'express';

const isTestMode = process.env.NODE_ENV === 'test';
const clerkSecretKey = process.env.CLERK_SECRET_KEY || '';
const hasValidClerkKey = clerkSecretKey && !clerkSecretKey.includes('placeholder') && clerkSecretKey.startsWith('sk_');
const isDevWithoutClerk = process.env.NODE_ENV === 'development' && !hasValidClerkKey;

// Don't use Clerk middleware in test mode or dev mode without Clerk configured
const bypassClerk = isTestMode || isDevWithoutClerk;

if (bypassClerk) {
  console.log('[AUTH] Clerk authentication bypassed (test mode or missing valid Clerk key)');
}

// Lazy-load Clerk to avoid errors when not configured
let clerkMiddleware: any = null;
let requireAuth: any = null;
let getAuth: any = null;

if (!bypassClerk) {
  try {
    const clerkExpress = require('@clerk/express');
    clerkMiddleware = clerkExpress.clerkMiddleware;
    requireAuth = clerkExpress.requireAuth;
    getAuth = clerkExpress.getAuth;
  } catch (error) {
    console.warn('Clerk not configured properly, authentication will be bypassed');
  }
}

/**
 * Clerk authentication middleware
 * Adds authentication to Express app
 * Bypassed in test mode or development without Clerk configured
 */
export const clerkAuthMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (bypassClerk || !clerkMiddleware) {
    return next();
  }
  return clerkMiddleware()(req, res, next);
};

/**
 * Protected route middleware
 * Requires authentication for the route
 * Bypassed in test mode or development without Clerk, allows x-test-user-id header
 */
export const requireAuthMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (bypassClerk || !requireAuth) {
    // In bypass mode, allow userId from header or body for testing
    const testUserId = req.headers['x-test-user-id'] as string || (req as any).testUserId;
    if (testUserId) {
      (req as any).auth = { userId: testUserId };
    }
    return next();
  }
  return requireAuth()(req, res, next);
};

/**
 * Helper to get userId from authenticated request
 * In bypass mode (test/dev without Clerk), checks for test userId in headers or request body/params
 */
export const getUserId = (req: Request): string | null => {
  if (bypassClerk || !getAuth) {
    // In bypass mode, try multiple sources
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
