# Account Deletion Feature - PIPEDA Compliance

This document describes the account deletion feature implemented for PIPEDA (Personal Information Protection and Electronic Documents Act) compliance.

## Overview

Users can now permanently delete their accounts and all associated personal data through the Account Settings page. This feature ensures compliance with privacy regulations by providing users with complete control over their personal information.

## User Interface

### Access

- Navigate to Account Settings from the user profile menu
- Scroll to the bottom of the page to find the "Delete Account" section

### Process

1. Click "Delete Account" button in the danger zone
2. Enter current password for security verification
3. Type "DELETE" (or "SUPPRIMER" in French) to confirm
4. Click "Delete Account" to proceed

### Security Features

- Password verification required
- Explicit confirmation text required
- Clear warnings about data loss
- Modal dialog prevents accidental deletion

## Data Deletion

When an account is deleted, the following data is permanently removed:

### Automatically Deleted (CASCADE)

- **Bookmarks**: All job bookmarks (ON DELETE CASCADE)
- **Job Matches**: User's job match history (ON DELETE CASCADE)

### Manually Deleted

- **Profile**: User profile information, bio, skills, values, work preferences
- **User Roles**: Admin/moderator role assignments
- **Profile Photos**: Avatar images stored in Supabase storage
- **Auth User**: The authentication record itself

### Deletion Order

1. Profile photo from storage (if exists)
2. Profile record from `profiles` table
3. User roles from `user_roles` table
4. Auth user record (triggers CASCADE deletes for bookmarks and job matches)

## API Endpoint

### `DELETE /api/account/delete`

**Authentication**: Required (user must be logged in)

**Request Body**:

```json
{
  "password": "user_current_password"
}
```

**Responses**:

- `200`: Account successfully deleted
- `400`: Invalid password or missing confirmation
- `401`: User not authenticated
- `500`: Server error during deletion

**Security**:

- Verifies current password before deletion
- Uses admin client for privileged operations
- Logs deletion events for audit purposes

## Technical Implementation

### Database Schema

The feature handles both explicit foreign key constraints and manual cleanup:

```sql
-- Tables with CASCADE (automatic cleanup)
bookmarks.user_id → auth.users.id (ON DELETE CASCADE)
job_matches.user_id → auth.users.id (ON DELETE CASCADE)

-- Tables requiring manual cleanup
profiles.id → auth.users.id (no explicit FK)
user_roles.user_id → auth.users.id (no CASCADE in current schema)
```

### Storage Cleanup

Profile photos are stored in the `avatars` bucket with the pattern:

```
{user_id}/profile-photo-{timestamp}.{ext}
```

The deletion process extracts the file path from the profile photo URL and removes it from storage.

### Error Handling

- Comprehensive error logging
- Graceful failure handling
- User-friendly error messages
- Audit trail for successful deletions

## Testing

The feature includes comprehensive unit tests covering:

- Authentication requirements
- Password verification
- Successful deletion flow
- Error scenarios

Run tests with:

```bash
npm test -- app/api/account/delete/route.test.ts
```

## Compliance Notes

This implementation addresses PIPEDA requirements by:

- Providing users with complete control over their personal data
- Ensuring permanent deletion of all user-related information
- Implementing secure verification processes
- Maintaining audit logs for compliance reporting
- Supporting both English and French interfaces

## Internationalization

The feature supports both English and French languages with appropriate translations for:

- User interface text
- Confirmation requirements ("DELETE" vs "SUPPRIMER")
- Error messages
- Help text and warnings
