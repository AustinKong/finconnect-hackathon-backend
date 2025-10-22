# Auth API Documentation

## Overview
Simple authentication endpoints for user registration and login. No password authentication is required for simplicity.

## Endpoints

### POST /auth/register
Register a new user account and automatically create a wallet.

**Request Body:**
```json
{
  "email": "user@example.com",
  "name": "User Name"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "userId": "uuid-string",
  "user": {
    "id": "uuid-string",
    "email": "user@example.com",
    "name": "User Name",
    "createdAt": "2025-10-22T10:00:00.000Z"
  },
  "wallet": {
    "id": "uuid-string",
    "balance": 0,
    "stakedAmount": 0,
    "yieldEarned": 0,
    "autoStake": true
  }
}
```

**Error Responses:**
- `400 Bad Request`: Missing email or name, or user already exists
- `500 Internal Server Error`: Server error

---

### POST /auth/login
Login with an existing user account (no password required).

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "userId": "uuid-string",
  "user": {
    "id": "uuid-string",
    "email": "user@example.com",
    "name": "User Name",
    "createdAt": "2025-10-22T10:00:00.000Z"
  },
  "wallet": {
    "id": "uuid-string",
    "balance": 0,
    "stakedAmount": 0,
    "yieldEarned": 0,
    "autoStake": true
  }
}
```

**Error Responses:**
- `400 Bad Request`: Missing email
- `404 Not Found`: User not found
- `500 Internal Server Error`: Server error

---

## Usage Examples

### cURL Examples

**Register a new user:**
```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","name":"John Doe"}'
```

**Login:**
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com"}'
```

### JavaScript Examples

**Register:**
```javascript
const response = await fetch('http://localhost:3000/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    name: 'John Doe'
  })
});
const data = await response.json();
console.log('User ID:', data.userId);
```

**Login:**
```javascript
const response = await fetch('http://localhost:3000/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com'
  })
});
const data = await response.json();
console.log('User ID:', data.userId);
```

## Features

- ✅ Simple email-based registration (no password required)
- ✅ Automatic wallet creation on registration
- ✅ Login returns userId for subsequent API calls
- ✅ Returns wallet information in both register and login responses
- ✅ Prevents duplicate email registration
- ✅ Created wallets have autoStake enabled by default

## Notes

- This is a simplified authentication system designed for hackathon/demo purposes
- In production, you should implement proper password authentication and security measures
- The userId returned should be used in subsequent API calls to identify the user
