import { useState, useRef } from 'react';

interface RateLimitConfig {
  maxAttempts: number;
  windowMs: number;
}

/**
 * Client-side rate limiting hook
 * Tracks attempts in a sliding time window
 * 
 * IMPORTANT: This is CLIENT-SIDE only. It can be bypassed.
 * For production, implement server-side rate limiting via Cloud Functions.
 * This provides basic protection against accidental spam and casual attacks.
 * 
 * @param config.maxAttempts - Maximum number of attempts allowed
 * @param config.windowMs - Time window in milliseconds
 * @returns checkRateLimit function to call before each action
 */
export const useRateLimit = ({ maxAttempts, windowMs }: RateLimitConfig) => {
  // Store timestamps of attempts (persists across renders without causing re-renders)
  const attemptsRef = useRef<number[]>([]);

  /**
   * Check if action is allowed under rate limit
   * Automatically cleans up old attempts outside the time window
   * 
   * @returns true if action is allowed, false if rate limit exceeded
   */
  const checkRateLimit = (): boolean => {
    const now = Date.now();
    
    // Remove attempts older than the time window
    // This creates a "sliding window" - old attempts naturally expire
    attemptsRef.current = attemptsRef.current.filter(
      timestamp => now - timestamp < windowMs
    );

    // Check if we've exceeded the limit
    if (attemptsRef.current.length >= maxAttempts) {
      return false; // Rate limit exceeded
    }

    // Record this attempt
    attemptsRef.current.push(now);
    return true; // Action allowed
  };

  /**
   * Get current count of attempts in the window
   * Useful for showing user feedback ("3/5 attempts remaining")
   */
  const getRemainingAttempts = (): number => {
    const now = Date.now();
    attemptsRef.current = attemptsRef.current.filter(
      timestamp => now - timestamp < windowMs
    );
    return Math.max(0, maxAttempts - attemptsRef.current.length);
  };

  /**
   * Manually reset the rate limit
   * Useful after successful action or for testing
   */
  const reset = (): void => {
    attemptsRef.current = [];
  };

  return { 
    checkRateLimit, 
    getRemainingAttempts,
    reset 
  };
};