# Golden-Baobab-Fleet-Management-System

This is a [Next.js](https://nextjs.org) project bootstrapped with [v0](https://v0.app).

## Built with v0

This repository is linked to a [v0](https://v0.app) project. You can continue developing by visiting the link below -- start new chats to make changes, and v0 will push commits directly to this repo. Every merge to `main` will automatically deploy.

[Continue working on v0 →](https://v0.app/chat/projects/prj_1zFPL7nrLwKnrwVKEtmMOmJBSpJY)

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Database setup and backups

Run `scripts/013_operator_profile_picture.sql` in the Supabase SQL Editor to add the operator profile-picture field
and configure the compressed WebP storage bucket. The operator-module machine assignment action uses the
`sync_operator_machine_assignments` function from `scripts/005_project_contract_and_assignment_flow.sql`; ensure
that migration has also been applied to the database.

Run `scripts/014_machine_images.sql` in the Supabase SQL Editor to add machine photo storage. Fleet Register
photo upload and display require this migration.

Run `scripts/015_maintenance_status_override.sql` in the Supabase SQL Editor before deploying the maintenance
status changes. Unfinished services use their service date for automatic status; completed services use the
next due date when present. Explicit status choices are retained as overrides.

The Settings & Backup page can download JSON snapshots or SQL `INSERT` statements for the listed tables. SQL
downloads contain records readable by the signed-in role, not database schema, functions, or files in Supabase
Storage. Use Supabase's database backup facilities for a complete schema-and-data backup.

## Learn More

To learn more, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
- [v0 Documentation](https://v0.app/docs) - learn about v0 and how to use it.
