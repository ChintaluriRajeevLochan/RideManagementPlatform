# Campus Ride Management Platform

A full-stack ride management web app for IIT Roorkee-style campus e-rickshaw coordination. Passengers can request rides, drivers can manage availability and ride requests, and both sides receive real-time ride updates through WebSockets.

## Technology Stack

- Backend: Java 21, Spring Boot, Spring Security, Spring Data JPA, WebSocket/STOMP
- Database: PostgreSQL
- Frontend: React, TypeScript, Vite, Leaflet, OpenStreetMap
- UI: CSS modules-style global styling, Lucide icons, Recharts

## Mandatory Features Implemented

- Passenger and driver registration/login
- JWT authentication and role-based backend access
- Passenger profile management
- Driver vehicle and verification information
- Driver online/offline/busy availability
- Available driver listing for passengers
- Ride request creation with pickup and destination
- Driver incoming request list
- Accept/reject ride workflow
- Database-locked ride acceptance so only one driver can be assigned
- Ride lifecycle: `REQUESTED`, `ACCEPTED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`
- Real-time driver availability, ride request, ride status, and assignment updates
- Driver dashboard with completed rides, active rides, history, ratings, and chart
- Passenger ratings and written feedback for completed rides
- Average driver rating and feedback history

## Optional Features Implemented

- Live map integration with Leaflet and OpenStreetMap
- Campus pickup/destination coordinates seeded into PostgreSQL
- Passenger map with pickup, destination, and assigned driver marker
- Driver map with pickup and destination for active/incoming rides
- Driver GPS tracking through the browser Geolocation API
- Real-time driver location updates through WebSocket events

## Project Structure

```text
RideManagementPlatform/
  backend/    Spring Boot API and WebSocket server
  frontend/   React Vite client
  README.md
```

## Prerequisites

Teammates need these installed locally:

- Java 21 JDK
- Node.js and npm
- PostgreSQL server

Recommended but optional:

- IntelliJ IDEA for backend development
- pgAdmin for viewing PostgreSQL tables visually

IntelliJ is not strictly required to run the app because the backend includes the Maven wrapper:

```bash
cd backend
./mvnw spring-boot:run
```

pgAdmin is also not required to run the app. It is only a database GUI. The required database dependency is the PostgreSQL server.

## Database Setup

PostgreSQL should be running locally on port `5432`.

The backend is configured for:

```text
Database: ride_management_db
Username: ride_user
Password: ride_password
```

If needed, create them with:

```sql
CREATE ROLE ride_user WITH LOGIN PASSWORD 'ride_password';
CREATE DATABASE ride_management_db OWNER ride_user;
GRANT ALL PRIVILEGES ON DATABASE ride_management_db TO ride_user;
```

On macOS with Homebrew, PostgreSQL can be started with:

```bash
brew services start postgresql@18
```

Then create the database/user using `psql` or pgAdmin Query Tool.

Tables are created/updated automatically by Spring Boot JPA using:

```properties
spring.jpa.hibernate.ddl-auto=update
```

## Quick Start

1. Start PostgreSQL locally.

2. Create the database and user:

```sql
CREATE ROLE ride_user WITH LOGIN PASSWORD 'ride_password';
CREATE DATABASE ride_management_db OWNER ride_user;
GRANT ALL PRIVILEGES ON DATABASE ride_management_db TO ride_user;
```

3. Start the backend.

Mac/Linux:

```bash
cd backend
./mvnw spring-boot:run
```

Windows:

```bat
cd backend
mvnw.cmd spring-boot:run
```

4. Start the frontend in a second terminal.

```bash
cd frontend
npm install
npm run dev
```

5. Open the app:

```text
http://localhost:5173
```

The frontend development server proxies `/api` and `/ws` requests to the backend on `8099`.

## Run Backend

Mac/Linux:

```bash
cd backend
./mvnw spring-boot:run
```

Windows:

```bat
cd backend
mvnw.cmd spring-boot:run
```

Backend runs at:

```text
http://localhost:8099
```

## Run Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at:

```text
http://localhost:5173
```

During local development, Vite proxies frontend `/api` and `/ws` traffic to the Spring Boot backend on `8099`.

## Build And Test

Backend:

```bash
cd backend
./mvnw test
```

Frontend:

```bash
cd frontend
npm run build
```

## Core API Overview

```text
POST /api/auth/register/passenger
POST /api/auth/register/driver
POST /api/auth/login

GET  /api/users/me
PUT  /api/users/me

POST /api/drivers/availability/online
POST /api/drivers/availability/offline
GET  /api/drivers/available
GET  /api/drivers/requests
GET  /api/drivers/dashboard
POST /api/drivers/location

GET  /api/locations

POST /api/rides
GET  /api/rides/my
GET  /api/rides/{rideId}
POST /api/rides/{rideId}/accept
POST /api/rides/{rideId}/reject
POST /api/rides/{rideId}/start
POST /api/rides/{rideId}/complete
POST /api/rides/{rideId}/cancel

POST /api/ratings
```

## WebSocket Topics

The frontend connects to:

```text
ws://localhost:8099/ws
```

Live topics used:

```text
/topic/drivers/availability
/topic/drivers/location
/topic/rides/requests
/topic/rides/{rideId}
/topic/rides/{rideId}/driver-location
/topic/users/{userId}/notifications
/topic/drivers/{driverId}/dashboard
```

## Notes

- Deployment is intentionally out of scope because it was not required in the challenge.
- Drivers must allow browser location permission after going online for live GPS tracking to update.
- Bonus features such as route lines, scheduling, payments, analytics, and forecasting can be added later without changing the core structure.
