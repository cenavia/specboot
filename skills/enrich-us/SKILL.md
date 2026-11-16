---
name: enrich-us
description: Analyze and enhance a vague user story or idea into an implementation-ready ticket with acceptance criteria, technical detail and edge cases, from direct ticket text or from Jira. Use before proposing an OpenSpec change when the request lacks detail.
author: LIDR.co (adapted for specboot)
version: 1.1.0
---

# enrich-us

Analyze and enrich the ticket: $ARGUMENTS.

## Steps

1. Determine the ticket input source:
   - **Direct input (default when ticket text is provided):** use the ticket content shared by the user.
   - **Jira (optional):** if the user gives a Jira key, or asks to use Jira, fetch the ticket with the Jira MCP tools. If they are not available, ask for the ticket text.
2. Gather project context before judging the story:
   - Read `openspec/config.yaml` for the detected stack and project constraints.
   - Read the relevant specs under `openspec/specs/` for behavior that already exists.
   - Inspect the code areas the story touches.
3. Act as a product expert with technical knowledge and understand the problem described.
4. Decide whether the story is complete. It should include:
   - Full functionality description
   - Fields to create or update
   - Endpoint structure and URLs, when applicable
   - Files or modules to modify, following the existing architecture
   - Definition of done
   - Documentation and test updates
   - Non-functional requirements (security, performance, observability)
5. If it lacks detail for autonomous implementation, write an improved version that is clearer, more specific and concise.
6. Always output both sections in markdown:
   - `## Original`
   - `## Enhanced`
7. Jira write-back only in Jira mode and only if the user asks for it: append the enhanced content after the original under clear headings.

## Notes

- Do not require Jira when the user already provided the ticket content.
- If the input is ambiguous (a short reference with no content), ask whether to resolve it through Jira or to paste the full text.
- The enhanced story is the input for `openspec-propose`. Do not save it inside the code repository.
