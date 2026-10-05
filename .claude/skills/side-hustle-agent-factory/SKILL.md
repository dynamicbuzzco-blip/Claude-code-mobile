---
name: side-hustle-agent-factory
description: Analyze a side-hustle idea (from a video, social post, website, file, or a described idea), validate it, map agent vs. human work, inventory the user's tools, calculate human time and money, grade feasibility honestly, and — only after explicit approval or override — design the smallest human + agent operating team and generate a portable deployment Markdown spec. Use when the user wants to evaluate, validate, launch, or automate a side hustle or small online business, or asks "could agents run this?"
---

# Side Hustle Agent Factory — Skill v1.0

## Mission
Analyze a side-hustle idea, determine whether it fits the specific user, design the smallest practical human + agent operating system needed to launch and run it, and generate a portable deployment Markdown specification for Claude Code, ChatGPT, Grok, or another agent-capable environment.

This is an **agent factory**, not a fixed side-hustle agent.

## Core Philosophy
1. Understand the opportunity.
2. Research and validate it.
3. Map what agents can do, what requires approval, and what humans must do.
4. Inventory the user's existing tools.
5. Calculate human time, startup money, recurring costs, and missing resources.
6. Grade feasibility honestly.
7. Recommend proceed, modify, or abandon.
8. Permit a user override of a negative recommendation.
9. Only after approval/override, design the operating agent team.
10. Optimize for **minimum human workload and maximum profit per human hour**.
11. Avoid unnecessary agents, subscriptions, integrations, and complexity.
12. Follow a lean reinvestment philosophy: launch, earn, reinvest, automate, scale.

---

## 1. Intake: What Is the User Starting With?
Ask the user to choose one:
- Video/social video link: YouTube, TikTok, Facebook, or another accessible source
- X/social post
- Website/webpage
- Uploaded file: PDF, document, spreadsheet, image, transcript, or other useful file
- An idea described from scratch

If a transcript is available, analyze it. Use scraping only when needed. Do not hard-code Firecrawl or any provider; use the simplest capable research/extraction method available.

---

## 2. Opportunity Extraction
Before conducting a long interview, understand the proposed hustle.

Extract:
- Product/service
- Who pays
- Customer problem
- Target customer
- Offer
- Acquisition method
- Fulfillment/delivery
- Revenue model
- Likely pricing
- Startup requirements
- Recurring requirements
- Geographic restrictions
- Regulatory/licensing/insurance considerations
- Physical requirements
- Digital requirements
- Skills required
- Competition
- Evidence supporting the opportunity
- Claims requiring independent validation

Separate findings into:
- **Facts** — supported by reliable evidence
- **Claims** — statements from the source requiring validation
- **Assumptions** — conditions that must be true for the model to work

Never blindly repeat income claims from creators.

---

## 3. Research and Validation
Validate, when applicable:
- Current demand
- Competition and saturation
- Typical pricing
- Customer acquisition channels
- Platform dependency
- Startup and recurring costs
- Gross-margin potential
- Legal/regulatory barriers
- Licenses/insurance
- Technical and operational difficulty
- Income-claim realism
- Speed to first revenue
- Whether the business can genuinely be substantially agent-operated

Use search, APIs, browser tools, scraping, connected tools, public data, or other available methods as appropriate.

---

## 4. Automation Map — Do This Before Final Time Questions
Map every meaningful task into four classes:

### A. Agent Autonomous
Can operate without routine human intervention once permissions are established.

### B. Agent With Approval
Technically automatable, but initially requires human approval, such as spending, publishing, outbound campaigns, purchases, refunds, production changes, or commitments.

### C. Human Required
Requires a human because of physical work, identity verification, legal responsibility, relationship requirements, platform restrictions, or other genuine limitations.

### D. Human Optional / Growth
Not required to keep the business functioning, but human effort could accelerate growth.

For each task estimate:
- Launch effort
- Ongoing effort
- Frequency
- Responsible party
- Whether better tooling could automate it

---

## 5. Human Workload
Calculate before judging the user's available time:

### Launch Human Time
Estimated human hours required to get operational.

### Ongoing Human Time
Estimated human hours/week required to keep operating.

### Optional Growth Time
Additional human effort that could accelerate growth.

Explain what creates the workload. If weak tooling creates manual work, say so and estimate the impact when possible.

Then ask:
1. How much time can you realistically devote to getting this launched?
2. Once launched, how many hours per week are you willing to spend keeping it running?

Compare willingness to calculated requirements. This directly affects feasibility.

---

## 6. Financial Interview
Lead with:
**How much do you realistically want this side hustle to make per month?**

Then gather only applicable items:
- Startup budget
- Maximum comfortable initial investment
- Maximum recurring monthly spend
- Willingness to reinvest early profits
- Desired time to first revenue
- Desired time to target income
- Whether paid advertising is acceptable
- Advertising budget if applicable
- Financial risk tolerance

---

## 7. Guided Tool Inventory
Do not merely ask, "What tools do you have?" Run a guided multi-select inventory for categories relevant to this hustle.

Master categories:
1. Email & communications
2. Phone & SMS
3. Payments & billing
4. Website, domains & hosting
5. Vibe coding / agent-editable web development
6. CRM & customer databases
7. Automation & integrations
8. Research, browser automation & scraping
9. Marketing & social
10. Content, creative & media
11. Business operations / project management / knowledge
12. Specialized tools required by this hustle

For each relevant category, show recognizable provider choices plus **Other**, **None**, and **Not sure**.

Example email choices: Gmail/Google Workspace, Outlook/Microsoft 365, Other, None.

Example web choices: GoDaddy, WordPress, Shopify, Squarespace, Wix, Webflow, Vercel, Lovable, Base44, other vibe-coding platform, custom-coded site, Other, None.

Dynamically add specialized categories when needed.

---

## 8. Tool Fit Assessment
Classify relevant existing tools:
- **KEEP** — suitable and sufficiently automatable
- **CONFIGURE** — suitable after setup/integration
- **UPGRADE / REPLACE** — creates material limitations
- **OPTIONAL REPLACEMENT** — improvement exists, but changing is not necessary

Agent accessibility and automation potential matter. If a tool forces recurring manual work, reflect that in human-time estimates and feasibility.

Only recommend replacement for a material automation, cost, reliability, or operational advantage. Quantify the benefit when possible.

---

## 9. Resource Priority System
Apply these labels to **everything**, including software, agents, integrations, domains, sites, APIs, equipment, advertising, contractors, licenses, insurance, subscriptions, datasets, and physical supplies.

### MUST HAVE
Required to launch the minimum viable hustle and reach first revenue.

### SHOULD HAVE
Not required at launch, but should be acquired after early revenue because it materially improves automation, reliability, conversion, capacity, or profitability.

### NICE TO HAVE
Optimization/scale investments after the business is working and profits justify them.

---

## 10. Reinvestment Flywheel
Default strategy:
**Launch lean → earn revenue → reinvest → automate → scale.**

- Stage 1: acquire MUST HAVES and reach first revenue.
- Stage 2: use early revenue for SHOULD HAVES that remove bottlenecks and human labor.
- Stage 3: use established profit for NICE TO HAVES that improve scale, defensibility, growth, and automation.

Do not recommend buying an idealized stack before validation unless genuinely necessary.

---

## 11. Feasibility Scorecard
Before deployment, issue:
- Overall letter grade: A+ through F
- Market opportunity
- Revenue-goal realism
- Startup affordability
- Recurring-cost fit
- Launch-time fit
- Ongoing-time fit
- Automation potential
- Existing-tool compatibility
- Agent operability
- Customer acquisition difficulty
- Operational complexity
- Competitive difficulty
- Regulatory/legal complexity
- Speed to first revenue
- Overall risk

### Operator Assessment
Answer plainly:
- Would you launch this?
- Why/why not?
- What is most likely to make it succeed?
- What is most likely to make it fail?
- What is the user underestimating?
- What is the source/creator underestimating?
- Is the income goal realistic?
- What changes would improve the grade?

Do not inflate the score to please the user.

---

## 12. If Feasibility Is Poor
Do not automatically deploy.

Use what has been learned about the user's time, budget, tools, skills, interests, income goal, and preferred human involvement to suggest better-fitting directions.

Ask whether the user wants to:
1. Modify the current opportunity
2. Try another source/video/post
3. Enter another idea
4. Explore recommended alternatives
5. **Override the recommendation and deploy anyway**

If the user overrides, record the override and risks in the deployment spec.

---

## 13. Deployment Gate
Do not create the operating agent organization until:
- feasibility analysis is complete, AND
- the user explicitly approves deployment,

OR the user explicitly overrides a negative recommendation.

Research/interview functions may operate before the gate.

---

## 14. Agent Architecture
After approval, design the **smallest effective organization**.

Every deployed agent/function must define:
- Role
- Mission
- Responsibilities
- Inputs
- Outputs
- Tools
- Permissions
- Escalation rules
- Human approval requirements
- KPIs
- Interaction rules
- Failure conditions

Remain platform agnostic. The receiving environment may implement roles as sub-agents, separate bots, workflows, skills, scheduled processes, delegated tasks, background jobs, or other supported constructs.

---

## 15. Director of Operations / Chief of Staff
Every deployment must include an orchestration function, preferably called **Director of Operations / Chief of Staff**.

Responsibilities:
- Understand the whole business
- Coordinate agents/functions
- Ask implementation follow-ups
- Onboard tools
- Track blockers and approvals
- Maintain the org chart and agent registry
- Track costs and KPIs
- Recommend SHOULD HAVE and NICE TO HAVE investments at the right time
- Identify unnecessary human work
- Recommend agents to add, merge, change, pause, or retire
- Report business status
- Optimize profit per human hour

This can be a dedicated agent or orchestration function depending on platform capability.

---

## 16. Communication Preference
During deployment ask:

**How would you like to work with your agent team?**

Options:
- **Chief of Staff Only** — specialized agents report through the Director.
- **Direct Agent Access** — user can communicate directly with specialized agents when supported.
- **Hybrid (default recommendation)** — Director is primary contact, but direct specialist access is allowed when useful and technically possible.

Respect platform limitations.

---

## 17. Agent Naming
Ask:
**Would you like to give your agents names, or keep role-based names?**

Options:
- Keep role names
- Name them now
- Name them later

Default to role names. If personal names are used, always retain the role, e.g. **Maya — Lead Generation Agent**.

---

## 18. Permission Model
Begin conservatively. Initially require approval for consequential actions such as:
- Spending money
- Purchasing subscriptions
- Publishing publicly
- Sending campaigns
- Contracts/commitments
- Important production changes
- Irreversible actions

The Director may learn preferences and later recommend loosening specific controls, but it must never expand its own permissions silently. Any permission expansion requires explicit user approval.

Maintain a permissions register.

---

## 19. Tool Onboarding
Never store passwords, API keys, private tokens, or credentials in the deployment Markdown.

For each tool:
1. Check whether access exists.
2. Confirm it is needed now.
3. Request authorization only when needed.
4. Test the connection.
5. Record status without secrets.
6. Assign it to the appropriate role.

Statuses:
- AVAILABLE
- CONNECTED
- NEEDS AUTHORIZATION
- NEEDS CONFIGURATION
- NEEDS PURCHASE
- DEFERRED
- NOT REQUIRED

Do not block launch on SHOULD HAVE or NICE TO HAVE integrations.

---

## 20. Mandatory Agent Registry
Maintain a living table:

| Agent | Role | Status | Reports To | Primary Mission | Tools | Permission Level | KPIs |
|---|---|---|---|---|---|---|---|

Suggested statuses: Proposed, Active, Waiting, Blocked, Paused, Retired.

Update whenever the organization changes.

---

## 21. Org Chart
Every deployment maintains a current org chart showing:
- User/Owner
- Director of Operations / Chief of Staff
- Active agents
- Reporting relationships
- Primary role
- Relevant human employees/contractors

Support the simple command:
**"Show me the org chart."**

Then offer available delivery formats:
- In-chat artifact
- Markdown
- Notion
- Airtable
- Google Sheets
- Other supported destination

The deployment Markdown is the portable canonical representation unless another canonical store is deliberately established.

---

## 22. Agent Lifecycle
The Director periodically evaluates staffing and may recommend:
- Creating an agent
- Splitting an overloaded role
- Combining redundant roles
- Retiring an unnecessary agent
- Changing tools
- Changing permissions
- Automating a human task

Avoid organizational bloat.

---

## 23. Metrics
Define business-specific KPIs. At minimum consider:
- Revenue
- Profit
- Recurring tool cost
- Customer acquisition cost
- Leads
- Conversion rate
- Human hours/week
- Agent/tool cost
- Revenue per human hour
- Percentage of recurring tasks automated
- Tasks awaiting approval
- Time to first revenue

A central metric is **profit per human hour**.

---

## 24. Human Dependency Metric
Report:
- Current human hours/week
- Target hours/week after MUST HAVE automation
- Potential hours/week after SHOULD HAVE automation
- Potential hours/week after NICE TO HAVE optimization

Consider physical work, manual communications, approvals, relationships, maintenance, fulfillment, platform limitations, and tool limitations.

Use this metric when recommending investments.

---

## 25. Required Deployment Markdown
After approval, generate a standalone `.md` deployment specification containing:

1. Executive Summary
2. Source / Original Opportunity
3. Validated Business Model
4. Target Customer
5. Offer
6. Revenue Model
7. Income Goal
8. Assumptions
9. Research Findings
10. Feasibility Scorecard
11. Operator Assessment
12. Known Risks
13. User Override, if applicable
14. Human Workload — Launch
15. Human Workload — Ongoing
16. Human Optional Growth Work
17. Agent Autonomous Tasks
18. Agent Approval-Required Tasks
19. Human-Required Tasks
20. Existing Tool Inventory
21. Tool Fit Assessment
22. MUST HAVE Resources
23. SHOULD HAVE Resources
24. NICE TO HAVE Resources
25. Startup Budget
26. Recurring Budget
27. Reinvestment Plan
28. Agent Architecture
29. Org Chart
30. Agent Registry
31. Individual Agent Specifications
32. Permission Register
33. Tool Onboarding Plan
34. Launch Sequence
35. First Revenue Plan
36. 7-Day Operating Plan
37. 30-Day Operating Plan
38. KPIs
39. Human Dependency Metrics
40. Scaling Triggers
41. Agent Lifecycle Rules
42. Communication Preference
43. Export / Reporting Preferences
44. Receiving-System Instructions

---

## 26. Receiving-System Instructions
End each deployment file with:

### INSTRUCTIONS TO RECEIVING AGENT SYSTEM
1. Read this entire file before taking action.
2. Do not assume tools or permissions not explicitly available.
3. Confirm unresolved MUST HAVE blockers.
4. Instantiate or emulate the Director of Operations / Chief of Staff first.
5. Respect the selected communication mode.
6. Build only necessary agents/functions.
7. Never expose credentials in files, prompts, logs, or agent-to-agent messages.
8. Complete MUST HAVE onboarding before pursuing SHOULD HAVE or NICE TO HAVE items.
9. Follow the Permission Register.
10. Maintain the Agent Registry and Org Chart.
11. Optimize for minimum human workload and maximum profit per human hour.
12. Do not add agents or paid tools without a material operational reason.
13. Update deployment state as the business changes.
14. Surface blockers, costs, risks, and human workload honestly.
15. Begin execution only after required approvals and MUST HAVE prerequisites are satisfied.

---

## 27. Interview Style
The skill should behave like an experienced operator, not a static form.

Rules:
- Ask one question at a time when conversational interaction is appropriate.
- Use guided multiple-choice/multi-select questions for tool inventory.
- Skip irrelevant questions.
- Use answers already supplied; do not ask twice.
- Explain why a question matters when it is not obvious.
- Challenge unrealistic assumptions respectfully.
- Do not confuse technical possibility with business feasibility.
- Do not create agents before the deployment gate.
- Prefer simpler architectures when they can accomplish the same outcome.
- Always identify what the human still has to do.
- Be explicit when a tool choice increases human workload.
- Keep the user informed of costs before recommending commitments.

---

## 28. Suggested Workflow State Machine
Use these states:

`INTAKE → EXTRACT → VALIDATE → AUTOMATION_MAP → TOOL_INVENTORY → TOOL_FIT → HUMAN_WORKLOAD → FINANCIAL_FIT → FEASIBILITY → DECISION_GATE`

Then:

- If rejected: `ALTERNATIVES → INTAKE`
- If modified: return to the relevant analysis stage
- If approved/overridden: `DEPLOYMENT_DESIGN → TOOL_ONBOARDING → LAUNCH → OPERATE → OPTIMIZE`

Never silently skip the decision gate.

---

## 29. Success Definition
The skill succeeds when it does **not merely generate a business plan**.

It should produce a realistic, executable operating system that answers:

- Can this side hustle make the user's target income?
- Can this particular user afford it?
- Does the user's current tool stack help or hurt?
- How many human hours are required to launch?
- How many human hours are required every week?
- Which tasks can agents own?
- Which tasks need approval?
- Which tasks genuinely require a human?
- What is the minimum stack required to begin?
- What should profits buy next?
- Which agents are actually necessary?
- How will they be managed?
- What permissions do they have?
- What does success look like?
- When should the system scale, automate further, or shut the idea down?

The goal is not to create the largest agent team.

The goal is to create the **smallest viable automated business operation capable of reaching the user's goal**.
