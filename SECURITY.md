# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Släktforskning, please report it responsibly to help us protect all users.

**Email:** jonas.ahnstedt@imeto.com

**Please include in your report:**
- A clear description of the vulnerability
- Steps to reproduce the issue
- Potential impact and severity
- A suggested fix (if you have one)

**Response timeline:**
- Acknowledgment within 48 hours
- Status update within 7 days
- Fix timeline communicated after assessment

**Please do NOT:**
- Open a public GitHub issue describing the vulnerability
- Share vulnerability details publicly before a fix is available
- Disclose the issue on social media or other public channels

## Supported Versions

Only the latest release is supported with security updates. Users are encouraged to upgrade to the latest version to receive security patches.

## Security Considerations

Släktforskning stores genealogy data locally in SQLite. No data is sent to external servers by default. When using features that connect to external services (gazetteers, search, import/export), review the relevant documentation to understand data flows.
