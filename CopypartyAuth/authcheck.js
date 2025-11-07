const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const admin = require('firebase-admin');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const app = express();

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(require('./serviceAccountKey.json'))
});

app.use(cookieParser());

// Session store (in production, use Redis or similar)
const sessions = new Map();
const SESSION_DURATION = 3600000; // 1 hour

// Store IP-based authentication temporarily
const authenticatedIPs = new Map();

// Generate secure session ID
function generateSessionId() {
  return crypto.randomBytes(32).toString('hex');
}

// Verify Firebase token
async function verifyToken(token) {
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    return { valid: true, uid: decodedToken.uid, email: decodedToken.email };
  } catch (error) {
    console.error('Token verification failed:', error);
    return { valid: false };
  }
}

// Authentication middleware
async function authenticate(req, res, next) {
  // Skip authentication for copyparty static assets
  if (req.path.startsWith('/.cpr/') || req.path.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/)) {
    return next();
  }

  const clientIP = req.ip || req.connection.remoteAddress;
  console.log(`Auth check for ${req.path}, IP: ${clientIP}, cookies:`, req.cookies);
  
  let authResult = null;

  // Check if this IP is already authenticated
  if (authenticatedIPs.has(clientIP)) {
    const ipAuth = authenticatedIPs.get(clientIP);
    if (Date.now() - ipAuth.timestamp < SESSION_DURATION) {
      req.user = { uid: ipAuth.uid, email: ipAuth.email };
      console.log(`✓ Authenticated via IP cache: ${ipAuth.email}`);
      return next();
    } else {
      authenticatedIPs.delete(clientIP);
    }
  }

  // Try session cookie first
  const sessionId = req.cookies.copyparty_session;
  if (sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId);
    
    // Check if session expired
    if (Date.now() - session.createdAt < SESSION_DURATION) {
      req.user = session;
      console.log(`✓ Authenticated user: ${session.email}`);
      return next();
    } else {
      sessions.delete(sessionId);
      console.log('✗ Session expired');
    }
  }

  // Fall back to Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    authResult = await verifyToken(token);
    
    if (authResult.valid) {
      req.user = { uid: authResult.uid, email: authResult.email };
      // Cache authentication by IP
      authenticatedIPs.set(clientIP, {
        uid: authResult.uid,
        email: authResult.email,
        timestamp: Date.now()
      });
      console.log(`✓ Authenticated via header: ${authResult.email}`);
      return next();
    }
  }

  // Fall back to query parameter (for initial iframe load)
  const tokenParam = req.query.token;
  if (tokenParam) {
    authResult = await verifyToken(tokenParam);
    
    if (authResult.valid) {
      req.user = { uid: authResult.uid, email: authResult.email };
      // Cache authentication by IP for subsequent requests
      authenticatedIPs.set(clientIP, {
        uid: authResult.uid,
        email: authResult.email,
        timestamp: Date.now()
      });
      console.log(`✓ Authenticated via query param: ${authResult.email}`);
      return next();
    }
  }

  console.log('✗ Authentication failed - no valid credentials');
  res.status(401).json({ error: 'Authentication required' });
}

// Clean up expired sessions and IP cache periodically
setInterval(() => {
  const now = Date.now();
  
  // Clean sessions
  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.createdAt > SESSION_DURATION) {
      sessions.delete(sessionId);
    }
  }
  
  // Clean IP cache
  for (const [ip, auth] of authenticatedIPs.entries()) {
    if (now - auth.timestamp > SESSION_DURATION) {
      authenticatedIPs.delete(ip);
    }
  }
}, 300000); // Every 5 minutes

// Proxy to copyparty with authentication (all routes)
app.use('/', authenticate, createProxyMiddleware({
  target: 'https://uploads.yabbyville.xyz',
  changeOrigin: true,
  ws: true, // WebSocket support
  onProxyReq: (proxyReq, req) => {
    // Add user info to request (optional, for copyparty logging)
    if (req.user) {
      proxyReq.setHeader('X-User-ID', req.user.uid);
      proxyReq.setHeader('X-User-Email', req.user.email);
    }
  },
  onError: (err, req, res) => {
    console.error('Proxy error:', err);
    res.status(500).json({ error: 'Proxy error' });
  }
}));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Auth proxy running on port ${PORT}`);
});
