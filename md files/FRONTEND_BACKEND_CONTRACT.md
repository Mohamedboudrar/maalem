# Maalem Backend Contract for Frontend

This document describes the backend API contract the Expo app should use now that Firebase is removed.

Sources:

- `src/controllers/*`
- `src/routes/*`
- `prisma/schema.prisma`

## Base Rules

- Base URL is whatever the running backend exposes locally or in deployment.
- Protected routes require:

```http
Authorization: Bearer <token>
```

- Tokens are returned by `POST /api/auth/register` and `POST /api/auth/login`.
- The backend uses JWT only. There is no Firebase session layer anymore.

## Auth Endpoints

### `POST /api/auth/register`

Public.

#### Request body

```json
{
  "fullName": "John Doe",
  "email": "john@example.com",
  "phone": "+212600000000",
  "password": "secret123",
  "role": "CLIENT"
}
```

#### Required fields

- `fullName`
- `email`
- `password`
- `role`

#### Optional fields

- `phone`

#### Allowed `role` values

- `CLIENT`
- `TECHNICIAN`
- `ADMIN`

#### Success response

Status: `201`

```json
{
  "message": "Inscription réussie",
  "token": "<jwt>",
  "user": {
    "id": 1,
    "fullName": "John Doe",
    "email": "john@example.com",
    "role": "CLIENT",
    "mode": "client",
    "technicianProfile": null
  }
}
```

#### Errors

- `400` missing required fields
- `400` email already used

#### Notes

- If `role === "TECHNICIAN"`, the backend automatically creates a `technicianProfile`.
- The password is hashed in the database.

---

### `POST /api/auth/login`

Public.

#### Request body

```json
{
  "email": "john@example.com",
  "password": "secret123"
}
```

#### Required fields

- `email`
- `password`

#### Success response

```json
{
  "message": "Connexion réussie",
  "token": "<jwt>",
  "user": {
    "id": 1,
    "fullName": "John Doe",
    "email": "john@example.com",
    "role": "CLIENT",
    "mode": "client",
    "technicianProfile": null
  }
}
```

#### Errors

- `400` invalid email or password

---

### `GET /api/auth/me`

Protected.

#### Success response

Returns the current user record, including nested `technicianProfile`.
`passwordHash` is stripped before the response is sent.

Example:

```json
{
  "id": 1,
  "fullName": "John Doe",
  "email": "john@example.com",
  "phone": "+212600000000",
  "role": "CLIENT",
  "createdAt": "2026-04-22T00:00:00.000Z",
  "updatedAt": "2026-04-22T00:00:00.000Z",
  "technicianProfile": null
}
```

#### Frontend decision logic

Use this endpoint as the source of truth for the worker-mode check:

```ts
if (user.role === 'TECHNICIAN' && user.technicianProfile) {
  navigate('worker-map');
} else {
  navigate('worker-registration');
}
```

#### Notes

- This endpoint should be called after refreshing the cached session.
- If the user is already a technician, the frontend should skip registration.
- The backend keeps `technicianProfile` attached to the user and does not delete it when the user is in client mode.

---

### `PUT /api/auth/me/role`

Protected.

Use this endpoint when a logged-in user completes worker registration and needs to become a technician.

#### Request body

```json
{
  "bio": "Licensed electrician with 8 years of experience",
  "skillsText": "electrical, wiring, fixtures",
  "radiusKm": 15,
  "latitude": 33.5731,
  "longitude": -7.5898,
  "isAvailable": true
}
```

#### Required fields

None. All fields are optional.

#### Success response

```json
{
  "message": "Utilisateur promu technicien avec succès",
  "token": "<new-jwt>",
  "user": {
    "id": 1,
    "fullName": "John Doe",
    "email": "john@example.com",
    "phone": "+212600000000",
    "role": "TECHNICIAN",
    "mode": "worker",
    "createdAt": "2026-04-22T00:00:00.000Z",
    "updatedAt": "2026-04-22T00:00:00.000Z",
    "technicianProfile": {
      "id": 1,
      "userId": 1,
      "bio": "Licensed electrician with 8 years of experience",
      "skillsText": "electrical, wiring, fixtures",
      "radiusKm": 15,
      "latitude": 33.5731,
      "longitude": -7.5898,
      "averageRating": 0,
      "sold": 0,
      "isVerified": false,
      "isAvailable": true,
      "isWorkerMode": true
    }
  },
  "technicianProfile": {
    "id": 1,
    "userId": 1,
    "bio": "Licensed electrician with 8 years of experience",
    "skillsText": "electrical, wiring, fixtures",
    "radiusKm": 15,
    "latitude": 33.5731,
    "longitude": -7.5898,
    "averageRating": 0,
    "sold": 0,
    "isVerified": false,
    "isAvailable": true,
    "isWorkerMode": true
  }
}
```

#### Behavior

- updates `User.role` to `TECHNICIAN`
- creates `TechnicianProfile` if it does not exist
- updates `TechnicianProfile` if it already exists
- returns a refreshed JWT with the updated role
- keeps `isWorkerMode` enabled by default for the worker flow

#### Errors

- `404` user not found
- `401` missing or invalid bearer token

#### Frontend use

- The worker registration screen should call this endpoint after login.
- After success, store the returned `token` and replace the current auth state with the returned `user`.
- If the user is already a technician, the frontend should not call this endpoint from the worker registration screen.

---

### `PUT /api/auth/me/mode`

Protected.

Use this endpoint to switch the current technician between worker mode and client mode without changing `role`.

#### Request body

```json
{
  "isWorkerMode": true
}
```

#### Success response

```json
{
  "message": "Mode technicien mis à jour avec succès",
  "user": {
    "id": 1,
    "fullName": "John Doe",
    "email": "john@example.com",
    "phone": "+212600000000",
    "role": "TECHNICIAN",
    "createdAt": "2026-04-22T00:00:00.000Z",
    "updatedAt": "2026-04-22T00:00:00.000Z",
    "technicianProfile": {
      "id": 1,
      "userId": 1,
      "bio": "Licensed electrician",
      "skillsText": "electrical, wiring",
      "radiusKm": 15,
      "latitude": 33.5731,
      "longitude": -7.5898,
      "averageRating": 0,
      "sold": 0,
      "isVerified": false,
      "isAvailable": true,
      "isWorkerMode": false
    }
  },
  "technicianProfile": {
    "id": 1,
    "userId": 1,
    "bio": "Licensed electrician",
    "skillsText": "electrical, wiring",
    "radiusKm": 15,
    "latitude": 33.5731,
    "longitude": -7.5898,
    "averageRating": 0,
    "sold": 0,
    "isVerified": false,
    "isAvailable": true,
    "isWorkerMode": false
  }
}
```

#### Behavior

- keeps `role` as `TECHNICIAN`
- preserves `technicianProfile`
- toggles `technicianProfile.isWorkerMode`

---

## Category Endpoints

### `GET /api/categories`

Public.

Used to populate the request creation category picker.

#### Success response

Array of service categories.

Example:

```json
[
  {
    "id": 1,
    "name": "Plumbing",
    "description": "Pipe repair and water-related services"
  }
]
```

#### Frontend use

- The frontend must call `GET /api/categories` and use the returned `id` as `categoryId`.
- Do not hardcode category ids in the app.
- The backend seeds the default categories and keeps the operation idempotent.

#### Seeded categories

- Réparation
- Électricité
- Climatisation
- Plomberie
- Nettoyage
- Menuiserie
- Peinture
- Jardinage

### `GET /api/categories/:id`

Public.

#### Success response

Single category object.

#### Errors

- `404` category not found

---

## Client Request Endpoints

### `POST /api/requests`

Protected.

Allowed roles:

- `CLIENT`
- `TECHNICIAN` only when `technicianProfile.isWorkerMode === false`

#### Request body

Must be sent as `multipart/form-data`:

```
categoryId: 1
title: "Fix my sink"
description: "Water leak under the kitchen sink"
budget: 150
latitude: 33.5731
longitude: -7.5898
addressText: "Casablanca, Morocco"
images: [file1, file2, ...] (up to 5 images, max 5MB each)
```

#### Required fields

- `categoryId`
- `title`
- `description`
- `budget`
- `latitude`
- `longitude`

#### Optional fields

- `addressText`
- `images` (array of image files, max 5, each max 5MB)

#### Success response

Returns the created request with `ServiceCategory` and `images` included.

```json
{
  "id": 1,
  "categoryId": 1,
  "title": "Fix my sink",
  "description": "Water leak under the kitchen sink",
  "budget": 150,
  "latitude": 33.5731,
  "longitude": -7.5898,
  "addressText": "Casablanca, Morocco",
  "images": ["/uploads/requests/1234567890-123.jpg", "/uploads/requests/1234567891-456.jpg"],
  "status": "OPEN",
  "createdAt": "2026-04-22T00:00:00.000Z",
  "updatedAt": "2026-04-22T00:00:00.000Z",
  "ServiceCategory": {
    "id": 1,
    "name": "Plumbing",
    "description": "Pipe repair and water-related services"
  }
}
```

#### Errors

- `400` missing required fields
- `400` category not found
- `400` invalid file type (only jpeg, jpg, png, gif, webp allowed)
- `400` file too large (max 5MB per file)

#### Frontend alignment notes

- The frontend must send `categoryId`, not category name.
- `latitude` and `longitude` are required and must be numeric.
- `budget` is sent as a number and is stored as a float.
- Technicians in worker mode must not show the request creation flow.
- Technicians in client mode can create requests with the same payload as clients.
- Images must be sent as `multipart/form-data` with field name `images` (array).
- Images are accessible at `http://backend:5001/uploads/requests/filename.ext`.
- The `images` field is returned as an array of file paths in all request responses.

---

### `GET /api/requests/my`

Protected.

Role required: `CLIENT`

#### Success response

Array of client-owned requests ordered by newest first.

Each request includes:

- `ServiceCategory`
- `Offer[]` (all offers for this request)
- each offer includes selected `User` (technician) fields
- `images` array

---

### `GET /api/requests/:id`

Protected.

Accessible to any authenticated user.

#### Success response

Returns one request with:

- `ServiceCategory`
- `Offer[]` (all offers for this request)
- each offer includes full `User` (technician details)
- `images` array

#### Notes

- Any authenticated user can read any request by id.
- Images are returned as an array of file paths relative to `/uploads`.

---

### `PUT /api/requests/:id/cancel`

Protected.

Role required: `CLIENT`

#### Request body

None.

#### Success response

Returns the updated request with `ServiceCategory` and `images` included.

#### Errors

- `404` request not found
- `403` user is not the request owner

---

### `DELETE /api/requests/:id`

Protected.

Role required: `CLIENT`

#### Request body

None.

#### Success response

```json
{
  "message": "Demande supprimée avec succès"
}
```

#### Errors

- `404` request not found
- `403` user is not the request owner

---

## Worker / Technician Endpoints

The backend now exposes technician endpoints for the worker screens.

### `GET /api/technician/me`

Protected.

Role required: `TECHNICIAN`

#### Success response

```json
{
  "user": {
    "id": 1,
    "fullName": "John Doe",
    "email": "john@example.com",
    "phone": "+212600000000",
    "role": "TECHNICIAN",
    "createdAt": "2026-04-22T00:00:00.000Z",
    "updatedAt": "2026-04-22T00:00:00.000Z",
    "technicianProfile": {
      "id": 1,
      "userId": 1,
      "bio": "Licensed electrician",
      "skillsText": "electrical, wiring",
      "radiusKm": 15,
      "latitude": 33.5731,
      "longitude": -7.5898,
      "averageRating": 0,
      "sold": 0,
      "freeMissionCount": 1,
      "freeMissionMonth": 5,
      "freeMissionYear": 2026,
      "remainingFreeMissions": 2,
      "isVerified": false,
      "isAvailable": true,
      "isWorkerMode": true
    }
  },
  "technicianProfile": {
    "id": 1,
    "userId": 1,
    "bio": "Licensed electrician",
    "skillsText": "electrical, wiring",
    "radiusKm": 15,
    "latitude": 33.5731,
    "longitude": -7.5898,
    "averageRating": 0,
    "sold": 0,
    "freeMissionCount": 1,
    "freeMissionMonth": 5,
    "freeMissionYear": 2026,
    "remainingFreeMissions": 2,
    "isVerified": false,
    "isAvailable": true,
    "isWorkerMode": true
  }
}
```

#### Free Quota System

Each technician gets **3 free accepted missions per month**:

- `freeMissionCount`: Number of free missions used this month
- `freeMissionMonth`: Current month (1-12)
- `freeMissionYear`: Current year
- `remainingFreeMissions`: Computed as `Math.max(0, 3 - freeMissionCount)`

#### Quota Logic

- If `sold > 0`: Technician can accept unlimited missions
- If `sold <= 0`: Limited by `remainingFreeMissions`
- Monthly reset happens automatically when month/year changes
- Quota is consumed **only when offer is accepted**, not when created

#### Frontend Usage

Use `remainingFreeMissions` to show UI state:
- If `remainingFreeMissions > 0`: Show normal mission acceptance flow
- If `remainingFreeMissions === 0` and `sold === 0`: Show "Veuillez recharger votre solde pour accepter plus de missions"

### `GET /api/technician/requests`

Protected.

Role required: `TECHNICIAN`

Returns open requests matching the technician's configured categories.

Each request includes:

- `ServiceCategory`
- `User` (client details)
- `images` array
- `Offer[]` (all offers for this request, if any)

#### Notes

- Only returns requests with status `OPEN`
- Filters by technician's service categories
- Includes client information for contact

### `PUT /api/technician/profile/location`

Protected.

Role required: `TECHNICIAN`

#### Request body

```json
{
  "latitude": 33.5731,
  "longitude": -7.5898
}
```

Updates or creates the technician profile and persists live location.

### `PUT /api/technician/profile/availability`

Protected.

Role required: `TECHNICIAN`

#### Request body

```json
{
  "isAvailable": true
}
```

Updates or creates the technician profile and persists availability.

### `PUT /api/technician/profile/mode`

Protected.

Role required: `TECHNICIAN`

#### Request body

```json
{
  "isWorkerMode": true
}
```

Switches the technician between worker mode and client mode without changing `role`.

---

### `POST /api/technician/verify-identity`

Protected.

Role required: `TECHNICIAN`

#### Request format

Must be sent as `multipart/form-data`:

```
idImage: file (ID card image)
selfie: file (selfie photo)
```

#### Required fields

- `idImage` (file) - ID card image
- `selfie` (file) - Selfie photo

#### Success response

```json
{
  "verified": true,
  "confidence": 0.87,
  "message": "Identity verified successfully"
}
```

#### Decision logic

- If `verified === true` AND `confidence > 0.75` → `isVerified = true`
- Otherwise → `isVerified = false`

#### Side effects

- Updates `TechnicianProfile.isVerified` field in database
- `isVerified` remains `false` by default until successful verification

#### Errors

- `400` missing files or invalid format
- `500` verification service unavailable
- `401` unauthorized (invalid JWT)
- `403` forbidden (not a technician)

#### Notes

- Integrates with external verification service at `http://127.0.0.1:8000/verify`
- Called during worker onboarding after `PUT /api/auth/me/role`
- Verification status persists in technician profile

---

## Mission Endpoints

### `PUT /api/requests/:id/done`

Protected.

Accessible to:

- the client who owns the request
- the technician whose offer was accepted

#### Request body

None.

#### Success response

```json
{
  "message": "Mission marquée comme terminée",
  "request": {
    "id": 1,
    "status": "DONE"
  }
}
```

#### Errors

- `404` request not found
- `403` user is not authorized (not client or accepted technician)

---

## Offer Endpoints

### `POST /api/offers`

Protected.

Role required: `TECHNICIAN`

#### Request body

```json
{
  "requestId": 1,
  "price": 120,
  "message": "I can do this today"
}
```

#### Success response

Status: `201`

Returns the created offer.

#### Errors

- `400` requestId or price missing
- `404` request not found
- `400` request not open
- `400` technician already sent an offer

### `GET /api/offers/request/:id`

Protected.

Role required: `CLIENT`

#### Success response

Array of offers for the request, ordered oldest first.

Each offer includes:

- all offer fields
- `technician.id`
- `technician.fullName`
- `technician.email`

#### Errors

- `404` request not found
- `403` request not owned by caller

### `PUT /api/offers/:id/accept`

Protected.

Role required: `CLIENT`

#### Request body

None.

#### Success response

```json
{
  "message": "Offre acceptée avec succès"
}
```

#### Errors

- `404` offer not found
- `403` user is not the request owner
- `403` technician quota exhausted with code `"FREE_QUOTA_EXHAUSTED"`:

```json
{
  "message": "Quota gratuit épuisé. Veuillez recharger votre solde.",
  "code": "FREE_QUOTA_EXHAUSTED"
}
```

#### Side effects

- selected offer status becomes `ACCEPTED`
- all other offers on the same request become `REFUSED`
- request status becomes `IN_PROGRESS`
- request `selectedOfferId` is set
- If technician has `sold <= 0`, their `freeMissionCount` is incremented
- Monthly quota resets automatically when month/year changes

### `PUT /api/offers/:id/refuse`

Protected.

Role required: `CLIENT`

#### Request body

None.

#### Success response

```json
{
  "message": "Offre refusée avec succès"
}
```

#### Errors

- `404` offer not found
- `403` user is not the request owner

---

### `PUT /api/offers/:id/cancel`

Protected.

Role required: `TECHNICIAN`

#### Request body

None.

#### Success response

```json
{
  "message": "Offre annulée avec succès"
}
```

#### Side effects

- offer status becomes `CANCELLED`
- offer remains in the database for record keeping

#### Errors

- `404` offer not found
- `403` user is not the offer owner

---

### `DELETE /api/offers/:id`

Protected.

Role required: `TECHNICIAN`

#### Request body

None.

#### Success response

```json
{
  "message": "Offre supprimée avec succès"
}
```

#### Side effects

- offer is permanently deleted from the database

#### Errors

- `404` offer not found
- `403` user is not the offer owner

### `PUT /api/requests/:id/done`

Protected.

Accessible to:

- the client who owns the request
- the technician whose offer was accepted

#### Request body

None.

#### Success response

```json
{
  "message": "Mission marquée comme terminée",
  "request": {
    "id": 1,
    "status": "DONE"
  }
}
```

### `POST /api/reviews`

Protected.

Role required: `CLIENT`

#### Request body

```json
{
  "requestId": 1,
  "rating": 5,
  "comment": "Great work"
}
```

#### Required fields

- `requestId`
- `rating`

#### Constraints

- `rating` must be between `1` and `5`
- request must belong to the current client
- request must be `DONE`
- request must have an accepted offer
- only one review per client per request

#### Success response

Status: `201`

```json
{
  "message": "Avis ajouté avec succès",
  "review": {
    "id": 1,
    "requestId": 1,
    "reviewerId": 10,
    "reviewedUserId": 22,
    "rating": 5,
    "comment": "Great work",
    "createdAt": "2026-04-22T00:00:00.000Z"
  },
  "newAverageRating": 4.8
}
```

### `GET /api/reviews/technician/:id`

Protected.

Accessible to any authenticated user.

#### Success response

Array of technician reviews ordered newest first.

Each review includes:

- `reviewer.id`
- `reviewer.fullName`
- `reviewer.email`
- `request.id`
- `request.title`
- `request.status`

---

## Database / Schema Notes

The current schema contains:

- `User`
- `TechnicianProfile`
- `ServiceCategory`
- `TechnicianCategory`
- `Request`
- `Offer`
- `Review`

### Important schema-driven expectations

- `role` is required when creating a user.
- `Request.categoryId` is required and must reference an existing `ServiceCategory`.
- `Request.latitude` and `Request.longitude` are required.
- `Offer.requestId` and `Offer.technicianId` are required.
- `Review.reviewedUserId` is derived from the accepted offer, not sent by frontend.
- `TechnicianProfile.averageRating` defaults to `0`.
- `TechnicianProfile.isWorkerMode` defaults to `true`.

---

## Field Name Alignment

### Fields that must match exactly

- `fullName`
- `email`
- `phone`
- `password`
- `role`
- `categoryId`
- `title`
- `description`
- `budget`
- `latitude`
- `longitude`
- `addressText`
- `requestId`
- `price`
- `message`
- `rating`
- `comment`

### Potential frontend mismatch risks

- `categoryId` is numeric, not category name.
- `budget`, `latitude`, `longitude`, `price`, and `rating` should be sent as numbers.
- `GET /api/auth/me` and `PUT /api/auth/me/role` strip `passwordHash` before returning the user payload.
- `technicianProfile.isWorkerMode` is the source of truth for temporary worker/client mode.
- `technicianProfile.isWorkerMode` is the source of truth for temporary worker/client mode.
- `User.role` stays stable and should not be changed when toggling between worker and client UI mode.
- `POST /api/requests` accepts technicians only when `technicianProfile.isWorkerMode === false`.
- `GET /api/requests/:id` does not check ownership.
- `GET /api/reviews/technician/:id` uses a technician user id, not technician profile id.

---

## Auth / Session Rules

- JWT is the only authentication mechanism.
- Tokens are returned immediately after register and login.
- Protected routes must send the token as a Bearer token.
- The JWT payload includes:

```json
{
  "id": 1,
  "email": "john@example.com",
  "role": "CLIENT"
}
```

- There is no refresh token flow in the current backend.
- There is no Firebase session, OAuth, or anonymous auth support anymore.

---

## Frontend Action Needed

- Use JWT Bearer auth on every protected screen and API call.
- Send `categoryId` instead of category name when creating a request.
- Use `PUT /api/auth/me/role` from the worker registration flow.
- Store the returned JWT after technician promotion.
- For live worker location, use `PUT /api/technician/profile/location`.
- For availability toggles, use `PUT /api/technician/profile/availability`.
- For temporary worker/client switching, use `PUT /api/auth/me/mode` or `PUT /api/technician/profile/mode`.
- Load category options with `GET /api/categories`.
- Do not rely on Firebase auth/session APIs anywhere.
- If the worker UI needs a dedicated jobs inbox, use `GET /api/technician/requests`.
