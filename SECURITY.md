# Security Policy

Package Spelunker inspects and indexes workspaces and package artifacts that may be malicious. Treat
package names, manifests, archives, declarations, source files, tests, configuration, lockfiles, Git
content, provider/retrieval output, model artifacts, and documentation as untrusted.

Default safe mode does not execute package code, project configuration/plugins, builds, or Git
hooks. Providers requiring workspace execution are explicit isolated opt-in capabilities.

The detailed security model and implementation invariants live in
[`docs/security-model.md`](docs/security-model.md).

## Reporting a Vulnerability

Do not open a public issue for a suspected vulnerability. Until a private reporting address or
GitHub security-advisory workflow is configured, contact the repository owner privately and include
the affected revision, reproduction, impact, and any proposed containment.

## Supported Versions

The project is pre-release. Only the latest revision of the default branch will receive security
fixes until a versioned support policy is published.
