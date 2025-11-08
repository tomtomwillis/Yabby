# CopypartyAuth - Firebase Authentication Proxy

Express.js authentication middleware that sits between your frontend and Copyparty upload server, verifying Firebase tokens before proxying requests.

## 🎯 What It Does

- **Firebase Token Verification**: Validates Firebase ID tokens for authenticated requests
- **Session Management**: Cookie-based sessions with configurable duration
- **IP Caching**: Temporarily caches authenticated IPs for improved performance
- **Seamless Proxying**: Forwards authenticated requests to Copyparty server with user info
- **WebSocket Support**: Full WebSocket proxying for real-time features

## 🚀 Quick Start

### Prerequisites

- Node.js >= 16.0.0
- Firebase Admin SDK service account key
- Copyparty server running and accessible

### Installation

From the monorepo root:

```bash
npm install
```

Or from this package directory:

```bash
cd packages/copyparty-auth
npm install
```

### Configuration

Set up environment variables in the **root `.env` file**:

```bash
# Option 1: Use service account key file
FIREBASE_SERVICE_ACCOUNT_PATH="./CopypartyAuth/serviceAccountKey.json"

# Option 2: Use individual credentials (more secure for production)
FIREBASE_ADMIN_PROJECT_ID="your-project-id"
FIREBASE_ADMIN_CLIENT_EMAIL="firebase-adminsdk-xxxxx@project.iam.gserviceaccount.com"
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour key here\n-----END PRIVATE KEY-----"

# Copyparty server configuration
COPYPARTY_TARGET_URL="https://uploads.yabbyville.xyz"
COPYPARTY_AUTH_PORT=3001
SESSION_DURATION=3600000
```

### Running the Service

**From monorepo root:**
```bash
npm run dev:auth
```

**From this directory:**
```bash
npm run dev
```

The service will start on port `3001` (or your configured `COPYPARTY_AUTH_PORT`).

---

## 🔐 Authentication Flow

### 1. Multiple Authentication Methods

The proxy accepts authentication via three methods (in order of priority):

#### A. Session Cookie (Primary)
```javascript
Cookie: copyparty_session=<session-id>
```
- Used for subsequent requests after initial authentication
- Stored for 1 hour (configurable via `SESSION_DURATION`)
- Most efficient method

#### B. Authorization Header (Fallback)
```javascript
Authorization: Bearer <firebase-id-token>
```
- Used when no valid session exists
- Creates IP cache entry on successful verification
- Typical for API calls from frontend

#### C. Query Parameter (Initial Load)
```
?token=<firebase-id-token>
```
- Used for initial iframe loads
- Automatically upgrades to session or IP cache
- Convenient for embedding in URLs

### 2. IP-Based Caching

After successful token verification, the user's IP is cached for the session duration. This allows:
- Faster subsequent requests (no token verification needed)
- Better performance for batch uploads
- Automatic session management per IP

### 3. Static Asset Bypass

These requests skip authentication entirely:
- `/.cpr/*` - Copyparty static assets
- Files matching: `.css`, `.js`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.ico`, `.woff`, `.woff2`, `.ttf`, `.eot`

---

## 📋 API Endpoints

### All Routes (`/*`)

**Authentication Required:** Yes (except static assets)

**Methods:** All HTTP methods + WebSocket upgrade

**Behavior:**
- Validates authentication (session, token, or IP cache)
- Proxies request to `COPYPARTY_TARGET_URL`
- Adds custom headers with user info:
  - `X-User-ID: <firebase-uid>`
  - `X-User-Email: <user-email>`

**Response Codes:**
- `401 Unauthorized` - No valid authentication provided
- `500 Internal Server Error` - Proxy or Firebase error
- Otherwise: Passes through Copyparty server response

---

## ⚙️ Configuration Options

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Yes* | - | Path to Firebase service account JSON file |
| `FIREBASE_ADMIN_PROJECT_ID` | Yes* | - | Firebase project ID (alternative to file) |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | Yes* | - | Firebase service account email |
| `FIREBASE_ADMIN_PRIVATE_KEY` | Yes* | - | Firebase private key (with `\n` for newlines) |
| `COPYPARTY_TARGET_URL` | No | `https://uploads.yabbyville.xyz` | Backend Copyparty server URL |
| `COPYPARTY_AUTH_PORT` | No | `3001` | Port for auth proxy server |
| `SESSION_DURATION` | No | `3600000` | Session timeout in milliseconds (1 hour) |

\* Either `FIREBASE_SERVICE_ACCOUNT_PATH` **OR** the three `FIREBASE_ADMIN_*` variables are required.

### Session Management

**Session Duration:** Default 1 hour (`3600000` ms)

**Cleanup:** Sessions and IP cache entries are cleaned every 5 minutes

**Storage:** In-memory (Map-based)
- ⚠️ **Production Note:** Use Redis or similar for persistent, scalable session storage

---

## 🔧 Architecture

### Components

```
Frontend (React)
    ↓ (Firebase ID Token)
CopypartyAuth Proxy (This Service)
    ↓ (Authenticated + User Info)
Copyparty Server
```

### Request Flow

```
1. Client sends request with Firebase token
2. Proxy verifies token with Firebase Admin SDK
3. Proxy checks/creates session and IP cache
4. Proxy forwards to Copyparty with user headers
5. Copyparty processes upload/download
6. Proxy returns response to client
```

### Session Storage Structure

```javascript
sessions: Map {
  '<session-id>': {
    uid: '<firebase-uid>',
    email: '<user-email>',
    createdAt: <timestamp>
  }
}

authenticatedIPs: Map {
  '<client-ip>': {
    uid: '<firebase-uid>',
    email: '<user-email>',
    timestamp: <timestamp>
  }
}
```

---

## 🛡️ Security Considerations

### Production Recommendations

1. **Use Environment-Based Credentials**
   ```bash
   # Preferred method (no file on disk)
   FIREBASE_ADMIN_PROJECT_ID="..."
   FIREBASE_ADMIN_CLIENT_EMAIL="..."
   FIREBASE_ADMIN_PRIVATE_KEY="..."
   ```

2. **Secure Session Storage**
   - Replace in-memory Maps with Redis
   - Enable Redis authentication and encryption
   - Use Redis TTL for automatic cleanup

3. **HTTPS Only**
   - Run behind reverse proxy (nginx, Apache)
   - Force HTTPS for all connections
   - Enable HSTS headers

4. **Rate Limiting**
   - Add rate limiting middleware
   - Protect against token verification spam
   - Limit failed authentication attempts

5. **Logging & Monitoring**
   - Log all authentication failures
   - Monitor for suspicious IP patterns
   - Alert on repeated 401 errors

### Token Security

- Firebase ID tokens expire after 1 hour
- Tokens are verified against Google's public keys
- Invalid tokens immediately return 401
- No token persistence on server side

### IP Caching Risks

- IP caching improves performance but has security tradeoffs
- Users behind NAT share IPs (could leak sessions)
- Consider disabling for high-security applications
- Current cache duration: Same as session (1 hour)

---

## 📊 Monitoring & Debugging

### Console Output

```
Auth proxy running on port 3001

Auth check for /upload, IP: 192.168.1.100, cookies: {}
✓ Authenticated via header: user@example.com
✓ Authenticated via IP cache: user@example.com
✗ Session expired
✗ Authentication failed - no valid credentials

Proxy error: ECONNREFUSED
```

### Key Log Messages

| Message | Meaning |
|---------|---------|
| `✓ Authenticated via IP cache` | User authenticated via cached IP |
| `✓ Authenticated via header` | User authenticated via Bearer token |
| `✓ Authenticated via query param` | User authenticated via URL token |
| `✓ Authenticated user` | User authenticated via session cookie |
| `✗ Session expired` | Session cookie found but expired |
| `✗ Authentication failed` | No valid authentication provided |
| `Token verification failed` | Firebase token is invalid/expired |
| `Proxy error` | Error communicating with Copyparty |

---

## 🔄 Integration with Frontend

### Example: Uploading with Authentication

```javascript
// Get Firebase ID token
const user = auth.currentUser;
const token = await user.getIdToken();

// Upload file with token in header
const formData = new FormData();
formData.append('file', file);

const response = await fetch('http://localhost:3001/upload', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});
```

### Example: Loading in Iframe

```javascript
// Get Firebase ID token
const token = await auth.currentUser.getIdToken();

// Load Copyparty in iframe with token in URL
const iframeUrl = `http://localhost:3001/?token=${token}`;
document.getElementById('copyparty-frame').src = iframeUrl;
```

---

## 🚨 Troubleshooting

### "Firebase credentials not configured"

**Cause:** Missing or invalid Firebase environment variables

**Fix:**
```bash
# Ensure one of these setups in root .env:
# Option 1:
FIREBASE_SERVICE_ACCOUNT_PATH="./CopypartyAuth/serviceAccountKey.json"

# Option 2:
FIREBASE_ADMIN_PROJECT_ID="..."
FIREBASE_ADMIN_CLIENT_EMAIL="..."
FIREBASE_ADMIN_PRIVATE_KEY="..."
```

### "Token verification failed"

**Cause:** Invalid, expired, or malformed Firebase token

**Fix:**
- Verify token is a valid Firebase ID token
- Check token hasn't expired (1 hour max age)
- Ensure Firebase project ID matches

### "ECONNREFUSED" or "Proxy error"

**Cause:** Cannot connect to Copyparty server

**Fix:**
```bash
# Check Copyparty server is running
curl https://uploads.yabbyville.xyz

# Verify COPYPARTY_TARGET_URL in .env
COPYPARTY_TARGET_URL="https://uploads.yabbyville.xyz"
```

### Sessions Not Persisting

**Cause:** In-memory sessions reset on restart

**Fix:**
- For production, implement Redis-based session store
- Or use only Bearer token authentication (stateless)

### Port Already in Use

**Cause:** Another service using port 3001

**Fix:**
```bash
# Change port in .env
COPYPARTY_AUTH_PORT=3002

# Or kill process using port
lsof -ti:3001 | xargs kill
```

---

## 🧪 Testing

### Test Authentication

```bash
# Get Firebase ID token from your frontend console:
# await firebase.auth().currentUser.getIdToken()

# Test with curl
curl -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  http://localhost:3001/

# Should return Copyparty homepage if authenticated
# Should return 401 if token invalid
```

### Test Session Creation

```bash
# First request creates session
curl -v -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3001/

# Look for Set-Cookie header in response
# Use session cookie for subsequent requests

curl -H "Cookie: copyparty_session=SESSION_ID" \
  http://localhost:3001/
```

---

## 📚 Related Documentation

- [Firebase Admin SDK Documentation](https://firebase.google.com/docs/admin/setup)
- [Copyparty Documentation](https://github.com/9001/copyparty)
- [Express.js Middleware Guide](https://expressjs.com/en/guide/writing-middleware.html)

---

## 🔗 Dependencies

- **express** (^5.1.0) - Web framework
- **firebase-admin** (^13.5.0) - Firebase authentication
- **http-proxy-middleware** (^3.0.5) - HTTP proxying
- **cookie-parser** (^1.4.7) - Cookie parsing
- **cors** (^2.8.5) - CORS support

---

## 📄 License

Part of the YabbyVille monorepo - Private project
