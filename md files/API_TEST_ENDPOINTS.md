# API Test Endpoints

Base URL: `http://localhost:5001`

Database backend: Neon PostgreSQL

Use this header on protected routes:

```bash
Authorization: Bearer <token>
```

## Health

### GET `/`

Returns:

```json
{ "message": "Maalem Tech API is running" }
```

---

## Auth

### POST `/api/auth/register`

Public.

Required body:

```json
{
  "fullName": "John Doe",
  "email": "john@example.com",
  "password": "secret123",
  "role": "CLIENT"
}
```

Optional:

```json
{
  "phone": "+212600000000"
}
```

Allowed `role` values:

- `CLIENT`
- `TECHNICIAN`
- `ADMIN`

Success:

```json
{
  "message": "Inscription réussie",
  "token": "<jwt>",
  "user": {
    "id": 1,
    "fullName": "John Doe",
    "email": "john@example.com",
    "role": "CLIENT"
  }
}
```

Common errors:

- `400` missing fields
- `400` email already used

### POST `/api/auth/login`

Public.

Required body:

```json
{
  "email": "john@example.com",
  "password": "secret123"
}
```

Success:

```json
{
  "message": "Connexion réussie",
  "token": "<jwt>",
  "user": {
    "id": 1,
    "fullName": "John Doe",
    "email": "john@example.com",
    "role": "CLIENT"
  }
}
```

Common errors:

- `400` invalid email or password

### GET `/api/auth/me`

Protected.

Returns the current user, including `technicianProfile` if it exists.

Success:

```json
{
  "id": 1,
  "fullName": "John Doe",
  "email": "john@example.com",
  "phone": "+212600000000",
  "passwordHash": "...",
  "role": "CLIENT",
  "createdAt": "2026-04-22T00:00:00.000Z",
  "updatedAt": "2026-04-22T00:00:00.000Z",
  "technicianProfile": null
}
```

---

## Requests

### POST `/api/requests`

Protected.

Role required: `CLIENT`

Required body:

```json
{
  "categoryId": 1,
  "title": "Fix my sink",
  "description": "Water leak under the kitchen sink",
  "budget": 150,
  "latitude": 33.5731,
  "longitude": -7.5898
}
```

Optional:

```json
{
  "addressText": "Casablanca, Morocco"
}
```

Success:

- `201`
- Returns the created request with `category` included

Common errors:

- `400` missing required fields

### GET `/api/requests/my`

Protected.

Role required: `CLIENT`

Returns all requests created by the authenticated client, ordered by newest first.

Each request includes:

- `category`
- `offers`
- each offer includes `technician`

### GET `/api/requests/:id`

Protected.

Accessible to any authenticated user.

Returns one request with:

- `category`
- `offers`
- each offer includes `technician`

Common errors:

- `404` request not found

### PUT `/api/requests/:id/cancel`

Protected.

Role required: `CLIENT`

No body required.

Success:

```json
{
  "id": 1,
  "status": "CANCELLED"
}
```

Common errors:

- `404` request not found
- `403` not the owner

---

## Offers

### POST `/api/offers`

Protected.

Role required: `TECHNICIAN`

Required body:

```json
{
  "requestId": 1,
  "price": 120,
  "message": "I can do this today"
}
```

Success:

- `201`
- Returns the created offer

Common errors:

- `400` missing `requestId` or `price`
- `404` request not found
- `400` request is no longer open
- `400` technician already sent an offer for that request

### GET `/api/offers/request/:id`

Protected.

Role required: `CLIENT`

Returns all offers for a request, ordered by oldest first.

Each offer includes:

- `technician.id`
- `technician.fullName`
- `technician.email`

Common errors:

- `404` request not found
- `403` not the owner

### PUT `/api/offers/:id/accept`

Protected.

Role required: `CLIENT`

No body required.

Success:

```json
{ "message": "Offre acceptée avec succès" }
```

Side effects:

- selected offer becomes `ACCEPTED`
- other offers for the same request become `REFUSED`
- request status becomes `IN_PROGRESS`
- request `selectedOfferId` is set

Common errors:

- `404` offer not found
- `403` not the owner

---

## Missions

### PUT `/api/requests/:id/done`

Protected.

Accessible to:

- the client who owns the request
- the technician whose offer was accepted

No body required.

Success:

```json
{
  "message": "Mission marquée comme terminée",
  "request": {
    "id": 1,
    "status": "DONE"
  }
}
```

Common errors:

- `404` request not found
- `400` request is not `IN_PROGRESS`
- `400` no accepted offer exists
- `403` not authorized

---

## Reviews

### POST `/api/reviews`

Protected.

Role required: `CLIENT`

Required body:

```json
{
  "requestId": 1,
  "rating": 5,
  "comment": "Great work"
}
```

Rules:

- `rating` must be between `1` and `5`
- the request must belong to the authenticated client
- the request must be `DONE`
- there must be an accepted offer
- one review per client per request

Success:

```json
{
  "message": "Avis ajouté avec succès",
  "review": {
    "id": 1,
    "requestId": 1,
    "reviewerId": 1,
    "reviewedUserId": 2,
    "rating": 5,
    "comment": "Great work",
    "createdAt": "2026-04-22T00:00:00.000Z"
  },
  "newAverageRating": 4.8
}
```

Common errors:

- `400` missing `requestId` or `rating`
- `400` rating out of range
- `404` request not found
- `403` not the owner
- `400` mission not finished
- `400` no accepted offer found
- `400` review already exists

### GET `/api/reviews/technician/:id`

Protected.

Accessible to any authenticated user.

Returns all reviews for the technician, ordered by newest first.

Each review includes:

- `reviewer.id`
- `reviewer.fullName`
- `reviewer.email`
- `request.id`
- `request.title`
- `request.status`

---

## Quick Test Order

1. `POST /api/auth/register`
2. `POST /api/auth/login`
3. `POST /api/requests`
4. `POST /api/offers`
5. `PUT /api/offers/:id/accept`
6. `PUT /api/requests/:id/done`
7. `POST /api/reviews`
