# Access Guardian - User Manual

## Table of Contents
1. [Introduction](#introduction)
2. [Getting Started](#getting-started)
3. [User Roles](#user-roles)
4. [Application Workflow](#application-workflow)
5. [Managing Facilities & Areas](#managing-facilities--areas)
6. [Managing Requirements](#managing-requirements)
7. [Managing Users](#managing-users)
8. [Notifications & Logs](#notifications--logs)
9. [Settings](#settings)
10. [API Reference](#api-reference)

---

## Introduction

Access Guardian is a Role-Based Access Control (RBAC) system for managing facility access requests. Users can apply for access to facilities, and the application goes through an approval workflow based on user roles.

### System Architecture

- **Frontend**: React + TypeScript + shadcn-ui (port 8080)
- **Backend**: Express.js (port 3000)
- **Database**: PostgreSQL

---

## Getting Started

### Initial Login

The system creates a default administrator on first run:

| Property | Value |
|----------|-------|
| Email | admin@foretag.se |
| Password | Admin123! |

**Note**: On first login, you must change your password.

### Starting the Application

```bash
# Full stack with Docker
docker compose up

# Frontend only
npm run dev

# Backend only
cd backend && npm run dev
```

### Access URLs

- Frontend: http://localhost:8080
- Backend API: http://localhost:3000/api
- Health: http://localhost:3000/health

---

## User Roles

The system has 6 roles defined in the `app_role` enum:

| Role | Description | Access Level |
|-----|-------------|---------------|
| `administrator` | System administrator | Full system access |
| `facility_owner` | Facility owner | Full facility control |
| `facility_admin` | Facility administrator | Facility management |
| `line_manager` | Line manager | Approve team applications |
| `employee` | Regular employee | Apply for access |
| `contractor` | External contractor | Limited access |

### Role Hierarchy

```
administrator
    ├── facility_owner / facility_admin
    │       └── line_manager
    │              └── employee / contractor
```

---

## Application Workflow

### Status Flow

```
draft → pending_manager → pending_facility → pending_exception → approved
     → pending_manager → pending_facility → denied
```

### Step-by-Step

1. **Draft** - User creates application (initially)
2. **pending_manager** - Submitted, awaiting line manager approval
3. **pending_facility** - Manager approved, awaiting facility owner/admin approval
4. **pending_exception** - Missing requirements, awaiting administrator decision
5. **approved** - Access granted
6. **denied** - Access denied

### Creating an Application

1. Log in as an employee or contractor
2. Navigate to "My Applications" or "Applications"
3. Click "New Application"
4. Select a facility
5. Optionally select areas within the facility
6. Choose start and end dates
7. If requirements are missing, provide justification for exception
8. Submit the application

### Approval Process

#### Line Manager Approval
- Receives notification when employee submits application
- Reviews requirement compliance
- Can approve or deny with reason

#### Facility Owner/Admin Approval
- Receives notification after manager approval
- Reviews the application
- Can approve for all areas or select specific areas
- Can deny with reason

#### Exception Requests
- If user lacks required certifications/clearances
- Application goes to `pending_exception` status
- Administrator decides to approve or deny

---

## Managing Facilities & Areas

### Facilities

Facilities are physical locations that users can apply to access.

**Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | VARCHAR(255) | Yes | Facility name |
| description | TEXT | No | Description |
| address | TEXT | No | Physical address |
| owner_id | UUID | Yes | Owner user ID |

**API Endpoints:**
- `GET /api/facilities` - List all facilities
- `POST /api/facilities` - Create facility (admin only)
- `GET /api/facilities/:id` - Get facility
- `PUT /api/facilities/:id` - Update facility
- `DELETE /api/facilities/:id` - Delete facility (admin only)

### Areas

Areas are sub-sections within a facility with security levels.

**Security Levels:**
- `low` - Basic access
- `medium` - Standard clearance
- `high` - Elevated clearance
- `critical` - Maximum security

**API Endpoints:**
- `GET /api/areas?facility_id=:id` - List areas for facility
- `POST /api/areas` - Create area
- `PUT /api/areas/:id` - Update area
- `DELETE /api/areas/:id` - Delete area

---

## Managing Requirements

Requirements are certifications, clearances, or trainings that users must fulfill.

### Requirement Types
- `certification` - Formal certification
- `clearance` - Security clearance
- `training` - Required training

### Expiry

Requirements can have expiry dates:
- `has_expiry`: Boolean
- `validity_days`: Number of days until expiration

### User Requirements

Each user can have requirement fulfillments with status:
- `fulfilled` - Currently valid
- `pending` - Awaiting approval
- `expired` - No longer valid

### API Endpoints

**Requirements:**
- `GET /api/requirements` - List requirements
- `POST /api/requirements` - Create requirement (admin)
- `DELETE /api/requirements/:id` - Delete requirement

**Facility Requirements:**
- `GET /api/facility-requirements?facility_id=:id`
- `POST /api/facility-requirements` - Link requirement to facility
- `DELETE /api/facility-requirements?facility_id=:id&requirement_id=:id`

**Area Requirements:**
- `GET /api/area-requirements?area_id=:id`
- `POST /api/area-requirements` - Link requirement to area

**User Requirements:**
- `GET /api/user-requirements?user_id=:id`
- `POST /api/user-requirements` - Assign requirement to user
- `PUT /api/user-requirements/:id` - Update fulfillment status

---

## Managing Users

### User Fields

| Field | Type | Required |
|-------|------|----------|
| email | VARCHAR(255) | Yes (unique) |
| full_name | VARCHAR(255) | Yes |
| first_name | VARCHAR(128) | No |
| last_name | VARCHAR(128) | No |
| password | VARCHAR(255) | Yes* |
| department | VARCHAR(100) | No |
| title | VARCHAR(255) | No |
| phone | VARCHAR(50) | No |
| manager_id | UUID | No |
| company | VARCHAR(255) | No |
| is_active | BOOLEAN | No (default true) |
| roles | ARRAY | No |

*Password required when creating user. Not returned in responses.

### User Roles Assignment

Users can have multiple roles stored in `user_roles` table.

### API Endpoints

- `GET /api/users` - List users
- `POST /api/users` - Create user (admin)
- `GET /api/users/:id` - Get user
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

### Manager Hierarchy

The `manager_id` field creates a reporting hierarchy. Line managers can view and approve applications for their direct reports.

---

## Notifications & Logs

### Notifications

Users receive notifications for:
- Application status changes
- Requirement expiry warnings
- System announcements

**Types:**
- `info` - General information
- `warning` - Warning message
- `action_required` - Requires user action

**Endpoints:**
- `GET /api/notifications?user_id=:id`
- `POST /api/notifications` - Create notification
- `PUT /api/notifications/:id/read` - Mark as read
- `PUT /api/notifications/read-all?user_id=:id` - Mark all as read

### System Logs

All actions are logged to `system_logs` table with:
- `action` - Action type
- `actor_id` - User who performed action
- `target_id` - Affected entity
- `target_type` - Entity type
- `details` - JSON details
- `created_at` - Timestamp

**Log Actions:**
- `application_created`, `application_approved_manager`, `application_approved_facility`
- `application_denied`, `exception_approved`, `exception_denied`
- `access_granted`, `access_revoked`, `access_expired`
- `user_created`, `user_updated`, `role_assigned`, `role_removed`
- `requirement_created`, `requirement_fulfilled`, `requirement_expired`
- `facility_created`, `area_created`, `settings_changed`

**Endpoint:**
- `GET /api/logs` - Get logs (supports filtering)

---

## Settings

System settings are stored in `system_settings` table as JSONB.

### Default Settings

```json
{
  "branding": { "appName": "RBAC Access", "subtitle": "Tillträdeshantering" },
  "notifications": { "expiryWarningDays": [30, 7, 1] },
  "security": { "sessionTimeoutMinutes": 30, "maxLoginAttempts": 5 }
}
```

### API Endpoints

- `GET /api/settings` - Get all settings
- `PUT /api/settings` - Update settings

---

## API Reference

### Authentication

#### POST /api/auth/login
```json
{ "email": "user@example.com", "password": "password" }
```
Returns: `{ token, user, mustChangePassword }`

#### GET /api/auth/me
Headers: `Authorization: Bearer <token>`
Returns current user info.

#### POST /api/auth/change-password
```json
{ "oldPassword": "old", "newPassword": "new" }
```

### Facilities

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/facilities | List facilities |
| POST | /api/facilities | Create facility |
| GET | /api/facilities/:id | Get facility |
| PUT | /api/facilities/:id | Update facility |
| DELETE | /api/facilities/:id | Delete facility |
| POST | /api/facilities/:id/admins | Add facility admin |
| DELETE | /api/facilities/:id/admins/:userId | Remove facility admin |

### Areas

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/areas | List areas |
| POST | /api/areas | Create area |
| PUT | /api/areas/:id | Update area |
| DELETE | /api/areas/:id | Delete area |

### Requirements

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/requirements | List requirements |
| POST | /api/requirements | Create requirement |
| DELETE | /api/requirements/:id | Delete requirement |

### Applications

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/applications | List applications |
| POST | /api/applications | Create application |
| GET | /api/applications/:id | Get application |
| PUT | /api/applications/:id | Update application |
| DELETE | /api/applications/:id | Delete application |

### Users

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/users | List users |
| POST | /api/users | Create user |
| GET | /api/users/:id | Get user |
| PUT | /api/users/:id | Update user |
| DELETE | /api/users/:id | Delete user |

### User Requirements

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/user-requirements | List user requirements |
| POST | /api/user-requirements | Create user requirement |
| PUT | /api/user-requirements/:id | Update |
| DELETE | /api/user-requirements/:id | Delete |

### Notifications

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/notifications | List notifications |
| POST | /api/notifications | Create |
| PUT | /api/notifications/:id/read | Mark read |
| PUT | /api/notifications/read-all | Mark all read |

### Other Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/logs | System logs |
| GET | /api/org | Organization tree |
| PUT | /api/org | Update organization |
| GET | /api/settings | System settings |
| PUT | /api/settings | Update settings |
| POST | /api/attachments | Upload attachment |
| DELETE | /api/attachments/:id | Delete attachment |

---

## Security

### JWT Token

The system uses JWT for authentication:
- Token includes user `id`, `email`, and `roles`
- Expiry: 24 hours by default

### Rate Limiting

Login attempts are rate-limited:
- 5 attempts per 15 minutes per IP
- Returns 429 status if exceeded

### Password Requirements

- Minimum 8 characters
- User must change on first login (`must_change_password: true`)

---

## Troubleshooting

### Login Issues

**"Felaktig e-post eller lösenord"**
- Check email format
- Verify password

**"För många inloggningsförsök"**
- Wait 15 minutes or try from different IP

### Facility Creation Fails

**"owner_id" null**
- System automatically uses current user as owner

### Application Not Appearing

- Check that user has required roles
- Verify facility exists and is active

---

## Database Schema

See `db/init.sql` for complete schema including:
- Users and user_roles
- Facilities and areas
- Requirements (facility, area, user)
- Applications and attachments
- Notifications and logs
- System settings

---

*Last updated: April 2026*