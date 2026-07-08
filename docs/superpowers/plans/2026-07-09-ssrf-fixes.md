# SSRF Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Secure validateUrl and safeFetch against IPv4-mapped/translated IPv6 SSRF bypasses, IPv6 AAAA record bypasses, and cross-origin header/redirect leaks.

**Architecture:** Use `dns.lookup` directly with `{ all: true }` to resolve all IPv4 and IPv6 records. Parse and map IPv4-mapped IPv6 addresses to standard IPv4 before checking range and private IP, and add `'rfc6145'` to the blocked ranges list. Strip sensitive headers on cross-origin redirects, and convert method to GET / remove body on 301, 302, 303 status codes.

**Tech Stack:** Node.js, TypeScript, Vitest, ipaddr.js

## Global Constraints

- SSRF validation must block uniqueLocal, linkLocal, loopback, private, unspecified, broadcast, multicast, and rfc6145.
- dns.lookup must be used with { all: true } instead of dns.resolve.
- Redirects with status 301, 302, 303 must switch method to GET and delete body.
- Cross-origin redirects must strip Authorization, Cookie, and Proxy-Authorization headers.

---

### Task 1: Update validateUrl and isPrivateIp in packages/providers/src/security/ssrf.ts

**Files:**
- Modify: `packages/providers/src/security/ssrf.ts`

**Interfaces:**
- Consumes: None
- Produces: `validateUrl(urlStr: string): Promise<string>`

- [ ] **Step 1: Write implementation changes for isPrivateIp**
  Update `isPrivateIp` to handle IPv4-mapped addresses and add `'rfc6145'` to `blockedRanges`.
- [ ] **Step 2: Write implementation changes for validateUrl**
  Update `validateUrl` to use `dns.lookup` directly with `{ all: true }` instead of calling `dns.resolve`.
- [ ] **Step 3: Verify build / typecheck passes**
  Run: `npm run typecheck`
  Expected: PASS

### Task 2: Update safeFetch in packages/providers/src/security/ssrf.ts

**Files:**
- Modify: `packages/providers/src/security/ssrf.ts`

**Interfaces:**
- Consumes: `validateUrl`
- Produces: `safeFetch(urlStr: string, options?: RequestInit): Promise<Response>`

- [ ] **Step 1: Write implementation changes for safeFetch**
  Implement cross-origin header stripping and redirect method/body modification.
- [ ] **Step 2: Verify build / typecheck passes**
  Run: `npm run typecheck`
  Expected: PASS

### Task 3: Implement unit tests in packages/providers/src/__tests__/ssrf.test.ts

**Files:**
- Modify: `packages/providers/src/__tests__/ssrf.test.ts`

- [ ] **Step 1: Add unit tests for mapped IPv6 addresses**
  Verify IPv4-mapped IPv6 loopback / private addresses are correctly blocked.
- [ ] **Step 2: Add unit tests for cross-origin header stripping**
  Verify Authorization, Cookie, and Proxy-Authorization are stripped on cross-origin redirect but kept on same-origin redirect.
- [ ] **Step 3: Add unit tests for redirect method and body modification**
  Verify method changes to GET and body is deleted for 301, 302, 303, but not for 307 or 308.
- [ ] **Step 4: Run unit tests to verify they pass**
  Run: `npm test`
  Expected: PASS
- [ ] **Step 5: Run lint and format**
  Run: `npm run lint` and `npm run format`
  Expected: PASS
- [ ] **Step 6: Generate task report**
  Append report to `C:\Users\sangh\OneDrive\Documents\Intern\Rafiqspace\Repo\aether\.superpowers\sdd\task-3-report.md`.
