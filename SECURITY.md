# Security Policy

## Reporting a Vulnerability

Please do not post sensitive vulnerability details in a public issue before there is time to triage.

Use GitHub's private vulnerability reporting or security advisory tools if they are available for this repository. If those are not available, contact the repository owner privately through GitHub or Sadilek Innovation's normal contact channels with:

- A concise description of the issue.
- Steps to reproduce.
- Browser, operating system, and device details.
- Any relevant screenshots or recordings that do not expose private information.

## Scope

This project is a frontend-only browser recorder. Important areas include:

- Browser permission handling.
- Local recording generation and download/share flows.
- Accidental exposure of media device identifiers.
- Dependency or build-chain vulnerabilities.

## Privacy Expectations

Recordings should stay local to the browser session unless the user chooses to save or share them. Changes that add network transmission of recordings, device lists, or permission data should be treated as security-sensitive and reviewed carefully.
